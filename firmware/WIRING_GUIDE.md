# ESP32 + DHT11 + Dual-Channel Relay (Fan & Mist) Hardware Wiring Guide

This guide details the physical hardware wiring, electrical isolation, and active-LOW relay logic for deploying the **Florify IoT Climate Monitor & Dual Actuator** node inside shuttle vehicle cabins.

---

## 1. Safety & Electrical Specifications

> **CRITICAL HARDWARE SAFETY NOTICE:**
> - **NEVER** power a 12V or 24V automotive blower fan or misting solenoid pump directly from an ESP32 GPIO pin. ESP32 pins are rated for a maximum of 12mA at 3.3V.
> - Always use an **optocoupled relay module** or **automotive-grade MOSFET driver** to switch inductive loads (motors, coils, and solenoids).
> - An in-line fuse (e.g. 5A–10A rated for the DC fan and 2A for the mist solenoid) MUST be installed on the switched 12V positive supply rail.
> - For passenger compartment safety, install an independent mechanical bimetallic thermal fuse (rated at 70°C) in series with the fan circuit to guarantee thermal cutoff in case of relay contact welding.

---

## 2. Complete Dual-Relay Pinout Connections

| Component | Component Pin | ESP32 Pin | Voltage Rail | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **DHT11 Sensor** | Pin 1 (VCC) | 3V3 / 5V | 3.3V or 5.0V DC | Power supply for DHT11 |
| **DHT11 Sensor** | Pin 2 (DATA) | **GPIO 4** | 3.3V Logic | Requires 4.7kΩ to 10kΩ pull-up resistor to 3.3V |
| **DHT11 Sensor** | Pin 3 (NC) | Not Connected | — | Leave disconnected (if 4-pin module) |
| **DHT11 Sensor** | Pin 4 (GND) | GND | Common GND | Ground plane return |
| **Dual Relay Module** | VCC | **VIN / 5V** | 5.0V DC | Power supply for relay coils (from 5V buck converter or USB) |
| **Dual Relay Module** | GND | **GND** | Common GND | Connected to ESP32 ground |
| **Dual Relay Module** | IN1 (Relay - Fan) | **GPIO 19** | 3.3V Logic | **Active LOW**: LOW (0V) = Fan ON, HIGH (3.3V) = Fan OFF |
| **Dual Relay Module** | IN2 (Relay - Mist) | **GPIO 18** | 3.3V Logic | **Active LOW**: LOW (0V) = Mist ON, HIGH (3.3V) = Mist OFF |
| **Status Indicator** | Built-in LED | **GPIO 2** | 3.3V Logic | Blinks during WiFi search, solid ON when connected |
| **Relay 1 (Output)** | COM | Shuttle +12V/24V | Fused 12V DC | Switched positive power supply |
| **Relay 1 (Output)** | NO | Fan Motor (+) | Fused 12V DC | Normally Open contact (circuit closes when fan ON) |
| **Relay 2 (Output)** | COM | Shuttle +12V/24V | Fused 12V DC | Switched positive power supply for mist pump |
| **Relay 2 (Output)** | NO | Mist Solenoid (+) | Fused 12V DC | Normally Open contact (circuit closes when mist ON) |
| **Cabin Loads** | Returns (-) | Shuttle Chassis | Common GND | Direct ground return to vehicle battery negative |

---

## 3. Active LOW Relay Logic Explained

Most standard 5V optocoupled relay modules (such as Songle SRD-05VDC-SL-C) use **Active LOW** input triggers:
- When the ESP32 pin is driven **LOW (`0V`)**, the optocoupler LED energizes the transistor, energizing the relay coil and closing the **NO (Normally Open)** switch.
- When the ESP32 pin is driven **HIGH (`3.3V`)**, the optocoupler de-energizes and the contacts remain open.

### Anti-Chatter Boot Protection
During ESP32 boot, GPIO pins can float momentarily before user code runs. To prevent the relays from clicking ON during device power-up, the firmware initializes the pin states to `HIGH` **before** enabling them as outputs:

```cpp
digitalWrite(RELAY_FAN_PIN, HIGH);  // De-energize
digitalWrite(RELAY_MIST_PIN, HIGH); // De-energize
pinMode(RELAY_FAN_PIN, OUTPUT);
pinMode(RELAY_MIST_PIN, OUTPUT);
```

---

## 4. Vehicle Power Architecture

```
[Shuttle +12V/24V Battery] 
        │
   [In-Line Fuse: 2A]
        │
[Automotive DC-DC Buck Converter (12V -> 5V 2A)] ───> ESP32 VIN & Relay VCC
        │
   [Common Ground] ─────────────────────────────────> ESP32 GND & Relay GND
```

Place a **100µF electrolytic capacitor** and a **0.1µF ceramic capacitor** across the 5V buck converter output near the ESP32 VIN/GND pins to filter automotive electrical noise (alternator ripple and inductive spikes).

---

## 5. Arduino IDE Flashing Checklist

1. Install **Arduino IDE** (v2.x) and add the **ESP32 by Espressif Systems** board package:
   - URL: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
2. Install required libraries via **Sketch > Include Library > Manage Libraries**:
   - `DHT sensor library` by Adafruit
   - `Adafruit Unified Sensor` by Adafruit
   - `ArduinoJson` by Benoit Blanchon (v6 or v7)
3. Open `firmware/esp32_florify_dht11_dual_relay.ino`.
4. Enter your `WIFI_SSID` and `WIFI_PASSWORD`.
5. Select board: **Tools > Board > esp32 > ESP32 Dev Module**.
6. Set Upload Speed: **921600**, Flash Frequency: **80MHz**.
7. Connect ESP32 via USB and click **Upload**.
8. Open Serial Monitor at **115200 baud** to observe live DHT11 readings and Firestore REST API telemetry updates.
