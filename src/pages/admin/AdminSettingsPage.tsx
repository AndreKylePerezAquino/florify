import React, { useState, useEffect } from 'react';
import {
  Settings,
  MapPin,
  Cpu,
  UserCheck,
  Shield,
  Save,
  CheckCircle2,
  Sliders,
  Radio,
  Thermometer,
  Droplets,
  Plus,
  ArrowRight,
  RefreshCw,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { isDeviceConnected } from '../../lib/deviceStatus';

interface AdminSettingsPageProps {
  navigate: (path: string) => void;
}

export const AdminSettingsPage: React.FC<AdminSettingsPageProps> = ({ navigate }) => {
  const { devices, allUsers, registerDevice, updateEsp32Control } = useApp();

  // Local state for admin configuration & map/automation settings (persisted to localStorage)
  const [fleetName, setFleetName] = useState<string>('Florify Fleet Intelligence');
  const [defaultZoom, setDefaultZoom] = useState<number>(13);
  const [mapTileLayer, setMapTileLayer] = useState<string>('Carto Voyager');
  const [gpsGracePeriodSec, setGpsGracePeriodSec] = useState<number>(30);
  const [autoCenter, setAutoCenter] = useState<boolean>(true);
  const [autoFitBounds, setAutoFitBounds] = useState<boolean>(true);
  const [showDriverMarkers, setShowDriverMarkers] = useState<boolean>(true);

  // Automation defaults
  const [defaultTempOn, setDefaultTempOn] = useState<number>(40.0);
  const [defaultTempOff, setDefaultTempOff] = useState<number>(38.0);
  const [defaultHumOn, setDefaultHumOn] = useState<number>(75.0);
  const [defaultHumOff, setDefaultHumOff] = useState<number>(65.0);
  const [defaultDhtInterval, setDefaultDhtInterval] = useState<number>(5);
  const [defaultActivationMode, setDefaultActivationMode] = useState<'ANY' | 'ALL'>('ANY');

  const [saving, setSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Registration modal state
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newLocationLabel, setNewLocationLabel] = useState('');
  const [newDriverUid, setNewDriverUid] = useState<string>('');
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const approvedDrivers = allUsers.filter((u) => u.role === 'DRIVER' && u.status === 'APPROVED');

  const handleGenerateId = () => {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setNewDeviceId(`ESP32-SHUTTLE-${randomSuffix}`);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceId.trim() || !newDisplayName.trim()) {
      setRegisterError('Device ID and Display Name are required.');
      return;
    }

    if (devices.some((d) => (d?.deviceId || '').toUpperCase() === newDeviceId.trim().toUpperCase())) {
      setRegisterError('A device with this ID already exists.');
      return;
    }

    try {
      setIsRegistering(true);
      setRegisterError(null);
      await registerDevice(
        newDeviceId,
        newDisplayName,
        newLocationLabel || undefined,
        newDriverUid || null
      );
      setIsRegisterModalOpen(false);
      setSuccessMessage(`Climate monitor ${newDeviceId.trim().toUpperCase()} registered successfully!`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setNewDeviceId('');
      setNewDisplayName('');
      setNewLocationLabel('');
      setNewDriverUid('');
      setRegisterError(null);
    } catch (err: any) {
      setRegisterError(err?.message || 'Failed to register device.');
    } finally {
      setIsRegistering(false);
    }
  };

  // Load saved settings from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('florify_admin_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.fleetName) setFleetName(parsed.fleetName);
        if (parsed.defaultZoom) setDefaultZoom(parsed.defaultZoom);
        if (parsed.mapTileLayer) setMapTileLayer(parsed.mapTileLayer);
        if (parsed.gpsGracePeriodSec) setGpsGracePeriodSec(parsed.gpsGracePeriodSec);
        if (parsed.autoCenter !== undefined) setAutoCenter(parsed.autoCenter);
        if (parsed.autoFitBounds !== undefined) setAutoFitBounds(parsed.autoFitBounds);
        if (parsed.showDriverMarkers !== undefined) setShowDriverMarkers(parsed.showDriverMarkers);
        if (parsed.defaultTempOn) setDefaultTempOn(parsed.defaultTempOn);
        if (parsed.defaultTempOff) setDefaultTempOff(parsed.defaultTempOff);
        if (parsed.defaultHumOn) setDefaultHumOn(parsed.defaultHumOn);
        if (parsed.defaultHumOff) setDefaultHumOff(parsed.defaultHumOff);
        if (parsed.defaultDhtInterval) setDefaultDhtInterval(parsed.defaultDhtInterval);
        if (parsed.defaultActivationMode) setDefaultActivationMode(parsed.defaultActivationMode);
      }
    } catch (e) {
      console.warn('Error loading admin settings:', e);
    }
  }, []);

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);

    const payload = {
      fleetName,
      defaultZoom,
      mapTileLayer,
      gpsGracePeriodSec,
      autoCenter,
      autoFitBounds,
      showDriverMarkers,
      defaultTempOn,
      defaultTempOff,
      defaultHumOn,
      defaultHumOff,
      defaultDhtInterval,
      defaultActivationMode,
      updatedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem('florify_admin_settings', JSON.stringify(payload));
      setTimeout(() => {
        setSaving(false);
        setSuccessMessage('Admin settings, map parameters, and automation thresholds saved successfully.');
        setTimeout(() => setSuccessMessage(null), 4000);
      }, 400);
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  };

  const pendingUsersCount = allUsers.filter((u) => u.status === 'PENDING').length;
  const onlineDevicesCount = devices.filter((d) => isDeviceConnected(d)).length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2E1826] flex items-center gap-2.5">
            <Settings className="h-6 w-6 text-[#C72C5E]" />
            Admin Control Center & Settings
          </h1>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF5C89] hover:bg-[#C72C5E] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving Settings...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save All Changes
            </>
          )}
        </button>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSaveAll} className="space-y-8">
        {/* SECTION 1: General Settings and Map Settings */}
        <section className="bg-white rounded-2xl border border-[#FDC3D1] p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b border-[#FDC3D1]">
            <div className="p-2 rounded-xl bg-[#FFF7F9] text-[#C72C5E] border border-[#FDC3D1]">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2E1826]">SECTION 1: General Settings and Map Settings</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">Fleet System Title</label>
              <input
                type="text"
                value={fleetName}
                onChange={(e) => setFleetName(e.target.value)}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-xl px-3 py-2 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">Map Tile Layer Provider</label>
              <select
                value={mapTileLayer}
                onChange={(e) => setMapTileLayer(e.target.value)}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-xl px-3 py-2 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
              >
                <option value="Carto Voyager">CartoDB Voyager (High Detail)</option>
                <option value="OpenStreetMap">OpenStreetMap Standard</option>
                <option value="Carto Dark">CartoDB Dark Mode</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">
                Default Map Zoom Level ({defaultZoom})
              </label>
              <input
                type="range"
                min="10"
                max="18"
                value={defaultZoom}
                onChange={(e) => setDefaultZoom(Number(e.target.value))}
                className="w-full accent-[#FF5C89] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-[#826674] mt-1 font-mono">
                <span>10 (City Overview)</span>
                <span>13 (Standard)</span>
                <span>18 (Street Close-up)</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">
                GPS Stale / Delayed Grace Period ({gpsGracePeriodSec} seconds)
              </label>
              <input
                type="number"
                min="10"
                max="120"
                value={gpsGracePeriodSec}
                onChange={(e) => setGpsGracePeriodSec(Number(e.target.value))}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-xl px-3 py-2 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-[#FDC3D1]/60 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[#2E1826]">
              <input
                type="checkbox"
                checked={autoCenter}
                onChange={(e) => setAutoCenter(e.target.checked)}
                className="h-4 w-4 accent-[#FF5C89] rounded"
              />
              <span>Auto-Center Map on Selection</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[#2E1826]">
              <input
                type="checkbox"
                checked={autoFitBounds}
                onChange={(e) => setAutoFitBounds(e.target.checked)}
                className="h-4 w-4 accent-[#FF5C89] rounded"
              />
              <span>Auto-Fit All Active Shuttles</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-[#2E1826]">
              <input
                type="checkbox"
                checked={showDriverMarkers}
                onChange={(e) => setShowDriverMarkers(e.target.checked)}
                className="h-4 w-4 accent-[#FF5C89] rounded"
              />
              <span>Display Live Driver Status Pills</span>
            </label>
          </div>
        </section>

        {/* SECTION 2: Registration Management */}
        <section className="bg-white rounded-2xl border border-[#FDC3D1] p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b border-[#FDC3D1]">
            <div className="p-2 rounded-xl bg-[#FFF7F9] text-[#C72C5E] border border-[#FDC3D1]">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2E1826]">SECTION 2: Registration Management</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#FFF7F9]/50 p-4 rounded-xl border border-[#FDC3D1] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#2E1826]">Climate Monitors</span>
                <Cpu className="h-4 w-4 text-[#C72C5E]" />
              </div>
              <p className="text-xs text-[#826674]">
                {devices.length} ESP32 units registered ({onlineDevicesCount} active).
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    handleGenerateId();
                    setIsRegisterModalOpen(true);
                  }}
                  className="w-full py-2 bg-[#FF5C89] hover:bg-[#C72C5E] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Register Climate Monitor
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/admin/devices')}
                  className="w-full py-1.5 bg-[#FFF7F9] hover:bg-[#FDC3D1]/40 border border-[#FDC3D1] text-[#2E1826] text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Manage Devices
                </button>
              </div>
            </div>

            <div className="bg-[#FFF7F9]/50 p-4 rounded-xl border border-[#FDC3D1] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#2E1826]">Drivers & Staff</span>
                <UserCheck className="h-4 w-4 text-[#C72C5E]" />
              </div>
              <p className="text-xs text-[#826674]">
                {allUsers.length} total staff accounts registered in database.
              </p>
              <button
                type="button"
                onClick={() => navigate('/admin/users')}
                className="w-full py-2 bg-[#FF5C89] hover:bg-[#C72C5E] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Shield className="h-3.5 w-3.5" />
                Manage Users & Approvals
              </button>
            </div>

            <div className={`p-4 rounded-xl border space-y-3 ${pendingUsersCount > 0 ? 'bg-amber-50/55 border-amber-300' : 'bg-[#FFF7F9]/50 border-[#FDC3D1]'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#2E1826]">Pending Access Requests</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${pendingUsersCount > 0 ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {pendingUsersCount} pending
                </span>
              </div>
              <p className="text-xs text-[#826674]">
                Approve or reject new driver registrations requiring system access.
              </p>
              <button
                type="button"
                onClick={() => navigate('/admin/users')}
                className="w-full py-2 bg-[#2E1826] hover:bg-black text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Review Pending Requests</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: Automation Settings */}
        <section className="bg-white rounded-2xl border border-[#FDC3D1] p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b border-[#FDC3D1]">
            <div className="p-2 rounded-xl bg-[#FFF7F9] text-[#C72C5E] border border-[#FDC3D1]">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2E1826]">SECTION 3: Automation Settings</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Temperature Hysteresis */}
            <div className="bg-[#FFF7F9]/30 p-4 rounded-xl border border-[#FDC3D1] space-y-4">
              <div className="flex items-center gap-2 text-[#2E1826]">
                <Thermometer className="h-4 w-4 text-[#C72C5E]" />
                <h3 className="text-xs font-bold">Default Temperature Hysteresis (°C)</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#826674] mb-1">Fan ON Threshold</label>
                  <input
                    type="number"
                    step="0.5"
                    value={defaultTempOn}
                    onChange={(e) => setDefaultTempOn(Number(e.target.value))}
                    className="w-full bg-white border border-[#FDC3D1] rounded-xl px-3 py-1.5 text-xs text-[#2E1826] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#826674] mb-1">Fan OFF Threshold</label>
                  <input
                    type="number"
                    step="0.5"
                    value={defaultTempOff}
                    onChange={(e) => setDefaultTempOff(Number(e.target.value))}
                    className="w-full bg-white border border-[#FDC3D1] rounded-xl px-3 py-1.5 text-xs text-[#2E1826] font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Humidity Hysteresis */}
            <div className="bg-[#FFF7F9]/30 p-4 rounded-xl border border-[#FDC3D1] space-y-4">
              <div className="flex items-center gap-2 text-[#2E1826]">
                <Droplets className="h-4 w-4 text-[#C72C5E]" />
                <h3 className="text-xs font-bold">Default Humidity Hysteresis (% RH)</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#826674] mb-1">Mist ON Threshold</label>
                  <input
                    type="number"
                    step="0.5"
                    value={defaultHumOn}
                    onChange={(e) => setDefaultHumOn(Number(e.target.value))}
                    className="w-full bg-white border border-[#FDC3D1] rounded-xl px-3 py-1.5 text-xs text-[#2E1826] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#826674] mb-1">Mist OFF Threshold</label>
                  <input
                    type="number"
                    step="0.5"
                    value={defaultHumOff}
                    onChange={(e) => setDefaultHumOff(Number(e.target.value))}
                    className="w-full bg-white border border-[#FDC3D1] rounded-xl px-3 py-1.5 text-xs text-[#2E1826] font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">
                DHT Sensor Read Interval ({defaultDhtInterval} seconds)
              </label>
              <input
                type="number"
                min="2"
                max="60"
                value={defaultDhtInterval}
                onChange={(e) => setDefaultDhtInterval(Number(e.target.value))}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-xl px-3 py-2 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89] font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2E1826] mb-1.5">Sensor Activation Logic Mode</label>
              <select
                value={defaultActivationMode}
                onChange={(e) => setDefaultActivationMode(e.target.value as 'ANY' | 'ALL')}
                className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-xl px-3 py-2 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
              >
                <option value="ANY">ANY (Triggers if Temp OR Humidity exceeds threshold)</option>
                <option value="ALL">ALL (Triggers only if BOTH Temp AND Humidity exceed threshold)</option>
              </select>
            </div>
          </div>
        </section>

        {/* SECTION 4: ESP32 Relay Manual Control */}
        <section className="bg-white rounded-2xl border border-[#FDC3D1] p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b border-[#FDC3D1]">
            <div className="p-2 rounded-xl bg-[#FFF7F9] text-[#C72C5E] border border-[#FDC3D1]">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#2E1826]">SECTION 4: ESP32 Relay Manual Control</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => updateEsp32Control('ON', 'OFF')}
              className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl"
            >
              Fan ON
            </button>
            <button
              type="button"
              onClick={() => updateEsp32Control('OFF', 'OFF')}
              className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl"
            >
              Fan OFF
            </button>
          </div>
        </section>

        {/* Bottom Save Action */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#FF5C89] hover:bg-[#C72C5E] text-white text-xs font-semibold rounded-xl shadow-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save Admin Settings & Automation Rules
          </button>
        </div>
      </form>

      {/* Register Climate Monitor Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#FDC3D1] shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#FDC3D1]">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-[#C72C5E]" />
                <h3 className="text-base font-bold text-[#2E1826]">Register Climate Monitor</h3>
              </div>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="p-1 rounded-lg text-[#826674] hover:bg-[#FFF7F9] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {registerError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                {registerError}
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2E1826] mb-1">Device ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newDeviceId}
                    onChange={(e) => setNewDeviceId(e.target.value)}
                    placeholder="e.g. ESP32-SHUTTLE-101"
                    className="flex-1 bg-[#FFF7F9]/50 border border-[#FDC3D1] rounded-xl px-3 py-2 text-xs font-mono text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateId}
                    className="px-3 py-2 bg-[#FFF7F9] hover:bg-[#FDC3D1]/40 border border-[#FDC3D1] text-[#C72C5E] text-xs font-semibold rounded-xl cursor-pointer whitespace-nowrap"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E1826] mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="e.g. Shuttle Cabin Alpha"
                  className="w-full bg-[#FFF7F9]/50 border border-[#FDC3D1] rounded-xl px-3 py-2 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E1826] mb-1">Location Label (Optional)</label>
                <input
                  type="text"
                  value={newLocationLabel}
                  onChange={(e) => setNewLocationLabel(e.target.value)}
                  placeholder="e.g. Central Terminal / Route 1"
                  className="w-full bg-[#FFF7F9]/50 border border-[#FDC3D1] rounded-xl px-3 py-2 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E1826] mb-1">Assign Driver (Optional)</label>
                <select
                  value={newDriverUid}
                  onChange={(e) => setNewDriverUid(e.target.value)}
                  className="w-full bg-[#FFF7F9]/50 border border-[#FDC3D1] rounded-xl px-3 py-2 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
                >
                  <option value="">Unassigned (Standby)</option>
                  {approvedDrivers.map((driver) => (
                    <option key={driver.uid} value={driver.uid}>
                      {driver.displayName} ({driver.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#FDC3D1]">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 bg-[#FFF7F9] hover:bg-[#FDC3D1]/40 border border-[#FDC3D1] text-[#2E1826] text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRegistering}
                  className="px-5 py-2 bg-[#FF5C89] hover:bg-[#C72C5E] text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isRegistering ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    'Register Monitor'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
