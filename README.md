# Shuttle Climate Monitor

A full-stack, secure, real-time IoT climate monitoring application for fleet shuttle buses. It monitors temperature and relative humidity via ESP32 microcontrollers equipped with DHT11 sensors and controls cabin blower fans via relay modules with local hysteresis automation.

Designed with an elegant, modern **Feminine Pink Theme** with clear operational status indicators (green for healthy, amber for elevated/warning, red for critical faults, gray for offline).

---

## 1. Core Architecture Invariants

- **No Vehicle Registration / Vehicle Management**: Each ESP32 device is assigned directly to **one active driver at a time (1:1 direct binding)**. No vehicle collections, vehicle IDs, plate numbers, or registration forms exist anywhere in the application.
- **Local On-Chip Automation**: The ESP32 evaluates temperature and humidity hysteresis locally on-chip. Even during cellular/Wi-Fi outages in remote transit zones, relay fan actuation continues safely without interruption.
- **Timed Manual Overrides**: Administrator fan overrides (`FORCE_ON` / `FORCE_OFF`) require an expiration window and are enforced locally on the ESP32 via on-chip timers. Expired overrides automatically revert to `AUTO`.
- **Hardware Emergency Cutoff**: If cabin temperature reaches 60.0°C, emergency thermal protection triggers fan ON regardless of software override mode.
- **Strict Role-Based Access Control (RBAC)**:
  - **Google-Only Authentication**: No passwords or insecure registration.
  - **Admin Approval Required**: New sign-ins enter a `PENDING` state and require approval by an authorized administrator before accessing telemetry data.
  - **Driver Read-Only Isolation**: Drivers can view only the ESP32 unit actively assigned to their profile. Drivers cannot modify thresholds, trigger overrides, or view other drivers' units.

---

## 2. Feminine Pink Color Palette & Design System

The application implements cohesive design tokens:
- **Primary Pink**: `#E84D9B` (primary CTAs, active tab backgrounds, focused states)
- **Deep Rose**: `#BE185D` (headings, brand wordmark, emphasized text)
- **Soft Blush Background**: `#FFF1F6` (canvas background, subtle card accents)
- **Light Pink**: `#FCE7F3` (hover backgrounds, segmented controls)
- **Pastel Pink**: `#F9A8D4` (scrollbars, subtle graph strokes)
- **Dusty Rose**: `#D87093` (secondary actions, humidity telemetry curves)
- **White Surfaces**: `#FFFFFF` (flat white elevation cards)
- **Dark Plum Text**: `#3D2635` (high-contrast primary typography)
- **Muted Mauve Text**: `#8B7180` (metadata, labels, timestamps)
- **Soft Pink Borders**: `#F1D5E2` (hairline structural dividers)

### Operational Status Indicators
- **Healthy / Online**: Green (`#10B981` / Emerald)
- **Warning / Elevated**: Amber (`#F59E0B` / Amber)
- **Critical / Sensor Fault**: Red (`#EF4444` / Rose)
- **Offline / Unknown**: Gray (`#6B7280` / Slate)

---

## 3. Repository Structure

```
├── .env.example                    # Environment variables template
├── firebase-applet-config.json     # Firebase web client configuration
├── firebase-blueprint.json         # Intermediate Firestore schema blueprint
├── firestore.rules                 # Hardened Firestore Security Rules
├── firestore.indexes.json          # Composite index definitions
├── firebase.json                   # Hosting & Functions deployment config
├── firmware/
│   ├── esp32_shuttle_climate.ino   # Complete Arduino C++ firmware for ESP32
│   └── WIRING_GUIDE.md             # Hardware schematic & optocoupled relay wiring
├── functions/
│   ├── src/index.ts                # Firebase Cloud Functions backend
│   └── package.json
├── server.ts                       # Express backend + Vite dev server (Port 3000)
├── src/
│   ├── components/
│   │   ├── common/                 # StatusBadge, DeviceCard, HistoricalChart
│   │   ├── layout/                 # Navbar, DemoBanner
│   │   └── modals/                 # ESP32SimulatorModal
│   ├── context/                    # AppContext (Auth, Firestore listeners, Demo mode)
│   ├── lib/                        # fanControl.ts, firebase.ts, demoData.ts
│   ├── pages/
│   │   ├── admin/                  # Overview, Devices, DeviceDetail, Settings, Users, Alerts, AuditLogs
│   │   ├── driver/                 # DriverDashboard, DriverDeviceDetail
│   │   ├── public/                 # LoginPage, PendingApprovalPage, AccessDeniedPage
│   │   └── shared/                 # ProfilePage, NotFoundPage
│   ├── types/                      # TypeScript data models and API interfaces
│   ├── App.tsx                     # Main router and route guards
│   └── index.css                   # Tailwind theme tokens and fonts
└── tests/
    ├── fanControl.test.ts          # Hysteresis and thermal safety tests
    ├── validation.test.ts          # Threshold range tests
    └── authorization.test.ts       # Driver isolation tests
```

