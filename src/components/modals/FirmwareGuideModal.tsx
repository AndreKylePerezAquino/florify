import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Download,
  Cpu,
  Layers,
  Zap,
  BookOpen,
  Terminal,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { activeFirebaseConfig } from '../../lib/firebase';

interface FirmwareGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId?: string;
}

export const FirmwareGuideModal: React.FC<FirmwareGuideModalProps> = ({
  isOpen,
  onClose,
  deviceId = 'ESP32-FLORIFY-01',
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'wiring' | 'instructions' | 'diagnostics'>('code');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const projectId = activeFirebaseConfig.projectId || 'axial-antler-spthm';
  const databaseId = activeFirebaseConfig.firestoreDatabaseId || '(default)';
  const apiKey = activeFirebaseConfig.apiKey || '';

  const arduinoSketch = `/*
 * ==============================================================================
 * Florify IoT - ESP32 Climate Monitor & Actuator Firmware
 * Hardware: ESP32 DevKit + DHT11 Sensor + 2-Channel 5V Optocoupled Relay Module
 * 
 * Actuators:
 *   - Channel 1 (GPIO 26): Shuttle Cabin Cooling Fan
 *   - Channel 2 (GPIO 27): Shuttle Cabin Evaporative Mist / Humidifier Solenoid
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

#define RELAY_FAN_PIN 26      // Relay Channel 1: Cooling Fan (GPIO 26)
#define RELAY_MIST_PIN 27     // Relay Channel 2: Misting Solenoid / Humidifier (GPIO 27)
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
const char* FIREBASE_PROJECT_ID  = "${projectId}";
const char* FIREBASE_DATABASE_ID = "${databaseId}";
const char* FIREBASE_API_KEY     = "${apiKey}";

// Unique Device ID registered in Florify dashboard
const char* DEVICE_ID = "${deviceId}";
const char* FIRMWARE_VERSION = "v2.2.0-dual-relay";

// ==========================================
// 3. CLOSED-LOOP CLIMATE AUTOMATION THRESHOLDS
// (Autonomous local fallback if connection drops)
// ==========================================
struct DeviceThresholds {
  bool tempEnabled = true;
  float tempOnC    = 40.0;    // Fan turns ON if temp >= 40.0 °C
  float tempOffC   = 38.0;    // Fan turns OFF if temp <= 38.0 °C

  bool humEnabled  = false;   // Mist automation disabled by default
  float humOnRH    = 40.0;    // Mist turns ON if humidity <= 40.0 % RH (too dry)
  float humOffRH   = 55.0;    // Mist turns OFF if humidity >= 55.0 % RH (satisfied)

  String fanMode   = "AUTO";      // "AUTO", "FORCE_ON", "FORCE_OFF"
  String mistMode  = "FORCE_OFF"; // "AUTO", "FORCE_ON", "FORCE_OFF" (Default OFF)
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
// 4. HELPER: UTC ISO-8601 TIMESTAMP
// ==========================================
String getIsoTimestamp() {
  time_t now;
  time(&now);
  struct tm timeinfo;
  if (!gmtime_r(&now, &timeinfo) || now < 100000) {
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
    Serial.println("\\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
    digitalWrite(STATUS_LED_PIN, HIGH);

    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  } else {
    Serial.println("\\n[WiFi] Connection timeout. Local automation running offline.");
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
    if (tempC >= currentConfig.tempOnC) {
      isFanActive = true;
    } else if (tempC <= currentConfig.tempOffC) {
      isFanActive = false;
    }
  }

  // --- B. Relay 2: Mist / Auxiliary Control Logic (GPIO 19) ---
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

  // Apply to physical relays strictly and independently (Active LOW: LOW = ON, HIGH = OFF)
  digitalWrite(RELAY_FAN_PIN, isFanActive ? RELAY_ON : RELAY_OFF);
  digitalWrite(RELAY_MIST_PIN, isMistActive ? RELAY_ON : RELAY_OFF);

  Serial.printf("[Actuators] Relay 1 (Fan): %s | Relay 2 (Mist): %s | FanMode: %s | MistMode: %s\\n",
    isFanActive ? "ON (Cooling)" : "OFF (Standby)",
    isMistActive ? "ON (Misting)" : "OFF (Standby)",
    currentConfig.fanMode.c_str(),
    currentConfig.mistMode.c_str()
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
      Serial.printf("[Firestore] PATCH failed, code: %d\\n", httpCode);
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

        Serial.printf("[Config Sync] Temp: On=%.1f°C Off=%.1f°C | Hum: On=%.1f%% Off=%.1f%% | FanMode=%s | MistMode=%s\\n",
          currentConfig.tempOnC, currentConfig.tempOffC,
          currentConfig.humOnRH, currentConfig.humOffRH,
          currentConfig.fanMode.c_str(),
          currentConfig.mistMode.c_str()
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
  Serial.println("\\n==========================================");
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

      Serial.printf("[Telemetry] DHT11 -> Temp: %.1f °C | Humidity: %.1f %% RH\\n", temp, hum);

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
}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(arduinoSketch);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([arduinoSketch], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esp32_${deviceId.toLowerCase().replace(/[^a-z0-9]/g, '_')}_dual_relay.ino`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-[#FDC3D1] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#FDC3D1] flex items-center justify-between bg-[#FFF7F9]/60">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#FF5C89]/10 border border-[#FDC3D1] flex items-center justify-center text-[#C72C5E]">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2E1826]">
                ESP32 Firmware & Hardware Integration
              </h2>
              <p className="text-xs text-[#826674]">
                Target Device: <strong className="font-mono text-[#C72C5E]">{deviceId}</strong> · DHT11 + Dual Relays (Fan & Mist)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#826674] hover:text-[#2E1826] hover:bg-[#FFDBDB]/50 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-[#FDC3D1] bg-white">
          <button
            onClick={() => setActiveTab('code')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'code'
                ? 'border-[#FF5C89] text-[#C72C5E]'
                : 'border-transparent text-[#826674] hover:text-[#2E1826]'
            }`}
          >
            <Zap className="h-4 w-4" />
            Arduino C++ Code (.ino)
          </button>
          <button
            onClick={() => setActiveTab('wiring')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'wiring'
                ? 'border-[#FF5C89] text-[#C72C5E]'
                : 'border-transparent text-[#826674] hover:text-[#2E1826]'
            }`}
          >
            <Layers className="h-4 w-4" />
            Hardware Wiring & Pinout
          </button>
          <button
            onClick={() => setActiveTab('instructions')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'instructions'
                ? 'border-[#FF5C89] text-[#C72C5E]'
                : 'border-transparent text-[#826674] hover:text-[#2E1826]'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Flashing Instructions
          </button>
          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'diagnostics'
                ? 'border-[#FF5C89] text-[#C72C5E]'
                : 'border-transparent text-[#826674] hover:text-[#2E1826]'
            }`}
          >
            <Terminal className="h-4 w-4" />
            Testing & Verification
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'code' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[#826674]">
                <span>
                  Configured for active project <code className="font-mono text-[#C72C5E] font-semibold">{projectId}</code> · Device <code className="font-mono text-[#C72C5E] font-semibold">{deviceId}</code>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1.5 bg-[#FFF7F9] hover:bg-[#FFDBDB] border border-[#FDC3D1] text-[#C72C5E] text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied to Clipboard' : 'Copy Code'}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="px-3 py-1.5 bg-[#FF5C89] hover:bg-[#C72C5E] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download .ino File
                  </button>
                </div>
              </div>

              <div className="relative rounded-xl border border-[#FDC3D1] bg-[#2E1826] text-white p-4 font-mono text-xs overflow-x-auto max-h-[460px]">
                <pre>{arduinoSketch}</pre>
              </div>
            </div>
          )}

          {activeTab === 'wiring' && (
            <div className="space-y-4 text-xs">
              <div className="bg-[#FFF7F9] p-4 rounded-xl border border-[#FDC3D1]">
                <h4 className="font-bold text-[#2E1826] mb-2 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-[#C72C5E]" />
                  Active LOW Relay Logic Explanation
                </h4>
                <p className="text-[#826674] leading-relaxed">
                  Most 5V dual-channel relay modules (Songle optocoupled) use <strong>Active LOW</strong> switching.
                  Sending a <code className="font-mono text-[#C72C5E] bg-white px-1 py-0.5 rounded border border-[#FDC3D1]">LOW (0V)</code> signal
                  energizes the coil, closing the <strong>NO (Normally Open)</strong> contacts to power the Fan or Mist pump.
                  Sending a <code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded border border-slate-200">HIGH (3.3V)</code> signal
                  keeps the relay open and de-energized.
                </p>
              </div>

              <div className="border border-[#FDC3D1] rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FFF7F9] text-[#826674] font-semibold border-b border-[#FDC3D1]">
                      <th className="py-2.5 px-3">Peripheral</th>
                      <th className="py-2.5 px-3">Peripheral Pin</th>
                      <th className="py-2.5 px-3">ESP32 Pin</th>
                      <th className="py-2.5 px-3">Purpose & Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FDC3D1] text-[#2E1826]">
                    <tr>
                      <td className="py-2 px-3 font-semibold text-[#C72C5E]">DHT11 Sensor</td>
                      <td className="py-2 px-3 font-mono">Pin 1 (VCC)</td>
                      <td className="py-2 px-3 font-mono">3V3 / 5V</td>
                      <td className="py-2 px-3 text-[#826674]">Power supply (3.3V or 5V DC)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-[#C72C5E]">DHT11 Sensor</td>
                      <td className="py-2 px-3 font-mono">Pin 2 (DATA)</td>
                      <td className="py-2 px-3 font-mono font-bold">GPIO 4</td>
                      <td className="py-2 px-3 text-[#826674]">One-wire data bus (with 10kΩ pull-up to 3V3)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-[#C72C5E]">DHT11 Sensor</td>
                      <td className="py-2 px-3 font-mono">Pin 4 (GND)</td>
                      <td className="py-2 px-3 font-mono">GND</td>
                      <td className="py-2 px-3 text-[#826674]">Ground return</td>
                    </tr>
                    <tr className="bg-[#FFF7F9]/30">
                      <td className="py-2 px-3 font-semibold text-emerald-700">Relay Channel 1 (Fan)</td>
                      <td className="py-2 px-3 font-mono">IN1</td>
                      <td className="py-2 px-3 font-mono font-bold">GPIO 26</td>
                      <td className="py-2 px-3 text-[#826674]">Active LOW signal to engage Shuttle Fan</td>
                    </tr>
                    <tr className="bg-[#FFF7F9]/30">
                      <td className="py-2 px-3 font-semibold text-sky-700">Relay Channel 2 (Mist)</td>
                      <td className="py-2 px-3 font-mono">IN2</td>
                      <td className="py-2 px-3 font-mono font-bold">GPIO 27</td>
                      <td className="py-2 px-3 text-[#826674]">Active LOW signal to engage Misting Solenoid</td>
                    </tr>
                    <tr className="bg-[#FFF7F9]/30">
                      <td className="py-2 px-3 font-semibold">Dual Relay Module</td>
                      <td className="py-2 px-3 font-mono">VCC</td>
                      <td className="py-2 px-3 font-mono">VIN / 5V</td>
                      <td className="py-2 px-3 text-[#826674]">Power for relay coils (5V from USB or buck converter)</td>
                    </tr>
                    <tr className="bg-[#FFF7F9]/30">
                      <td className="py-2 px-3 font-semibold">Dual Relay Module</td>
                      <td className="py-2 px-3 font-mono">GND</td>
                      <td className="py-2 px-3 font-mono">GND</td>
                      <td className="py-2 px-3 text-[#826674]">Common ground with ESP32</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'instructions' && (
            <div className="space-y-4 text-xs">
              <div className="bg-white p-4 rounded-xl border border-[#FDC3D1] space-y-3">
                <h4 className="font-bold text-[#2E1826]">Step 1: Install Required Libraries in Arduino IDE</h4>
                <p className="text-[#826674]">
                  Open Arduino IDE, go to <strong>Sketch &gt; Include Library &gt; Manage Libraries...</strong> and install:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[#2E1826]">
                  <li><strong>DHT sensor library</strong> by Adafruit</li>
                  <li><strong>Adafruit Unified Sensor</strong> by Adafruit</li>
                  <li><strong>ArduinoJson</strong> by Benoit Blanchon (Version 6.x or 7.x)</li>
                </ul>
              </div>

              <div className="bg-white p-4 rounded-xl border border-[#FDC3D1] space-y-3">
                <h4 className="font-bold text-[#2E1826]">Step 2: Board Selection & Flashing</h4>
                <ol className="list-decimal pl-5 space-y-1.5 text-[#826674]">
                  <li>Connect your ESP32 board to your computer via USB cable.</li>
                  <li>In Arduino IDE, select <strong>Tools &gt; Board &gt; esp32 &gt; ESP32 Dev Module</strong>.</li>
                  <li>Select the appropriate USB COM port under <strong>Tools &gt; Port</strong>.</li>
                  <li>Replace <code className="font-mono text-[#C72C5E]">YOUR_WIFI_SSID</code> and <code className="font-mono text-[#C72C5E]">YOUR_WIFI_PASSWORD</code> with your shuttle's WiFi or mobile hotspot credentials.</li>
                  <li>Click the <strong>Upload</strong> button (Arrow icon).</li>
                  <li>Open <strong>Tools &gt; Serial Monitor</strong> set to <strong>115200 baud</strong> to verify sensor readings and Firestore updates.</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-4 text-xs">
              <div className="bg-[#FFF7F9] p-4 rounded-xl border border-[#FDC3D1] space-y-2">
                <h4 className="font-bold text-[#2E1826] flex items-center gap-1.5">
                  <Terminal className="h-4 w-4 text-[#C72C5E]" />
                  Expected Serial Monitor Output (115200 baud)
                </h4>
                <div className="bg-[#2E1826] text-emerald-400 p-3 rounded-lg font-mono text-[11px] space-y-1">
                  <div>[WiFi] Connecting to: Shuttle_Fleet_WiFi......</div>
                  <div>[WiFi] Connected successfully! IP: 192.168.1.142</div>
                  <div>[Sensors] DHT11 sensor initialized on GPIO 4.</div>
                  <div>[Telemetry] DHT11 -&gt; Temp: 32.5 °C | Humidity: 54.3 % RH</div>
                  <div>[Actuators] Fan: ON (Cooling) | Mist: ON (Misting) | Mode: AUTO</div>
                  <div>[Firestore] Device summary updated successfully.</div>
                  <div>[Firestore] Time-series sample logged.</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-white border border-[#FDC3D1] rounded-xl space-y-1.5">
                  <h5 className="font-bold text-[#2E1826] flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Status Verification
                  </h5>
                  <p className="text-[#826674] leading-relaxed">
                    Once the device logs to Firestore, the <strong>{deviceId}</strong> card in Florify will automatically pulse green with an <strong className="text-emerald-700">ONLINE</strong> status, live temperature gauge, and real-time Fan & Mist indicators.
                  </p>
                </div>
                <div className="p-3 bg-white border border-[#FDC3D1] rounded-xl space-y-1.5">
                  <h5 className="font-bold text-[#2E1826] flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    Troubleshooting NaN Sensor
                  </h5>
                  <p className="text-[#826674] leading-relaxed">
                    If Serial prints <em>Failed to read from DHT sensor</em>, verify the 10kΩ pull-up resistor between 3V3 and GPIO 4, and ensure the DHT11 is powered with 3.3V or 5V.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#FDC3D1] bg-[#FFF7F9]/50 flex items-center justify-between text-xs">
          <span className="text-[#826674]">
            Pre-configured file saved to <code className="font-mono text-[#C72C5E]">firmware/esp32_florify_dht11_dual_relay.ino</code>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#FF5C89] hover:bg-[#C72C5E] text-white font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
