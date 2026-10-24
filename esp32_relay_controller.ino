/* ==============================================================================
 * Project: ESP32 Climate Monitoring & Appliance Control System
 * Hardware:
 *   - ESP32 Development Board
 *   - DHT11 Temperature & Relative Humidity Sensor (GPIO 4)
 *   - Relay 1 (Fan): GPIO 18 [Normal ON/OFF switch]
 *   - Relay 2 (Humidifier): GPIO 19 [Button-click simulator]
 *   - Relay Polarity: Active HIGH (RELAY_ACTIVE_LOW = false)
 *
 * Cloud Integration (Option 1):
 *   - Live Cloud App: https://ais-dev-7cvxx7mrqyouauu4kc4dgz-311611723945.asia-southeast1.run.app
 *   - WiFiClientSecure with setInsecure() for seamless SSL connection
 *   - Periodic DHT11 telemetry push to POST /api/device/readings
 *   - Periodic heartbeat ping to POST /api/device/heartbeat
 *
 * Control Channels:
 *   1. Local Web Server (mDNS: http://esp32.local):
 *      - GET /status          -> Telemetry & appliance states
 *      - GET /fan?state=on|off -> Fan relay control
 *      - GET /hum?state=on|off -> Humidifier button clicks (1 for ON, 2 for OFF)
 *   2. Serial Monitor Commands (115200 baud):
 *      - R1 ON / R1 OFF, R2 ON / R2 OFF, ALL ON / ALL OFF, HELP
 * ============================================================================== */

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ==========================================
// 1. HARDWARE PIN DEFINITIONS & RELAY CONFIG
// ==========================================
const int DHT_PIN  = 4;     // GPIO 4 for DHT11 data line
#define DHT_TYPE     DHT11  // DHT 11 sensor model

const int RELAY1   = 18;    // Fan relay: normal ON/OFF
const int RELAY2   = 19;    // Humidifier relay: button clicks

// false = active-HIGH relay; true = active-LOW relay
const bool RELAY_ACTIVE_LOW = false;

// Humidifier click sequence timings
const unsigned long CLICK_DURATION_MS = 200;
const unsigned long CLICK_INTERVAL_MS = 500;

// Relay hardware control helper
void relayControl(int pin, bool on) {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(pin, on ? LOW : HIGH);
  } else {
    digitalWrite(pin, on ? HIGH : LOW);
  }
}

// ==========================================
// 2. HUMIDIFIER CLICK STATE MACHINE
// ==========================================
enum HumState {
  HUM_IDLE,
  HUM_FIRST_CLICK,
  HUM_WAIT_SECOND,
  HUM_SECOND_CLICK
};

HumState humState = HUM_IDLE;
unsigned long humTimer = 0;
bool humidifierTurnOffSequence = false;

// Track commanded states
bool commandedFanState = false;  // false = OFF, true = ON
bool commandedHumState = false;  // false = OFF, true = ON

// Start a humidifier button-click sequence
bool humidifierClick(bool turnOn, const char* source = "LOCAL") {
  if (humState != HUM_IDLE) {
    Serial.println("[HUMIDIFIER] Sequence busy; command ignored.");
    return false;
  }

  // Prevent redundant click sequences if already in requested commanded state
  if (turnOn == commandedHumState) {
    Serial.printf("[HUMIDIFIER] Duplicate command ignored (%s: already commanded %s)\n",
                  source, turnOn ? "ON" : "OFF");
    return false;
  }

  commandedHumState = turnOn;
  humidifierTurnOffSequence = !turnOn;

  // First click
  relayControl(RELAY2, true);
  humTimer = millis();
  humState = HUM_FIRST_CLICK;

  Serial.printf("[HUMIDIFIER] %s: %s (%s)\n",
                source,
                turnOn ? "Humidifier ON: 1 click started." : "Humidifier OFF: 2-click sequence started.",
                "Note: physical state requires external verification");
  return true;
}

// Progress click sequence without blocking
void updateHumidifier() {
  unsigned long now = millis();

  switch (humState) {
    case HUM_IDLE:
      break;

    case HUM_FIRST_CLICK:
      if (now - humTimer >= CLICK_DURATION_MS) {
        relayControl(RELAY2, false);

        if (humidifierTurnOffSequence) {
          humTimer = now;
          humState = HUM_WAIT_SECOND;
          Serial.println("[HUMIDIFIER] First click released; waiting 500 ms.");
        } else {
          humState = HUM_IDLE;
          Serial.println("[HUMIDIFIER] Humidifier ON click complete.");
        }
      }
      break;

    case HUM_WAIT_SECOND:
      if (now - humTimer >= CLICK_INTERVAL_MS) {
        relayControl(RELAY2, true);
        humTimer = now;
        humState = HUM_SECOND_CLICK;
        Serial.println("[HUMIDIFIER] Second click started (200 ms).");
      }
      break;

    case HUM_SECOND_CLICK:
      if (now - humTimer >= CLICK_DURATION_MS) {
        relayControl(RELAY2, false);
        humState = HUM_IDLE;
        Serial.println("[HUMIDIFIER] Humidifier OFF click sequence complete.");
      }
      break;
  }
}

