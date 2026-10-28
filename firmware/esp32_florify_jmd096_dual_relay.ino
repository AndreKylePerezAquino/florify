/* ==============================================================================
 * Florify IoT - ESP32 Climate Monitor & Actuator Firmware
 * Module: JMD0.96D-1 OLED + DHT11 Sensor + 2-Channel Active-HIGH Relay Module
 * 
 * Hardware Configuration:
 *   - ESP32 Development Board (NodeMCU / ESP32 DevKit V1)
 *   - DHT11 Temperature & Humidity Sensor: GPIO 4
 *   - JMD0.96D-1 0.96" Monochrome I2C OLED (SSD1306 128x64):
 *       * SDA: GPIO 21
 *       * SCL: GPIO 22
 *       * VCC: 3.3V / 5V
 *       * GND: GND
 *       * Default I2C Address: 0x3C (auto-falls back to 0x3D)
 *   - Relay Channel 1 (Cooling Fan): GPIO 18 [Active-HIGH continuous ON/OFF]
 *   - Relay Channel 2 (Humidifier): GPIO 19 [Active-HIGH momentary button clicks]
 *       * 1 click (200ms pulse) to turn ON
 *       * 2 clicks (200ms pulse, 300ms pause, 200ms pulse) to turn OFF
 *   - Trigger Polarity: Active-HIGH (HIGH = Energized/ON, LOW = Standby/OFF)
 *   - Status Indicator LED: GPIO 2 (Built-in Blue LED)
 * 
 * Cloud Communication:
 *   - Direct HTTPS REST client using WiFiClientSecure to Google Firebase Firestore v1
 *   - Project: florify-c5dea | Database: (default)
 *   - Telemetry PATCH to: /devices/{DEVICE_ID}
 *   - Historical logging to: /devices/{DEVICE_ID}/readings
 *   - Remote config polling from: /devices/{DEVICE_ID}/config/current
 * ============================================================================== */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "DHT.h"

// ==========================================
// 1. HARDWARE PIN DEFINITIONS & CONSTANTS
// ==========================================
#define DHTPIN            4       // DHT11 Data Line
#define DHTTYPE           DHT11   // Sensor type

#define OLED_SDA          21      // JMD0.96D-1 I2C SDA
#define OLED_SCL          22      // JMD0.96D-1 I2C SCL
#define SCREEN_WIDTH      128     // OLED display width in pixels
#define SCREEN_HEIGHT     64      // OLED display height in pixels
#define OLED_RESET        -1      // Reset pin (-1 if shared or not present)

#define RELAY_FAN_PIN     18      // Relay 1: Fan continuous ON/OFF
#define RELAY_HUM_PIN     19      // Relay 2: Humidifier momentary clicks
#define STATUS_LED_PIN    2       // Built-in Blue LED

// Relay Trigger Polarity (Active-HIGH verified hardware)
// false = Active-HIGH (HIGH = ON, LOW = OFF)
// true  = Active-LOW  (LOW = ON, HIGH = OFF)
const bool RELAY_ACTIVE_LOW = false;

// Humidifier Click Pulse Durations (Milliseconds)
const unsigned long CLICK_PULSE_MS    = 200;  // Relay energize duration (button contact press)
const unsigned long CLICK_INTERVAL_MS = 300;  // In-between delay for 2-click OFF sequence

// ==========================================
// 2. NETWORK & FIREBASE CREDENTIALS
// ==========================================
const char* WIFI_SSID     = "John3:16";
const char* WIFI_PASSWORD = "JesusSaves!";

// Florify Firebase Firestore Configuration
const char* FIREBASE_PROJECT_ID  = "florify-c5dea";
const char* FIREBASE_DATABASE_ID = "(default)";
const char* FIREBASE_API_KEY     = "AIzaSyBHQc-tMbFYHlvpsds7oTA635Yebr7k0_o";

// Unique Device ID registered in the Florify Dashboard
const char* DEVICE_ID        = "ESP32-FLORIFY-01";
const char* FIRMWARE_VERSION = "v3.2.0-active-high-duo";

// ==========================================
// 3. OBJECTS & GLOBAL STATE VARIABLES
// ==========================================
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
DHT dht(DHTPIN, DHTTYPE);

// Humidifier Click State Machine
enum HumClickState {
  HUM_IDLE,
  HUM_FIRST_CLICK,
  HUM_WAIT_INTERVAL,
  HUM_SECOND_CLICK
};

