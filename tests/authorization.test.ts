import { describe, it, expect } from 'vitest';
import { UserProfile, Device } from '../src/types';

describe('Authorization & Device Assignment Scoping', () => {
  const driverAlice: UserProfile = {
    uid: 'alice-101',
    displayName: 'Alice Driver',
    email: 'alice@shuttle.example',
    role: 'DRIVER',
    status: 'APPROVED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const driverBob: UserProfile = {
    uid: 'bob-102',
    displayName: 'Bob Driver',
    email: 'bob@shuttle.example',
    role: 'DRIVER',
    status: 'APPROVED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const deviceShuttle1: Device = {
    deviceId: 'ESP32-SHUTTLE-01',
    displayName: 'Cabin 1',
    assignedDriverUid: 'alice-101',
    active: true,
    status: 'ONLINE',
    firmwareVersion: 'v2.1.0-prod',
    sensorType: 'DHT22',
    latestFanState: 'OFF',
    reportedMode: 'AUTO',
    reportedConfigVersion: 1,
    desiredConfigVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const deviceShuttle2: Device = {
    deviceId: 'ESP32-SHUTTLE-02',
    displayName: 'Cabin 2',
    assignedDriverUid: 'bob-102',
    active: true,
    status: 'ONLINE',
    firmwareVersion: 'v2.1.0-prod',
    sensorType: 'DHT22',
    latestFanState: 'OFF',
    reportedMode: 'AUTO',
    reportedConfigVersion: 1,
    desiredConfigVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  function canDriverAccessDevice(driverUid: string, device: Device): boolean {
    return device.assignedDriverUid === driverUid;
  }

  it('permits assigned driver Alice to access her assigned device', () => {
    expect(canDriverAccessDevice(driverAlice.uid, deviceShuttle1)).toBe(true);
  });

  it('strictly denies driver Alice access to device assigned to driver Bob', () => {
    expect(canDriverAccessDevice(driverAlice.uid, deviceShuttle2)).toBe(false);
  });

  it('strictly denies driver access if device is unassigned', () => {
    const unassignedDevice: Device = { ...deviceShuttle1, assignedDriverUid: null };
    expect(canDriverAccessDevice(driverAlice.uid, unassignedDevice)).toBe(false);
  });

  it('strictly revokes access when device is reassigned to another driver', () => {
    // Reassigned to Bob
    const reassignedDevice: Device = { ...deviceShuttle1, assignedDriverUid: 'bob-102' };
    expect(canDriverAccessDevice(driverAlice.uid, reassignedDevice)).toBe(false);
    expect(canDriverAccessDevice(driverBob.uid, reassignedDevice)).toBe(true);
  });
});