// Fan relay control with state tracking & deduplication
void setFanState(bool turnOn, const char* source = "LOCAL") {
  if (turnOn == commandedFanState) {
    Serial.printf("[FAN] Duplicate command ignored (%s: already %s)\n", source, turnOn ? "ON" : "OFF");
    return;
  }

  commandedFanState = turnOn;
  relayControl(RELAY1, commandedFanState);
  Serial.printf("[FAN] %s -> Fan relay %s\n", source, commandedFanState ? "ON" : "OFF");
}

// ==========================================
// 3. NETWORK & CLOUD BACKEND CONFIGURATION
// ==========================================
// Wi-Fi Credentials
const char* WIFI_SSID       = "John3:16";
const char* WIFI_PASSWORD   = "JesusSaves!";

// Identity for web backend integration
const char* DEVICE_ID       = "ESP32-CLIMATE-01";
const char* DEVICE_TOKEN    = "esp32_sec_alpha998_secret";
const char* FIRMWARE_VER    = "2.3.0-climate";

// OPTION 1: Connected directly to your live Cloud App
const char* BACKEND_BASE_URL = "https://ais-dev-7cvxx7mrqyouauu4kc4dgz-311611723945.asia-southeast1.run.app";

// ==========================================
// 4. TIMING & TELEMETRY STATE
// ==========================================
const unsigned long DHT_SAMPLE_INTERVAL_MS = 2500;   // DHT11 hardware limit is >= 2000 ms
const unsigned long TELEMETRY_PUSH_INTERVAL = 5000;  // Push readings to server every 5s
const unsigned long HEARTBEAT_INTERVAL_MS   = 15000; // Heartbeat ping every 15s
const unsigned long WIFI_RECONNECT_INTERVAL = 10000; // Wi-Fi check interval

DHT dht(DHT_PIN, DHT_TYPE);
float latestTemperatureC = 0.0f;
float latestHumidityRH   = 0.0f;
bool sensorHealthy       = false;
unsigned long lastValidDhtReadMs = 0;
unsigned long sensorConsecutiveErrors = 0;
unsigned long lastTelemetryPushMs = 0;
unsigned long lastHeartbeatPushMs = 0;
unsigned long lastWifiCheckMs     = 0;

// Local Web Server on Port 80
WebServer server(80);

// CORS headers for direct browser/web dashboard communication
void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

void handleOptionsPreflight() {
  sendCorsHeaders();
  server.send(204);
}