HumClickState humClickState = HUM_IDLE;
unsigned long humClickTimer = 0;
bool humTargetIsOff = false;
bool currentHumState = false; // Expected humidifier state (true = ON, false = OFF)

// Closed-loop Climate Thresholds & Modes
struct DeviceConfig {
  bool tempEnabled = true;
  float tempOnC    = 40.0;    // Fan turns ON if Temp >= 40.0 °C
  float tempOffC   = 38.0;    // Fan turns OFF if Temp <= 38.0 °C

  bool humEnabled  = false;   // Humidifier auto-mode disabled by default
  float humOnRH    = 45.0;    // Humidifier turns ON if Humidity <= 45% RH
  float humOffRH   = 60.0;    // Humidifier turns OFF if Humidity >= 60% RH

  String fanMode   = "AUTO";      // "AUTO", "FORCE_ON", "FORCE_OFF"
  String mistMode  = "FORCE_OFF"; // "AUTO", "FORCE_ON", "FORCE_OFF"
};

DeviceConfig currentConfig;

// Telemetry & Timing State
float lastTempC = NAN;
float lastHumRH = NAN;
bool isSensorHealthy = false;
bool isFanActive = false;
bool oledReady = false;

unsigned long lastSensorReadMillis = 0;
unsigned long lastTelemetryMillis  = 0;
unsigned long lastConfigPollMillis = 0;

const unsigned long SENSOR_INTERVAL_MS      = 2500;   // Read DHT11 every 2.5 seconds
const unsigned long TELEMETRY_INTERVAL_MS   = 6000;   // Push to Firestore every 6 seconds
const unsigned long CONFIG_POLL_INTERVAL_MS = 15000;  // Poll cloud config every 15 seconds

// ==========================================
// 4. LOW-LEVEL RELAY CONTROL (ACTIVE-HIGH)
// ==========================================
void setRelay(int pin, bool on) {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(pin, on ? LOW : HIGH);
  } else {
    digitalWrite(pin, on ? HIGH : LOW);
  }
}

