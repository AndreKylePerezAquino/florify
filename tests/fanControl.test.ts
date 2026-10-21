import { describe, it, expect } from 'vitest';
import { computeFanAutomation } from '../src/lib/fanControl';
import { DeviceConfig } from '../src/types';

describe('Fan Automation & Hysteresis Engine', () => {
  const baseConfig: DeviceConfig = {
    temperatureEnabled: true,
    temperatureOnC: 40.0,
    temperatureOffC: 38.0,
    humidityEnabled: true,
    humidityOnRH: 75.0,
    humidityOffRH: 65.0,
    activationMode: 'ANY',
    fanMode: 'AUTO',
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  it('turns fan ON when temperature reaches or exceeds ON threshold', () => {
    const result = computeFanAutomation({
      temperatureC: 40.5,
      humidityRH: 50.0,
      sensorHealthy: true,
      currentFanState: 'OFF',
      config: baseConfig,
    });
    expect(result.nextFanState).toBe('ON');
  });

  it('keeps fan ON in hysteresis deadband (between ON and OFF thresholds)', () => {
    const result = computeFanAutomation({
      temperatureC: 39.0, // Between 38 and 40
      humidityRH: 50.0,
      sensorHealthy: true,
      currentFanState: 'ON',
      config: baseConfig,
    });
    expect(result.nextFanState).toBe('ON');
  });

  it('turns fan OFF once temperature drops to or below OFF threshold', () => {
    const result = computeFanAutomation({
      temperatureC: 37.8,
      humidityRH: 50.0,
      sensorHealthy: true,
      currentFanState: 'ON',
      config: baseConfig,
    });
    expect(result.nextFanState).toBe('OFF');
  });

  it('activates fan in ANY mode if humidity exceeds ON threshold even if temperature is cool', () => {
    const result = computeFanAutomation({
      temperatureC: 25.0,
      humidityRH: 78.0,
      sensorHealthy: true,
      currentFanState: 'OFF',
      config: baseConfig,
    });
    expect(result.nextFanState).toBe('ON');
  });

  it('requires BOTH conditions to turn fan ON in ALL mode', () => {
    const allConfig: DeviceConfig = { ...baseConfig, activationMode: 'ALL' };

    // Only temp exceeded -> Should remain OFF
    const result1 = computeFanAutomation({
      temperatureC: 41.0,
      humidityRH: 50.0,
      sensorHealthy: true,
      currentFanState: 'OFF',
      config: allConfig,
    });
    expect(result1.nextFanState).toBe('OFF');

    // Both exceeded -> Should turn ON
    const result2 = computeFanAutomation({
      temperatureC: 41.0,
      humidityRH: 76.0,
      sensorHealthy: true,
      currentFanState: 'OFF',
      config: allConfig,
    });
    expect(result2.nextFanState).toBe('ON');
  });

  it('reverts expired manual override to AUTO', () => {
    const expiredOverrideConfig: DeviceConfig = {
      ...baseConfig,
      fanMode: 'FORCE_ON',
      overrideExpiresAt: new Date(Date.now() - 60000).toISOString(), // Expired 1 min ago
    };

    const result = computeFanAutomation({
      temperatureC: 25.0, // Normal cool temp
      humidityRH: 40.0,
      sensorHealthy: true,
      currentFanState: 'ON',
      config: expiredOverrideConfig,
    });

    expect(result.effectiveMode).toBe('AUTO');
    expect(result.overrideExpired).toBe(true);
    expect(result.nextFanState).toBe('OFF');
  });

  it('overrides FORCE_OFF if critical cabin temperature exceeds 60°C emergency cutoff', () => {
    const forceOffConfig: DeviceConfig = {
      ...baseConfig,
      fanMode: 'FORCE_OFF',
      overrideExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    };

    const result = computeFanAutomation({
      temperatureC: 62.5, // Extreme thermal condition
      humidityRH: 40.0,
      sensorHealthy: true,
      currentFanState: 'OFF',
      config: forceOffConfig,
    });

    expect(result.nextFanState).toBe('ON');
    expect(result.reason).toContain('CRITICAL SAFETY OVERRIDE');
  });

  it('defaults fan ON if DHT11 sensor reports hardware communication error', () => {
    const result = computeFanAutomation({
      temperatureC: NaN,
      humidityRH: NaN,
      sensorHealthy: false,
      currentFanState: 'OFF',
      config: baseConfig,
    });
    expect(result.nextFanState).toBe('ON');
    expect(result.reason).toContain('Sensor fault');
  });
});