// DHT11 Reading & Validation
void readDhtSensor(bool force = false) {
  unsigned long now = millis();
  if (!force && (now - lastValidDhtReadMs < DHT_SAMPLE_INTERVAL_MS)) {
    return;
  }

  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();

  if (isnan(temp) || isnan(hum) || temp < -20.0f || temp > 80.0f || hum < 0.0f || hum > 100.0f) {
    sensorConsecutiveErrors++;
    sensorHealthy = false;
    Serial.printf("[DHT11 ERROR] Invalid reading #%lu: Temp=%0.1f C, Hum=%0.1f%%\n",
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
// 5. LOCAL WEB SERVER HANDLERS
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
  doc["fanState"]            = commandedFanState ? "ON" : "OFF";
  doc["commandedHumState"]   = commandedHumState ? "ON" : "OFF";
  doc["humidifierBusy"]      = (humState != HUM_IDLE);
  doc["uptimeSec"]           = millis() / 1000;
  doc["freeHeapBytes"]       = ESP.getFreeHeap();
  doc["wifiRssi"]            = WiFi.RSSI();
  doc["lastReadElapsedMs"]   = millis() - lastValidDhtReadMs;
  doc["consecutiveErrors"]   = sensorConsecutiveErrors;

  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// GET /fan?state=on|off
void handleFanRequest() {
  sendCorsHeaders();
  if (!server.hasArg("state")) {
    server.send(400, "application/json", "{\"error\":\"Missing 'state' param (?state=on or ?state=off)\"}");
    return;
  }

  String state = server.arg("state");
  state.toLowerCase();

  if (state == "on") {
    setFanState(true, "LOCAL_HTTP");
    server.send(200, "application/json", "{\"status\":\"OK\",\"fanState\":\"ON\"}");
  } else if (state == "off") {
    setFanState(false, "LOCAL_HTTP");
    server.send(200, "application/json", "{\"status\":\"OK\",\"fanState\":\"OFF\"}");
  } else {
    server.send(400, "application/json", "{\"error\":\"Invalid state. Expected 'on' or 'off'\"}");
  }
}

// GET /hum?state=on|off
void handleHumidifierRequest() {
  sendCorsHeaders();
  if (!server.hasArg("state")) {
    server.send(400, "application/json", "{\"error\":\"Missing 'state' param (?state=on or ?state=off)\"}");
    return;
  }

  String state = server.arg("state");
  state.toLowerCase();

  if (state == "on") {
    bool ok = humidifierClick(true, "LOCAL_HTTP");
    if (ok) {
      server.send(200, "application/json", "{\"status\":\"PULSE_INITIATED\",\"commandedState\":\"ON\",\"clicks\":1}");
    } else {
      server.send(409, "application/json", "{\"status\":\"IGNORED\",\"reason\":\"Already in requested state or busy\"}");
    }
  } else if (state == "off") {
    bool ok = humidifierClick(false, "LOCAL_HTTP");
    if (ok) {
      server.send(200, "application/json", "{\"status\":\"PULSE_INITIATED\",\"commandedState\":\"OFF\",\"clicks\":2}");
    } else {
      server.send(409, "application/json", "{\"status\":\"IGNORED\",\"reason\":\"Already in requested state or busy\"}");
    }
  } else {
    server.send(400, "application/json", "{\"error\":\"Invalid state. Expected 'on' or 'off'\"}");
  }
}

// ==========================================
// 6. CLOUD / EXPRESS BACKEND PUSH (OPTION 1)
// ==========================================
void pushTelemetryToBackend() {
  if (strlen(BACKEND_BASE_URL) == 0 || WiFi.status() != WL_CONNECTED) return;
  if (!sensorHealthy) return;

  HTTPClient http;
  WiFiClientSecure secureClient;
  WiFiClient normalClient;
  String url = String(BACKEND_BASE_URL) + "/api/device/readings";

  if (url.startsWith("https://")) {
    secureClient.setInsecure(); // Skip certificate verification for cloud domain
    http.begin(secureClient, url);
  } else {
    http.begin(normalClient, url);
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.setTimeout(5000);

  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  JsonArray readings = doc["readings"].to<JsonArray>();
  JsonObject sample = readings.add<JsonObject>();
  sample["temperatureC"]  = latestTemperatureC;
  sample["humidityRH"]    = latestHumidityRH;
  sample["fanState"]      = commandedFanState ? "ON" : "OFF";
  sample["mistState"]     = commandedHumState ? "ON" : "OFF";
  sample["operatingMode"] = "AUTO";
  sample["sensorHealthy"] = sensorHealthy;

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.POST(requestBody);
  if (httpCode == 200 || httpCode == 201) {
    Serial.printf("[CLOUD] Ingested: %0.1f°C, %0.1f%% RH | Fan:%s Hum:%s\n",
                  latestTemperatureC, latestHumidityRH,
                  commandedFanState ? "ON" : "OFF",
                  commandedHumState ? "ON" : "OFF");
  } else if (httpCode == -1) {
    Serial.println("[CLOUD ERROR] HTTP -1: Connection failed to Cloud URL. Check internet connection.");
  } else {
    Serial.printf("[CLOUD] POST /api/device/readings returned HTTP %d\n", httpCode);
  }
  http.end();
}

void pushHeartbeatToBackend() {
  if (strlen(BACKEND_BASE_URL) == 0 || WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  WiFiClientSecure secureClient;
  WiFiClient normalClient;
  String url = String(BACKEND_BASE_URL) + "/api/device/heartbeat";

  if (url.startsWith("https://")) {
    secureClient.setInsecure();
    http.begin(secureClient, url);
  } else {
    http.begin(normalClient, url);
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  http.setTimeout(5000);

  JsonDocument doc;
  doc["deviceId"]        = DEVICE_ID;
  doc["firmwareVersion"] = FIRMWARE_VER;
  doc["freeHeap"]        = ESP.getFreeHeap();
  doc["wifiRssi"]        = WiFi.RSSI();

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.POST(requestBody);
  if (httpCode == 200) {
    Serial.println("[CLOUD] Heartbeat acknowledged by server.");
  } else if (httpCode != -1) {
    Serial.printf("[CLOUD] POST /api/device/heartbeat returned HTTP %d\n", httpCode);
  }
  http.end();
}

void handleWifiWatchdog() {
  unsigned long now = millis();
  if (now - lastWifiCheckMs >= WIFI_RECONNECT_INTERVAL) {
    lastWifiCheckMs = now;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WIFI] Reconnecting...");
      WiFi.reconnect();
    }
  }
}

// Print help for Serial commands
void printHelp() {
  Serial.println("\n=== ESP32 RELAY & CLIMATE CONTROLLER ===");
  Serial.println("R1 ON   - Fan ON");
  Serial.println("R1 OFF  - Fan OFF");
  Serial.println("R2 ON   - Humidifier button: 1 click");
  Serial.println("R2 OFF  - Humidifier button: 2 clicks");
  Serial.println("ALL ON  - Fan ON + humidifier 1 click");
  Serial.println("ALL OFF - Fan OFF + humidifier 2 clicks");
  Serial.println("HELP    - Show commands");
  Serial.println("========================================\n");
}

// Process Serial Monitor inputs
void handleSerialCommands() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();

    if (cmd == "R1 ON") {
      setFanState(true, "SERIAL");
    } else if (cmd == "R1 OFF") {
      setFanState(false, "SERIAL");
    } else if (cmd == "R2 ON") {
      humidifierClick(true, "SERIAL");
    } else if (cmd == "R2 OFF") {
      humidifierClick(false, "SERIAL");
    } else if (cmd == "ALL ON") {
      setFanState(true, "SERIAL");
      humidifierClick(true, "SERIAL");
    } else if (cmd == "ALL OFF") {
      setFanState(false, "SERIAL");
      humidifierClick(false, "SERIAL");
    } else if (cmd == "HELP") {
      printHelp();
    } else if (cmd.length() > 0) {
      Serial.println("Unknown command. Type HELP.");
    }
  }
}

// ==========================================
// 7. SETUP & INITIALIZATION
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n==============================================");
  Serial.println("  ESP32 Climate Monitor & Appliance Controller");
  Serial.println("==============================================");

  // Safe initialization: set inactive output levels BEFORE configuring outputs
  digitalWrite(RELAY1, RELAY_ACTIVE_LOW ? HIGH : LOW);
  digitalWrite(RELAY2, RELAY_ACTIVE_LOW ? HIGH : LOW);

  pinMode(RELAY1, OUTPUT);
  pinMode(RELAY2, OUTPUT);

  relayControl(RELAY1, false);
  relayControl(RELAY2, false);
  commandedFanState = false;
  commandedHumState = false;

  Serial.println("[INIT] Relays safely initialized (inactive).");
  printHelp();

  // Initialize DHT11 sensor
  dht.begin();
  Serial.println("[INIT] DHT11 sensor initialized on GPIO 4.");
  readDhtSensor(true);

  // Connect to Wi-Fi
  Serial.printf("[WIFI] Connecting to SSID: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - wifiStart < 15000)) {
    delay(400);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WIFI] Connected successfully!");
    Serial.printf("[WIFI] IP Address: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WIFI] RSSI: %d dBm\n", WiFi.RSSI());

    if (MDNS.begin("esp32")) {
      Serial.println("[mDNS] Responder active: http://esp32.local");
      MDNS.addService("http", "tcp", 80);
    }
  } else {
    Serial.println("\n[WIFI WARNING] Wi-Fi connection timed out. Will continue in background.");
  }

  // Setup Local Web Server endpoints
  server.on("/status", HTTP_GET, handleGetStatus);
  server.on("/status", HTTP_OPTIONS, handleOptionsPreflight);

  server.on("/fan", HTTP_GET, handleFanRequest);
  server.on("/fan", HTTP_OPTIONS, handleOptionsPreflight);

  server.on("/hum", HTTP_GET, handleHumidifierRequest);
  server.on("/hum", HTTP_OPTIONS, handleOptionsPreflight);

  server.begin();
  Serial.println("[SERVER] Local HTTP endpoints registered: /status, /fan, /hum");
  Serial.println("[READY] System initialized and running.\n");
}

// ==========================================
// 8. MAIN LOOP
// ==========================================
void loop() {
  unsigned long now = millis();

  // 1. Keep click timing running while accepting commands
  updateHumidifier();

  // 2. Handle Serial commands
  handleSerialCommands();

  // 3. Handle incoming HTTP requests
  server.handleClient();

  // 4. Periodic DHT11 sensor sampling
  if (now - lastValidDhtReadMs >= DHT_SAMPLE_INTERVAL_MS) {
    readDhtSensor();
  }

  // 5. Periodic telemetry push to backend (Option 1 Cloud App)
  if (now - lastTelemetryPushMs >= TELEMETRY_PUSH_INTERVAL) {
    lastTelemetryPushMs = now;
    pushTelemetryToBackend();
  }

  // 6. Periodic heartbeat
  if (now - lastHeartbeatPushMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatPushMs = now;
    pushHeartbeatToBackend();
  }

  // 7. Wi-Fi watchdog
  handleWifiWatchdog();
}