// ==========================================
// 5. HELPER: ISO-8601 UTC TIMESTAMP
// ==========================================
String getIsoTimestamp() {
  time_t now;
  time(&now);
  struct tm timeinfo;
  if (!gmtime_r(&now, &timeinfo) || now < 100000) {
    return "2026-10-28T00:00:00Z";
  }
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

// ==========================================
// 6. HUMIDIFIER CLICK ENGINE (NON-BLOCKING)
// ==========================================
void triggerHumidifier(bool turnOn) {
  if (currentHumState == turnOn && humClickState == HUM_IDLE) {
    return; // Already in expected state
  }

  if (humClickState != HUM_IDLE) {
    Serial.println(F("[Humidifier] Busy executing pulse sequence. Command queued."));
    return;
  }

  currentHumState = turnOn;
  humTargetIsOff = !turnOn;

  // Start 1st click pulse (energize relay: HIGH)
  setRelay(RELAY_HUM_PIN, true);
  humClickTimer = millis();
  humClickState = HUM_FIRST_CLICK;

  Serial.println(turnOn
    ? F("[Humidifier] Sending 1 ON click...")
    : F("[Humidifier] Sending 2 OFF clicks (300ms pause)..."));
}

void updateHumidifierStateMachine() {
  if (humClickState == HUM_IDLE) return;

  unsigned long now = millis();

  switch (humClickState) {
    case HUM_FIRST_CLICK:
      if (now - humClickTimer >= CLICK_PULSE_MS) {
        // Release 1st click (de-energize relay: LOW)
        setRelay(RELAY_HUM_PIN, false);
        humClickTimer = now;

        if (humTargetIsOff) {
          humClickState = HUM_WAIT_INTERVAL;
          Serial.println(F("[Humidifier] OFF click 1 released. Waiting 300ms pause..."));
        } else {
          humClickState = HUM_IDLE;
          Serial.println(F("[Humidifier] ON 1-click completed. State: ON"));
        }
      }
      break;

    case HUM_WAIT_INTERVAL:
      if (now - humClickTimer >= CLICK_INTERVAL_MS) {
        // Start 2nd click pulse (energize relay: HIGH)
        setRelay(RELAY_HUM_PIN, true);
        humClickTimer = now;
        humClickState = HUM_SECOND_CLICK;
        Serial.println(F("[Humidifier] OFF click 2 started."));
      }
      break;

    case HUM_SECOND_CLICK:
      if (now - humClickTimer >= CLICK_PULSE_MS) {
        // Release 2nd click (de-energize relay: LOW)
        setRelay(RELAY_HUM_PIN, false);
        humClickState = HUM_IDLE;
        Serial.println(F("[Humidifier] OFF 2-click completed. State: OFF"));
      }
      break;

    default:
      setRelay(RELAY_HUM_PIN, false);
      humClickState = HUM_IDLE;
      break;
  }
}

// ==========================================
// 7. JMD0.96D-1 OLED UI RENDERING ENGINE
// ==========================================
void renderOledDisplay() {
  if (!oledReady) return;

  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  // Line 0: Header & WiFi Status
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(F("FLORIFY CLIMATE"));

  display.setCursor(95, 0);
  if (WiFi.status() == WL_CONNECTED) {
    display.print(F("[WIFI]"));
  } else {
    display.print(F("[OFFL]"));
  }
  display.drawLine(0, 11, 127, 11, SSD1306_WHITE);

  // Line 1: Temperature Row
  display.setCursor(0, 16);
  display.print(F("Temp: "));
  if (isSensorHealthy && !isnan(lastTempC)) {
    display.print(lastTempC, 1);
    display.print(F(" C"));
  } else {
    display.print(F("-- C"));
  }

  // Line 2: Humidity Row
  display.setCursor(0, 28);
  display.print(F("Humidity: "));
  if (isSensorHealthy && !isnan(lastHumRH)) {
    display.print(lastHumRH, 1);
    display.print(F(" %"));
  } else {
    display.print(F("-- %"));
  }

  display.drawLine(0, 40, 127, 40, SSD1306_WHITE);

  // Line 3: Fan Status
  display.setCursor(0, 44);
  display.printf("Fan: %s (%s)", isFanActive ? "ON " : "OFF", currentConfig.fanMode == "AUTO" ? "AUTO" : "MAN");

  // Line 4: Humidifier Status
  display.setCursor(0, 54);
  if (humClickState != HUM_IDLE) {
    display.print(F("Humidifier: CLICKING.."));
  } else {
    display.printf("Humidifier: %s", currentHumState ? "ON" : "OFF");
  }

  display.display();
}

// ==========================================
// 8. CLOSED-LOOP ACTUATION EVALUATION
// ==========================================
void evaluateActuators(float tempC, float humRH) {
  // A. Cooling Fan Control (GPIO 18)
  if (currentConfig.fanMode == "FORCE_ON") {
    isFanActive = true;
  } else if (currentConfig.fanMode == "FORCE_OFF") {
    isFanActive = false;
  } else if (currentConfig.tempEnabled && isSensorHealthy && !isnan(tempC)) {
    // Local AUTO hysteresis
    if (tempC >= currentConfig.tempOnC) {
      isFanActive = true;
    } else if (tempC <= currentConfig.tempOffC) {
      isFanActive = false;
    }
  } else {
    isFanActive = false;
  }

  // Apply to Fan Relay (Active-HIGH)
  setRelay(RELAY_FAN_PIN, isFanActive);

  // B. Humidifier Momentary Control (GPIO 19)
  bool targetHumState = false;
  if (currentConfig.mistMode == "FORCE_ON") {
    targetHumState = true;
  } else if (currentConfig.mistMode == "FORCE_OFF") {
    targetHumState = false;
  } else if (currentConfig.mistMode == "AUTO" && currentConfig.humEnabled && isSensorHealthy && !isnan(humRH)) {
    if (humRH <= currentConfig.humOnRH) {
      targetHumState = true;
    } else if (humRH >= currentConfig.humOffRH) {
      targetHumState = false;
    }
  } else {
    targetHumState = false;
  }

  // Trigger pulse sequence if target differs from current expected state
  if (targetHumState != currentHumState) {
    triggerHumidifier(targetHumState);
  }
}

// ==========================================
// 9. WIFI & NTP SYNCHRONIZATION
// ==========================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print(F("[WiFi] Connecting to: "));
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(F("."));
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("\n[WiFi] Connected!"));
    Serial.print(F("[WiFi] IP: "));
    Serial.println(WiFi.localIP());
    digitalWrite(STATUS_LED_PIN, HIGH);
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    Serial.println(F("\n[WiFi] Timeout. Operating in offline automation mode."));
    digitalWrite(STATUS_LED_PIN, LOW);
  }
}

