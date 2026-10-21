import React, { useState, useEffect } from 'react';
import {
  collection,
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
  ArrowLeft,
  Clock,
  ShieldAlert,
  Radio,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../../components/common/StatusBadge';
import { HistoricalChart } from '../../components/common/HistoricalChart';
import { SensorGauge } from '../../components/common/SensorGauge';
import { DeviceReading } from '../../types';

interface DriverDeviceDetailPageProps {
  deviceId: string;
  navigate: (path: string) => void;
}

export const DriverDeviceDetailPage: React.FC<DriverDeviceDetailPageProps> = ({ deviceId, navigate }) => {
  const { currentUser, devices, alerts } = useApp();

  const activeDriverUid = currentUser?.uid;
  const device = devices.find((d) => d.deviceId === deviceId);

  // Security Verification: Is this device assigned to the current driver?
  const isAssignedToDriver = device?.assignedDriverUid === activeDriverUid;

  const [liveReadings, setLiveReadings] = useState<DeviceReading[]>([]);

  // Listen to live readings subcollection
  useEffect(() => {
    if (!deviceId || !isAssignedToDriver) return;
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
  }, [deviceId, isAssignedToDriver]);

  // Relevant device alerts
  const deviceAlerts = alerts.filter((a) => a.deviceId === deviceId);

  if (!device || !isAssignedToDriver) {
    return (
      <div className="bg-white rounded-xl border border-rose-200 p-8 text-center space-y-3">
        <ShieldAlert className="h-8 w-8 text-rose-600 mx-auto" />
        <h2 className="text-base font-bold text-[#2E1826]">Access Restricted</h2>
        <p className="text-xs text-[#826674] max-w-sm mx-auto">
          You are not authorized to view device <strong>{deviceId}</strong>. Drivers can only view telemetry for ESP32 units actively assigned to their profile.
        </p>
        <button
          onClick={() => navigate('/driver')}
          className="px-4 py-2 bg-[#FF5C89] text-white text-xs font-semibold rounded-lg"
        >
          Return to My Devices
        </button>
      </div>
    );
  }

  const hasReading = device.latestTemperatureC !== undefined && device.latestHumidityRH !== undefined;
  const isHighTemp = device.latestTemperatureC !== undefined && device.latestTemperatureC >= 40.0;
  const isHighHum = device.latestHumidityRH !== undefined && device.latestHumidityRH >= 75.0;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/driver')}
          className="p-1.5 rounded-lg border border-[#FDC3D1] bg-white hover:bg-[#FFF7F9] text-[#C72C5E]"
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

      {/* Main KPI Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Temperature */}
        <div
          className={`p-5 rounded-xl border shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
            isHighTemp
              ? 'bg-rose-50/70 border-rose-300 animate-warning-glow'
              : 'bg-white border-[#FDC3D1]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1.5 font-semibold">
                <Thermometer className="h-4 w-4 text-[#C72C5E]" />
                Cabin Temperature
              </span>
              {isHighTemp && (
                <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                  Warm
                </span>
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold font-mono tabular-nums text-[#2E1826] transition-all">
                {hasReading ? device.latestTemperatureC!.toFixed(1) : '--'}
              </span>
              <span className="text-sm font-semibold text-[#826674]">°C</span>
            </div>
          </div>
          <SensorGauge
            type="temperature"
            value={device.latestTemperatureC}
            threshold={40.0}
            unit="°C"
            min={15}
            max={50}
            isWarning={isHighTemp}
          />
        </div>

        {/* Humidity */}
        <div
          className={`p-5 rounded-xl border shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
            isHighHum
              ? 'bg-amber-50/70 border-amber-300 animate-warning-glow'
              : 'bg-white border-[#FDC3D1]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1.5 font-semibold">
                <Droplets className="h-4 w-4 text-[#FB8CAC]" />
                Relative Humidity
              </span>
              {isHighHum && (
                <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                  High
                </span>
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-bold font-mono tabular-nums text-[#2E1826] transition-all">
                {hasReading ? device.latestHumidityRH!.toFixed(1) : '--'}
              </span>
              <span className="text-sm font-semibold text-[#826674]">% RH</span>
            </div>
          </div>
          <SensorGauge
            type="humidity"
            value={device.latestHumidityRH}
            threshold={75.0}
            unit="%"
            min={20}
            max={100}
            isWarning={isHighHum}
          />
        </div>

        {/* Relay 1: Fan Status */}
        <div className={`p-5 rounded-xl border shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
          device.latestFanState === 'ON' ? 'bg-emerald-50/20 border-emerald-300' : 'bg-white border-[#FDC3D1]'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1.5 font-semibold">
                <div className="relative flex items-center justify-center">
                  <Fan
                    className={`h-4 w-4 transition-colors ${
                      device.latestFanState === 'ON' ? 'text-emerald-600 animate-fan-spin' : 'text-[#826674]'
                    }`}
                  />
                  {device.latestFanState === 'ON' && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                  )}
                </div>
                Relay 1: Cabin Fan
              </span>
              <span className="text-[11px] font-mono text-[#C72C5E] bg-[#FFF7F9] px-1.5 py-0.5 rounded border border-[#FDC3D1]">
                {device.reportedMode}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold font-mono transition-colors ${
                  device.latestFanState === 'ON' ? 'text-emerald-700' : 'text-slate-600'
                }`}
              >
                {device.latestFanState}
              </span>
              {device.latestFanState === 'ON' && (
                <span className="text-xs text-emerald-700 font-semibold animate-pulse">
                  Cooling Shuttle Cabin
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-[#FDC3D1]/60 flex items-center justify-between text-xs text-[#826674]">
            <span>
              {device.latestFanState === 'ON'
                ? 'Relay circuit actively circulating air'
                : 'Standby; cabin within comfort range'}
            </span>
          </div>
        </div>

        {/* Relay 2: Mist Solenoid Status */}
        <div className={`p-5 rounded-xl border shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 flex flex-col justify-between ${
          device.latestMistState === 'ON' ? 'bg-sky-50/20 border-sky-300' : 'bg-white border-[#FDC3D1]'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1.5 font-semibold">
                <div className="relative flex items-center justify-center">
                  <CloudRain
                    className={`h-4 w-4 transition-colors ${
                      device.latestMistState === 'ON' ? 'text-sky-600 animate-pulse' : 'text-[#826674]'
                    }`}
                  />
                  {device.latestMistState === 'ON' && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500" />
                    </span>
                  )}
                </div>
                Relay 2: Cabin Mist
              </span>
              <span className="text-[11px] font-mono text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                GPIO 19
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold font-mono transition-colors ${
                  device.latestMistState === 'ON' ? 'text-sky-700' : 'text-slate-600'
                }`}
              >
                {device.latestMistState || 'OFF'}
              </span>
              {device.latestMistState === 'ON' && (
                <span className="text-xs text-sky-700 font-semibold animate-pulse">
                  Evaporative Mist Active
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-[#FDC3D1]/60 flex items-center justify-between text-xs text-[#826674]">
            <span>
              {device.latestMistState === 'ON'
                ? 'Relay energizing mist pump'
                : 'Standby; humidity balanced'}
            </span>
          </div>
        </div>
      </div>

      {/* Historical Telemetry Chart */}
      <HistoricalChart readings={liveReadings} />

      {/* Active Device Alerts */}
      <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-[#2E1826] flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[#C72C5E]" />
          Driver Notifications & Climate Events
        </h3>

        {deviceAlerts.length === 0 ? (
          <p className="text-xs text-[#826674]">No active alerts for your shuttle unit.</p>
        ) : (
          <div className="divide-y divide-[#FDC3D1]">
            {deviceAlerts.map((a) => (
              <div key={a.id} className="py-2.5 text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#2E1826]">{a.message}</span>
                  <span className="text-[11px] text-[#826674] block font-mono">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    a.severity === 'CRITICAL'
                      ? 'bg-rose-100 text-rose-800'
                      : a.severity === 'WARNING'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {a.severity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 rounded-xl bg-[#FFF7F9] border border-[#FDC3D1] text-xs text-[#826674] flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>Last communication received: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleTimeString() : 'Recently'}</span>
        <span className="font-mono text-[11px]">Firmware: {device.firmwareVersion}</span>
      </div>
    </div>
  );
};
