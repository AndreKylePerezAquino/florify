import React, { useState, useEffect } from 'react';
import {
  Thermometer,
  Droplets,
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Device } from '../../types';
import { StatusBadge } from './StatusBadge';
import { isDeviceConnected } from '../../lib/deviceStatus';

interface DriverTelemetryCardProps {
  device: Device;
}

export const DriverTelemetryCard: React.FC<DriverTelemetryCardProps> = ({ device }) => {
  const isOnline = isDeviceConnected(device);
  const hasReading =
    device.latestTemperatureC !== undefined && device.latestHumidityRH !== undefined;

  const isHighTemp =
    device.latestTemperatureC !== undefined && device.latestTemperatureC >= 40.0;
  const isHighHum =
    device.latestHumidityRH !== undefined && device.latestHumidityRH >= 75.0;

  // Realtime relative timestamp ticker that updates every 10 seconds
  const [timeAgo, setTimeAgo] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const rawTimestamp = device.lastReadingAt || device.lastSeenAt;
      if (!rawTimestamp) {
        setTimeAgo('No telemetry received yet');
        return;
      }
      const time = new Date(rawTimestamp).getTime();
      if (isNaN(time)) {
        setTimeAgo('Invalid timestamp');
        return;
      }
      const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
      if (diffSec < 15) {
        setTimeAgo('Live · Updated just now');
      } else if (diffSec < 60) {
        setTimeAgo(`Updated ${diffSec}s ago`);
      } else {
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) {
          setTimeAgo(
            `Updated ${diffMin}m ago (${new Date(rawTimestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })})`
          );
        } else {
          setTimeAgo(
            `Updated ${new Date(rawTimestamp).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })} at ${new Date(rawTimestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}`
          );
        }
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 10000);
    return () => clearInterval(interval);
  }, [device.lastReadingAt, device.lastSeenAt]);

  return (
    <div className="bg-white rounded-2xl border border-[#FDC3D1] p-5 sm:p-6 shadow-xs transition-all duration-200 flex flex-col justify-between">
      <div>
        {/* Header: Shuttle Name, ID, Location, and Connection Status */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-[#FDC3D1]/70">
          <div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-[#2E1826]">
                {device.displayName}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[#826674] font-mono">
              <span>{device.deviceId}</span>
              {device.locationLabel && (
                <>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="flex items-center gap-1 font-sans text-[#2E1826]">
                    <MapPin className="h-3.5 w-3.5 text-[#C72C5E]" />
                    {device.locationLabel}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="self-start sm:self-auto">
            <StatusBadge
              status={device.status}
              type="device"
              isOnline={isOnline}
            />
          </div>
        </div>

        {/* Telemetry Numbers Grid: Large, Glanceable Cabin Readings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-5">
          {/* Temperature Display */}
          <div
            className={`p-5 rounded-xl border transition-all duration-300 ${
              isHighTemp
                ? 'bg-rose-50/80 border-rose-300 animate-warning-glow'
                : 'bg-[#FFF7F9]/60 border-[#FDC3D1] hover:border-[#FB8CAC]'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1.5 font-semibold text-xs text-[#2E1826]">
                <Thermometer
                  className={`h-4 w-4 ${isHighTemp ? 'text-rose-600' : 'text-[#C72C5E]'}`}
                />
                Cabin Temperature
              </span>
              {isHighTemp ? (
                <span className="text-[10px] font-bold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                  High Temp
                </span>
              ) : (
                <span className="text-[11px] text-[#826674]">
                  {hasReading && device.latestTemperatureC! <= 26 ? 'Optimal' : 'Normal'}
                </span>
              )}
            </div>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-4xl sm:text-5xl font-bold font-mono tabular-nums text-[#2E1826] tracking-tight">
                {hasReading ? device.latestTemperatureC!.toFixed(1) : '--'}
              </span>
              <span className="text-lg font-semibold text-[#826674]">°C</span>
            </div>
            <div className="mt-1 text-[11px] text-[#826674]">
              Sensor type: {device.sensorType || 'DHT11'}
            </div>
          </div>

          {/* Humidity Display */}
          <div
            className={`p-5 rounded-xl border transition-all duration-300 ${
              isHighHum
                ? 'bg-amber-50/80 border-amber-300 animate-warning-glow'
                : 'bg-[#FFF7F9]/60 border-[#FDC3D1] hover:border-[#FB8CAC]'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-[#826674]">
              <span className="flex items-center gap-1.5 font-semibold text-xs text-[#2E1826]">
                <Droplets
                  className={`h-4 w-4 ${isHighHum ? 'text-amber-600' : 'text-[#C72C5E]'}`}
                />
                Relative Humidity
              </span>
              {isHighHum ? (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                  Elevated
                </span>
              ) : (
                <span className="text-[11px] text-[#826674]">
                  {hasReading && device.latestHumidityRH! >= 40 && device.latestHumidityRH! <= 65
                    ? 'Comfortable'
                    : 'Standard'}
                </span>
              )}
            </div>

            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-4xl sm:text-5xl font-bold font-mono tabular-nums text-[#2E1826] tracking-tight">
                {hasReading ? device.latestHumidityRH!.toFixed(1) : '--'}
              </span>
              <span className="text-lg font-semibold text-[#826674]">% RH</span>
            </div>
            <div className="mt-1 text-[11px] text-[#826674]">
              Relative moisture index
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Telemetry Freshness & Timestamp (No Relays, No Mode Badges, No Click Through) */}
      <div className="pt-3.5 border-t border-[#FDC3D1]/70 flex items-center justify-between text-xs text-[#826674]">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-[#C72C5E]" />
          <span className="font-mono text-[11px] font-medium text-[#2E1826]">
            {timeAgo}
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px]">
          {isOnline ? (
            <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Live Telemetry Stream
            </span>
          ) : (
            <span className="text-slate-500 italic">
              Awaiting next ESP32 transmission
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
