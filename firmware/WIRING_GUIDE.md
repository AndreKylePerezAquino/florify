# ESP32 Hybrid Hardware Wiring Guide: TB6612FNG (DC Fan) + 2-Channel Relay (Dual Humidifiers)

This guide details the complete hardware wiring, pin assignments, electrical protection, and operating logic for deploying the **ESP32 Florify Climate Monitor & Actuator System** using a hybrid architecture:
1. **Toshiba TB6612FNG Dual H-Bridge Driver** for high-current, MOSFET-switched DC Cooling Fan drive.
2. **2-Channel Optocoupled Relay Module** for 100% electrically isolated mechanical dry contact closure across the push-button contacts of both humidifiers.

---

## 1. Safety & Power Architecture

> **CRITICAL HARDWARE RULES:**
> 1. **Common Ground is Mandatory**:
>    - Connect ESP32 `GND`, TB6612FNG `GND` pins, Relay Module `GND`, and the External 5V Power Supply `GND (-)` together into a single reference ground.
> 2. **Power Rail Separation**:
>    - **TB6612FNG `VCC`**: Connect to **ESP32 3.3V** (Logic power). Ensures all digital input pins (`PWMA`, `AIN1`, `AIN2`, `STBY`) match 3.3V GPIO thresholds.
>    - **TB6612FNG `VM`**: Connect to **External 5.0V DC Power Supply (+)** (Motor power rail). **Never** power the fan or motor rail from the ESP32 3.3V regulator pin!
>    - **Relay Module `VCC`**: Connect to **5V DC** (or 3.3V if your relay module supports 3.3V logic/coils).
> 3. **Humidifier Contact Isolation**:
>    - Connect the two push-button wires from **Humidifier 1** across Relay 1's **`COM`** and **`NO`** terminals.
>    - Connect the two push-button wires from **Humidifier 2** across Relay 2's **`COM`** and **`NO`** terminals.
>    - **Never inject external 5V or 12V voltage into the humidifier button contacts!** The relay provides a pure dry mechanical switch closure (0V differential, identical to pressing the physical button with your finger).

---

## 2. Complete Pinout & Wiring Table

| Module | Pin on Board | Connects To | Voltage / Logic | Description |
| :--- | :--- | :--- | :--- | :--- |
| **TB6612FNG** | **VCC** | ESP32 **3V3** | 3.3V DC | Logic supply power |
| **TB6612FNG** | **VM** | External **5V Power (+)** | 5.0V DC | Motor / Fan power rail |
| **TB6612FNG** | **GND** (all) | Common **GND** | 0V Ground | Tied to ESP32 GND and 5V supply (-) |
| **TB6612FNG** | **STBY** | ESP32 **GPIO 23** | 3.3V Logic | Standby enable (Firmware drives HIGH at boot) |
| **TB6612FNG** | **PWMA** | ESP32 **GPIO 18** | 3.3V Logic | Channel A (Fan) Speed/Gate (HIGH = 100% full ON) |
| **TB6612FNG** | **AIN1** | ESP32 **GPIO 19** | 3.3V Logic | Channel A Direction 1 (HIGH for forward) |
| **TB6612FNG** | **AIN2** | ESP32 **GPIO 5** | 3.3V Logic | Channel A Direction 2 (LOW for forward) |
| **TB6612FNG** | **AO1** | **DC Fan (+) Lead** | 0V to 5V | Motor Output A1 |
| **TB6612FNG** | **AO2** | **DC Fan (-) Lead** | 0V to GND | Motor Output A2 |
| **TB6612FNG Channel B**| *Unused* | *Disconnected* | N/A | Channel B pins (PWMB, BIN1, BIN2) are unpinned |
| **2-Channel Relay** | **VCC** | ESP32 **5V / VIN** | 5.0V DC | Relay coil power |
| **2-Channel Relay** | **GND** | Common **GND** | Ground | Relay ground return |
| **2-Channel Relay** | **IN1** | ESP32 **GPIO 26** | 3.3V Logic | Relay 1 trigger (Active-LOW: LOW=Energized) |
| **2-Channel Relay** | **IN2** | ESP32 **GPIO 27** | 3.3V Logic | Relay 2 trigger (Active-LOW: LOW=Energized) |
| **Humidifier 1** | **Button Wire A** | Relay 1 **COM** | Dry Contact | First contact terminal of Humidifier 1 switch |
| **Humidifier 1** | **Button Wire B** | Relay 1 **NO** | Dry Contact | Second contact terminal of Humidifier 1 switch |
| **Humidifier 2** | **Button Wire A** | Relay 2 **COM** | Dry Contact | First contact terminal of Humidifier 2 switch |
| **Humidifier 2** | **Button Wire B** | Relay 2 **NO** | Dry Contact | Second contact terminal of Humidifier 2 switch |
| **DHT11 Sensor** | VCC / '+' | ESP32 **3V3** | 3.3V DC | Sensor power |
| **DHT11 Sensor** | DATA / OUT | ESP32 **GPIO 4** | 3.3V Logic | Data bus (4.7kΩ pull-up to 3.3V recommended) |
| **DHT11 Sensor** | GND / '-' | Common **GND** | Ground | Ground return |
| **JMD0.96D-1 OLED** | VCC | ESP32 **3V3** | 3.3V DC | Display power |
| **JMD0.96D-1 OLED** | GND | Common **GND** | Ground | Display ground |
| **JMD0.96D-1 OLED** | SDA | ESP32 **GPIO 21** | 3.3V Logic | I2C Data bus |
| **JMD0.96D-1 OLED** | SCL | ESP32 **GPIO 22** | 3.3V Logic | I2C Clock bus |
| **Status LED** | Built-in LED | ESP32 **GPIO 2** | 3.3V Logic | Blue LED: Blinks on boot, solid when WiFi connected |

