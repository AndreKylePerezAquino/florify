#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// --- Configuration ---
const char* ssid = "John3:16";
const char* password = "JesusSaves!";
const String projectId = "florify-c5dea";
const String deviceId = "ESP32-SHUTTLE-4449";

// --- Pins and Sensors ---
#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// Base URLs
const String deviceDocUrl = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents/devices/" + deviceId;
const String configDocUrl = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents/devices/" + deviceId + "/config/automation";

// Variables for automation
int readIntervalMs = 30000; // Default 30 seconds

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to Wi-Fi");
}

void loop() {
  // 1. Read config from Firestore
  readConfig();

  // 2. Send telemetry
  sendTelemetry();

  // 3. Wait for the interval defined by remote config
  delay(readIntervalMs);
}

void readConfig() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(configDocUrl);
  int httpResponseCode = http.GET();

  if (httpResponseCode == 200) {
    String payload = http.getString();
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, payload);
    
    // Assuming structure: { "fields": { "readIntervalSeconds": { "integerValue": "..." } } }
    if (doc.containsKey("fields") && doc["fields"].containsKey("readIntervalSeconds")) {
      readIntervalMs = doc["fields"]["readIntervalSeconds"]["integerValue"].as<int>() * 1000;
      Serial.print("Updated read interval to: "); Serial.println(readIntervalMs);
    }
  }
  http.end();
}

void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) return;

  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (isnan(h) || isnan(t)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }

  Serial.print("Reading: Temp="); Serial.print(t); Serial.print("C, Humidity="); Serial.println(h);

  HTTPClient http;
  // PATCH URL with updateMask to update specific fields on the device document
  String url = deviceDocUrl + "?updateMask.fieldPaths=latestTemperatureC&updateMask.fieldPaths=latestHumidityRH&updateMask.fieldPaths=latestFanState&updateMask.fieldPaths=lastReadingAt";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-HTTP-Method-Override", "PATCH");

  // Payload construction
  DynamicJsonDocument doc(1024);
  JsonObject fields = doc.createNestedObject("fields");

  fields["latestTemperatureC"]["doubleValue"] = t;
  fields["latestHumidityRH"]["doubleValue"] = h;
  fields["latestFanState"]["stringValue"] = "OFF";
  // Firestore expects ISO 8601 format
  fields["lastReadingAt"]["timestampValue"] = "2026-10-22T06:43:38.000Z";

  String payload;
  serializeJson(doc, payload);

  int httpResponseCode = http.POST(payload);
  Serial.print("Telemetry PATCH response: "); Serial.println(httpResponseCode);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.println("Response body: " + response);
  } else {
    Serial.println("Error on HTTP request");
  }
  
  http.end();
}
