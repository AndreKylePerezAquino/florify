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
