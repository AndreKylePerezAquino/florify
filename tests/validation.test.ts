import { describe, it, expect } from 'vitest';
import { validateDeviceConfig } from '../src/lib/fanControl';

describe('Device Configuration Validation', () => {
  it('accepts valid hysteresis thresholds where OFF < ON', () => {
    const result = validateDeviceConfig({
      temperatureEnabled: true,
      temperatureOnC: 40.0,
      temperatureOffC: 38.0,
      humidityEnabled: true,
      humidityOnRH: 75.0,
      humidityOffRH: 65.0,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects configuration where Temperature OFF is greater than or equal to ON', () => {
    const result = validateDeviceConfig({
      temperatureEnabled: true,
      temperatureOnC: 38.0,
      temperatureOffC: 40.0, // Invalid: OFF > ON
      humidityEnabled: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('must be lower than ON threshold');
  });

  it('rejects humidity outside 0-100% RH range', () => {
    const result = validateDeviceConfig({
      temperatureEnabled: false,
      humidityEnabled: true,
      humidityOnRH: 110.0,
      humidityOffRH: 50.0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('within 0% to 100% RH'))).toBe(true);
  });
});