---

## 3. Actuator Operating Principles

### A. 5V DC Cooling Fan (TB6612FNG Channel A)
- **Fan OFF (Stop / Coast)**:
  - `PWMA = LOW`, `AIN1 = LOW`, `AIN2 = LOW`
  - Output terminals `AO1` and `AO2` enter high-impedance mode (0V differential). The fan stops rotating.
- **Fan ON (100% Full Power)**:
  - `PWMA = HIGH`, `AIN1 = HIGH`, `AIN2 = LOW`, `STBY = HIGH`
  - `AO1` is connected to `VM` (+5V) and `AO2` is connected to `GND`. The fan runs at full 5V CFM capacity with internal flyback clamping diode protection.

### B. Dual Humidifiers (2-Channel Optocoupled Relay Module)
- **Isolated Mechanical Shorting**:
  - The humidifier boards use sensitive low-voltage tactile switches. Pulling them to ground with active semiconductor devices can sometimes introduce ground offsets or trigger latch-up.
  - Using the **Relay COM and NO contacts** provides a true mechanical dry short (zero electrical risk, total galvanic isolation).
- **Synchronous Click Sequencing**:
  - When the humidifier command is triggered, both relays actuate in exact unison:
  - **Power ON (1 Click)**:
    - Relays 1 & 2 energize (`LOW` on GPIO 26 & 27) for **200 ms** (contacts closed).
    - Relays de-energize (`HIGH`) for contacts to open.
  - **Power OFF (2 Clicks)**:
    - 1st click: Energize for **200 ms**, then release.
    - Interval pause: Wait **300 ms** (contacts open).
    - 2nd click: Energize for **200 ms**, then release.
    - Result: Cycles the humidifier controller through intermittent mist and shuts it completely OFF.
  - The sequence is 100% asynchronous and non-blocking via `millis()`.

---

## 4. Serial Commands Reference

Open the Serial Monitor at **115200 baud** with Newline line ending:

| Command | Action |
| :--- | :--- |
| `FAN ON` | Turns DC fan ON immediately (TB6612FNG Channel A at 100%) |
| `FAN OFF` | Turns DC fan OFF immediately (TB6612FNG Channel A stop) |
| `FAN AUTO` | Returns fan to automatic temperature threshold hysteresis (default 40°C ON / 38°C OFF) |
| `HUM ON` | Pulses Relays 1 & 2 together with 1 click (200ms contact short) |
| `HUM OFF` | Pulses Relays 1 & 2 together with 2 clicks (200ms short, 300ms pause, 200ms short) |
| `HUM AUTO` | Returns both humidifiers to automatic relative humidity threshold |
| `STATUS` | Prints complete hardware status, pin mappings, live readings, and WiFi connection |
| `HELP` | Prints available command reference |

---

## 5. OLED Display Layout (SSD1306 128x64)

The JMD0.96D-1 display updates continuously:
- **Line 0**: `FLORIFY CLIMATE    [WIFI]` (or `[OFFL]`)
- **Line 1**: `Temp: 28.5 C`
- **Line 2**: `Humidity: 62.1 %`
- **Line 3**: `Fan: ON (AUTO)` or `Fan: OFF (MAN)`
- **Line 4**: `Humidifier: ON`, `Humidifier: OFF`, or `Humidifier: PULSING..`
