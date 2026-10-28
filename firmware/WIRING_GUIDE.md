# ESP32 + JMD0.96D-1 OLED + DHT11 + Dual Relay Hardware Wiring Guide

This guide details the complete hardware wiring, I2C display connections, and relay logic for deploying the **ESP32 Climate Monitor, JMD0.96D-1 OLED & Appliance Control System**.

---

## 1. Safety & Electrical Specifications

> **HARDWARE SAFETY NOTICE:**
> - Never power heavy fans, heaters, or appliances directly from ESP32 GPIO pins (ESP32 pins deliver max 12mA at 3.3V).
> - Always use an optocoupled relay module (e.g., Songle 5V 2-channel board) to switch appliance power circuits.
> - Provide common ground (`GND`) across the ESP32, sensor, OLED, and relay module.
> - The JMD0.96D-1 OLED module contains an on-board regulator and can run on 3.3V or 5V (3.3V recommended).

---

## 2. Complete Pinout Table

| Component | Pin Label | ESP32 GPIO / Pin | Voltage Rail | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **DHT11 Sensor** | VCC / '+' | **3V3 / 5V** | 3.3V or 5V DC | Power supply for DHT11 |
| **DHT11 Sensor** | DATA / OUT | **GPIO 4** | 3.3V Logic | 4.7kΩ to 10kΩ pull-up to 3.3V recommended |
| **DHT11 Sensor** | GND / '-' | **GND** | Common GND | Ground return |
| **JMD0.96D-1 OLED**| GND | **GND** | Common GND | OLED ground |
| **JMD0.96D-1 OLED**| VCC | **3V3** | 3.3V DC | OLED power |
| **JMD0.96D-1 OLED**| SCL | **GPIO 22** | 3.3V Logic | I2C Clock (Hardware I2C) |
| **JMD0.96D-1 OLED**| SDA | **GPIO 21** | 3.3V Logic | I2C Data (Hardware I2C) |
| **Dual Relay Module** | VCC | **VIN (5V)** | 5.0V DC | Power supply for relay coils |
| **Dual Relay Module** | GND | **GND** | Common GND | Connect to ESP32 ground |
| **Dual Relay Module** | IN1 (Fan) | **GPIO 18** | 3.3V Logic | **Active LOW**: Normal ON/OFF continuous switch |
| **Dual Relay Module** | IN2 (Humidifier) | **GPIO 19** | 3.3V Logic | **Active LOW**: Momentary click pulse simulator |
| **Status LED** | Built-in LED | **GPIO 2** | 3.3V Logic | Solid when connected to WiFi, blinks during connection |

---

## 3. Appliance Actuation Logic

### A. Relay 1 (Cooling Fan): GPIO 18
- Operates as a continuous ON / OFF switch.
- When commanded ON: Relay 1 energizes (`LOW`) and stays closed until commanded OFF (`HIGH`).

### B. Relay 2 (Humidifier Button Simulator): GPIO 19
- Modern humidifiers use a momentary push button (electronic tactile switch) to toggle power states. Connecting continuous power does not work; the relay contacts must simulate finger presses across the humidifier's button leads:
  - **Humidifier ON (1 Click)**:
    - Relay pulled `LOW` for **200 ms** (button contact pressed)
    - Relay released `HIGH` (button contact released)
  - **Humidifier OFF (2 Clicks spaced 300 ms apart)**:
    - 1st click: Relay pulled `LOW` for **200 ms**
    - Pause: Relay released `HIGH` for **300 ms**
    - 2nd click: Relay pulled `LOW` for **200 ms**
    - Standby: Relay released `HIGH`

```text
Turn ON (1 Click):
GPIO 19:  HIGH ────┐            ┌─────────────── (Standby)
                   │ 200 ms LOW │
                   └────────────┘

Turn OFF (2 Clicks, 300 ms interval):
GPIO 19:  HIGH ──┐          ┌────── 300 ms ──────┐          ┌─── (Standby)
                 │ 200 ms   │                    │ 200 ms   │
                 └──────────┘                    └──────────┘
```

---

## 4. JMD0.96D-1 Display Configuration

- **Controller**: SSD1306 (128 columns x 64 rows, monochrome white/blue)
- **Interface**: I2C (2-wire + power)
- **I2C Address**: Defaults to `0x3C`. The firmware includes an auto-detection fallback that automatically tests `0x3D` if `0x3C` does not acknowledge.
- **Onboard Layout**:
  - Line 1: Wi-Fi status and acquired local IP address
  - Line 2: Real-time Temperature in Celsius (`°C`)
  - Line 3: Real-time Relative Humidity percentage (`% RH`)
  - Line 4: Live states for Fan (`ON`/`OFF`), Humidifier (`ON`/`OFF`/`CLK..`), and Mode (`[AUTO]`/`[MAN]`)

---

## 5. Required Arduino IDE Libraries

Install these libraries from the **Arduino IDE Library Manager** (`Sketch > Include Library > Manage Libraries`):
1. **Adafruit SSD1306** by Adafruit
2. **Adafruit GFX Library** by Adafruit
3. **DHT sensor library** by Adafruit
4. **Adafruit Unified Sensor** by Adafruit
5. **ArduinoJson** by Benoit Blanchon (v6 or v7)

---

## 6. External 5V Relay Wiring & Open-Drain Mode

### The 5V Optocoupler vs. 3.3V Logic Issue
Standard 2-channel relay boards power their optocoupler inputs from **5V** (VCC). When controlled by a 3.3V microcontroller like the ESP32:
- An active-LOW optocoupler LED connects between `5V` (anode) and the `IN` pin (cathode).
- If the ESP32 pin drives standard push-pull `HIGH` (3.3V):
  `5.0V - 3.3V = 1.7V` remains across the optocoupler LED! Because infrared LEDs conduct at ~1.2V, current continuously leaks into the ESP32 pin, keeping the relay **permanently energized**.

### The Solution: `OUTPUT_OPEN_DRAIN` Mode
The updated firmware configures GPIO 18 and 19 as `OUTPUT_OPEN_DRAIN`:
- **DE-ENERGIZED (OFF)**: Pin is set `HIGH` (High-Z floating). The circuit is completely broken, 0 current flows, and the relay LED turns OFF.
- **ENERGIZED (ON)**: Pin pulls to `LOW` (GND / 0V), allowing current to sink safely to ground and energizing the relay coil.

### External Power & Common Ground Wiring
When using an external 5V power supply for the relay module:
1. **Relay VCC** -> External 5V Power Supply (+)
2. **Relay GND** -> External 5V Power Supply (-) **AND** ESP32 `GND` pin (Common Ground is mandatory!)
3. **Relay IN1** -> ESP32 GPIO 18 (Cooling Fan)
4. **Relay IN2** -> ESP32 GPIO 19 (Humidifier)

### Instant Serial Diagnostics
You can verify relay switching directly in the **Arduino IDE Serial Monitor** (115200 baud) without Wi-Fi or cloud sync:
- `FAN ON` - Forces Fan relay closed (relay LED turns ON)
- `FAN OFF` - Forces Fan relay open (relay LED turns OFF)
- `HUM ON` - Executes a 1-click 200ms pulse for humidifier
- `HUM OFF` - Executes a 2-click 200ms pulse sequence (300ms pause)
- `POLARITY LOW` - Sets active-LOW logic (default for optocoupled modules)
- `POLARITY HIGH` - Sets active-HIGH logic
- `STATUS` - Displays complete sensor, relay, and Wi-Fi state
- `HELP` - Displays available commands

