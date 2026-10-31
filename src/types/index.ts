export type UserRole = 'ADMIN' | 'DRIVER';
export type AdminLevel = 'MASTER' | 'STANDARD';
export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface DriverLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  updatedAt: string;
  isActive?: boolean;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  email: string;
  role: UserRole;
  adminLevel?: AdminLevel;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  currentLocation?: DriverLocation;
}

export type DeviceStatus = 'SENSOR_ERROR' | 'DISABLED' | 'UNKNOWN';
export type FanState = 'ON' | 'OFF' | 'UNKNOWN';
export type MistState = 'ON' | 'OFF' | 'UNKNOWN';
export type OperatingMode = 'AUTO' | 'FORCE_ON' | 'FORCE_OFF';
export type ActivationMode = 'ANY' | 'ALL';

export interface Device {
  deviceId: string;
  displayName: string;
  locationLabel?: string;
  assignedDriverUid: string | null;
  active: boolean;
  status: DeviceStatus;
  firmwareVersion: string;
  sensorType: 'DHT11';
  lastSeenAt?: string;
  lastReadingAt?: string;
  latestTemperatureC?: number;
  latestHumidityRH?: number;
  latestFanState: FanState;
  latestMistState?: MistState;
  reportedMode: OperatingMode;
  reportedConfigVersion: number;
  desiredConfigVersion: number;
  lastErrorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceConfig {
  temperatureEnabled: boolean;
  temperatureOnC: number;
  temperatureOffC: number;
  humidityEnabled: boolean;
  humidityOnRH: number;
  humidityOffRH: number;
  dhtReadIntervalSeconds?: number;
  activationMode: ActivationMode;
  fanMode: OperatingMode;
  mistMode?: OperatingMode;
  overrideExpiresAt?: string;
  overrideReason?: string;
  mistOverrideExpiresAt?: string;
  mistOverrideReason?: string;
  updatedAt: string;
  updatedBy?: string;
  version: number;
  flowerPreset?: string;
}

export type FlowerPresetType =
  | 'Phalaenopsis Orchid'
  | 'Vanda Orchid'
  | 'Anthurium'
  | 'Rose'
  | 'General Flower'
  | 'Custom'
  | (string & {});

export interface FlowerPresetValues {
  tempOn: number;
  tempOff: number;
  humOn: number;
  humOff: number;
}

export const FLOWER_PRESETS: Record<Exclude<FlowerPresetType, 'Custom'>, FlowerPresetValues> = {
  'Phalaenopsis Orchid': {
    tempOn: 28.0,
    tempOff: 26.0,
    humOn: 45.0,
    humOff: 60.0,
  },
  'Vanda Orchid': {
    tempOn: 30.0,
    tempOff: 28.0,
    humOn: 60.0,
    humOff: 75.0,
  },
  'Anthurium': {
    tempOn: 28.0,
    tempOff: 26.0,
    humOn: 60.0,
    humOff: 75.0,
  },
  'Rose': {
    tempOn: 25.0,
    tempOff: 23.0,
    humOn: 40.0,
    humOff: 55.0,
  },
  'General Flower': {
    tempOn: 28.0,
    tempOff: 26.0,
    humOn: 45.0,
    humOff: 60.0,
  },
};

export interface DeviceReading {
  id?: string;
  temperatureC: number;
  humidityRH: number;
  fanState: FanState;
  mistState?: MistState;
  operatingMode: OperatingMode;
  sensorHealthy: boolean;
  configVersion: number;
  deviceRecordedAt: string;
  receivedAt: string;
}

export type AlertType =
  | 'HIGH_TEMPERATURE'
  | 'HIGH_HUMIDITY'
  | 'DEVICE_OFFLINE'
  | 'SENSOR_FAULT'
  | 'OVERRIDE_ACTIVE'
  | 'CONFIG_SYNC_ERROR';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;
  deviceId: string;
  assignedDriverUidAtCreation?: string | null;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  createdAt: string;
  source: 'DEVICE' | 'BACKEND';
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface DeviceHeartbeatRequest {
  deviceId: string;
  timestamp: string;
  firmwareVersion?: string;
  freeHeap?: number;
  wifiRssi?: number;
}

export interface DeviceReadingsRequest {
  deviceId: string;
  readings: Array<{
    temperatureC: number;
    humidityRH: number;
    fanState: FanState;
    operatingMode: OperatingMode;
    sensorHealthy: boolean;
    configVersion: number;
    deviceRecordedAt: string;
  }>;
}

export interface DeviceConfigAckRequest {
  deviceId: string;
  appliedVersion: number;
  timestamp: string;
}
