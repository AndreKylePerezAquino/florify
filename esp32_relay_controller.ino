/*
 * ==============================================================================
 * Florify IoT - ESP32 Climate Monitor & Actuator Firmware (Integrated)
 * Hardware:
 *   - ESP32 Development Board (NodeMCU / DevKit)
 *   - DHT11 Temperature & Relative Humidity Sensor on GPIO 4
 *   - Actuator Relay 1: Cooling Fan on GPIO 26 (Active LOW)
 *   - Actuator Relay 2: Misting Solenoid / Humidifier on GPIO 27 (Active LOW)
 *   - Status Indicator: Built-in LED on GPIO 2
 *
 * Integrated Capabilities:
 *   1. Direct Firebase Firestore REST API v1 over HTTPS (SSL/TLS):
 *      - Direct PATCH to /databases/(default)/documents/devices/{DEVICE_ID}
 *      - Direct POST to /readings subcollection for time-series charts
 *      - Periodic GET to poll remote /config/current thresholds and mode overrides
 *   2. Closed-Loop Autonomous Local Climate Automation (Hysteresis):
 *      - Fan triggers ON if temp >= tempOnC, turns OFF if temp <= tempOffC
 *      - Mist triggers ON if hum <= humOnRH, turns OFF if hum >= humOffRH
 *      - Respects cloud manual overrides ("AUTO", "FORCE_ON", "FORCE_OFF")
 *   3. Local Web Server (mDNS: http://esp32.local) with CORS:
 *      - GET /status, GET /fan?state=on|off, GET /hum?state=on|off
 *   4. Serial Monitor Commands (115200 baud):
 *      - R1 ON, R1 OFF, R2 ON, R2 OFF, ALL ON, ALL OFF, STATUS, HELP
 *   5. Glitch-free safe relay initialization on boot
 * ==============================================================================
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <time.h>

// ==========================================
// 1. HARDWARE PIN DEFINITIONS & RELAY LOGIC
// ==========================================
#define DHTPIN            4     // DHT11 Data pin on GPIO 4
#define DHTTYPE           DHT11 // Sensor model

#define RELAY_FAN_PIN     26    // Relay 1: Cooling Fan (GPIO 26)
#define RELAY_MIST_PIN    27    // Relay 2: Misting / Humidifier (GPIO 27)
#define STATUS_LED_PIN    2     // Built-in LED indicator on GPIO 2

// Active LOW Relay Constants (Standard 5V optocoupled relay modules)
#define RELAY_ON          LOW   // Coil energized (COM connects to NO)
#define RELAY_OFF         HIGH  // Coil de-energized (COM connects to NC)

// ==========================================
// 2. NETWORK & FIREBASE FIRESTORE CREDENTIALS
// ==========================================
// Wi-Fi Credentials
const char* WIFI_SSID     = "John3:16";
const char* WIFI_PASSWORD = "JesusSaves!";

// Florify Firebase Firestore Configuration
const char* FIREBASE_PROJECT_ID  = "florify-c5dea";
const char* FIREBASE_DATABASE_ID = "(default)";
const char* FIREBASE_API_KEY     = "AIzaSyBHQc-tMbFYHlvpsds7oTA635Yebr7k0_o";

// Device Identification
const char* DEVICE_ID       = "ESP32-FLORIFY-01";
const char* FIRMWARE_VER    = "v2.3.0-florify-rest";

// ==========================================
// 3. CLOSED-LOOP CLIMATE AUTOMATION THRESHOLDS
// ==========================================
struct DeviceThresholds {
  bool tempEnabled = true;
  float tempOnC    = 40.0;    // Fan turns ON if temp >= 40.0 °C
  float tempOffC   = 38.0;    // Fan turns OFF if temp <= 38.0 °C

  bool humEnabled  = false;   // Mist automation disabled by default
  float humOnRH    = 40.0;    // Mist turns ON if humidity <= 40.0 % RH (too dry)
  float humOffRH   = 55.0;    // Mist turns OFF if humidity >= 55.0 % RH (satisfied)

  String fanMode   = "AUTO";      // "AUTO", "FORCE_ON", "FORCE_OFF"
  String mistMode  = "FORCE_OFF"; // "AUTO", "FORCE_ON", "FORCE_OFF"
};

DeviceThresholds currentConfig;
DHT dht(DHTPIN, DHTTYPE);

// ==========================================
// 4. TIMING & SYSTEM STATE
// ==========================================
const unsigned long TELEMETRY_INTERVAL_MS = 6000;   // Push readings to Firestore every 6s
const unsigned long CONFIG_POLL_INTERVAL_MS = 15000; // Poll cloud config every 15s
const unsigned long WIFI_RECONNECT_INTERVAL = 10000; // Wi-Fi check interval

float latestTemperatureC = 0.0f;
float latestHumidityRH   = 0.0f;
bool isFanActive         = false;
bool isMistActive        = false;
bool sensorHealthy       = false;
unsigned long sensorConsecutiveErrors = 0;
unsigned long lastValidDhtReadMs = 0;
unsigned long lastTelemetryMillis = 0;
unsigned long lastConfigPollMillis = 0;
unsigned long lastWifiCheckMs     = 0;

// Local Web Server on Port 80
WebServer server(80);

// ==========================================
// 5. HELPER: UTC ISO-8601 TIMESTAMP (NTP)
// ==========================================
String getIsoTimestamp() {
  time_t now;
  time(&now);
  struct tm timeinfo;
  if (!gmtime_r(&now, &timeinfo) || now < 100000) {
    return "2026-10-24T00:00:00Z";
  }
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

// ==========================================
// 6. HELPER: CORS PREFLIGHT
// ==========================================
void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

void handleOptionsPreflight() {
  sendCorsHeaders();
  server.send(204);
}

// ==========================================
// 7. SENSOR READING & VALIDATION
// ==========================================
void readDhtSensor(bool force = false) {
  unsigned long now = millis();
  if (!force && (now - lastValidDhtReadMs < 2000)) {
    return;
  }

  float hum  = dht.readHumidity();
  float temp = dht.readTemperature();

  if (isnan(hum) || isnan(temp) || temp < -20.0f || temp > 80.0f || hum < 0.0f || hum > 100.0f) {
    sensorConsecutiveErrors++;
    sensorHealthy = false;
    Serial.printf("[DHT11 ERROR] Reading #%lu invalid (Temp: %.1f C, Hum: %.1f %%)\n",
                  sensorConsecutiveErrors, temp, hum);
  } else {
    latestTemperatureC = temp;
    latestHumidityRH   = hum;
    sensorHealthy      = true;
    sensorConsecutiveErrors = 0;
    lastValidDhtReadMs = now;
  }
}

// ==========================================
// 8. CLOSED-LOOP HYSTERESIS ACTUATOR EVALUATION
// ==========================================
void evaluateActuators(float tempC, float humRH) {
  // --- Fan Actuator Logic (Relay 1 - GPIO 26) ---
  if (currentConfig.fanMode == "FORCE_ON") {
    isFanActive = true;
  } else if (currentConfig.fanMode == "FORCE_OFF") {
    isFanActive = false;
  } else if (currentConfig.tempEnabled) {
    if (tempC >= currentConfig.tempOnC) {
      isFanActive = true;
    } else if (tempC <= currentConfig.tempOffC) {
      isFanActive = false;
    }
  } else {
    isFanActive = false;
  }

  // --- Mist Actuator Logic (Relay 2 - GPIO 27) ---
  if (currentConfig.mistMode == "FORCE_ON") {
    isMistActive = true;
  } else if (currentConfig.mistMode == "FORCE_OFF") {
    isMistActive = false;
  } else if (currentConfig.mistMode == "AUTO" && currentConfig.humEnabled) {
    if (humRH <= currentConfig.humOnRH) {
      isMistActive = true;
    } else if (humRH >= currentConfig.humOffRH) {
      isMistActive = false;
    }
  } else {
    isMistActive = false;
  }

  // Apply to physical relays (Active LOW: LOW = ON, HIGH = OFF)
  digitalWrite(RELAY_FAN_PIN, isFanActive ? RELAY_ON : RELAY_OFF);
  digitalWrite(RELAY_MIST_PIN, isMistActive ? RELAY_ON : RELAY_OFF);

  Serial.printf("[Actuators] Fan (GPIO 26): %s | Mist (GPIO 27): %s | Modes: Fan=%s, Mist=%s\n",
                isFanActive ? "ON" : "OFF",
                isMistActive ? "ON" : "OFF",
                currentConfig.fanMode.c_str(),
                currentConfig.mistMode.c_str());
}

// ==========================================
// 9. DIRECT FIREBASE FIRESTORE REST API (v1)
// ==========================================

// Update device summary document in Firestore
void sendTelemetryToFirestore(float tempC, float humRH) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // SSL handshake for firestore.googleapis.com
  HTTPClient https;

  // Build Firestore REST Document PATCH URL with updateMask
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
  patchUrl += "&updateMask.fieldPaths=sensorType";
  patchUrl += "&updateMask.fieldPaths=active";
  patchUrl += "&updateMask.fieldPaths=displayName";
  patchUrl += "&key=";
  patchUrl += FIREBASE_API_KEY;

  if (https.begin(client, patchUrl)) {
    https.addHeader("Content-Type", "application/json");
    https.setTimeout(5000);
    String nowIso = getIsoTimestamp();

    JsonDocument doc;
    JsonObject fields = doc["fields"].to<JsonObject>();

    fields["latestTemperatureC"]["doubleValue"] = tempC;
    fields["latestHumidityRH"]["doubleValue"]    = humRH;
    fields["latestFanState"]["stringValue"]       = isFanActive ? "ON" : "OFF";
    fields["latestMistState"]["stringValue"]      = isMistActive ? "ON" : "OFF";
    fields["status"]["stringValue"]               = "ONLINE";
    fields["lastReadingAt"]["stringValue"]        = nowIso;
    fields["lastSeenAt"]["stringValue"]           = nowIso;
    fields["reportedMode"]["stringValue"]         = currentConfig.fanMode;
    fields["firmwareVersion"]["stringValue"]      = FIRMWARE_VER;
    fields["sensorType"]["stringValue"]           = "DHT11";
    fields["active"]["booleanValue"]              = true;
    fields["displayName"]["stringValue"]         = String("ESP32 Climate (") + DEVICE_ID + ")";

    String requestBody;
    serializeJson(doc, requestBody);

    int httpCode = https.PATCH(requestBody);
    if (httpCode == HTTP_CODE_OK || httpCode == 200) {
      Serial.printf("[Firestore] Summary PATCH ok: %.1f C, %.1f %% RH (Fan:%s, Mist:%s)\n",
                    tempC, humRH, isFanActive ? "ON" : "OFF", isMistActive ? "ON" : "OFF");
    } else {
      Serial.printf("[Firestore] Summary PATCH returned HTTP %d\n", httpCode);
    }
    https.end();
  }

  // Append historical time-series sample to /readings subcollection
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
    https.setTimeout(5000);

    JsonDocument readingDoc;
    JsonObject rFields = readingDoc["fields"].to<JsonObject>();

    rFields["temperatureC"]["doubleValue"]     = tempC;
    rFields["humidityRH"]["doubleValue"]        = humRH;
    rFields["fanState"]["stringValue"]          = isFanActive ? "ON" : "OFF";
    rFields["mistState"]["stringValue"]         = isMistActive ? "ON" : "OFF";
    rFields["operatingMode"]["stringValue"]     = currentConfig.fanMode;
    rFields["sensorHealthy"]["booleanValue"]    = sensorHealthy;
    rFields["receivedAt"]["stringValue"]        = getIsoTimestamp();

    String readingBody;
    serializeJson(readingDoc, readingBody);

    int rCode = https.POST(readingBody);
    if (rCode == HTTP_CODE_OK || rCode == 200) {
      Serial.println("[Firestore] Time-series sample logged to /readings.");
    } else {
      Serial.printf("[Firestore] Readings POST returned HTTP %d\n", rCode);
    }
    https.end();
  }
}

// Poll cloud configuration and dynamic threshold updates
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
    https.setTimeout(5000);
    int httpCode = https.GET();
    if (httpCode == 200) {
      String payload = https.getString();
      JsonDocument doc;
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
          currentConfig.fanMode = f["fanMode"]["stringValue"].as<String>();
        }
        if (f.containsKey("mistMode") && f["mistMode"].containsKey("stringValue")) {
          currentConfig.mistMode = f["mistMode"]["stringValue"].as<String>();
        }

        Serial.printf("[Config Sync] Temp: On=%.1f C Off=%.1f C | Hum: On=%.1f %% Off=%.1f %% | Modes: Fan=%s, Mist=%s\n",
                      currentConfig.tempOnC, currentConfig.tempOffC,
                      currentConfig.humOnRH, currentConfig.humOffRH,
                      currentConfig.fanMode.c_str(),
                      currentConfig.mistMode.c_str());
      }
    }
    https.end();
  }
}

// ==========================================
// 10. LOCAL WEB SERVER REQUEST HANDLERS
// ==========================================

// GET /status
void handleGetStatus() {
  sendCorsHeaders();
  readDhtSensor();

  JsonDocument doc;
  doc["deviceId"]            = DEVICE_ID;
  doc["firmwareVersion"]     = FIRMWARE_VER;
  doc["temperatureC"]        = sensorHealthy ? latestTemperatureC : (float)0.0;
  doc["humidityRH"]          = sensorHealthy ? latestHumidityRH : (float)0.0;
  doc["sensorHealthy"]       = sensorHealthy;
  doc["fanState"]            = isFanActive ? "ON" : "OFF";
  doc["mistState"]           = isMistActive ? "ON" : "OFF";
  doc["fanMode"]             = currentConfig.fanMode;
  doc["mistMode"]            = currentConfig.mistMode;
  doc["tempOnThreshold"]     = currentConfig.tempOnC;
  doc["tempOffThreshold"]    = currentConfig.tempOffC;
  doc["humOnThreshold"]      = currentConfig.humOnRH;
  doc["humOffThreshold"]     = currentConfig.humOffRH;
  doc["uptimeSec"]           = millis() / 1000;
  doc["freeHeapBytes"]       = ESP.getFreeHeap();
  doc["wifiRssi"]            = WiFi.RSSI();
  doc["lastReadElapsedMs"]   = millis() - lastValidDhtReadMs;

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// GET /fan?state=on|off
void handleFanRequest() {
  sendCorsHeaders();
  if (!server.hasArg("state")) {
    server.send(400, "application/json", "{\"error\":\"Missing state (?state=on or ?state=off)\"}");
    return;
  }

  String state = server.arg("state");
  state.toLowerCase();

  if (state == "on") {
    currentConfig.fanMode = "FORCE_ON";
    isFanActive = true;
    digitalWrite(RELAY_FAN_PIN, RELAY_ON);
    server.send(200, "application/json", "{\"status\":\"OK\",\"fanState\":\"ON\",\"mode\":\"FORCE_ON\"}");
  } else if (state == "off") {
    currentConfig.fanMode = "FORCE_OFF";
    isFanActive = false;
    digitalWrite(RELAY_FAN_PIN, RELAY_OFF);
    server.send(200, "application/json", "{\"status\":\"OK\",\"fanState\":\"OFF\",\"mode\":\"FORCE_OFF\"}");
  } else if (state == "auto") {
    currentConfig.fanMode = "AUTO";
    evaluateActuators(latestTemperatureC, latestHumidityRH);
    server.send(200, "application/json", "{\"status\":\"OK\",\"mode\":\"AUTO\"}");
  } else {
    server.send(400, "application/json", "{\"error\":\"Invalid state. Expected 'on', 'off', or 'auto'\"}");
  }
}

// GET /hum?state=on|off
void handleHumRequest() {
  sendCorsHeaders();
  if (!server.hasArg("state")) {
    server.send(400, "application/json", "{\"error\":\"Missing state (?state=on or ?state=off)\"}");
    return;
  }

  String state = server.arg("state");
  state.toLowerCase();

  if (state == "on") {
    currentConfig.mistMode = "FORCE_ON";
    isMistActive = true;
    digitalWrite(RELAY_MIST_PIN, RELAY_ON);
    server.send(200, "application/json", "{\"status\":\"OK\",\"mistState\":\"ON\",\"mode\":\"FORCE_ON\"}");
  } else if (state == "off") {
    currentConfig.mistMode = "FORCE_OFF";
    isMistActive = false;
    digitalWrite(RELAY_MIST_PIN, RELAY_OFF);
    server.send(200, "application/json", "{\"status\":\"OK\",\"mistState\":\"OFF\",\"mode\":\"FORCE_OFF\"}");
  } else if (state == "auto") {
    currentConfig.mistMode = "AUTO";
    evaluateActuators(latestTemperatureC, latestHumidityRH);
    server.send(200, "application/json", "{\"status\":\"OK\",\"mode\":\"AUTO\"}");
  } else {
    server.send(400, "application/json", "{\"error\":\"Invalid state. Expected 'on', 'off', or 'auto'\"}");
  }
}

// ==========================================
// 11. SERIAL MONITOR INTERFACE
// ==========================================
void printHelp() {
  Serial.println("\n=== FLORIFY ESP32 CLIMATE CONTROLLER ===");
  Serial.println("R1 ON   - Force Cooling Fan ON (GPIO 26)");
  Serial.println("R1 OFF  - Force Cooling Fan OFF");
  Serial.println("R2 ON   - Force Mist / Humidifier ON (GPIO 27)");
  Serial.println("R2 OFF  - Force Mist / Humidifier OFF");
  Serial.println("ALL ON  - Force both Fan & Mist ON");
  Serial.println("ALL OFF - Force both Fan & Mist OFF");
  Serial.println("AUTO    - Return actuators to automatic climate regulation");
  Serial.println("STATUS  - Display current temperature, humidity & thresholds");
  Serial.println("HELP    - Show this command reference");
  Serial.println("========================================\n");
}

void handleSerialCommands() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();

    if (cmd == "R1 ON") {
      currentConfig.fanMode = "FORCE_ON";
      isFanActive = true;
      digitalWrite(RELAY_FAN_PIN, RELAY_ON);
      Serial.println("[Serial] Fan forced ON (GPIO 26).");
    } else if (cmd == "R1 OFF") {
      currentConfig.fanMode = "FORCE_OFF";
      isFanActive = false;
      digitalWrite(RELAY_FAN_PIN, RELAY_OFF);
      Serial.println("[Serial] Fan forced OFF (GPIO 26).");
    } else if (cmd == "R2 ON") {
      currentConfig.mistMode = "FORCE_ON";
      isMistActive = true;
      digitalWrite(RELAY_MIST_PIN, RELAY_ON);
      Serial.println("[Serial] Mist forced ON (GPIO 27).");
    } else if (cmd == "R2 OFF") {
      currentConfig.mistMode = "FORCE_OFF";
      isMistActive = false;
      digitalWrite(RELAY_MIST_PIN, RELAY_OFF);
      Serial.println("[Serial] Mist forced OFF (GPIO 27).");
    } else if (cmd == "ALL ON") {
      currentConfig.fanMode = "FORCE_ON";
      currentConfig.mistMode = "FORCE_ON";
      isFanActive = true;
      isMistActive = true;
      digitalWrite(RELAY_FAN_PIN, RELAY_ON);
      digitalWrite(RELAY_MIST_PIN, RELAY_ON);
      Serial.println("[Serial] Both Fan & Mist forced ON.");
    } else if (cmd == "ALL OFF") {
      currentConfig.fanMode = "FORCE_OFF";
      currentConfig.mistMode = "FORCE_OFF";
      isFanActive = false;
      isMistActive = false;
      digitalWrite(RELAY_FAN_PIN, RELAY_OFF);
      digitalWrite(RELAY_MIST_PIN, RELAY_OFF);
      Serial.println("[Serial] Both Fan & Mist forced OFF.");
    } else if (cmd == "AUTO") {
      currentConfig.fanMode = "AUTO";
      currentConfig.mistMode = "AUTO";
      evaluateActuators(latestTemperatureC, latestHumidityRH);
      Serial.println("[Serial] Actuators returned to AUTO climate loop.");
    } else if (cmd == "STATUS") {
      Serial.printf("[Status] Temp: %.1f C | Hum: %.1f %% | Fan: %s (%s) | Mist: %s (%s)\n",
                    latestTemperatureC, latestHumidityRH,
                    isFanActive ? "ON" : "OFF", currentConfig.fanMode.c_str(),
                    isMistActive ? "ON" : "OFF", currentConfig.mistMode.c_str());
    } else if (cmd == "HELP") {
      printHelp();
    } else if (cmd.length() > 0) {
      Serial.println("Unknown command. Type HELP for commands.");
    }
  }
}

// ==========================================
// 12. WIFI & NTP CONNECTION ROUTINE
// ==========================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[WiFi] Connecting to SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startMs < 15000)) {
    delay(400);
    Serial.print(".");
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.printf("[WiFi] IP Address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WiFi] RSSI: %d dBm\n", WiFi.RSSI());

    // Sync NTP Time for RFC-3339 / ISO-8601 timestamps
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    Serial.println("[NTP] Time synchronization requested.");

    // Start mDNS responder (http://esp32.local)
    if (MDNS.begin("esp32")) {
      Serial.println("[mDNS] Responder active at: http://esp32.local");
      MDNS.addService("http", "tcp", 80);
    }
  } else {
    digitalWrite(STATUS_LED_PIN, LOW);
    Serial.println("\n[WiFi] Connection timeout. Running local climate automation.");
  }
}

void handleWifiWatchdog() {
  unsigned long now = millis();
  if (now - lastWifiCheckMs >= WIFI_RECONNECT_INTERVAL) {
    lastWifiCheckMs = now;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] Reconnecting...");
      WiFi.reconnect();
    }
  }
}

// ==========================================
// 13. SETUP & INITIALIZATION
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n==============================================");
  Serial.println("  Florify IoT - ESP32 Climate Controller      ");
  Serial.println("  Direct Firebase REST + Dual Relay Actuators ");
  Serial.println("==============================================");

  // SAFE DE-ENERGIZED STARTUP: Write HIGH before setting pinMode to prevent boot flicker
  digitalWrite(RELAY_FAN_PIN, RELAY_OFF);
  digitalWrite(RELAY_MIST_PIN, RELAY_OFF);
  pinMode(RELAY_FAN_PIN, OUTPUT);
  pinMode(RELAY_MIST_PIN, OUTPUT);

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  isFanActive = false;
  isMistActive = false;
  Serial.println("[INIT] Relays safely initialized to OFF (Active LOW).");

  // Initialize DHT11 sensor
  dht.begin();
  Serial.println("[INIT] DHT11 sensor initialized on GPIO 4.");
  readDhtSensor(true);

  // Connect to Wi-Fi & configure NTP
  connectWiFi();

  // Register Local Web Server endpoints with CORS
  server.on("/status", HTTP_GET, handleGetStatus);
  server.on("/status", HTTP_OPTIONS, handleOptionsPreflight);

  server.on("/fan", HTTP_GET, handleFanRequest);
  server.on("/fan", HTTP_OPTIONS, handleOptionsPreflight);

  server.on("/hum", HTTP_GET, handleHumRequest);
  server.on("/hum", HTTP_OPTIONS, handleOptionsPreflight);

  server.begin();
  Serial.println("[SERVER] Local HTTP endpoints registered: /status, /fan, /hum");
  printHelp();
  Serial.println("[READY] System initialized and running.\n");
}

// ==========================================
// 14. MAIN EXECUTION LOOP
// ==========================================
void loop() {
  unsigned long now = millis();

  // 1. Process local Web Server requests
  server.handleClient();

  // 2. Process Serial Monitor commands
  handleSerialCommands();

  // 3. Periodic sensor sample, actuator regulation & direct Firestore REST telemetry push
  if (now - lastTelemetryMillis >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMillis = now;

    readDhtSensor();

    if (sensorHealthy) {
      // Evaluate local autonomous hysteresis
      evaluateActuators(latestTemperatureC, latestHumidityRH);

      // Transmit directly to Firebase Firestore
      sendTelemetryToFirestore(latestTemperatureC, latestHumidityRH);
    }
  }

  // 4. Periodic cloud configuration polling
  if (now - lastConfigPollMillis >= CONFIG_POLL_INTERVAL_MS) {
    lastConfigPollMillis = now;
    pollRemoteConfig();
  }

  // 5. Wi-Fi watchdog
  handleWifiWatchdog();
}
