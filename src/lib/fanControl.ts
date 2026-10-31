import { DeviceConfig, FanState, OperatingMode } from '../types';

export interface AutomationInput {
  temperatureC: number;
  humidityRH: number;
  sensorHealthy: boolean;
  currentFanState: FanState;
  config: DeviceConfig;
  currentTime?: Date;
}

export interface AutomationResult {
  nextFanState: 'ON' | 'OFF';
  effectiveMode: OperatingMode;
  reason: string;
  overrideExpired: boolean;
}

/**
 * Validates climate automation threshold settings.
 * Ensures OFF thresholds are strictly lower than ON thresholds to enforce hysteresis.
 */
export function validateDeviceConfig(config: Partial<DeviceConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.temperatureEnabled) {
    if (typeof config.temperatureOnC !== 'number' || isNaN(config.temperatureOnC)) {
      errors.push('Temperature ON threshold must be a valid number.');
    }
    if (typeof config.temperatureOffC !== 'number' || isNaN(config.temperatureOffC)) {
      errors.push('Temperature OFF threshold must be a valid number.');
    }
    if (
      typeof config.temperatureOnC === 'number' &&
      typeof config.temperatureOffC === 'number' &&
      config.temperatureOffC >= config.temperatureOnC
    ) {
      errors.push(`Temperature OFF threshold (${config.temperatureOffC}°C) must be lower than ON threshold (${config.temperatureOnC}°C) to prevent rapid relay cycling.`);
    }
    if (config.temperatureOnC! < 0 || config.temperatureOnC! > 60) {
      errors.push('Temperature ON threshold must be within DHT11 range (0°C to 50°C).');
    }
  }

  if (config.humidityEnabled) {
    if (typeof config.humidityOnRH !== 'number' || isNaN(config.humidityOnRH)) {
      errors.push('Humidity ON threshold must be a valid number.');
    }
    if (typeof config.humidityOffRH !== 'number' || isNaN(config.humidityOffRH)) {
      errors.push('Humidity OFF threshold must be a valid number.');
    }
    if (
      typeof config.humidityOnRH === 'number' &&
      typeof config.humidityOffRH === 'number' &&
      config.humidityOnRH === config.humidityOffRH
    ) {
      errors.push('Humidity ON and OFF thresholds must be distinct to prevent rapid cycling.');
    }
    if (
      (typeof config.humidityOnRH === 'number' && (config.humidityOnRH < 0 || config.humidityOnRH > 100)) ||
      (typeof config.humidityOffRH === 'number' && (config.humidityOffRH < 0 || config.humidityOffRH > 100))
    ) {
      errors.push('Humidity thresholds must be within 0% to 100% RH.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Core climate automation logic running identically on frontend, backend, and simulated firmware.
 */
export function computeFanAutomation(input: AutomationInput): AutomationResult {
  const { temperatureC, humidityRH, sensorHealthy, currentFanState, config } = input;
  const now = input.currentTime || new Date();

  // 1. Check for manual override and check expiry
  let effectiveMode: OperatingMode = config.fanMode;
  let overrideExpired = false;

  if (config.fanMode !== 'AUTO') {
    if (config.overrideExpiresAt) {
      const expiry = new Date(config.overrideExpiresAt);
      if (now.getTime() > expiry.getTime()) {
        effectiveMode = 'AUTO';
        overrideExpired = true;
      }
    }
  }

  // Handle active manual overrides
  if (effectiveMode === 'FORCE_ON') {
    return {
      nextFanState: 'ON',
      effectiveMode: 'FORCE_ON',
      reason: 'Manual admin override: FORCE_ON active',
      overrideExpired,
    };
  }

  if (effectiveMode === 'FORCE_OFF') {
    // Physical hardware thermal emergency rule: If temperature exceeds 60°C, emergency thermal protection overrides FORCE_OFF
    if (sensorHealthy && temperatureC >= 60) {
      return {
        nextFanState: 'ON',
        effectiveMode: 'AUTO',
        reason: 'CRITICAL SAFETY OVERRIDE: Temperature >= 60°C overrides FORCE_OFF to prevent overheating',
        overrideExpired,
      };
    }
    return {
      nextFanState: 'OFF',
      effectiveMode: 'FORCE_OFF',
      reason: 'Manual admin override: FORCE_OFF active',
      overrideExpired,
    };
  }

  // 2. Local sensor automation (AUTO mode)
  if (!sensorHealthy || isNaN(temperatureC) || isNaN(humidityRH)) {
    // Failsafe condition: If sensor fails, run fan to protect shuttle cabin
    return {
      nextFanState: 'ON',
      effectiveMode: 'AUTO',
      reason: 'Sensor fault or reading communication error. Failsafe default ON.',
      overrideExpired,
    };
  }

  // Calculate temperature trigger state
  let tempTrigger: 'ON' | 'OFF' | 'HOLD' = 'HOLD';
  if (config.temperatureEnabled) {
    if (temperatureC >= config.temperatureOnC) {
      tempTrigger = 'ON';
    } else if (temperatureC <= config.temperatureOffC) {
      tempTrigger = 'OFF';
    } else {
      tempTrigger = 'HOLD';
    }
  }

  // Calculate humidity trigger state
  let humTrigger: 'ON' | 'OFF' | 'HOLD' = 'HOLD';
  if (config.humidityEnabled) {
    if (humidityRH >= config.humidityOnRH) {
      humTrigger = 'ON';
    } else if (humidityRH <= config.humidityOffRH) {
      humTrigger = 'OFF';
    } else {
      humTrigger = 'HOLD';
    }
  }

  // Combine conditions based on activationMode
  let nextState: 'ON' | 'OFF' = currentFanState === 'ON' ? 'ON' : 'OFF';
  let reason = 'Holding current hysteresis state.';

  if (config.activationMode === 'ANY') {
    // Temperature OR Humidity triggers fan
    if (tempTrigger === 'ON' || humTrigger === 'ON') {
      nextState = 'ON';
      reason = tempTrigger === 'ON' ? `Temperature (${temperatureC}°C >= ${config.temperatureOnC}°C) triggered fan ON.` : `Humidity (${humidityRH}% >= ${config.humidityOnRH}%) triggered fan ON.`;
    } else if (
      (tempTrigger === 'OFF' || !config.temperatureEnabled) &&
      (humTrigger === 'OFF' || !config.humidityEnabled)
    ) {
      nextState = 'OFF';
      reason = 'All enabled parameters are below OFF thresholds.';
    }
  } else {
    // ALL: Both enabled conditions must trigger fan ON
    const tempSatisfied = !config.temperatureEnabled || tempTrigger === 'ON';
    const humSatisfied = !config.humidityEnabled || humTrigger === 'ON';

    if (tempSatisfied && humSatisfied && (config.temperatureEnabled || config.humidityEnabled)) {
      nextState = 'ON';
      reason = 'Both temperature and humidity exceeded ON thresholds.';
    } else if (tempTrigger === 'OFF' || humTrigger === 'OFF') {
      nextState = 'OFF';
      reason = 'Parameter dropped below OFF threshold in ALL mode.';
    }
  }

  return {
    nextFanState: nextState,
    effectiveMode: 'AUTO',
    reason,
    overrideExpired,
  };
}