// ==========================================
// 10. FIREBASE FIRESTORE REST: TELEMETRY PUSH
// ==========================================
void sendTelemetryToFirestore(float tempC, float humRH) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return;
  }

  WiFiClientSecure client;
  client.setInsecure(); // Direct TLS connection

  HTTPClient https;

  // 1. Update Device Summary Document (PATCH)
  String patchUrl = "https://firestore.googleapis.com/v1/projects/";
  patchUrl += FIREBASE_PROJECT_ID;
  patchUrl += "/databases/";
  patchUrl += FIREBASE_DATABASE_ID;
  patchUrl += "/documents/devices/";
  patchUrl += DEVICE_ID;
  patchUrl += "?updateMask.fieldPaths=latestTemperatureC";
  patchUrl += "&updateMask.fieldPaths=latestHumidityRH";
  patchUrl += "&updateMask.fieldPaths=latestFanState";
  patchUrl += "&updateMask.fieldPaths=latestMistState";
  patchUrl += "&updateMask.fieldPaths=status";
  patchUrl += "&updateMask.fieldPaths=lastReadingAt";
  patchUrl += "&updateMask.fieldPaths=lastSeenAt";
  patchUrl += "&updateMask.fieldPaths=reportedMode";
  patchUrl += "&updateMask.fieldPaths=firmwareVersion";
  patchUrl += "&key=";
  patchUrl += FIREBASE_API_KEY;

  if (https.begin(client, patchUrl)) {
    https.addHeader("Content-Type", "application/json");

    String nowIso = getIsoTimestamp();

    StaticJsonDocument<512> doc;
    JsonObject fields = doc.createNestedObject("fields");

    fields["latestTemperatureC"]["doubleValue"] = tempC;
    fields["latestHumidityRH"]["doubleValue"]    = humRH;
    fields["latestFanState"]["stringValue"]       = isFanActive ? "ON" : "OFF";
    fields["latestMistState"]["stringValue"]      = currentHumState ? "ON" : "OFF";
    fields["status"]["stringValue"]               = "ONLINE";
    fields["lastReadingAt"]["stringValue"]        = nowIso;
    fields["lastSeenAt"]["stringValue"]           = nowIso;
    fields["reportedMode"]["stringValue"]         = currentConfig.fanMode;
    fields["firmwareVersion"]["stringValue"]      = FIRMWARE_VERSION;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpCode = https.PATCH(requestBody);
    if (httpCode == HTTP_CODE_OK || httpCode == 200) {
      Serial.println(F("[Firestore] Telemetry summary pushed successfully."));
    } else {
      Serial.printf("[Firestore] Telemetry PATCH failed (Code %d)\n", httpCode);
    }
    https.end();
  }

  // 2. Append Time-Series Sample to /readings Subcollection (POST)
  String readingUrl = "https://firestore.googleapis.com/v1/projects/";
  readingUrl += FIREBASE_PROJECT_ID;
  readingUrl += "/databases/";
  readingUrl += FIREBASE_DATABASE_ID;
  readingUrl += "/documents/devices/";
  readingUrl += DEVICE_ID;
  readingUrl += "/readings";
  readingUrl += "?key=";
  readingUrl += FIREBASE_API_KEY;

  if (https.begin(client, readingUrl)) {
    https.addHeader("Content-Type", "application/json");

    StaticJsonDocument<512> rDoc;
    JsonObject rFields = rDoc.createNestedObject("fields");

    rFields["temperatureC"]["doubleValue"]  = tempC;
    rFields["humidityRH"]["doubleValue"]     = humRH;
    rFields["fanState"]["stringValue"]       = isFanActive ? "ON" : "OFF";
    rFields["mistState"]["stringValue"]      = currentHumState ? "ON" : "OFF";
    rFields["operatingMode"]["stringValue"]  = currentConfig.fanMode;
    rFields["sensorHealthy"]["booleanValue"] = isSensorHealthy;
    rFields["receivedAt"]["stringValue"]     = getIsoTimestamp();

    String rBody;
    serializeJson(rDoc, rBody);

    int rCode = https.POST(rBody);
    if (rCode == HTTP_CODE_OK || rCode == 200) {
      Serial.println(F("[Firestore] Time-series sample logged to /readings."));
    }
    https.end();
  }
}

