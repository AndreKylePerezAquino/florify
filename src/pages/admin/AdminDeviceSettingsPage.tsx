import React, { useState, useEffect } from 'react';
import {
  Settings,
  ArrowLeft,
  Save,
  CheckCircle2,
  AlertCircle,
  Thermometer,
  Droplets,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { validateDeviceConfig } from '../../lib/fanControl';
import { ActivationMode } from '../../types';

interface AdminDeviceSettingsPageProps {
  deviceId: string;
  navigate: (path: string) => void;
}

export const AdminDeviceSettingsPage: React.FC<AdminDeviceSettingsPageProps> = ({ deviceId, navigate }) => {
  const { devices, deviceConfigs, updateConfig } = useApp();

  const device = devices.find((d) => d.deviceId === deviceId);
  const currentConfig = deviceConfigs[deviceId] || {
    temperatureEnabled: true,
    temperatureOnC: 40.0,
    temperatureOffC: 38.0,
    humidityEnabled: true,
    humidityOnRH: 75.0,
    humidityOffRH: 65.0,
    activationMode: 'ANY' as ActivationMode,
    fanMode: 'AUTO' as const,
    version: 1,
  };

  // Form state
  const [tempEnabled, setTempEnabled] = useState(currentConfig.temperatureEnabled);
  const [tempOn, setTempOn] = useState<number>(currentConfig.temperatureOnC);
  const [tempOff, setTempOff] = useState<number>(currentConfig.temperatureOffC);
  const [humEnabled, setHumEnabled] = useState(currentConfig.humidityEnabled);
  const [humOn, setHumOn] = useState<number>(currentConfig.humidityOnRH);
  const [humOff, setHumOff] = useState<number>(currentConfig.humidityOffRH);
  const [activationMode, setActivationMode] = useState<ActivationMode>(currentConfig.activationMode);

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Sync state if deviceConfigs update
  useEffect(() => {
    if (deviceConfigs[deviceId]) {
      const c = deviceConfigs[deviceId];
      setTempEnabled(c.temperatureEnabled);
      setTempOn(c.temperatureOnC);
      setTempOff(c.temperatureOffC);
      setHumEnabled(c.humidityEnabled);
      setHumOn(c.humidityOnRH);
      setHumOff(c.humidityOffRH);
      setActivationMode(c.activationMode);
    }
  }, [deviceId, deviceConfigs]);

  // Validation
  const validation = validateDeviceConfig({
    temperatureEnabled: tempEnabled,
    temperatureOnC: tempOn,
    temperatureOffC: tempOff,
    humidityEnabled: humEnabled,
    humidityOnRH: humOn,
    humidityOffRH: humOff,
  });

  const hasUnsavedChanges =
    tempEnabled !== currentConfig.temperatureEnabled ||
    tempOn !== currentConfig.temperatureOnC ||
    tempOff !== currentConfig.temperatureOffC ||
    humEnabled !== currentConfig.humidityEnabled ||
    humOn !== currentConfig.humidityOnRH ||
    humOff !== currentConfig.humidityOffRH ||
    activationMode !== currentConfig.activationMode;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validation.valid) return;

    setSaving(true);
    setSuccessMessage(null);
    try {
      await updateConfig(deviceId, {
        temperatureEnabled: tempEnabled,
        temperatureOnC: tempOn,
        temperatureOffC: tempOff,
        humidityEnabled: humEnabled,
        humidityOnRH: humOn,
        humidityOffRH: humOff,
        activationMode,
      });
      setSuccessMessage('Automation configuration saved. Target configuration version incremented.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!device) {
    return (
      <div className="bg-white p-8 rounded-xl border border-[#FDC3D1] text-center space-y-3">
        <h2 className="text-base font-bold text-[#2E1826]">Device Not Found</h2>
        <button
          onClick={() => navigate('/admin/devices')}
          className="px-4 py-2 bg-[#FF5C89] text-white text-xs font-semibold rounded-lg"
        >
          Return to Devices
        </button>
      </div>
    );
  }

  const isSync = device.reportedConfigVersion === currentConfig.version;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/admin/devices/${deviceId}`)}
            className="p-1.5 rounded-lg border border-[#FDC3D1] bg-white hover:bg-[#FFF7F9] text-[#C72C5E]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">
              Climate Automation Settings
            </h1>
            <p className="text-xs font-mono text-[#826674]">
              {device.displayName} ({device.deviceId}) · Config Version: v{currentConfig.version}
            </p>
          </div>
        </div>

        {hasUnsavedChanges && (
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
            Unsaved Changes
          </span>
        )}
      </div>

      {/* Sync Status Alert Banner */}
      <div className="p-4 rounded-xl bg-white border border-[#FDC3D1] shadow-xs flex items-center justify-between text-xs">
        <div className="space-y-0.5">
          <span className="font-semibold text-[#2E1826]">Configuration Sync Status:</span>
          <p className="text-[#826674]">
            Target Revision: <strong className="font-mono">v{currentConfig.version}</strong> · Device Acknowledged:{' '}
            <strong className="font-mono">v{device.reportedConfigVersion}</strong>
          </p>
        </div>
        <span
          className={`font-semibold font-mono px-2.5 py-1 rounded-md text-xs ${
            isSync
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
        >
          {isSync ? 'Synchronized' : 'Pending Device Fetch'}
        </span>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-5">
        {/* Temperature Automation Card */}
        <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#FDC3D1]">
            <div className="flex items-center gap-2">
              <Thermometer className="h-5 w-5 text-[#C72C5E]" />
              <div>
                <h3 className="text-sm font-bold text-[#2E1826]">Temperature Hysteresis Control</h3>
                <p className="text-xs text-[#826674]">
                  Commands fan ON when temperature climbs, and turns fan OFF once cooled.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#C72C5E]">
              <input
                type="checkbox"
                checked={tempEnabled}
                onChange={(e) => setTempEnabled(e.target.checked)}
                className="h-4 w-4 accent-[#FF5C89]"
              />
              <span>Enabled</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1">
                Fan ON Threshold (°C)
              </label>
              <input
                type="number"
                step="0.5"
                disabled={!tempEnabled}
                value={isNaN(tempOn) ? '' : tempOn}
                onChange={(e) => setTempOn(parseFloat(e.target.value))}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-2 text-xs font-mono text-[#2E1826] focus:outline-none focus:border-[#FF5C89] disabled:opacity-50"
              />
              <p className="text-[11px] text-[#826674] mt-1">Fan activates at or above this temperature.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1">
                Fan OFF Threshold (°C)
              </label>
              <input
                type="number"
                step="0.5"
                disabled={!tempEnabled}
                value={isNaN(tempOff) ? '' : tempOff}
                onChange={(e) => setTempOff(parseFloat(e.target.value))}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-2 text-xs font-mono text-[#2E1826] focus:outline-none focus:border-[#FF5C89] disabled:opacity-50"
              />
              <p className="text-[11px] text-[#826674] mt-1">
                Must be lower than ON threshold (e.g. 38°C vs 40°C).
              </p>
            </div>
          </div>
        </div>

        {/* Humidity Automation Card */}
        <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#FDC3D1]">
            <div className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-[#FB8CAC]" />
              <div>
                <h3 className="text-sm font-bold text-[#2E1826]">Relative Humidity Hysteresis Control</h3>
                <p className="text-xs text-[#826674]">
                  Commands fan ON when moisture builds up in shuttle cabin.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#C72C5E]">
              <input
                type="checkbox"
                checked={humEnabled}
                onChange={(e) => setHumEnabled(e.target.checked)}
                className="h-4 w-4 accent-[#FF5C89]"
              />
              <span>Enabled</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1">
                Fan ON Threshold (% RH)
              </label>
              <input
                type="number"
                step="1"
                disabled={!humEnabled}
                value={isNaN(humOn) ? '' : humOn}
                onChange={(e) => setHumOn(parseFloat(e.target.value))}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-2 text-xs font-mono text-[#2E1826] focus:outline-none focus:border-[#FF5C89] disabled:opacity-50"
              />
              <p className="text-[11px] text-[#826674] mt-1">Fan activates at or above this humidity level.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1">
                Fan OFF Threshold (% RH)
              </label>
              <input
                type="number"
                step="1"
                disabled={!humEnabled}
                value={isNaN(humOff) ? '' : humOff}
                onChange={(e) => setHumOff(parseFloat(e.target.value))}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-2 text-xs font-mono text-[#2E1826] focus:outline-none focus:border-[#FF5C89] disabled:opacity-50"
              />
              <p className="text-[11px] text-[#826674] mt-1">
                Must be lower than ON threshold (e.g. 65% vs 75%).
              </p>
            </div>
          </div>
        </div>

        {/* Activation Mode Card */}
        <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-[#2E1826]">Activation Mode Combination</h3>
          <p className="text-xs text-[#826674]">
            Determine how temperature and humidity thresholds trigger cooling actuation together:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label
              className={`p-3.5 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                activationMode === 'ANY'
                  ? 'bg-[#FFF7F9] border-[#FF5C89] text-[#2E1826]'
                  : 'bg-white border-[#FDC3D1] text-[#826674]'
              }`}
            >
              <input
                type="radio"
                name="actMode"
                value="ANY"
                checked={activationMode === 'ANY'}
                onChange={() => setActivationMode('ANY')}
                className="mt-0.5 accent-[#FF5C89]"
              />
              <div>
                <span className="font-bold block text-[#C72C5E]">ANY (Temperature OR Humidity)</span>
                <span className="text-[11px] text-[#826674] mt-0.5 block">
                  Fan activates if either parameter exceeds its ON threshold. Most common for passenger shuttles.
                </span>
              </div>
            </label>

            <label
              className={`p-3.5 rounded-xl border cursor-pointer flex items-start gap-3 transition-colors ${
                activationMode === 'ALL'
                  ? 'bg-[#FFF7F9] border-[#FF5C89] text-[#2E1826]'
                  : 'bg-white border-[#FDC3D1] text-[#826674]'
              }`}
            >
              <input
                type="radio"
                name="actMode"
                value="ALL"
                checked={activationMode === 'ALL'}
                onChange={() => setActivationMode('ALL')}
                className="mt-0.5 accent-[#FF5C89]"
              />
              <div>
                <span className="font-bold block text-[#C72C5E]">ALL (Temperature AND Humidity)</span>
                <span className="text-[11px] text-[#826674] mt-0.5 block">
                  Fan activates only when both enabled parameters exceed their respective ON thresholds simultaneously.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Validation Errors */}
        {!validation.valid && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              Configuration Validation Errors:
            </div>
            <ul className="list-disc pl-5 space-y-0.5">
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(`/admin/devices/${deviceId}`)}
            className="px-4 py-2 text-xs font-semibold text-[#826674] hover:text-[#2E1826]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!validation.valid || saving || !hasUnsavedChanges}
            className="px-5 py-2.5 text-xs font-semibold bg-[#FF5C89] hover:bg-[#C72C5E] text-white rounded-xl shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save & Publish Configuration'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
