/*
 * ==============================================================================
 * Florify IoT - ESP32 Climate Monitor & Actuator Firmware
 * Hardware: ESP32 DevKit + DHT11 Sensor + 2-Channel 5V Optocoupled Relay Module
 * 
 * Actuators:
 *   - Channel 1 (GPIO 18): Shuttle Cabin Cooling Fan
 *   - Channel 2 (GPIO 19): Shuttle Cabin Evaporative Mist / Humidifier Solenoid
 * 
 * Communication: Direct Firebase Firestore REST API v1 over HTTPS (SSL/TLS)
 * Trigger Logic: Active LOW (LOW = Relay Energized / ON, HIGH = Relay Standby / OFF)
 * 
 * Required Arduino Libraries (Install via Arduino Library Manager):
 *   1. "DHT sensor library" by Adafruit
 *   2. "Adafruit Unified Sensor" by Adafruit
 *   3. "ArduinoJson" by Benoit Blanchon (v6 or v7)
 * ==============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

// ==========================================
// 1. HARDWARE PIN DEFINITIONS
// ==========================================
#define DHTPIN 4              // DHT11 Data pin connected to ESP32 GPIO 4
#define DHTTYPE DHT11         // DHT 11 Temperature & Humidity Sensor

#define RELAY_FAN_PIN 18      // Relay Channel 1: Cooling Fan
#define RELAY_MIST_PIN 19     // Relay Channel 2: Misting Solenoid / Humidifier
#define STATUS_LED_PIN 2      // Built-in blue LED for connectivity status

// Active LOW Relay Constants (Standard 5V Songle optocoupler board)
#define RELAY_ON  LOW
#define RELAY_OFF HIGH

// ==========================================
// 2. NETWORK & FIREBASE CREDENTIALS
// ==========================================
// Replace with your local shuttle WiFi or mobile hotspot credentials
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Florify Firebase Firestore Configuration
const char* FIREBASE_PROJECT_ID  = "florify-c5dea";
const char* FIREBASE_DATABASE_ID = "(default)";
const char* FIREBASE_API_KEY     = "AIzaSyCTt97yEB5-AGHTv5x423fCdQVBw03lUFc";

// Unique Device ID registered in Florify dashboard
const char* DEVICE_ID = "ESP32-FLORIFY-01";
const char* FIRMWARE_VERSION = "v2.2.0-dual-relay";

// ==========================================
// 3. CLOSED-LOOP CLIMATE AUTOMATION THRESHOLDS
// (Autonomous local fallback if connection drops)
// ==========================================
struct DeviceThresholds {
  bool tempEnabled = true;
  float tempOnC    = 40.0;    // Fan turns ON if temp >= 40.0 °C
  float tempOffC   = 38.0;    // Fan turns OFF if temp <= 38.0 °C

  bool humEnabled  = true;
  float humOnRH    = 60.0;    // Mist turns ON if humidity <= 60.0 % RH (too dry)
  float humOffRH   = 75.0;    // Mist turns OFF if humidity >= 75.0 % RH (satisfied)

  String fanMode   = "AUTO";  // "AUTO", "FORCE_ON", "FORCE_OFF"
  String mistMode  = "AUTO";  // "AUTO", "FORCE_ON", "FORCE_OFF"
};

DeviceThresholds currentConfig;
DHT dht(DHTPIN, DHTTYPE);

// State tracking
float lastTemp = 0.0;
float lastHum = 0.0;
bool isFanActive = false;
bool isMistActive = false;
unsigned long lastTelemetryMillis = 0;
unsigned long lastConfigPollMillis = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 6000;    // Transmit telemetry every 6s
const unsigned long CONFIG_POLL_INTERVAL_MS = 15000;  // Poll cloud config every 15s

// ==========================================
// 4. HELPER: UTC ISO-8601 TIMESTAMP (ESTIMATION)
// ==========================================
String getIsoTimestamp() {
  time_t now;
  time(&now);
  struct tm timeinfo;
  if (!gmtime_r(&now, &timeinfo) || now < 100000) {
    // If NTP not yet synced, return a valid placeholder ISO string
    return "2026-10-16T00:00:00Z";
  }
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

// ==========================================
// 5. WIFI & NTP SETUP
// ==========================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
    digitalWrite(STATUS_LED_PIN, HIGH);

    // Synchronize NTP clock for ISO timestamps
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    Serial.println("\n[WiFi] Connection timeout. Local automation running offline.");
    digitalWrite(STATUS_LED_PIN, LOW);
  }
}

// ==========================================
// 6. CLOSED-LOOP LOCAL HYSTERESIS LOGIC
// ==========================================
void evaluateActuators(float tempC, float humRH) {
  // --- A. Fan Control Logic (Relay 1) ---
  if (currentConfig.fanMode == "FORCE_ON") {
    isFanActive = true;
  } else if (currentConfig.fanMode == "FORCE_OFF") {
    isFanActive = false;
  } else if (currentConfig.tempEnabled) {
    // AUTO hysteresis
    if (tempC >= currentConfig.tempOnC) {
      isFanActive = true;
    } else if (tempC <= currentConfig.tempOffC) {
      isFanActive = false;
    }
  }

  // --- B. Mist / Humidifier Control Logic (Relay 2) ---
  if (currentConfig.mistMode == "FORCE_ON") {
    isMistActive = true;
  } else if (currentConfig.mistMode == "FORCE_OFF") {
    isMistActive = false;
  } else if (currentConfig.humEnabled) {
    // Misting activates when cabin air is too dry or for cooling evaporative boost
    if (humRH <= currentConfig.humOnRH) {
      isMistActive = true;
    } else if (humRH >= currentConfig.humOffRH) {
      isMistActive = false;
    }
  }

  // Apply to physical relays (Active LOW trigger)
  digitalWrite(RELAY_FAN_PIN, isFanActive ? RELAY_ON : RELAY_OFF);
  digitalWrite(RELAY_MIST_PIN, isMistActive ? RELAY_ON : RELAY_OFF);

  Serial.printf("[Actuators] Fan: %s | Mist: %s | Mode: %s\n",
    isFanActive ? "ON (Cooling)" : "OFF (Standby)",
    isMistActive ? "ON (Misting)" : "OFF (Standby)",
    currentConfig.fanMode.c_str()
  );
}

// ==========================================
// 7. FIREBASE FIRESTORE REST: PATCH TELEMETRY
// ==========================================
void sendTelemetryToFirestore(float tempC, float humRH) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return;
  }

  WiFiClientSecure client;
  client.setInsecure(); // Direct TLS without pre-installed root bundle

  HTTPClient https;

  // 1. Build PATCH URL for the Device summary document
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

    // Construct Firestore document structure
    StaticJsonDocument<512> doc;
    JsonObject fields = doc.createNestedObject("fields");

    fields["latestTemperatureC"]["doubleValue"] = tempC;
    fields["latestHumidityRH"]["doubleValue"]    = humRH;
    fields["latestFanState"]["stringValue"]       = isFanActive ? "ON" : "OFF";
    fields["latestMistState"]["stringValue"]      = isMistActive ? "ON" : "OFF";
    fields["status"]["stringValue"]               = "ONLINE";
    fields["lastReadingAt"]["stringValue"]        = nowIso;
    fields["lastSeenAt"]["stringValue"]           = nowIso;
    fields["reportedMode"]["stringValue"]         = currentConfig.fanMode;
    fields["firmwareVersion"]["stringValue"]      = FIRMWARE_VERSION;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpCode = https.PATCH(requestBody);
    if (httpCode == HTTP_CODE_OK || httpCode == 200) {
      Serial.println("[Firestore] Device summary updated successfully.");
    } else {
      Serial.printf("[Firestore] PATCH failed, code: %d, body: %s\n", httpCode, https.getString().c_str());
    }
    https.end();
  }

  // 2. Build POST URL for time-series readings subcollection
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

    StaticJsonDocument<512> readingDoc;
    JsonObject rFields = readingDoc.createNestedObject("fields");

    rFields["temperatureC"]["doubleValue"]     = tempC;
    rFields["humidityRH"]["doubleValue"]        = humRH;
    rFields["fanState"]["stringValue"]          = isFanActive ? "ON" : "OFF";
    rFields["mistState"]["stringValue"]         = isMistActive ? "ON" : "OFF";
    rFields["operatingMode"]["stringValue"]     = currentConfig.fanMode;
    rFields["sensorHealthy"]["booleanValue"]    = true;
    rFields["receivedAt"]["stringValue"]        = getIsoTimestamp();

    String readingBody;
    serializeJson(readingDoc, readingBody);

    int rCode = https.POST(readingBody);
    if (rCode == HTTP_CODE_OK || rCode == 200) {
      Serial.println("[Firestore] Time-series sample logged.");
    }
    https.end();
  }
}

// ==========================================
// 8. FIREBASE FIRESTORE REST: POLL CONFIG
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

        if (f.containsKey("temperatureOnC") && f["temperatureOnC"].containsKey("doubleValue")) {
          currentConfig.tempOnC = f["temperatureOnC"]["doubleValue"];
        }
        if (f.containsKey("temperatureOffC") && f["temperatureOffC"].containsKey("doubleValue")) {
          currentConfig.tempOffC = f["temperatureOffC"]["doubleValue"];
        }
        if (f.containsKey("humidityOnRH") && f["humidityOnRH"].containsKey("doubleValue")) {
          currentConfig.humOnRH = f["humidityOnRH"]["doubleValue"];
        }
        if (f.containsKey("humidityOffRH") && f["humidityOffRH"].containsKey("doubleValue")) {
          currentConfig.humOffRH = f["humidityOffRH"]["doubleValue"];
        }
        if (f.containsKey("fanMode") && f["fanMode"].containsKey("stringValue")) {
          currentConfig.fanMode = f["fanMode"]["stringValue"].as<String>();
        }

        Serial.printf("[Config Sync] Temp: On=%.1f°C Off=%.1f°C | Hum: On=%.1f%% Off=%.1f%% | Mode=%s\n",
          currentConfig.tempOnC, currentConfig.tempOffC,
          currentConfig.humOnRH, currentConfig.humOffRH,
          currentConfig.fanMode.c_str()
        );
      }
    }
    https.end();
  }
}

// ==========================================
// 9. SETUP & INITIALIZATION
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==========================================");
  Serial.println("  Florify IoT ESP32 Climate Controller    ");
  Serial.println("  DHT11 + Dual Relay (Fan & Mist Solenoid)");
  Serial.println("==========================================");

  // Initialize Relays in SAFE DE-ENERGIZED state (Active LOW -> write HIGH before pinMode)
  digitalWrite(RELAY_FAN_PIN, RELAY_OFF);
  digitalWrite(RELAY_MIST_PIN, RELAY_OFF);
  pinMode(RELAY_FAN_PIN, OUTPUT);
  pinMode(RELAY_MIST_PIN, OUTPUT);

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // Start DHT11 sensor bus
  dht.begin();
  Serial.println("[Sensors] DHT11 sensor initialized on GPIO 4.");

  // Connect to WiFi
  connectWiFi();
}

// ==========================================
// 10. MAIN EXECUTION LOOP
// ==========================================
void loop() {
  unsigned long now = millis();

  // 1. Read DHT11 and evaluate local automation loop
  if (now - lastTelemetryMillis >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMillis = now;

    float hum = dht.readHumidity();
    float temp = dht.readTemperature(); // Celsius

    if (isnan(hum) || isnan(temp)) {
      Serial.println("[DHT11] Warning: Failed to read from DHT sensor! Retrying bus...");
      digitalWrite(STATUS_LED_PIN, LOW);
    } else {
      lastTemp = temp;
      lastHum = hum;

      Serial.printf("[Telemetry] DHT11 -> Temp: %.1f °C | Humidity: %.1f %% RH\n", temp, hum);

      // Run closed-loop automation
      evaluateActuators(temp, hum);

      // Transmit live data to Florify Firestore
      sendTelemetryToFirestore(temp, hum);
    }
  }

  // 2. Poll remote configuration updates from cloud
  if (now - lastConfigPollMillis >= CONFIG_POLL_INTERVAL_MS) {
    lastConfigPollMillis = now;
    pollRemoteConfig();
  }

  delay(50);
}
