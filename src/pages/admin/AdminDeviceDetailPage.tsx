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
  Power,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Cpu,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../../components/common/StatusBadge';
import { isDeviceConnected } from '../../lib/deviceStatus';
import { HistoricalChart } from '../../components/common/HistoricalChart';
import { SensorGauge } from '../../components/common/SensorGauge';
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
    setMistOverride,
    returnMistToAuto,
    assignDevice,
    rotateDeviceCredential,
    removeDevice,
    updateConfig,
  } = useApp();

  const device = devices.find((d) => d.deviceId === deviceId);
  const assignedDriver = allUsers.find((u) => u.uid === device?.assignedDriverUid);

  const [liveConfig, setLiveConfig] = useState<DeviceConfig | undefined>(undefined);
  const [liveReadings, setLiveReadings] = useState<DeviceReading[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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
  const [overrideTarget, setOverrideTarget] = useState<'FAN' | 'MIST'>('FAN');
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
    if (overrideTarget === 'FAN') {
      await setFanOverride(device.deviceId, overrideMode, overrideDuration, overrideReason);
    } else {
      await setMistOverride(device.deviceId, overrideMode, overrideDuration, overrideReason);
    }
    setOverrideModalOpen(false);
    setOverrideConfirmChecked(false);
  };

  const handleDeleteDevice = async () => {
    await removeDevice(device.deviceId);
    navigate('/admin/devices');
  };

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
              <StatusBadge
                status={device.status}
                type="device"
                isOnline={isDeviceConnected(device)}
              />
            </div>
            <p className="text-xs font-mono text-[#826674]">
              ID: {device.deviceId} {device.locationLabel && `· ${device.locationLabel}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/admin/devices/${device.deviceId}/settings`)}
            className="px-3 py-1.5 bg-white border border-[#FDC3D1] hover:bg-[#FFF7F9] text-[#C72C5E] text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="h-4 w-4" />
            Automation Settings
          </button>
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            className="px-3 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            Remove Monitor
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

        {/* Cooling Relay State */}
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
                Cooling Channel
              </span>
              <span className="text-[10px] font-mono text-emerald-700 font-semibold">GPIO 26</span>
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
                Cooling Active
              </span>
            )}
          </div>
        </div>

        {/* Humidity Relay State */}
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
                Humidity Channel
              </span>
              <span className="text-[10px] font-mono text-sky-700 font-semibold">GPIO 27</span>
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
            <span>Humidity Regulation</span>
            {device.latestMistState === 'ON' && (
              <span className="text-sky-700 font-medium bg-sky-100/70 px-1.5 py-0.5 rounded animate-pulse">
                Active
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

      {/* Manual Actuator Controls: Cooling, Humidifier & Target Threshold */}
      <div className="space-y-4">
        {/* Row 1: Actuator Overrides (Cooling & Humidifier) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cooling OFF/ON Control Bar */}
          <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#2E1826] flex items-center gap-2">
                  <Power className="h-4 w-4 text-[#C72C5E]" />
                  Cooling OFF / ON Controls (GPIO 18 / 26)
                </h3>
                <p className="text-xs text-[#826674]">
                  Operating mode:{' '}
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
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Return to AUTO
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setOverrideTarget('FAN');
                        setOverrideMode('FORCE_ON');
                        setOverrideReason('Pre-cooling shuttle before boarding');
                        setOverrideModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-[#FFF7F9] hover:bg-[#FFDBDB] text-[#C72C5E] border border-[#FDC3D1] text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Cooling ON
                    </button>
                    <button
                      onClick={() => {
                        setOverrideTarget('FAN');
                        setOverrideMode('FORCE_OFF');
                        setOverrideReason('Manual cooling fan shutdown');
                        setOverrideModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Cooling OFF
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Humidifier Override Control Bar (Below Cooling Controls) */}
          <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#2E1826] flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-sky-600" />
                  Humidifier Override Controls (GPIO 19 / 27)
                </h3>
                <p className="text-xs text-[#826674]">
                  Operating mode:{' '}
                  <strong className="text-sky-700 uppercase">{liveConfig?.mistMode || 'AUTO'}</strong>
                  {liveConfig?.mistOverrideExpiresAt && (
                    <span className="ml-2 text-amber-700">
                      (Expires in {Math.max(0, Math.round((new Date(liveConfig.mistOverrideExpiresAt).getTime() - Date.now()) / 60000))} mins)
                    </span>
                  )}
                  <span className="ml-2 text-[11px] text-slate-400 hidden sm:inline">
                    (1 Click = ON, 2 Clicks = OFF)
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {liveConfig?.mistMode && liveConfig?.mistMode !== 'AUTO' ? (
                  <button
                    onClick={() => returnMistToAuto(device.deviceId)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Return to AUTO
                  </button>
                ) : null}
                <button
                  onClick={() => {
                    setOverrideTarget('MIST');
                    setOverrideMode('FORCE_ON');
                    setOverrideReason('Manual humidifier activation (1 click pulse)');
                    setOverrideModalOpen(true);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                    liveConfig?.mistMode === 'FORCE_ON'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200'
                  }`}
                >
                  Humidifier ON (1 Click)
                </button>
                <button
                  onClick={() => {
                    setOverrideTarget('MIST');
                    setOverrideMode('FORCE_OFF');
                    setOverrideReason('Manual humidifier shutdown (2 click pulses)');
                    setOverrideModalOpen(true);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-colors ${
                    liveConfig?.mistMode === 'FORCE_OFF'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                  }`}
                >
                  Humidifier OFF (2 Clicks)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Target Humidity Threshold Tuning */}
        <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#2E1826] flex items-center gap-2">
                <CloudRain className="h-4 w-4 text-sky-600" />
                Humidity value% UP / DOWN (Target Threshold Tuning)
              </h3>
              <p className="text-xs text-[#826674]">
                Target Threshold:{' '}
                <strong className="text-sky-700">{liveConfig?.humidityOnRH || 75.0}% RH</strong>
                <span className="ml-2 text-slate-500">(Auto Mode: {liveConfig?.mistMode || 'AUTO'})</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const currentHum = liveConfig?.humidityOnRH || 75.0;
                  const newHum = Math.max(20, currentHum - 5);
                  await updateConfig(device.deviceId, { humidityOnRH: newHum });
                }}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                title="Decrease Target Humidity 5%"
              >
                Humidity -5% (DOWN)
              </button>
              <button
                onClick={async () => {
                  const currentHum = liveConfig?.humidityOnRH || 75.0;
                  const newHum = Math.min(100, currentHum + 5);
                  await updateConfig(device.deviceId, { humidityOnRH: newHum });
                }}
                className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold cursor-pointer"
                title="Increase Target Humidity 5%"
              >
                Humidity +5% (UP)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Telemetry Chart */}
      <HistoricalChart readings={liveReadings} config={liveConfig} />


      {/* Override Duration Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#FDC3D1] shadow-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#2E1826]">
              Configure {overrideTarget === 'FAN' ? 'Relay 1 (Fan)' : 'Relay 2 (Mist)'} Override: {overrideMode}
            </h3>
            <p className="text-xs text-[#826674]">
              Manual overrides switch the physical relay immediately. The ESP32 will automatically revert to its standard operating mode once the duration window expires.
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
                    Caution: FORCE_OFF disables {overrideTarget === 'FAN' ? 'cabin cooling' : 'cabin humidifier'}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      required
                      checked={overrideConfirmChecked}
                      onChange={(e) => setOverrideConfirmChecked(e.target.checked)}
                      className="accent-rose-600"
                    />
                    <span>I confirm safety protocols for disabling the {overrideTarget === 'FAN' ? 'cooling fan' : 'humidifier'}.</span>
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

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-rose-200 shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="text-sm font-bold">Remove Climate Monitor?</h3>
            </div>
            <p className="text-xs text-[#826674]">
              This will permanently delete climate monitor <strong>{device.deviceId}</strong> and all associated historical data and telemetry records. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-[#826674]"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDevice}
                className="px-4 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700"
              >
                Confirm Removal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