// ==========================================
// 11. FIREBASE FIRESTORE: BOOTSTRAP DEFAULT CONFIG
// ==========================================
void bootstrapRemoteConfig() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String patchUrl = "https://firestore.googleapis.com/v1/projects/";
  patchUrl += FIREBASE_PROJECT_ID;
  patchUrl += "/databases/";
  patchUrl += FIREBASE_DATABASE_ID;
  patchUrl += "/documents/devices/";
  patchUrl += DEVICE_ID;
  patchUrl += "/config/current?key=";
  patchUrl += FIREBASE_API_KEY;

  if (https.begin(client, patchUrl)) {
    https.addHeader("Content-Type", "application/json");

    StaticJsonDocument<512> doc;
    JsonObject fields = doc.createNestedObject("fields");

    fields["temperatureOnC"]["doubleValue"] = 40.0;
    fields["temperatureOffC"]["doubleValue"] = 38.0;
    fields["humidityOnRH"]["doubleValue"]   = 45.0;
    fields["humidityOffRH"]["doubleValue"]  = 60.0;
    fields["fanMode"]["stringValue"]        = "AUTO";
    fields["mistMode"]["stringValue"]       = "FORCE_OFF";
    fields["updatedAt"]["stringValue"]      = getIsoTimestamp();

    String body;
    serializeJson(doc, body);

    int code = https.PATCH(body);
    Serial.printf("[Cloud Sync] Default config bootstrap response: %d\n", code);
    https.end();
  }
}

// ==========================================
// 12. FIREBASE FIRESTORE REST: POLL CONFIG
// ==========================================
void pollRemoteConfig() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String configUrl = "https://firestore.googleapis.com/v1/projects/";
  configUrl += FIREBASE_PROJECT_ID;
  configUrl += "/databases/";
  configUrl += FIREBASE_DATABASE_ID;
  configUrl += "/documents/devices/";
  configUrl += DEVICE_ID;
  configUrl += "/config/current?key=";
  configUrl += FIREBASE_API_KEY;

  if (https.begin(client, configUrl)) {
    int httpCode = https.GET();
    if (httpCode == 200) {
      String payload = https.getString();
      StaticJsonDocument<1024> doc;
      DeserializationError err = deserializeJson(doc, payload);

      if (!err && doc.containsKey("fields")) {
        JsonObject f = doc["fields"];

        if (f.containsKey("temperatureOnC")) {
          if (f["temperatureOnC"].containsKey("doubleValue")) {
            currentConfig.tempOnC = f["temperatureOnC"]["doubleValue"].as<float>();
          } else if (f["temperatureOnC"].containsKey("integerValue")) {
            currentConfig.tempOnC = String(f["temperatureOnC"]["integerValue"].as<const char*>()).toFloat();
          }
        }
        if (f.containsKey("temperatureOffC")) {
          if (f["temperatureOffC"].containsKey("doubleValue")) {
            currentConfig.tempOffC = f["temperatureOffC"]["doubleValue"].as<float>();
          } else if (f["temperatureOffC"].containsKey("integerValue")) {
            currentConfig.tempOffC = String(f["temperatureOffC"]["integerValue"].as<const char*>()).toFloat();
          }
        }
        if (f.containsKey("humidityOnRH")) {
          if (f["humidityOnRH"].containsKey("doubleValue")) {
            currentConfig.humOnRH = f["humidityOnRH"]["doubleValue"].as<float>();
          } else if (f["humidityOnRH"].containsKey("integerValue")) {
            currentConfig.humOnRH = String(f["humidityOnRH"]["integerValue"].as<const char*>()).toFloat();
          }
        }
        if (f.containsKey("humidityOffRH")) {
          if (f["humidityOffRH"].containsKey("doubleValue")) {
            currentConfig.humOffRH = f["humidityOffRH"]["doubleValue"].as<float>();
          } else if (f["humidityOffRH"].containsKey("integerValue")) {
            currentConfig.humOffRH = String(f["humidityOffRH"]["integerValue"].as<const char*>()).toFloat();
          }
        }
        if (f.containsKey("fanMode") && f["fanMode"].containsKey("stringValue")) {
          String newFanMode = f["fanMode"]["stringValue"].as<String>();
          if (newFanMode != currentConfig.fanMode) {
            Serial.printf("[Cloud Sync] Fan mode updated from %s to %s\n", currentConfig.fanMode.c_str(), newFanMode.c_str());
            currentConfig.fanMode = newFanMode;
          }
        }
        if (f.containsKey("mistMode") && f["mistMode"].containsKey("stringValue")) {
          String newMistMode = f["mistMode"]["stringValue"].as<String>();
          if (newMistMode != currentConfig.mistMode) {
            Serial.printf("[Cloud Sync] Mist mode updated from %s to %s\n", currentConfig.mistMode.c_str(), newMistMode.c_str());
            currentConfig.mistMode = newMistMode;
          }
        }

        Serial.printf("[Cloud Sync] Config: FanMode=%s | MistMode=%s\n",
          currentConfig.fanMode.c_str(), currentConfig.mistMode.c_str());

        // Immediately evaluate actuators with latest remote config
        evaluateActuators(lastTempC, lastHumRH);
        renderOledDisplay();
      }
    } else if (httpCode == 404) {
      Serial.println(F("[Cloud Sync] Config document 404. Bootstrapping initial document..."));
      bootstrapRemoteConfig();
    }
    https.end();
  }
}

