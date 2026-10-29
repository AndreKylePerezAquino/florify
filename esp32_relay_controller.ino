/* ==============================================================================
 * Florify IoT - ESP32 Climate Monitor & Actuator Firmware
 * Module: JMD0.96D-1 OLED + DHT11 Sensor + TB6612FNG Dual H-Bridge Motor Driver
 * 
 * Hardware Configuration:
 *   - ESP32 Development Board (NodeMCU / ESP32 DevKit V1)
 *   - DHT11 Temperature & Humidity Sensor: GPIO 4
 *   - JMD0.96D-1 0.96" Monochrome I2C OLED (SSD1306 128x64):
 *       * SDA: GPIO 21
 *       * SCL: GPIO 22
 *       * VCC: 3.3V
 *       * GND: GND
 *       * Default I2C Address: 0x3C (auto-falls back to 0x3D)
 * 
 *   - TB6612FNG Dual H-Bridge Driver:
 *       * VCC:  ESP32 3.3V (Logic supply)
 *       * VM:   External 5.0V DC Power Supply (+)
 *       * GND:  Common Ground (ESP32 GND + 5V Supply GND + TB6612FNG GND)
 *       * STBY: GPIO 23 (Active HIGH standby pin; driven HIGH to enable driver)
 *       
 *       * Channel A (5V DC Cooling Fan):
 *           - PWMA: GPIO 18 (Speed / Enable: HIGH = 100% full-power, LOW = OFF)
 *           - AIN1: GPIO 19 (Forward direction: HIGH)
 *           - AIN2: GPIO 5  (Forward direction: LOW)
 *           - Outputs: Fan (+) connected to AO1, Fan (-) connected to AO2
 *       
 *       * Channel B (Humidifier Tactile Button Simulator):
 *           - PWMB: GPIO 25 (Gate enable)
 *           - BIN1: GPIO 26 (Direction 1)
 *           - BIN2: GPIO 27 (Direction 2)
 *           - Output: BO1 connected to Humidifier button signal/sense pin.
 *                     Humidifier circuit ground tied to common system GND.
 *           - Behavior:
 *               * Idle / Released: BO1 is High-Z (Floating, unpressed).
 *               * 1 Click ON: BO1 pulled to GND (LOW) for 200 ms.
 *               * 2 Clicks OFF: BO1 pulled to GND for 200 ms, 300 ms pause, 200 ms pulse.
 * 
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

// TB6612FNG Driver Pins
#define TB_STBY_PIN       23      // Standby pin (HIGH = enabled)

// Channel A: 5V DC Cooling Fan
#define TB_PWMA_PIN       18      // Fan Speed/Gate (HIGH = Full ON, LOW = OFF)
#define TB_AIN1_PIN       19      // Fan Direction 1
#define TB_AIN2_PIN       5       // Fan Direction 2

// Channel B: Humidifier Button Simulator
#define TB_PWMB_PIN       25      // Humidifier Gate Enable
#define TB_BIN1_PIN       26      // Humidifier Direction 1
#define TB_BIN2_PIN       27      // Humidifier Direction 2

#define STATUS_LED_PIN    2       // Built-in Blue LED

// Humidifier Button Timing (Milliseconds)
const unsigned long CLICK_PULSE_MS    = 200;  // Button contact pulled to GND duration
const unsigned long CLICK_INTERVAL_MS = 300;  // Pause between clicks for 2-click OFF sequence

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
const char* FIRMWARE_VERSION = "v4.0.0-tb6612fng-driver";

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
// 4. LOW-LEVEL TB6612FNG MOTOR DRIVER CONTROL
// ==========================================

// Initialize and enable TB6612FNG
void initMotorDriver() {
  pinMode(TB_STBY_PIN, OUTPUT);
  pinMode(TB_PWMA_PIN, OUTPUT);
  pinMode(TB_AIN1_PIN, OUTPUT);
  pinMode(TB_AIN2_PIN, OUTPUT);
  pinMode(TB_PWMB_PIN, OUTPUT);
  pinMode(TB_BIN1_PIN, OUTPUT);
  pinMode(TB_BIN2_PIN, OUTPUT);

  // Take driver out of standby (Active HIGH)
  digitalWrite(TB_STBY_PIN, HIGH);

  // Initialize Fan in Safe OFF state (0V across AO1/AO2)
  digitalWrite(TB_PWMA_PIN, LOW);
  digitalWrite(TB_AIN1_PIN, LOW);
  digitalWrite(TB_AIN2_PIN, LOW);

  // Initialize Humidifier in High-Z Idle state (unpressed, floating)
  digitalWrite(TB_PWMB_PIN, LOW);
  digitalWrite(TB_BIN1_PIN, LOW);
  digitalWrite(TB_BIN2_PIN, LOW);
}

// Channel A: Set DC Fan State (Full-Power ON / OFF)
void setFanDrive(bool on) {
  if (on) {
    // Forward rotation at full 5V power:
    // AIN1 = HIGH, AIN2 = LOW, PWMA = HIGH
    digitalWrite(TB_AIN1_PIN, HIGH);
    digitalWrite(TB_AIN2_PIN, LOW);
    digitalWrite(TB_PWMA_PIN, HIGH);
  } else {
    // Stop / Coast:
    // PWMA = LOW, AIN1 = LOW, AIN2 = LOW (High-Z stop)
    digitalWrite(TB_PWMA_PIN, LOW);
    digitalWrite(TB_AIN1_PIN, LOW);
    digitalWrite(TB_AIN2_PIN, LOW);
  }
}

// Channel B: Humidifier Button Simulator
// User configuration: Pulse BO1 LOW to pull button contact to ground
void setHumidifierPress(bool pressed) {
  if (pressed) {
    // Active Contact Press:
    // With BIN1 = LOW, BIN2 = HIGH, PWMB = HIGH:
    // BO1 is actively driven to LOW (GND through low-side MOSFET)
    digitalWrite(TB_BIN1_PIN, LOW);
    digitalWrite(TB_BIN2_PIN, HIGH);
    digitalWrite(TB_PWMB_PIN, HIGH);
  } else {
    // Idle / Released State:
    // With PWMB = LOW, BIN1 = LOW, BIN2 = LOW:
    // Both BO1 and BO2 are High-Z (Floating / Open circuit).
    // The humidifier's internal pull-up resistor stays at its undisturbed high level.
    digitalWrite(TB_PWMB_PIN, LOW);
    digitalWrite(TB_BIN1_PIN, LOW);
    digitalWrite(TB_BIN2_PIN, LOW);
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

  // Start 1st click pulse (Pull BO1 to GND)
  setHumidifierPress(true);
  humClickTimer = millis();
  humClickState = HUM_FIRST_CLICK;

  Serial.println(turnOn
    ? F("[Humidifier] Sending 1 ON click (200ms pull-down)...")
    : F("[Humidifier] Sending 2 OFF clicks (200ms pull-down, 300ms pause)..."));
}

void updateHumidifierStateMachine() {
  if (humClickState == HUM_IDLE) return;

  unsigned long now = millis();

  switch (humClickState) {
    case HUM_FIRST_CLICK:
      if (now - humClickTimer >= CLICK_PULSE_MS) {
        // Release 1st click (Return BO1 to High-Z floating)
        setHumidifierPress(false);
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
        // Start 2nd click pulse (Pull BO1 to GND)
        setHumidifierPress(true);
        humClickTimer = now;
        humClickState = HUM_SECOND_CLICK;
        Serial.println(F("[Humidifier] OFF click 2 started."));
      }
      break;

    case HUM_SECOND_CLICK:
      if (now - humClickTimer >= CLICK_PULSE_MS) {
        // Release 2nd click (Return BO1 to High-Z floating)
        setHumidifierPress(false);
        humClickState = HUM_IDLE;
        Serial.println(F("[Humidifier] OFF 2-click completed. State: OFF"));
      }
      break;

    default:
      setHumidifierPress(false);
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
  // A. Cooling Fan Control (TB6612FNG Channel A)
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

  // Apply to Fan Driver
  setFanDrive(isFanActive);

  // B. Humidifier Momentary Control (TB6612FNG Channel B)
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
      Serial.println(F("[Firestore] Historical reading logged to /readings subcollection."));
    }
    https.end();
  }
}

// ==========================================
// 11. FIREBASE FIRESTORE REST: REMOTE CONFIG POLL
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
  configUrl += "/config/current";
  configUrl += "?key=";
  configUrl += FIREBASE_API_KEY;

  if (https.begin(client, configUrl)) {
    int httpCode = https.GET();
    if (httpCode == HTTP_CODE_OK || httpCode == 200) {
      String response = https.getString();
      StaticJsonDocument<1024> doc;
      DeserializationError err = deserializeJson(doc, response);

      if (!err && doc.containsKey("fields")) {
        JsonObject fields = doc["fields"];

        if (fields.containsKey("temperatureOnC")) {
          currentConfig.tempOnC = fields["temperatureOnC"]["doubleValue"] | currentConfig.tempOnC;
        }
        if (fields.containsKey("temperatureOffC")) {
          currentConfig.tempOffC = fields["temperatureOffC"]["doubleValue"] | currentConfig.tempOffC;
        }
        if (fields.containsKey("fanControlEnabled")) {
          currentConfig.tempEnabled = fields["fanControlEnabled"]["booleanValue"] | currentConfig.tempEnabled;
        }
        if (fields.containsKey("fanMode")) {
          String newFanMode = fields["fanMode"]["stringValue"].as<String>();
          if (newFanMode.length() > 0 && newFanMode != currentConfig.fanMode) {
            Serial.printf("[Cloud Config] Fan Mode changed: %s -> %s\n", currentConfig.fanMode.c_str(), newFanMode.c_str());
            currentConfig.fanMode = newFanMode;
          }
        }

        if (fields.containsKey("humidityOnRH")) {
          currentConfig.humOnRH = fields["humidityOnRH"]["doubleValue"] | currentConfig.humOnRH;
        }
        if (fields.containsKey("humidityOffRH")) {
          currentConfig.humOffRH = fields["humidityOffRH"]["doubleValue"] | currentConfig.humOffRH;
        }
        if (fields.containsKey("mistControlEnabled")) {
          currentConfig.humEnabled = fields["mistControlEnabled"]["booleanValue"] | currentConfig.humEnabled;
        }
        if (fields.containsKey("mistMode")) {
          String newMistMode = fields["mistMode"]["stringValue"].as<String>();
          if (newMistMode.length() > 0 && newMistMode != currentConfig.mistMode) {
            Serial.printf("[Cloud Config] Humidifier Mode changed: %s -> %s\n", currentConfig.mistMode.c_str(), newMistMode.c_str());
            currentConfig.mistMode = newMistMode;
          }
        }

        // Check for timed overrides expiry
        if (fields.containsKey("overrideExpiresAt") && currentConfig.fanMode != "AUTO") {
          String expiresAtStr = fields["overrideExpiresAt"]["stringValue"].as<String>();
          if (expiresAtStr.length() > 0) {
            String nowIso = getIsoTimestamp();
            if (nowIso > expiresAtStr) {
              Serial.println(F("[Cloud Config] Fan override expired! Returning to AUTO."));
              currentConfig.fanMode = "AUTO";
            }
          }
        }

        if (fields.containsKey("mistOverrideExpiresAt") && currentConfig.mistMode != "AUTO") {
          String mistExpiresAt = fields["mistOverrideExpiresAt"]["stringValue"].as<String>();
          if (mistExpiresAt.length() > 0) {
            String nowIso = getIsoTimestamp();
            if (nowIso > mistExpiresAt) {
              Serial.println(F("[Cloud Config] Mist override expired! Returning to AUTO."));
              currentConfig.mistMode = "AUTO";
            }
          }
        }

        evaluateActuators(lastTempC, lastHumRH);
        renderOledDisplay();
      }
    }
    https.end();
  }
}

// ==========================================
// 12. SERIAL COMMAND PARSER
// ==========================================
void handleSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "FAN ON") {
    currentConfig.fanMode = "FORCE_ON";
    isFanActive = true;
    setFanDrive(true);
    renderOledDisplay();
    Serial.println(F("Fan turned ON (TB6612FNG Channel A: 100% full speed)."));
  } else if (cmd == "FAN OFF") {
    currentConfig.fanMode = "FORCE_OFF";
    isFanActive = false;
    setFanDrive(false);
    renderOledDisplay();
    Serial.println(F("Fan turned OFF (TB6612FNG Channel A: Coast/Stop)."));
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
    Serial.print(F("Driver: TB6612FNG (Dual H-Bridge Motor Driver)\n"));
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
    Serial.println(F("FAN ON     - Turn fan on (TB6612FNG Channel A forward)"));
    Serial.println(F("FAN OFF    - Turn fan off (TB6612FNG Channel A stop)"));
    Serial.println(F("FAN AUTO   - Return fan to auto threshold"));
    Serial.println(F("HUM ON     - Simulate 1 button click (BO1 pull to GND 200ms)"));
    Serial.println(F("HUM OFF    - Simulate 2 clicks (200ms pulse, 300ms pause, 200ms pulse)"));
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
// 13. SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(300);

  // 1. Initialize TB6612FNG Motor Driver Pins
  initMotorDriver();

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
  Serial.println(F("Driver: TB6612FNG Dual H-Bridge (Ch A: 5V DC Fan, Ch B: Humidifier Pull-to-GND)"));
  Serial.println(F("Type HELP in Serial Monitor for available commands."));
}

// ==========================================
// 14. MAIN SUPER-LOOP
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
