# ESP32 + TB6612FNG Dual Driver + DHT11 + OLED Hardware Wiring Guide

This guide details the complete hardware wiring, pin assignments, electrical protection, and operating logic for deploying the **ESP32 Climate Monitor & Florify Actuator System** using the **Toshiba TB6612FNG Dual H-Bridge Driver**.

---

## 1. Safety & Electrical Specifications

> **CRITICAL HARDWARE RULES:**
> 1. **Common Ground is Mandatory**: Connect the ESP32 `GND`, TB6612FNG `GND` pins, external 5V Power Supply `GND (-)`, and Humidifier circuit ground together. Without a common ground reference, the control signals and pull-down pulses will not work.
> 2. **Logic vs. Motor Power Separation**:
>    - **`VCC` (TB6612FNG Pin)**: Connect to **ESP32 3.3V** (Logic power, 2.7V - 5.5V). This ensures all logic inputs (`AIN1`, `AIN2`, `PWMA`, `BIN1`, `BIN2`, `PWMB`, `STBY`) match the ESP32's 3.3V GPIO levels.
>    - **`VM` (TB6612FNG Pin)**: Connect to your **External 5.0V DC Power Supply (+)** (Motor power rail, 4.5V - 15V). **Never** power the motor rail from the ESP32 3.3V pin!
> 3. **Standby Pin (`STBY`)**: Must be driven **HIGH** to activate the driver. The firmware drives ESP32 **GPIO 23 HIGH** at boot.

---

## 2. Complete Pinout & Wiring Table

| Module | Pin on Board | Connects To | Voltage / Logic | Description |
| :--- | :--- | :--- | :--- | :--- |
| **TB6612FNG** | **VCC** | ESP32 **3V3** | 3.3V DC | Logic supply power |
| **TB6612FNG** | **VM** | External **5V Power (+)** | 5.0V DC | Motor / Fan power rail |
| **TB6612FNG** | **GND** (all) | Common **GND** | 0V Ground | Connect ESP32 GND, 5V supply (-), and module GND |
| **TB6612FNG** | **STBY** | ESP32 **GPIO 23** | 3.3V Logic | Standby enable (Firmware drives HIGH) |
| **TB6612FNG** | **PWMA** | ESP32 **GPIO 18** | 3.3V Logic | Channel A (Fan) Speed/Gate (HIGH = 100% full ON) |
| **TB6612FNG** | **AIN1** | ESP32 **GPIO 19** | 3.3V Logic | Channel A Direction 1 (HIGH for forward) |
| **TB6612FNG** | **AIN2** | ESP32 **GPIO 5** | 3.3V Logic | Channel A Direction 2 (LOW for forward) |
| **TB6612FNG** | **AO1** | **DC Fan (+) Lead** | 0V to 5V | Motor Output A1 |
| **TB6612FNG** | **AO2** | **DC Fan (-) Lead** | 0V to GND | Motor Output A2 |
| **TB6612FNG** | **PWMB** | ESP32 **GPIO 25** | 3.3V Logic | Channel B (Humidifier) Gate Enable |
| **TB6612FNG** | **BIN1** | ESP32 **GPIO 26** | 3.3V Logic | Channel B Direction 1 |
| **TB6612FNG** | **BIN2** | ESP32 **GPIO 27** | 3.3V Logic | Channel B Direction 2 |
| **TB6612FNG** | **BO1** | **Humidifier Button Sense** | Pulled to GND on pulse | Pulse contact to trigger humidifier cycle |
| **DHT11 Sensor** | VCC / '+' | ESP32 **3V3** | 3.3V DC | Sensor power |
| **DHT11 Sensor** | DATA / OUT | ESP32 **GPIO 4** | 3.3V Logic | Data bus (4.7kΩ pull-up to 3.3V recommended) |
| **DHT11 Sensor** | GND / '-' | Common **GND** | Ground | Ground return |
| **JMD0.96D-1 OLED** | VCC | ESP32 **3V3** | 3.3V DC | Display power |
| **JMD0.96D-1 OLED** | GND | Common **GND** | Ground | Display ground |
| **JMD0.96D-1 OLED** | SDA | ESP32 **GPIO 21** | 3.3V Logic | I2C Data bus |
| **JMD0.96D-1 OLED** | SCL | ESP32 **GPIO 22** | 3.3V Logic | I2C Clock bus |
| **Status LED** | Built-in LED | ESP32 **GPIO 2** | 3.3V Logic | WiFi status indicator |

