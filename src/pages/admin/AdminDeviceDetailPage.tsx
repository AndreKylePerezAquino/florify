import React, { useState, useEffect } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  Thermometer,
  Droplets,
  Fan,
  CloudRain,
  Settings,
  ArrowLeft,
  User as UserIcon,
  Clock,
  ShieldAlert,
  Power,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Radio,
  Cpu,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../../components/common/StatusBadge';
import { HistoricalChart } from '../../components/common/HistoricalChart';
import { SensorGauge } from '../../components/common/SensorGauge';
import { FirmwareGuideModal } from '../../components/modals/FirmwareGuideModal';
import { DeviceReading, DeviceConfig } from '../../types';

interface AdminDeviceDetailPageProps {
  deviceId: string;
  navigate: (path: string) => void;
}

export const AdminDeviceDetailPage: React.FC<AdminDeviceDetailPageProps> = ({ deviceId, navigate }) => {
  const {
    devices,
    allUsers,
    setFanOverride,
    returnToAuto,
    assignDevice,
    rotateDeviceCredential,
  } = useApp();

  const device = devices.find((d) => d.deviceId === deviceId);
  const assignedDriver = allUsers.find((u) => u.uid === device?.assignedDriverUid);

  const [liveConfig, setLiveConfig] = useState<DeviceConfig | undefined>(undefined);
  const [liveReadings, setLiveReadings] = useState<DeviceReading[]>([]);

  // Listen to live device configuration
  useEffect(() => {
    if (!deviceId) return;
    const configDocRef = doc(db, 'devices', deviceId, 'config', 'current');
    const unsub = onSnapshot(configDocRef, (snap) => {
      if (snap.exists()) {
        setLiveConfig(snap.data() as DeviceConfig);
      }
    });
    return () => unsub();
  }, [deviceId]);

  // Listen to live readings subcollection
  useEffect(() => {
    if (!deviceId) return;
    const readingsQuery = query(
      collection(db, 'devices', deviceId, 'readings'),
      orderBy('receivedAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(readingsQuery, (snap) => {
      const list: DeviceReading[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as Omit<DeviceReading, 'id'>) }));
      setLiveReadings(list.reverse());
    });
    return () => unsub();
  }, [deviceId]);

  // Override modal state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [firmwareModalOpen, setFirmwareModalOpen] = useState(false);
  const [overrideMode, setOverrideMode] = useState<'FORCE_ON' | 'FORCE_OFF'>('FORCE_ON');
  const [overrideDuration, setOverrideDuration] = useState<number>(30); // 30 mins
  const [overrideReason, setOverrideReason] = useState<string>('Pre-cooling shuttle before boarding');
  const [overrideConfirmChecked, setOverrideConfirmChecked] = useState(false);

  if (!device) {
    return (
      <div className="bg-white p-8 rounded-xl border border-[#FDC3D1] text-center space-y-3">
        <h2 className="text-base font-bold text-[#2E1826]">Device Not Found</h2>
        <p className="text-xs text-[#826674]">No registered ESP32 monitor with ID {deviceId}.</p>
        <button
          onClick={() => navigate('/admin/devices')}
          className="px-4 py-2 bg-[#FF5C89] text-white text-xs font-semibold rounded-lg"
        >
          Return to Devices
        </button>
      </div>
    );
  }

  const handleApplyOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    await setFanOverride(device.deviceId, overrideMode, overrideDuration, overrideReason);
    setOverrideModalOpen(false);
    setOverrideConfirmChecked(false);
  };

  const isSync = device.reportedConfigVersion === device.desiredConfigVersion;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/devices')}
            className="p-1.5 rounded-lg border border-[#FDC3D1] bg-white hover:bg-[#FFF7F9] text-[#C72C5E] cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">
                {device.displayName}
              </h1>
              <StatusBadge status={device.status} type="device" />
            </div>
            <p className="text-xs font-mono text-[#826674]">
              ID: {device.deviceId} {device.locationLabel && `· ${device.locationLabel}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFirmwareModalOpen(true)}
            className="px-3 py-1.5 bg-[#FFF7F9] border border-[#FDC3D1] hover:bg-[#FFDBDB] text-[#C72C5E] text-xs font-semibold rounded-xl shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
          >
            <Cpu className="h-4 w-4" />
            ESP32 Code & Wiring
          </button>
          <button
            onClick={() => navigate(`/admin/devices/${device.deviceId}/settings`)}
            className="px-3 py-1.5 bg-white border border-[#FDC3D1] hover:bg-[#FFF7F9] text-[#C72C5E] text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="h-4 w-4" />
            Automation Settings
          </button>
        </div>
      </div>

      {/* Main Stats Cards */}
      {/* Main Stats Cards: Temp, Humidity, Relay 1 Fan, Relay 2 Mist, Assigned Driver */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Temperature */}
        <div className={`bg-white p-4 rounded-xl border shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
          device.latestTemperatureC !== undefined && device.latestTemperatureC >= (liveConfig?.temperatureOnC || 40.0)
            ? 'border-rose-300 animate-warning-glow'
            : 'border-[#FDC3D1]'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1 font-medium">
                <Thermometer className="h-3.5 w-3.5 text-[#C72C5E]" />
                Cabin Temperature
              </span>
              <span className="text-[10px] uppercase font-mono">{device.sensorType || 'DHT11'}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold font-mono tabular-nums text-[#2E1826] transition-all">
                {device.latestTemperatureC !== undefined ? device.latestTemperatureC.toFixed(1) : '--'}
              </span>
              <span className="text-xs text-[#826674] font-medium">°C</span>
            </div>
          </div>
          <SensorGauge
            type="temperature"
            value={device.latestTemperatureC}
            threshold={liveConfig?.temperatureOnC || 40.0}
            unit="°C"
            min={15}
            max={50}
            isWarning={device.latestTemperatureC !== undefined && device.latestTemperatureC >= (liveConfig?.temperatureOnC || 40.0)}
          />
        </div>

        {/* Humidity */}
        <div className={`bg-white p-4 rounded-xl border shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
          device.latestHumidityRH !== undefined && device.latestHumidityRH >= (liveConfig?.humidityOnRH || 75.0)
            ? 'border-amber-300 animate-warning-glow'
            : 'border-[#FDC3D1]'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1 font-medium">
                <Droplets className="h-3.5 w-3.5 text-[#FB8CAC]" />
                Relative Humidity
              </span>
              <span className="text-[10px] uppercase font-mono">{device.sensorType || 'DHT11'}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold font-mono tabular-nums text-[#2E1826] transition-all">
                {device.latestHumidityRH !== undefined ? device.latestHumidityRH.toFixed(1) : '--'}
              </span>
              <span className="text-xs text-[#826674] font-medium">% RH</span>
            </div>
          </div>
          <SensorGauge
            type="humidity"
            value={device.latestHumidityRH}
            threshold={liveConfig?.humidityOnRH || 75.0}
            unit="%"
            min={20}
            max={100}
            isWarning={device.latestHumidityRH !== undefined && device.latestHumidityRH >= (liveConfig?.humidityOnRH || 75.0)}
          />
        </div>

        {/* Relay 1: Fan Relay State */}
        <div className={`bg-white p-4 rounded-xl border shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
          device.latestFanState === 'ON' ? 'border-emerald-300 bg-emerald-50/20' : 'border-[#FDC3D1]'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1.5 font-medium">
                <div className="relative flex items-center justify-center">
                  <Fan className={`h-4 w-4 ${device.latestFanState === 'ON' ? 'text-emerald-600 animate-fan-spin' : 'text-[#826674]'}`} />
                  {device.latestFanState === 'ON' && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                  )}
                </div>
                Relay 1: Fan (Ch 1)
              </span>
              <span className="text-[10px] font-mono text-emerald-700 font-semibold">GPIO 18</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold font-mono transition-colors ${
                  device.latestFanState === 'ON' ? 'text-emerald-700' : 'text-slate-600'
                }`}
              >
                {device.latestFanState}
              </span>
              <span className="text-xs text-[#826674]">Mode: {device.reportedMode}</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#FDC3D1]/60 flex items-center justify-between text-[11px] text-[#826674]">
            <span>{device.reportedMode === 'AUTO' ? 'Sensor Hysteresis' : 'Admin Override'}</span>
            {device.latestFanState === 'ON' && (
              <span className="text-emerald-700 font-medium bg-emerald-100/70 px-1.5 py-0.5 rounded animate-pulse">
                Airflow Active
              </span>
            )}
          </div>
        </div>

        {/* Relay 2: Mist / Humidifier Solenoid */}
        <div className={`bg-white p-4 rounded-xl border shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
          device.latestMistState === 'ON' ? 'border-sky-300 bg-sky-50/20' : 'border-[#FDC3D1]'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1.5 font-medium">
                <div className="relative flex items-center justify-center">
                  <CloudRain className={`h-4 w-4 ${device.latestMistState === 'ON' ? 'text-sky-600 animate-pulse' : 'text-[#826674]'}`} />
                  {device.latestMistState === 'ON' && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500" />
                    </span>
                  )}
                </div>
                Relay 2: Mist (Ch 2)
              </span>
              <span className="text-[10px] font-mono text-sky-700 font-semibold">GPIO 19</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold font-mono transition-colors ${
                  device.latestMistState === 'ON' ? 'text-sky-700' : 'text-slate-600'
                }`}
              >
                {device.latestMistState || 'OFF'}
              </span>
              <span className="text-xs text-[#826674]">Optocoupled</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-[#FDC3D1]/60 flex items-center justify-between text-[11px] text-[#826674]">
            <span>Humidity Balancing</span>
            {device.latestMistState === 'ON' && (
              <span className="text-sky-700 font-medium bg-sky-100/70 px-1.5 py-0.5 rounded animate-pulse">
                Mist Active
              </span>
            )}
          </div>
        </div>

        {/* Assigned Driver */}
        <div className="bg-white p-4 rounded-xl border border-[#FDC3D1] shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1 font-medium">
                <UserIcon className="h-3.5 w-3.5 text-[#C72C5E]" />
                Assigned Driver
              </span>
              <span className="text-[10px] text-[#826674]">1:1 Bound</span>
            </div>
            <div className="mt-2 truncate">
              {assignedDriver ? (
                <span className="text-sm font-bold text-[#2E1826] block truncate">
                  {assignedDriver.displayName}
                </span>
              ) : (
                <span className="text-xs italic text-slate-400 block">No Driver Assigned</span>
              )}
            </div>
          </div>
          <p className="mt-2 pt-2 border-t border-[#FDC3D1]/60 text-[11px] text-[#826674] truncate">
            {assignedDriver ? assignedDriver.email : 'Read-only access upon assignment'}
          </p>
        </div>
      </div>

      {/* Manual Fan Control Bar */}
      <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#2E1826] flex items-center gap-2">
              <Power className="h-4 w-4 text-[#C72C5E]" />
              Manual Fan Override Controls
            </h3>
            <p className="text-xs text-[#826674]">
              Current operating mode:{' '}
              <strong className="text-[#C72C5E] uppercase">{liveConfig?.fanMode || 'AUTO'}</strong>
              {liveConfig?.overrideExpiresAt && (
                <span className="ml-2 text-amber-700">
                  (Expires in {Math.max(0, Math.round((new Date(liveConfig.overrideExpiresAt).getTime() - Date.now()) / 60000))} mins)
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {liveConfig?.fanMode !== 'AUTO' ? (
              <button
                onClick={() => returnToAuto(device.deviceId)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Return to AUTO (Sensor Control)
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setOverrideMode('FORCE_ON');
                    setOverrideModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-[#FFF7F9] hover:bg-[#FFDBDB] text-[#C72C5E] border border-[#FDC3D1] text-xs font-semibold rounded-lg"
                >
                  Force Fan ON
                </button>
                <button
                  onClick={() => {
                    setOverrideMode('FORCE_OFF');
                    setOverrideModalOpen(true);
                  }}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg"
                >
                  Force Fan OFF
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Historical Telemetry Chart */}
      <HistoricalChart readings={liveReadings} config={liveConfig} />

      {/* Hardware Diagnostics & Metadata Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Device Sync & Hardware Telemetry */}
        <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-3 text-xs">
          <h4 className="font-bold text-[#2E1826] flex items-center gap-1.5">
            <Radio className="h-4 w-4 text-[#C72C5E]" />
            Hardware & Firmware Diagnostics
          </h4>
          <div className="divide-y divide-[#FDC3D1]">
            <div className="py-2 flex items-center justify-between">
              <span className="text-[#826674]">Firmware Version:</span>
              <span className="font-mono font-medium text-[#2E1826]">{device.firmwareVersion}</span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-[#826674]">Sensor Type:</span>
              <span className="font-mono text-[#2E1826]">{device.sensorType || 'DHT11'} (Temperature & Humidity)</span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-[#826674]">Config Synchronization:</span>
              <span className={`font-mono font-semibold ${isSync ? 'text-emerald-700' : 'text-amber-700'}`}>
                Reported v{device.reportedConfigVersion} / Desired v{device.desiredConfigVersion}{' '}
                {isSync ? '(Synchronized)' : '(Pending Device Acknowledgment)'}
              </span>
            </div>
            <div className="py-2 flex items-center justify-between">
              <span className="text-[#826674]">Last Heartbeat:</span>
              <span className="font-mono text-[#2E1826]">
                {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Never'}
              </span>
            </div>
          </div>
        </div>

        {/* Safety & Driver Access Rules */}
        <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-3 text-xs">
          <h4 className="font-bold text-[#2E1826] flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4 text-[#C72C5E]" />
            Local ESP32 Safety Rules
          </h4>
          <ul className="space-y-2 text-[#826674]">
            <li className="flex items-start gap-2">
              <span className="text-[#C72C5E] font-bold">•</span>
              <span>
                <strong>Independent Local Execution:</strong> The ESP32 evaluates hysteresis automation locally. Internet disconnection will not stop fan operation.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#C72C5E] font-bold">•</span>
              <span>
                <strong>Local Override Expiration:</strong> Manual overrides expire via on-chip timer even without network connectivity.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#C72C5E] font-bold">•</span>
              <span>
                <strong>Hardware Cutoff:</strong> If temperature reaches 60°C, emergency thermal protection overrides FORCE_OFF.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Override Duration Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#FDC3D1] shadow-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#2E1826]">
              Configure Fan Override: {overrideMode}
            </h3>
            <p className="text-xs text-[#826674]">
              Manual overrides require an expiration window. The ESP32 will automatically return to local AUTO sensor automation once expired.
            </p>

            <form onSubmit={handleApplyOverride} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#2E1826] mb-1">
                  Duration (Minutes until AUTO return)
                </label>
                <select
                  value={overrideDuration}
                  onChange={(e) => setOverrideDuration(parseInt(e.target.value, 10))}
                  className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-1.5 text-xs text-[#2E1826]"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                  <option value={120}>2 Hours</option>
                  <option value={240}>4 Hours</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#2E1826] mb-1">
                  Reason for Override (Audit Log)
                </label>
                <input
                  type="text"
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Pre-cooling cabin, maintenance inspection"
                  className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-1.5 text-xs"
                />
              </div>

              {overrideMode === 'FORCE_OFF' && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                    Caution: FORCE_OFF disables cabin cooling
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      required
                      checked={overrideConfirmChecked}
                      onChange={(e) => setOverrideConfirmChecked(e.target.checked)}
                      className="accent-rose-600"
                    />
                    <span>I confirm cabin safety protocols for disabling the cooling fan.</span>
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[#FDC3D1]">
                <button
                  type="button"
                  onClick={() => setOverrideModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#826674]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideMode === 'FORCE_OFF' && !overrideConfirmChecked}
                  className="px-4 py-2 text-xs font-semibold bg-[#FF5C89] text-white rounded-lg hover:bg-[#C72C5E] disabled:opacity-50"
                >
                  Apply Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ESP32 Firmware & Wiring Guide Modal */}
      <FirmwareGuideModal
        isOpen={firmwareModalOpen}
        onClose={() => setFirmwareModalOpen(false)}
        deviceId={device.deviceId}
      />
    </div>
  );
};
