# Florify IoT - ESP32 Firmware Version History

This document maintains the official version history of ESP32 firmware variants developed for the Florify IoT Climate Control & Actuator System (Space Station Shuttle & Greenhouse Automation).

---

## ESP32 ver 1: Basic Single-Relay Prototype (`esp32_shuttle_climate.ino`)
- **Release Date**: Initial Prototyping Phase
- **Hardware**: ESP32 DevKit + DHT11/DHT22 Sensor + 1-Channel Relay Module
- **GPIO Pins**:
  - DHT Sensor: GPIO 4
  - Single Relay (Cooling Fan / Solenoid combined): GPIO 18
- **Core Features**:
  - Basic Wi-Fi connectivity.
  - Periodic temperature and humidity telemetry reporting to Firestore REST API.
  - Simple threshold-based fan activation (Active LOW).

---

## ESP32 ver 2: Dual Relay Separation (`esp32_florify_dht11_dual_relay.ino` & `esp32_florify_dht22_dual_relay.ino`)
- **Release Date**: Advanced Dual Actuator Integration Phase
- **Hardware**: ESP32 DevKit + DHT11/DHT22 Sensor + 2-Channel 5V Optocoupled Relay Module
- **GPIO Pins (Updated & Glitch-Free)**:
  - DHT Sensor: GPIO 4
  - Relay Channel 1 (Cooling Fan): **GPIO 26**
  - Relay Channel 2 (Evaporative Mist / Solenoid): **GPIO 27**
  - Status LED: GPIO 2
- **Core Features**:
  - Independent dual relay control (Fan and Mist powered separately).
  - Switched GPIO pins away from strapping pins (GPIO 18/19) to ensure clean, glitch-free boot behavior.
  - Closed-loop autonomous fallback thresholds combined with cloud remote commands (`AUTO`, `FORCE_ON`, `FORCE_OFF`).
  - Synchronized mist controls mirroring fan control architecture (timed overrides, return-to-auto timers, and independent toggle states).
  - Secure HTTPS REST communication with Firebase Firestore.
