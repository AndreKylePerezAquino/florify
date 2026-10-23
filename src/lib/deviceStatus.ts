import { UserProfile } from '../types';

/**
 * Device connection status helper
 * ESP32 device is considered '(ACTIVE) connected' if it is active and has reported
 * telemetry or heartbeat within the last 2 minutes (120,000 ms).
 * Otherwise it is considered 'disconnected'.
 */
export function isDeviceConnected(device?: {
  active?: boolean;
  lastReadingAt?: string;
  lastSeenAt?: string;
} | null): boolean {
  if (!device || device.active === false) {
    return false;
  }
  const timestamp = device.lastReadingAt || device.lastSeenAt;
  if (!timestamp) {
    return false;
  }
  const time = new Date(timestamp).getTime();
  if (isNaN(time)) {
    return false;
  }
  return Date.now() - time <= 2 * 60 * 1000;
}

/**
 * Driver GPS web connection status helper
 * Evaluates whether a driver's mobile GPS is actively connected and broadcasting
 * to the web within the last 30 seconds (30,000 ms).
 */
export function isDriverGpsConnected(driver?: UserProfile | null): boolean {
  if (!driver || !driver.currentLocation) {
    return false;
  }
  const { latitude, longitude, updatedAt } = driver.currentLocation;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    isNaN(latitude) ||
    isNaN(longitude) ||
    !updatedAt
  ) {
    return false;
  }
  const time = new Date(updatedAt).getTime();
  if (isNaN(time)) {
    return false;
  }
  // Connected if GPS update was received within the last 30 seconds
  return Date.now() - time <= 30 * 1000;
}

export type DriverGpsStatus = 'CONNECTED' | 'DISCONNECTED' | 'NO_SIGNAL';

export function getDriverGpsStatus(driver?: UserProfile | null): {
  status: DriverGpsStatus;
  elapsedSeconds: number | null;
  label: string;
} {
  if (!driver || !driver.currentLocation) {
    return { status: 'NO_SIGNAL', elapsedSeconds: null, label: 'No GPS Signal' };
  }
  const { latitude, longitude, updatedAt } = driver.currentLocation;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    isNaN(latitude) ||
    isNaN(longitude) ||
    !updatedAt
  ) {
    return { status: 'NO_SIGNAL', elapsedSeconds: null, label: 'No GPS Signal' };
  }
  const time = new Date(updatedAt).getTime();
  if (isNaN(time)) {
    return { status: 'NO_SIGNAL', elapsedSeconds: null, label: 'Invalid Timestamp' };
  }
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (elapsedSeconds <= 30) {
    return { status: 'CONNECTED', elapsedSeconds, label: `GPS Connected (${elapsedSeconds}s ago)` };
  }
  return { status: 'DISCONNECTED', elapsedSeconds, label: `GPS Disconnected (${elapsedSeconds}s ago)` };
}