---

## 3. Channel A: DC Cooling Fan Operation

The TB6612FNG drives the DC cooling fan using an integrated dual MOSFET H-bridge with internal flyback clamping diodes.

### Control Logic:
- **Fan OFF (Coast / Stop)**:
  - `PWMA = LOW`, `AIN1 = LOW`, `AIN2 = LOW`
  - Outputs `AO1` and `AO2` enter High-Z (floating stop), 0V applied across the fan.
- **Fan ON (100% Full Speed)**:
  - `PWMA = HIGH`, `AIN1 = HIGH`, `AIN2 = LOW`
  - Output `AO1` connects to `VM` (+5V) and `AO2` connects to `GND`. Fan runs at full power.

---

## 4. Channel B: Humidifier Tactile Button Simulation

Electronic mist humidifiers use a momentary push button (tactile switch) that is internally pulled up to 3.3V or 5V by the humidifier's onboard microcontroller. Pressing the button pulls the signal contact to Ground (`GND`).

### Wiring for Humidifier:
1. Locate the two terminals of the humidifier's tactile button:
   - **Terminal 1 (Sense Line)**: Connect this to TB6612FNG **`BO1`**.
   - **Terminal 2 (GND Line)**: Ensure the humidifier's circuit ground is tied to the **Common System GND**.
2. **How the TB6612FNG Simulates the Button**:
   - **Idle (Button Released)**:
     - Firmware sets `PWMB = LOW`, `BIN1 = LOW`, `BIN2 = LOW`.
     - Output `BO1` is in **High-Z (Floating)** state.
     - The humidifier's internal pull-up resistor keeps the contact high. The humidifier sees the button as unpressed.
   - **Active Press (200ms Pulse to Ground)**:
     - Firmware sets `PWMB = HIGH`, `BIN1 = LOW`, `BIN2 = HIGH`.
     - In this mode, the TB6612FNG turns ON its low-side MOSFET, firmly clamping **`BO1` to Ground (`LOW`)**.
     - The humidifier microcontroller detects a genuine physical button press.
   - **Button Release**:
     - After 200 ms, firmware resets Channel B to High-Z.

### Click Sequences:
- **Humidifier ON (1 Click)**:
  - Pulses `BO1` LOW for **200 ms**, then returns to High-Z.
- **Humidifier OFF (2 Clicks with 300ms pause)**:
  - Pulses `BO1` LOW for **200 ms** (1st click).
  - Pauses in High-Z for **300 ms**.
  - Pulses `BO1` LOW for **200 ms** (2nd click).
  - Returns to High-Z.

All timing is handled by a non-blocking asynchronous state machine in the firmware (`updateHumidifierStateMachine()`), so sensor readings, OLED updates, and cloud sync are never blocked.

---

## 5. Serial Commands

Open the Arduino Serial Monitor at **115200 baud** (Newline line ending):

| Command | Action |
| :--- | :--- |
| `FAN ON` | Turns DC fan ON immediately (TB6612FNG Channel A forward) |
| `FAN OFF` | Turns DC fan OFF immediately (TB6612FNG Channel A stop) |
| `FAN AUTO` | Returns fan to automatic temperature threshold hysteresis (default 40°C ON / 38°C OFF) |
| `HUM ON` | Simulates 1 button click (200ms pull-down pulse) |
| `HUM OFF` | Simulates 2 button clicks (200ms pulse, 300ms pause, 200ms pulse) |
| `HUM AUTO` | Returns humidifier to automatic relative humidity threshold |
| `STATUS` | Prints current temperature, humidity, fan state, humidifier state, WiFi status, and IP |
| `HELP` | Prints available command reference |

---

## 6. OLED Screen Layout

The JMD0.96D-1 SSD1306 (128x64) screen displays live status:
- **Row 1**: `FLORIFY CLIMATE` header with `[WIFI]` or `[OFFL]` indicator.
- **Row 2**: Real-time cabin temperature (e.g. `Temp: 28.4 C`).
- **Row 3**: Real-time relative humidity (e.g. `Humidity: 62.0 %`).
- **Row 4**: Fan status: `Fan: ON (AUTO)` or `Fan: OFF (MAN)`.
- **Row 5**: Humidifier status: `Humidifier: ON`, `OFF`, or `CLICKING..` during active pulse sequence.
