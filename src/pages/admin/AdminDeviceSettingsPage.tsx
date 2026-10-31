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
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { validateDeviceConfig } from '../../lib/fanControl';
import { ActivationMode, FlowerPresetType, FLOWER_PRESETS } from '../../types';

interface AdminDeviceSettingsPageProps {
  deviceId: string;
  navigate: (path: string) => void;
}

export const AdminDeviceSettingsPage: React.FC<AdminDeviceSettingsPageProps> = ({ deviceId, navigate }) => {
  const { devices, deviceConfigs, updateConfig, customPresets, addCustomPreset, removeCustomPreset } = useApp();

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
  const [flowerPreset, setFlowerPreset] = useState<FlowerPresetType>(
    (currentConfig.flowerPreset as FlowerPresetType) || 'Custom'
  );
  const [tempEnabled, setTempEnabled] = useState(currentConfig.temperatureEnabled);
  const [tempOn, setTempOn] = useState<number>(currentConfig.temperatureOnC);
  const [tempOff, setTempOff] = useState<number>(currentConfig.temperatureOffC);
  const [humEnabled, setHumEnabled] = useState(currentConfig.humidityEnabled);
  const [humOn, setHumOn] = useState<number>(currentConfig.humidityOnRH);
  const [humOff, setHumOff] = useState<number>(currentConfig.humidityOffRH);
  const [dhtReadInterval, setDhtReadInterval] = useState<number>(currentConfig.dhtReadIntervalSeconds || 5);
  const [activationMode, setActivationMode] = useState<ActivationMode>(currentConfig.activationMode);

  // Custom preset creation modal/panel state
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [presetTempOn, setPresetTempOn] = useState<number>(tempOn);
  const [presetTempOff, setPresetTempOff] = useState<number>(tempOff);
  const [presetHumOn, setPresetHumOn] = useState<number>(humOn);
  const [presetHumOff, setPresetHumOff] = useState<number>(humOff);
  const [presetAddError, setPresetAddError] = useState<string | null>(null);

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
      setDhtReadInterval(c.dhtReadIntervalSeconds || 5);
      setActivationMode(c.activationMode);
      setFlowerPreset((c.flowerPreset as FlowerPresetType) || 'Custom');
    }
  }, [deviceId, deviceConfigs]);

  const handlePresetSelect = (preset: FlowerPresetType) => {
    setFlowerPreset(preset);
    if (preset === 'Custom') return;

    if (FLOWER_PRESETS[preset as keyof typeof FLOWER_PRESETS]) {
      const p = FLOWER_PRESETS[preset as keyof typeof FLOWER_PRESETS];
      setTempOn(p.tempOn);
      setTempOff(p.tempOff);
      setHumOn(p.humOn);
      setHumOff(p.humOff);
    } else if (customPresets[preset]) {
      const p = customPresets[preset];
      setTempOn(p.tempOn);
      setTempOff(p.tempOff);
      setHumOn(p.humOn);
      setHumOff(p.humOff);
    }
  };

  const handleOpenAddPreset = () => {
    setNewPresetName('');
    setPresetTempOn(tempOn);
    setPresetTempOff(tempOff);
    setPresetHumOn(humOn);
    setPresetHumOff(humOff);
    setPresetAddError(null);
    setIsAddingPreset(true);
  };

  const handleSaveNewPreset = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPresetName.trim();
    if (!name) {
      setPresetAddError('Please enter a preset name.');
      return;
    }
    if (name.toLowerCase() === 'custom' || FLOWER_PRESETS[name as keyof typeof FLOWER_PRESETS]) {
      setPresetAddError('A built-in preset already uses this name. Please choose a unique name.');
      return;
    }
    if (isNaN(presetTempOn) || isNaN(presetTempOff) || isNaN(presetHumOn) || isNaN(presetHumOff)) {
      setPresetAddError('Please ensure all 4 thresholds have valid numerical values before saving.');
      return;
    }
    if (presetTempOff >= presetTempOn) {
      setPresetAddError(`Fan OFF threshold (${presetTempOff}°C) must be lower than Fan ON threshold (${presetTempOn}°C).`);
      return;
    }
    if (presetHumOn === presetHumOff) {
      setPresetAddError('Humidifier ON and OFF thresholds must be distinct.');
      return;
    }
    if (presetHumOn < 0 || presetHumOn > 100 || presetHumOff < 0 || presetHumOff > 100) {
      setPresetAddError('Humidifier thresholds must be between 0% and 100% RH.');
      return;
    }

    addCustomPreset(name, {
      tempOn: presetTempOn,
      tempOff: presetTempOff,
      humOn: presetHumOn,
      humOff: presetHumOff,
    });
    setTempOn(presetTempOn);
    setTempOff(presetTempOff);
    setHumOn(presetHumOn);
    setHumOff(presetHumOff);
    setFlowerPreset(name);
    setNewPresetName('');
    setPresetAddError(null);
    setIsAddingPreset(false);
  };

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
    flowerPreset !== (currentConfig.flowerPreset || 'Custom') ||
    tempEnabled !== currentConfig.temperatureEnabled ||
    tempOn !== currentConfig.temperatureOnC ||
    tempOff !== currentConfig.temperatureOffC ||
    humEnabled !== currentConfig.humidityEnabled ||
    humOn !== currentConfig.humidityOnRH ||
    humOff !== currentConfig.humidityOffRH ||
    dhtReadInterval !== (currentConfig.dhtReadIntervalSeconds || 5) ||
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
        dhtReadIntervalSeconds: dhtReadInterval,
        activationMode,
        flowerPreset,
      });
      setSuccessMessage('Automation configuration saved and synced to web. Target configuration version incremented.');
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
        {/* Flower Climate Preset Card */}
        <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#FDC3D1]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#C72C5E]" />
              <div>
                <h3 className="text-sm font-bold text-[#2E1826]">Flower Climate Preset</h3>
                <p className="text-xs text-[#826674]">
                  Select a botanical profile to automatically configure cooling fan and humidifier thresholds.
                </p>
              </div>
            </div>
            {flowerPreset !== 'Custom' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FFF7F9] text-[#C72C5E] border border-[#FDC3D1] self-start sm:self-auto">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FF5C89]" />
                {flowerPreset} Active
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-[#2E1826]">
                Select Preset
              </label>
              <div className="flex items-center gap-2">
                {customPresets[flowerPreset] && (
                  <button
                    type="button"
                    onClick={() => {
                      removeCustomPreset(flowerPreset);
                      setFlowerPreset('Custom');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-md border border-rose-200 flex items-center gap-1 cursor-pointer transition-colors"
                    title="Delete this custom preset"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete Preset
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenAddPreset}
                  className="text-xs font-semibold text-[#C72C5E] hover:text-[#FF5C89] hover:bg-[#FFF7F9] px-2.5 py-1 rounded-md border border-[#FDC3D1] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Name & Add Preset</span>
                </button>
              </div>
            </div>

            <select
              value={flowerPreset}
              onChange={(e) => handlePresetSelect(e.target.value as FlowerPresetType)}
              className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-2 text-xs font-medium text-[#2E1826] focus:outline-none focus:border-[#FF5C89] cursor-pointer"
            >
              <optgroup label="Standard Botanical Presets">
                <option value="Phalaenopsis Orchid">Phalaenopsis Orchid (Fan: 28°C / 26°C · Humidifier: 45% / 60% RH)</option>
                <option value="Vanda Orchid">Vanda Orchid (Fan: 30°C / 28°C · Humidifier: 60% / 75% RH)</option>
                <option value="Anthurium">Anthurium (Fan: 28°C / 26°C · Humidifier: 60% / 75% RH)</option>
                <option value="Rose">Rose (Fan: 25°C / 23°C · Humidifier: 40% / 55% RH)</option>
                <option value="General Flower">General Flower (Fan: 28°C / 26°C · Humidifier: 45% / 60% RH)</option>
              </optgroup>
              {Object.keys(customPresets).length > 0 && (
                <optgroup label="Custom Saved Presets">
                  {Object.entries(customPresets).map(([name, p]) => (
                    <option key={name} value={name}>
                      {name} (Fan: {p.tempOn}°C / {p.tempOff}°C · Humidifier: {p.humOn}% / {p.humOff}% RH)
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Manual">
                <option value="Custom">Custom (Manual threshold configuration)</option>
              </optgroup>
            </select>
          </div>

          {/* Inline Name & Add Preset Panel */}
          {isAddingPreset && (
            <div className="p-4 rounded-xl border border-[#FDC3D1] bg-[#FFF7F9] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#2E1826] flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#C72C5E]" />
                  Name & Save Custom Preset
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingPreset(false);
                    setPresetAddError(null);
                  }}
                  className="text-[#826674] hover:text-[#2E1826] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {presetAddError && (
                <div className="p-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                  {presetAddError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-[#2E1826] mb-1">
                  Preset Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dutch Hydrangea, Carnation, Tulip"
                  value={newPresetName}
                  onChange={(e) => {
                    setNewPresetName(e.target.value);
                    setPresetAddError(null);
                  }}
                  className="w-full bg-white border border-[#FDC3D1] rounded-lg px-3 py-1.5 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white p-3 rounded-lg border border-[#FDC3D1]/70">
                <div>
                  <label className="text-[10px] font-semibold text-[#826674] block mb-1">Fan ON (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={isNaN(presetTempOn) ? '' : presetTempOn}
                    onChange={(e) => setPresetTempOn(parseFloat(e.target.value))}
                    className="w-full bg-[#FFF7F9]/50 border border-[#FDC3D1] rounded-md px-2 py-1 text-xs font-mono font-bold text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#826674] block mb-1">Fan OFF (°C)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={isNaN(presetTempOff) ? '' : presetTempOff}
                    onChange={(e) => setPresetTempOff(parseFloat(e.target.value))}
                    className="w-full bg-[#FFF7F9]/50 border border-[#FDC3D1] rounded-md px-2 py-1 text-xs font-mono font-bold text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#826674] block mb-1">Humidifier ON (% RH)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={isNaN(presetHumOn) ? '' : presetHumOn}
                    onChange={(e) => setPresetHumOn(parseFloat(e.target.value))}
                    className="w-full bg-[#FFF7F9]/50 border border-[#FDC3D1] rounded-md px-2 py-1 text-xs font-mono font-bold text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#826674] block mb-1">Humidifier OFF (% RH)</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={isNaN(presetHumOff) ? '' : presetHumOff}
                    onChange={(e) => setPresetHumOff(parseFloat(e.target.value))}
                    className="w-full bg-[#FFF7F9]/50 border border-[#FDC3D1] rounded-md px-2 py-1 text-xs font-mono font-bold text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
                  />
                </div>
              </div>
              <p className="text-[10px] text-[#826674]">
                You can fine-tune these Fan and Humidifier thresholds directly before saving this preset.
              </p>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingPreset(false);
                    setPresetAddError(null);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-[#826674] hover:bg-white rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewPreset}
                  className="px-3.5 py-1.5 bg-[#FF5C89] hover:bg-[#C72C5E] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Save Preset
                </button>
              </div>
            </div>
          )}
        </div>

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
                onChange={(e) => {
                  setTempOn(parseFloat(e.target.value));
                  setFlowerPreset('Custom');
                }}
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
                onChange={(e) => {
                  setTempOff(parseFloat(e.target.value));
                  setFlowerPreset('Custom');
                }}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-2 text-xs font-mono text-[#2E1826] focus:outline-none focus:border-[#FF5C89] disabled:opacity-50"
              />
              <p className="text-[11px] text-[#826674] mt-1">
                Must be lower than ON threshold (e.g. 26°C vs 28°C).
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
                  Commands humidifier when moisture regulation is needed in shuttle cabin.
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
                Humidifier ON Threshold (% RH)
              </label>
              <input
                type="number"
                step="1"
                disabled={!humEnabled}
                value={isNaN(humOn) ? '' : humOn}
                onChange={(e) => {
                  setHumOn(parseFloat(e.target.value));
                  setFlowerPreset('Custom');
                }}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-2 text-xs font-mono text-[#2E1826] focus:outline-none focus:border-[#FF5C89] disabled:opacity-50"
              />
              <p className="text-[11px] text-[#826674] mt-1">Humidifier activates at or below this humidity level.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1">
                Humidifier OFF Threshold (% RH)
              </label>
              <input
                type="number"
                step="1"
                disabled={!humEnabled}
                value={isNaN(humOff) ? '' : humOff}
                onChange={(e) => {
                  setHumOff(parseFloat(e.target.value));
                  setFlowerPreset('Custom');
                }}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-2 text-xs font-mono text-[#2E1826] focus:outline-none focus:border-[#FF5C89] disabled:opacity-50"
              />
              <p className="text-[11px] text-[#826674] mt-1">
                Humidifier deactivates once target humidity is reached.
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

        {/* DHT11 Read Interval Card */}
        <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-3">
          <h3 className="text-sm font-bold text-[#2E1826] flex items-center gap-2">
            <Settings className="h-4 w-4 text-[#C72C5E]" />
            DHT11 Sensor Read Interval (Telemetry Polling)
          </h3>
          <p className="text-xs text-[#826674]">
            Configure how frequently the ESP32 samples and reports DHT11 temperature and humidity telemetry to the web backend:
          </p>
          <div className="max-w-xs">
            <select
              value={dhtReadInterval}
              onChange={(e) => setDhtReadInterval(parseInt(e.target.value, 10))}
              className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-2 text-xs font-mono text-[#2E1826]"
            >
              <option value={2}>2 Seconds (High Frequency)</option>
              <option value={5}>5 Seconds (Recommended Standard)</option>
              <option value={10}>10 Seconds (Balanced)</option>
              <option value={30}>30 Seconds (Power Saving)</option>
              <option value={60}>60 Seconds (Low Frequency)</option>
            </select>
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
