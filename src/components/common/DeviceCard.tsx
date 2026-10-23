import React from 'react';
import {
  Thermometer,
  Droplets,
  Fan,
  CloudRain,
  Clock,
  User as UserIcon,
  AlertTriangle,
  ChevronRight,
  MapPin,
  CheckCircle2,
} from 'lucide-react';
import { Device, UserProfile } from '../../types';
import { StatusBadge } from './StatusBadge';
import { isDeviceConnected } from '../../lib/deviceStatus';

interface DeviceCardProps {
  device: Device;
  driver?: UserProfile | null;
  onSelect: (deviceId: string) => void;
  isAdmin?: boolean;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ device, driver, onSelect, isAdmin }) => {
  const isOnline = isDeviceConnected(device);
  const hasReading = device.latestTemperatureC !== undefined && device.latestHumidityRH !== undefined;

  // Temperature warning if >= 40°C
  const isHighTemp = device.latestTemperatureC !== undefined && device.latestTemperatureC >= 40.0;
  const isHighHum = device.latestHumidityRH !== undefined && device.latestHumidityRH >= 75.0;

  return (
    <div
      onClick={() => onSelect(device.deviceId)}
      className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs hover:border-[#FF5C89] hover:shadow-lg hover:-translate-y-1 active:scale-[0.99] transition-all duration-200 ease-out cursor-pointer group flex flex-col justify-between relative overflow-hidden"
    >
      <div>
        {/* Header: Device Name & Status */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#2E1826] group-hover:text-[#C72C5E] transition-colors leading-snug">
              {device.displayName}
            </h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-[#826674] font-mono">
              <span>{device.deviceId}</span>
              {device.locationLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 font-sans">
                    <MapPin className="h-3 w-3 text-[#C72C5E]" />
                    {device.locationLabel}
                  </span>
                </>
              )}
            </div>
          </div>

          <StatusBadge status={device.status} type="device" isOnline={isOnline} />
        </div>

        {/* Telemetry Numbers Grid */}
        <div className="grid grid-cols-2 gap-3 my-4">
          {/* Temperature */}
          <div
            className={`p-3 rounded-lg border transition-all duration-300 ${
              isHighTemp
                ? 'bg-rose-50/70 border-rose-300 animate-warning-glow'
                : 'bg-[#FFF7F9]/50 border-[#FDC3D1] hover:border-[#FB8CAC]'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1">
                <Thermometer className={`h-3.5 w-3.5 transition-transform group-hover:scale-110 ${isHighTemp ? 'text-rose-600' : 'text-[#C72C5E]'}`} />
                Temperature
              </span>
              {isHighTemp && (
                <span className="text-[10px] font-semibold text-rose-600 uppercase tracking-wider animate-pulse">High</span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold font-mono tabular-nums text-[#2E1826] transition-all">
                {hasReading ? `${device.latestTemperatureC!.toFixed(1)}` : '--'}
              </span>
              <span className="text-xs text-[#826674] font-medium">°C</span>
            </div>
          </div>

          {/* Humidity */}
          <div
            className={`p-3 rounded-lg border transition-all duration-300 ${
              isHighHum
                ? 'bg-amber-50/70 border-amber-300 animate-warning-glow'
                : 'bg-[#FFF7F9]/50 border-[#FDC3D1] hover:border-[#FB8CAC]'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1">
                <Droplets className={`h-3.5 w-3.5 transition-transform group-hover:scale-110 ${isHighHum ? 'text-amber-600' : 'text-[#C72C5E]'}`} />
                Humidity
              </span>
              {isHighHum && (
                <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider animate-pulse">Elevated</span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-bold font-mono tabular-nums text-[#2E1826] transition-all">
                {hasReading ? `${device.latestHumidityRH!.toFixed(1)}` : '--'}
              </span>
              <span className="text-xs text-[#826674] font-medium">% RH</span>
            </div>
          </div>
        </div>

        {/* Dual Actuator Status (Relay 1 Fan & Relay 2 Mist) */}
        <div className="flex items-center justify-between py-2 border-t border-[#FDC3D1] text-xs">
          <div className="flex items-center gap-3">
            {/* Cooling */}
            <div className="flex items-center gap-1.5" title="Cooling Channel">
              <div className="relative flex items-center justify-center">
                <Fan
                  className={`h-4 w-4 transition-colors ${
                    device.latestFanState === 'ON'
                      ? 'text-emerald-600 animate-fan-spin'
                      : 'text-[#826674]'
                  }`}
                />
                {device.latestFanState === 'ON' && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                )}
              </div>
              <span className="text-[#826674] text-[11px]">Cooling:</span>
              <span
                className={`font-semibold font-mono text-[11px] transition-colors ${
                  device.latestFanState === 'ON' ? 'text-emerald-700' : 'text-slate-600'
                }`}
              >
                {device.latestFanState}
              </span>
            </div>

            {/* Humidity */}
            <div className="flex items-center gap-1.5" title="Humidity Channel">
              <div className="relative flex items-center justify-center">
                <CloudRain
                  className={`h-4 w-4 transition-colors ${
                    device.latestMistState === 'ON'
                      ? 'text-sky-600 animate-pulse'
                      : 'text-[#826674]'
                  }`}
                />
                {device.latestMistState === 'ON' && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-sky-500" />
                  </span>
                )}
              </div>
              <span className="text-[#826674] text-[11px]">Humidity:</span>
              <span
                className={`font-semibold font-mono text-[11px] transition-colors ${
                  device.latestMistState === 'ON' ? 'text-sky-700' : 'text-slate-600'
                }`}
              >
                {device.latestMistState || 'OFF'}
              </span>
            </div>
          </div>

          <div className="text-[#826674]">
            <span className="font-semibold text-[#C72C5E] bg-[#FFF7F9] px-1.5 py-0.5 rounded border border-[#FDC3D1] text-[10px]">
              {device.reportedMode}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Info: Driver Assignment & Timestamp */}
      <div className="pt-3 border-t border-[#FDC3D1] flex items-center justify-between text-xs text-[#826674]">
        <div className="flex items-center gap-1.5 truncate max-w-[200px]">
          <UserIcon className="h-3.5 w-3.5 text-[#C72C5E] shrink-0" />
          <span className="truncate">
            {driver ? (
              <span className="font-medium text-[#2E1826]">{driver.displayName}</span>
            ) : (
              <span className="italic text-slate-400">Unassigned</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[#C72C5E] group-hover:translate-x-1 transition-transform duration-200 font-medium">
          <span>Details</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
};
