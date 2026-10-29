# Florify IoT - ESP32 Firmware Version History

This document maintains the official version history of ESP32 firmware variants developed for the Florify IoT Climate Control & Actuator System.

---

## ESP32 ver 4.0: TB6612FNG Dual H-Bridge Motor Driver (`esp32_florify_jmd096_dual_relay.ino` & `esp32_relay_controller.ino`)
- **Release Version**: `v4.0.0-tb6612fng-driver`
- **Key Enhancements**:
  - **Adapted to Toshiba TB6612FNG Dual H-Bridge Driver**:
    - Completely replaces mechanical/optocoupled relays with silent, solid-state dual MOSFET driver.
    - **Channel A**: Controls 5V DC cooling fan (`AO1`/`AO2`) with full-power forward drive (`PWMA = GPIO 18`, `AIN1 = GPIO 19`, `AIN2 = GPIO 5`).
    - **Channel B**: Simulates electronic humidifier tactile button presses by pulling contact line to ground (`BO1`) with High-Z open circuit idle (`PWMB = GPIO 25`, `BIN1 = GPIO 26`, `BIN2 = GPIO 27`).
    - **Standby (`STBY`) Pin**: Hardware standby controlled via `GPIO 23` (driven HIGH for active drive).
  - **Preserved Systems**:
    - DHT11 sensor sampling on GPIO 4 with nan filtering.
    - JMD0.96D-1 SSD1306 OLED display on GPIO 21 (SDA) and GPIO 22 (SCL).
    - Serial monitor commands (`FAN ON/OFF/AUTO`, `HUM ON/OFF/AUTO`, `STATUS`, `HELP`) at 115200 baud.
    - Direct Google Firebase Firestore HTTPS REST client (telemetry summary, `/readings` time-series, and remote config sync).

---

## ESP32 ver 3.1: Open-Drain Safe Drive + Cloud Sync Bootstrap (`esp32_florify_jmd096_dual_relay.ino` & `esp32_relay_controller.ino`)
- **Release Version**: `v3.1.0-open-drain-dual-relay`
- **Key Enhancements**:
  - **`OUTPUT_OPEN_DRAIN` Relay Pin Mode**: Completely resolves the permanent 1.7V optocoupler voltage leakage that occurs when controlling a 5V relay module with 3.3V ESP32 GPIOs (which caused the relay to stay permanently energized).
  - **Configurable Relay Polarity**: Configurable trigger logic (`relayActiveLow` flag) with serial monitor toggle (`POLARITY LOW` / `POLARITY HIGH`).
  - **Self-Bootstrapping Cloud Config**: Automatically initializes `/devices/{DEVICE_ID}/config/current` on Firestore if 404 is encountered, ensuring cloud force commands immediately synchronize.
  - **Enhanced Serial Diagnostics**: Real-time commands (`FAN ON/OFF/AUTO`, `HUM ON/OFF/AUTO`, `POLARITY LOW/HIGH`, `STATUS`, `HELP`).

---

## ESP32 ver 3: JMD0.96D-1 OLED + Fan Relay + Humidifier Click Simulator (`esp32_florify_jmd096_dual_relay.ino` & `esp32_relay_controller.ino`)
- **Release Version**: `v3.0.0-jmd096-dual-relay`
- **Hardware**:
  - ESP32 Development Board
  - JMD0.96D-1 0.96-inch 128x64 Monochrome I2C OLED Display (SSD1306)
  - DHT11 Temperature & Relative Humidity Sensor
  - 2-Channel 5V Optocoupled Relay Module (Active LOW)
- **Pin Mapping**:
  - JMD0.96D-1 OLED: **GPIO 21 (SDA)**, **GPIO 22 (SCL)**, Address `0x3C`/`0x3D`
  - DHT11 Sensor: **GPIO 4**
  - Relay 1 (Cooling Fan): **GPIO 18** [Continuous ON / OFF switch]
  - Relay 2 (Humidifier Button Simulator): **GPIO 19** [Momentary pulse clicks]
  - Status Indicator LED: **GPIO 2**
- **Core Features**:
  - **JMD0.96D-1 Onboard Display**: Live dashboard displaying Wi-Fi connection IP, real-time temperature (°C), humidity (% RH), fan state, humidifier state, and mode.
  - **Humidifier Click Simulation Engine**:
    - **1 Click (200 ms pulse)** to turn ON the humidifier.
    - **2 Clicks (200 ms pulse, 300 ms pause, 200 ms pulse)** to turn OFF the humidifier.
    - Non-blocking `millis()` state machine preventing freeze during relay actuation.
  - **Direct Firebase Firestore REST API**: Pushes telemetry samples to `/devices/{DEVICE_ID}` and `/readings` over HTTPS TLS without requiring local proxy servers.
  - **Remote Web Overrides & Autonomous Hysteresis**: Polls desired appliance states from cloud config while preserving offline autonomous control.
  - **Serial Diagnostics**: Interactive serial commands (`FAN ON/OFF/AUTO`, `HUM ON/OFF/AUTO`, `STATUS`, `HELP`) at 115200 baud.

---

## ESP32 ver 2: Dual Relay Separation (`esp32_florify_dht11_dual_relay.ino`)
- **Release Version**: `v2.2.0-dual-relay`
- **Hardware**: ESP32 DevKit + DHT11 Sensor + 2-Channel Relay Module (GPIO 26 Fan, GPIO 27 Mist)
- **Core Features**: Basic independent dual relay control with continuous switching on both channels.

---

## ESP32 ver 1: Basic Single-Relay Prototype (`esp32_shuttle_climate.ino`)
- **Hardware**: ESP32 DevKit + DHT11 Sensor + 1-Channel Relay Module
- **Core Features**: Basic periodic telemetry push to Firestore.
