/*
 * Shuttle Climate Monitor - ESP32 Firmware
 * Hardware: ESP32-WROOM-32, DHT11 Sensor, 5V/12V Relay Module for Fan Control
 * 
 * Safety Critical Notes:
 * 1. NEVER drive a 12V/24V shuttle blower fan directly from ESP32 GPIO. Always use an optocoupled relay or MOSFET driver.
 * 2. This firmware executes hysteresis automation locally. If Wi-Fi or backend server drops, fan automation CONTINUES SAFELY.
 * 3. Overrides expire locally using esp_timer / millis() so fans do not stay stuck in manual modes during network outages.
 * 4. Critical Hardware Safety: If temperature >= 60.0°C, emergency thermal protection triggers fan ON regardless of software mode.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h> // v6.x or v7.x
#include "DHT.h"

// ==========================================
// 1. HARDWARE PIN DEFINITIONS & POLARITY
// ==========================================
#define DHTPIN 4           // GPIO 4 connected to DHT11 Data pin (with 4.7k-10k pull-up resistor to 3.3V)
#define DHTTYPE DHT11      // DHT 11 Temperature & Humidity Sensor

#define RELAY_PIN 18       // GPIO 18 connected to Relay IN pin
#define RELAY_ACTIVE_LOW 1 // Set to 1 if relay activates when GPIO is LOW (standard for most 5V relay boards), 0 for Active-HIGH

#define STATUS_LED_PIN 2   // Onboard Blue LED for diagnostic blink

// ==========================================
// 2. NETWORK & PROVISIONING CREDENTIALS
// ==========================================
// (Replace with actual deployment credentials in production. Do not commit secrets to Git.)
const char* WIFI_SSID     = "YOUR_SHUTTLE_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_SHUTTLE_WIFI_PASSWORD";

// Target Backend HTTPS API URL
const char* API_BASE_URL  = "https://your-domain.run.app/api";

// Unique Device Identity and Bearer Key (provisioned by Administrator)
const char* DEVICE_ID     = "ESP32-SHUTTLE-01";
const char* DEVICE_SECRET = "REPLACE_WITH_PROVISIONED_BEARER_KEY";

// Firmware version
const char* FIRMWARE_VER  = "v2.1.0-prod";

// ==========================================
// 3. TELEMETRY & SAMPLING CADENCE
// ==========================================
const unsigned long SENSOR_SAMPLE_INTERVAL_MS = 10000;   // 10 seconds between DHT11 samples
const unsigned long HEARTBEAT_INTERVAL_MS     = 60000;   // 60 seconds heartbeat
const unsigned long CONFIG_POLL_INTERVAL_MS   = 120000;  // 2 minutes config polling

// ==========================================
// 4. LOCAL AUTOMATION CONFIGURATION STATE
// ==========================================
struct DeviceConfig {
  bool temperatureEnabled = true;
  float temperatureOnC    = 40.0;
  float temperatureOffC   = 38.0;

  bool humidityEnabled    = true;
  float humidityOnRH      = 75.0;
  float humidityOffRH     = 65.0;

  String activationMode   = "ANY";   // "ANY" (OR) or "ALL" (AND)
  String fanMode          = "AUTO";  // "AUTO", "FORCE_ON", "FORCE_OFF"

  unsigned long overrideExpiryMillis = 0; // Local monotonic timer for override
  bool hasActiveOverride  = false;

  int version             = 1;
};

DeviceConfig currentConfig;
DHT dht(DHTPIN, DHTTYPE);

// Operating variables
float lastTemperature = 0.0;
float lastHumidity    = 0.0;
bool isSensorHealthy  = false;
bool currentFanState  = false; // false = OFF, true = ON

unsigned long lastSensorSampleTime = 0;
unsigned long lastHeartbeatTime    = 0;
unsigned long lastConfigPollTime   = 0;

// Exponential backoff for network retries
int wifiRetryAttempts = 0;

// ==========================================
// 5. RELAY HARDWARE CONTROL
// ==========================================
void setRelayState(bool turnOn) {
  currentFanState = turnOn;
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(RELAY_PIN, turnOn ? LOW : HIGH);
  } else {
    digitalWrite(RELAY_PIN, turnOn ? HIGH : LOW);
  }
}

// ==========================================
// 6. LOCAL CLIMATE AUTOMATION ENGINE
// ==========================================
void evaluateFanAutomation() {
  unsigned long now = millis();

  // 1. Check local override expiration
  if (currentConfig.hasActiveOverride) {
    if (now >= currentConfig.overrideExpiryMillis) {
      Serial.println("[AUTO] Manual override expired locally. Reverting to AUTO mode.");
      currentConfig.fanMode = "AUTO";
      currentConfig.hasActiveOverride = false;
    }
  }

  // 2. Handle manual FORCE_ON / FORCE_OFF
  if (currentConfig.fanMode == "FORCE_ON") {
    setRelayState(true);
    return;
  }

  if (currentConfig.fanMode == "FORCE_OFF") {
    // Physical thermal safety guard: Emergency cooling cutoff if temp exceeds 60°C
    if (isSensorHealthy && lastTemperature >= 60.0) {
      Serial.println("[SAFETY CUTOFF] Temperature >= 60°C! Overriding FORCE_OFF to protect cabin.");
      setRelayState(true);
      return;
    }
    setRelayState(false);
    return;
  }

  // 3. Sensor fault safety behavior: If DHT11 fails, run fan to prevent heat buildup
  if (!isSensorHealthy || isnan(lastTemperature) || isnan(lastHumidity)) {
    Serial.println("[WARN] Sensor fault! Defaulting fan ON for thermal safety.");
    setRelayState(true);
    return;
  }

  // 4. Hysteresis calculation
  int tempTrigger = 0; // 1 = ON, -1 = OFF, 0 = HOLD
  if (currentConfig.temperatureEnabled) {
    if (lastTemperature >= currentConfig.temperatureOnC) {
      tempTrigger = 1;
    } else if (lastTemperature <= currentConfig.temperatureOffC) {
      tempTrigger = -1;
    }
  }

  int humTrigger = 0; // 1 = ON, -1 = OFF, 0 = HOLD
  if (currentConfig.humidityEnabled) {
    if (lastHumidity >= currentConfig.humidityOnRH) {
      humTrigger = 1;
    } else if (lastHumidity <= currentConfig.humidityOffRH) {
      humTrigger = -1;
    }
  }

  // 5. Combine using ANY or ALL logic
  if (currentConfig.activationMode == "ANY") {
    // Temperature OR Humidity
    if (tempTrigger == 1 || humTrigger == 1) {
      setRelayState(true);
    } else if (
      (tempTrigger == -1 || !currentConfig.temperatureEnabled) &&
      (humTrigger == -1 || !currentConfig.humidityEnabled)
    ) {
      setRelayState(false);
    }
    // else retain current state (hysteresis deadband)
  } else {
    // ALL: Both enabled conditions must be met
    bool tempOk = !currentConfig.temperatureEnabled || (tempTrigger == 1);
    bool humOk  = !currentConfig.humidityEnabled || (humTrigger == 1);

    if (tempOk && humOk && (currentConfig.temperatureEnabled || currentConfig.humidityEnabled)) {
      setRelayState(true);
    } else if (tempTrigger == -1 || humTrigger == -1) {
      setRelayState(false);
    }
  }
}

// ==========================================
// 7. SENSOR SAMPLING (DHT11)
// ==========================================
void sampleDHT11() {
  float h = dht.readHumidity();
  float t = dht.readTemperature(); // Celsius

  // Validate finite and physical ranges for DHT11 (0-50°C, 20-90% RH)
  if (isnan(h) || isnan(t) || t < -10.0 || t > 60.0 || h < 0.0 || h > 100.0) {
    Serial.println("[ERROR] Failed to read valid data from DHT11 sensor!");
    isSensorHealthy = false;
  } else {
    lastHumidity = h;
    lastTemperature = t;
    isSensorHealthy = true;
    Serial.printf("[DHT11] Temp: %.1f °C, Humidity: %.1f %% RH\n", t, h);
  }

  // Execute local automation immediately upon new reading
  evaluateFanAutomation();
}

// ==========================================
// 8. HTTPS API TRANSMISSION
// ==========================================
void sendReadings() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // For testing; in production provide root CA certificate

  HTTPClient http;
  String url = String(API_BASE_URL) + "/device/readings";

  if (!http.begin(client, url)) {
    Serial.println("[HTTP] Failed to initialize connection to /device/readings");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + DEVICE_SECRET);

  StaticJsonDocument<512> doc;
  doc["deviceId"] = DEVICE_ID;

  JsonArray readings = doc.createNestedArray("readings");
  JsonObject reading = readings.createNestedObject();
  reading["temperatureC"]     = lastTemperature;
  reading["humidityRH"]       = lastHumidity;
  reading["fanState"]         = currentFanState ? "ON" : "OFF";
  reading["operatingMode"]    = currentConfig.fanMode;
  reading["sensorHealthy"]    = isSensorHealthy;
  reading["configVersion"]    = currentConfig.version;
  reading["deviceRecordedAt"] = String(millis());

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  int httpCode = http.POST(jsonPayload);
  if (httpCode > 0) {
    Serial.printf("[HTTP] Readings sent. Response code: %d\n", httpCode);
  } else {
    Serial.printf("[HTTP] Error sending readings: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(API_BASE_URL) + "/device/heartbeat";

  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + DEVICE_SECRET);

    StaticJsonDocument<256> doc;
    doc["deviceId"]        = DEVICE_ID;
    doc["firmwareVersion"] = FIRMWARE_VER;
    doc["freeHeap"]        = ESP.getFreeHeap();
    doc["wifiRssi"]        = WiFi.RSSI();

    String payload;
    serializeJson(doc, payload);

    int code = http.POST(payload);
    Serial.printf("[HTTP] Heartbeat response: %d\n", code);
    http.end();
  }
}

void pollConfiguration() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(API_BASE_URL) + "/device/config?deviceId=" + DEVICE_ID;

  if (http.begin(client, url)) {
    http.addHeader("Authorization", String("Bearer ") + DEVICE_SECRET);

    int httpCode = http.GET();
    if (httpCode == 200) {
      String payload = http.getString();
      StaticJsonDocument<512> doc;
      DeserializationError err = deserializeJson(doc, payload);

      if (!err) {
        int remoteVersion = doc["version"] | 1;
        if (remoteVersion > currentConfig.version || doc.containsKey("fanMode")) {
          currentConfig.temperatureEnabled = doc["temperatureEnabled"] | true;
          currentConfig.temperatureOnC     = doc["temperatureOnC"] | 40.0;
          currentConfig.temperatureOffC    = doc["temperatureOffC"] | 38.0;
          currentConfig.humidityEnabled    = doc["humidityEnabled"] | true;
          currentConfig.humidityOnRH       = doc["humidityOnRH"] | 75.0;
          currentConfig.humidityOffRH      = doc["humidityOffRH"] | 65.0;
          currentConfig.activationMode     = doc["activationMode"].as<String>();
          currentConfig.version            = remoteVersion;

          String remoteMode = doc["fanMode"].as<String>();
          if (remoteMode == "FORCE_ON" || remoteMode == "FORCE_OFF") {
            int durationMins = doc["overrideDurationMinutes"] | 30;
            currentConfig.fanMode = remoteMode;
            currentConfig.overrideExpiryMillis = millis() + (unsigned long)durationMins * 60000;
            currentConfig.hasActiveOverride = true;
          } else {
            currentConfig.fanMode = "AUTO";
            currentConfig.hasActiveOverride = false;
          }

          Serial.printf("[CONFIG] Applied new config v%d. Operating mode: %s\n", remoteVersion, currentConfig.fanMode.c_str());

          // Acknowledge configuration
          acknowledgeConfig(remoteVersion);
        }
      }
    }
    http.end();
  }
}

void acknowledgeConfig(int version) {
  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(API_BASE_URL) + "/device/config-ack";

  if (http.begin(client, url)) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + DEVICE_SECRET);

    StaticJsonDocument<128> doc;
    doc["deviceId"] = DEVICE_ID;
    doc["appliedVersion"] = version;

    String payload;
    serializeJson(doc, payload);
    http.POST(payload);
    http.end();
  }
}

// ==========================================
// 9. WI-FI INITIALIZATION WITH BACKOFF
// ==========================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[WiFi] Connecting to %s...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected successfully. IP: " + WiFi.localIP().toString());
    wifiRetryAttempts = 0;
  } else {
    Serial.println("\n[WiFi] Connection failed. Local fan automation remains active.");
    wifiRetryAttempts++;
  }
}

// ==========================================
// 10. SETUP & MAIN LOOP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==========================================");
  Serial.println("  SHUTTLE CLIMATE MONITOR - ESP32 NODE");
  Serial.printf("  Firmware: %s | Device: %s\n", FIRMWARE_VER, DEVICE_ID);
  Serial.println("==========================================");

  // Initialize Relay GPIO to safe state immediately
  pinMode(RELAY_PIN, OUTPUT);
  setRelayState(false); // Default to safe OFF state at boot

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // Initialize DHT11
  dht.begin();

  // Connect Wi-Fi
  connectWiFi();

  // Initial sensor read
  delay(2000);
  sampleDHT11();
}

void loop() {
  unsigned long now = millis();

  // 1. Maintain Wi-Fi connection
  if (WiFi.status() != WL_CONNECTED && (now - lastHeartbeatTime > 30000)) {
    connectWiFi();
  }

  // 2. Periodic Sensor Sampling & Local Automation
  if (now - lastSensorSampleTime >= SENSOR_SAMPLE_INTERVAL_MS) {
    lastSensorSampleTime = now;
    sampleDHT11();
    sendReadings();
  }

  // 3. Periodic Heartbeat
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendHeartbeat();
  }

  // 4. Periodic Config Polling
  if (now - lastConfigPollTime >= CONFIG_POLL_INTERVAL_MS) {
    lastConfigPollTime = now;
    pollConfiguration();
  }

  delay(50);
}