// ==========================================
// 13. SERIAL COMMAND PARSER (TESTING / DIAGNOSTICS)
// ==========================================
void handleSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "FAN ON") {
    currentConfig.fanMode = "FORCE_ON";
    isFanActive = true;
    setRelay(RELAY_FAN_PIN, true);
    renderOledDisplay();
    Serial.println(F("Fan turned ON."));
  } else if (cmd == "FAN OFF") {
    currentConfig.fanMode = "FORCE_OFF";
    isFanActive = false;
    setRelay(RELAY_FAN_PIN, false);
    renderOledDisplay();
    Serial.println(F("Fan turned OFF."));
  } else if (cmd == "FAN AUTO") {
    currentConfig.fanMode = "AUTO";
    evaluateActuators(lastTempC, lastHumRH);
    renderOledDisplay();
    Serial.println(F("Fan returned to AUTO mode."));
  } else if (cmd == "HUM ON") {
    if (currentHumState) {
      Serial.println(F("Humidifier is already expected ON."));
    } else {
      triggerHumidifier(true);
      renderOledDisplay();
    }
  } else if (cmd == "HUM OFF") {
    if (!currentHumState) {
      Serial.println(F("Humidifier is already expected OFF."));
    } else {
      triggerHumidifier(false);
      renderOledDisplay();
    }
  } else if (cmd == "HUM AUTO") {
    currentConfig.mistMode = "AUTO";
    evaluateActuators(lastTempC, lastHumRH);
    renderOledDisplay();
    Serial.println(F("Humidifier returned to AUTO mode."));
  } else if (cmd == "STATUS") {
    Serial.println();
    Serial.println(F("===== CURRENT STATUS ====="));
    Serial.print(F("Device ID: ")); Serial.println(DEVICE_ID);
    Serial.print(F("Firmware: ")); Serial.println(FIRMWARE_VERSION);
    Serial.print(F("WiFi: ")); Serial.println(WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED");
    if (WiFi.status() == WL_CONNECTED) {
      Serial.print(F("IP: ")); Serial.println(WiFi.localIP());
    }
    Serial.print(F("Temperature: "));
    if (isnan(lastTempC)) Serial.println(F("No reading"));
    else { Serial.print(lastTempC, 1); Serial.println(F(" C")); }
    Serial.print(F("Humidity: "));
    if (isnan(lastHumRH)) Serial.println(F("No reading"));
    else { Serial.print(lastHumRH, 1); Serial.println(F(" %")); }
    Serial.print(F("Fan: ")); Serial.printf("%s (Mode: %s)\n", isFanActive ? "ON" : "OFF", currentConfig.fanMode.c_str());
    Serial.print(F("Humidifier expected state: ")); Serial.printf("%s (Mode: %s)\n", currentHumState ? "ON" : "OFF", currentConfig.mistMode.c_str());
    Serial.println(F("==========================="));
    Serial.println();
  } else if (cmd == "HELP") {
    Serial.println();
    Serial.println(F("===== ESP32 CLIMATE COMMANDS ====="));
    Serial.println(F("FAN ON     - Turn fan on"));
    Serial.println(F("FAN OFF    - Turn fan off"));
    Serial.println(F("FAN AUTO   - Return fan to auto threshold"));
    Serial.println(F("HUM ON     - Simulate 1 button click"));
    Serial.println(F("HUM OFF    - Simulate 2 clicks (300ms pause)"));
    Serial.println(F("HUM AUTO   - Return humidifier to auto threshold"));
    Serial.println(F("STATUS     - Show current status"));
    Serial.println(F("HELP       - Show commands"));
    Serial.println(F("=================================="));
    Serial.println();
  } else if (cmd.length() > 0) {
    Serial.println(F("Unknown command. Type HELP."));
  }
}