---

## 4. Setup & Local Development

### Prerequisites
- Node.js 20+
- npm or bun

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### Step 3: Start Development Server
```bash
npm run dev
```
The server will start at `http://localhost:3000` with both Express REST API routes and the Vite frontend mounted.

---

## 5. Firebase Production Setup & Admin Bootstrap

1. **Create Firebase Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
   - Enable **Cloud Firestore** and **Firebase Authentication**.
   - Under Authentication -> Sign-in method, enable **Google Sign-In**. Add authorized domains (e.g. `localhost`, your Cloud Run domain).
2. **Deploy Firestore Security Rules**:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```
3. **Bootstrap Initial Administrator**:
   - The user account `newroskoto@gmail.com` is configured in Firestore Security Rules as the root bootstrap administrator.
   - When signing in with this Google account, the user is automatically granted `ADMIN` role with `APPROVED` status.
   - Additional administrators can subsequently be promoted from the Admin Users management console (`/admin/users`).
4. **Deploy Cloud Functions (Optional)**:
   ```bash
   cd functions && npm install && npm run deploy
   ```

---

## 6. Device REST API Specification

### 1. `POST /api/device/heartbeat`
- **Headers**: `Authorization: Bearer <DEVICE_SECRET>`, `Content-Type: application/json`
- **Body**:
  ```json
  {
    "deviceId": "ESP32-SHUTTLE-01",
    "firmwareVersion": "v2.1.0-prod",
    "freeHeap": 214500,
    "wifiRssi": -65
  }
  ```
- **Response**: `200 OK` with server time and target configuration version.

### 2. `POST /api/device/readings`
- **Headers**: `Authorization: Bearer <DEVICE_SECRET>`, `Content-Type: application/json`
- **Body**:
  ```json
  {
    "deviceId": "ESP32-SHUTTLE-01",
    "readings": [
      {
        "temperatureC": 40.8,
        "humidityRH": 68.2,
        "fanState": "ON",
        "operatingMode": "AUTO",
        "sensorHealthy": true,
        "configVersion": 3,
        "deviceRecordedAt": "18402120"
      }
    ]
  }
  ```

### 3. `GET /api/device/config?deviceId=ESP32-SHUTTLE-01`
- **Headers**: `Authorization: Bearer <DEVICE_SECRET>`
- **Response**:
  ```json
  {
    "temperatureEnabled": true,
    "temperatureOnC": 40.0,
    "temperatureOffC": 38.0,
    "humidityEnabled": true,
    "humidityOnRH": 75.0,
    "humidityOffRH": 65.0,
    "activationMode": "ANY",
    "fanMode": "AUTO",
    "version": 3
  }
  ```

### 4. `POST /api/device/config-ack`
- **Body**: `{"deviceId": "ESP32-SHUTTLE-01", "appliedVersion": 3}`

---

## 7. Running Automated Tests

Run the test suite using Vitest:
```bash
npm run test
```
The test suite verifies:
- Temperature and humidity hysteresis transitions
- Deadband state holding
- ANY vs ALL activation conditions
- Override local expiration and emergency thermal cutoff (>60°C)
- Sensor fault failsafe defaults
- Driver device access isolation and reassignment revocation
- Configuration validation (OFF < ON)
