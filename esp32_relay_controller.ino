#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>

/*
  ESP32 Fan + Humidifier Relay Controller - Local HTTP Server
  Control via local HTTP requests (mDNS):
  http://esp32.local/fan?state=on
  http://esp32.local/fan?state=off
  http://esp32.local/hum?state=on
  http://esp32.local/hum?state=off
*/

const int FAN_RELAY_PIN = 26;
const int HUM_RELAY_PIN = 27;
const bool RELAY_ACTIVE_LOW = false;

// Wi-Fi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

WebServer server(80);

// Humidifier State
const unsigned long CLICK_DURATION_MS = 200;
const unsigned long CLICK_INTERVAL_MS = 500;
enum HumPhase { HUM_IDLE, HUM_FIRST_PRESS, HUM_WAIT_SECOND, HUM_SECOND_PRESS };
HumPhase humPhase = HUM_IDLE;
bool humCommandIsOff = false;
unsigned long phaseStart = 0;

void setRelay(int pin, bool on) {
  digitalWrite(pin, RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
}

void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleOptions() {
  addCorsHeaders();
  server.send(200, "text/plain", "");
}

void handleFan() {
  String state = server.arg("state");
  if (state == "on") {
    setRelay(FAN_RELAY_PIN, true);
    addCorsHeaders();
    server.send(200, "text/plain", "Fan ON");
  } else {
    setRelay(FAN_RELAY_PIN, false);
    addCorsHeaders();
    server.send(200, "text/plain", "Fan OFF");
  }
}

void startHumidifier(bool turnOn) {
  if (humPhase != HUM_IDLE) return;
  humCommandIsOff = !turnOn;
  setRelay(HUM_RELAY_PIN, true);
  phaseStart = millis();
  humPhase = HUM_FIRST_PRESS;
}

void handleHum() {
  String state = server.arg("state");
  if (state == "on") {
    startHumidifier(true);
    addCorsHeaders();
    server.send(200, "text/plain", "Humidifier ON sequence started");
  } else {
    startHumidifier(false);
    addCorsHeaders();
    server.send(200, "text/plain", "Humidifier OFF sequence started");
  }
}

void updateHumidifier() {
  unsigned long now = millis();
  switch (humPhase) {
    case HUM_IDLE: break;
    case HUM_FIRST_PRESS:
      if (now - phaseStart >= CLICK_DURATION_MS) {
        setRelay(HUM_RELAY_PIN, false);
        if (humCommandIsOff) { phaseStart = now; humPhase = HUM_WAIT_SECOND; }
        else { humPhase = HUM_IDLE; }
      }
      break;
    case HUM_WAIT_SECOND:
      if (now - phaseStart >= CLICK_INTERVAL_MS) {
        setRelay(HUM_RELAY_PIN, true);
        phaseStart = now;
        humPhase = HUM_SECOND_PRESS;
      }
      break;
    case HUM_SECOND_PRESS:
      if (now - phaseStart >= CLICK_DURATION_MS) {
        setRelay(HUM_RELAY_PIN, false);
        humPhase = HUM_IDLE;
      }
      break;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(FAN_RELAY_PIN, OUTPUT);
  pinMode(HUM_RELAY_PIN, OUTPUT);
  setRelay(FAN_RELAY_PIN, false);
  setRelay(HUM_RELAY_PIN, false);
  
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  if (!MDNS.begin("esp32")) {
    Serial.println("Error setting up MDNS responder!");
  }

  server.on("/fan", HTTP_GET, handleFan);
  server.on("/fan", HTTP_OPTIONS, handleOptions);
  server.on("/hum", HTTP_GET, handleHum);
  server.on("/hum", HTTP_OPTIONS, handleOptions);
  server.begin();
  Serial.println("Server started");
}

void loop() {
  server.handleClient();
  updateHumidifier();
}