// ==========================================
// 14. SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(300);

  // 1. Initialize Relay Pins in Push-Pull OUTPUT Mode (Active-HIGH)
  pinMode(RELAY_FAN_PIN, OUTPUT);
  pinMode(RELAY_HUM_PIN, OUTPUT);

  // Keep both relays safely OFF at startup (LOW for Active-HIGH)
  setRelay(RELAY_FAN_PIN, false);
  setRelay(RELAY_HUM_PIN, false);

  // Status LED
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // 2. Initialize JMD0.96D-1 OLED Display (I2C on GPIO 21 SDA, GPIO 22 SCL)
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("[OLED] Address 0x3C not responding. Trying 0x3D..."));
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3D)) {
      Serial.println(F("[OLED] Warning: JMD0.96D-1 display failed to initialize."));
      oledReady = false;
    } else {
      Serial.println(F("[OLED] JMD0.96D-1 initialized at 0x3D."));
      oledReady = true;
    }
  } else {
    Serial.println(F("[OLED] JMD0.96D-1 initialized at 0x3C."));
    oledReady = true;
  }

  if (oledReady) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 15);
    display.println(F("FLORIFY CLIMATE IOT"));
    display.setCursor(0, 32);
    display.println(F("Connecting WiFi..."));
    display.display();
  }

  // 3. Start DHT11 Sensor
  dht.begin();
  Serial.println(F("[DHT11] Initialized on GPIO 4."));

  // 4. Connect to WiFi
  connectWiFi();

  // Initial sensor read
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t) && !isnan(h) && t >= -20.0 && t <= 80.0 && h >= 0.0 && h <= 100.0) {
    lastTempC = t;
    lastHumRH = h;
    isSensorHealthy = true;
  }

  renderOledDisplay();

  Serial.println();
  Serial.println(F("ESP32 Climate Controller Ready!"));
  Serial.println(F("Relay Logic: Active-HIGH (setRelay LOW = OFF, HIGH = ON)"));
  Serial.println(F("Type HELP in Serial Monitor for available commands."));
}

// ==========================================
// 15. MAIN SUPER-LOOP
// ==========================================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Process Humidifier Non-Blocking Click Timing
  updateHumidifierStateMachine();

  // 2. Process Interactive Serial Monitor Commands
  handleSerialCommands();

  // 3. Periodic DHT11 Sensor Sampling (Every 2.5 seconds)
  if (currentMillis - lastSensorReadMillis >= SENSOR_INTERVAL_MS) {
    lastSensorReadMillis = currentMillis;

    float t = dht.readTemperature();
    float h = dht.readHumidity();

    if (!isnan(t) && !isnan(h) && t >= -20.0 && t <= 80.0 && h >= 0.0 && h <= 100.0) {
      lastTempC = t;
      lastHumRH = h;
      isSensorHealthy = true;
    } else {
      isSensorHealthy = false;
      Serial.println(F("[DHT11] Warning: Reading failed on GPIO 4."));
    }

    // Evaluate closed-loop actuation logic
    evaluateActuators(lastTempC, lastHumRH);

    // Refresh JMD0.96D-1 OLED Screen
    renderOledDisplay();
  }

  // 4. Periodic Firebase Firestore Telemetry Push (Every 6 seconds)
  if (currentMillis - lastTelemetryMillis >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMillis = currentMillis;
    if (isSensorHealthy && !isnan(lastTempC) && !isnan(lastHumRH)) {
      sendTelemetryToFirestore(lastTempC, lastHumRH);
    }
  }

  // 5. Periodic Remote Config Polling from Firestore (Every 15 seconds)
  if (currentMillis - lastConfigPollMillis >= CONFIG_POLL_INTERVAL_MS) {
    lastConfigPollMillis = currentMillis;
    pollRemoteConfig();
  }

  // Brief yield to FreeRTOS watchdog & network stack
  delay(10);
}
