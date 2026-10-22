import React from 'react';
import {
  Cpu,
  Radio,
  UserCheck,
  Thermometer,
  Droplets,
  Fan,
  AlertTriangle,
  UserX,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DeviceCard } from '../../components/common/DeviceCard';
import { StatusBadge } from '../../components/common/StatusBadge';

interface AdminOverviewPageProps {
  navigate: (path: string) => void;
}

export const AdminOverviewPage: React.FC<AdminOverviewPageProps> = ({ navigate }) => {
  const {
    devices,
    allUsers,
    alerts,
    pendingUsersCount,
    activeAlertsCount,
    devicesWithFansOnCount,
    acknowledgeAlert,
  } = useApp();

  const onlineDevicesCount = devices.filter((d) => d.active).length;
  const assignedDevicesCount = devices.filter((d) => d.assignedDriverUid !== null).length;

  // Temperature and humidity averages from active devices
  const onlineWithReadings = devices.filter(
    (d) => d.active && d.latestTemperatureC !== undefined
  );
  const avgTemp =
    onlineWithReadings.length > 0
      ? (
          onlineWithReadings.reduce((acc, d) => acc + (d.latestTemperatureC || 0), 0) /
          onlineWithReadings.length
        ).toFixed(1)
      : '--';
  const avgHum =
    onlineWithReadings.length > 0
      ? (
          onlineWithReadings.reduce((acc, d) => acc + (d.latestHumidityRH || 0), 0) /
          onlineWithReadings.length
        ).toFixed(1)
      : '--';

  const devicesWithMistOnCount = devices.filter((d) => d.latestMistState === 'ON').length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">
            Fleet Climate Administration
          </h1>
          <p className="text-xs text-[#826674] mt-0.5">
            Realtime cabin condition monitoring system
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => navigate('/admin/devices')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF5C89] hover:bg-[#C72C5E] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Register New ESP32
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Devices */}
        <div className="bg-white p-4 rounded-xl border border-[#FDC3D1] shadow-xs hover:-translate-y-0.5 hover:shadow-md hover:border-[#FF5C89] transition-all duration-200">
          <div className="flex items-center justify-between text-[#826674] text-xs">
            <span>ESP32 Fleet</span>
            <Cpu className="h-4 w-4 text-[#C72C5E]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#2E1826]">
              {devices.length}
            </span>
            <span className="text-xs text-emerald-700 font-medium inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {onlineDevicesCount} online
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#826674]">
            {devices.length - onlineDevicesCount} offline or standby
          </div>
        </div>

        {/* Driver Assignments */}
        <div className="bg-white p-4 rounded-xl border border-[#FDC3D1] shadow-xs hover:-translate-y-0.5 hover:shadow-md hover:border-[#FF5C89] transition-all duration-200">
          <div className="flex items-center justify-between text-[#826674] text-xs">
            <span>Driver Assignments</span>
            <UserCheck className="h-4 w-4 text-[#C72C5E]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#2E1826]">
              {assignedDevicesCount}
            </span>
            <span className="text-xs text-[#826674]">/ {devices.length}</span>
          </div>
          <div className="mt-1 text-[11px] text-[#826674]">
            {devices.length - assignedDevicesCount} unassigned units
          </div>
        </div>

        {/* Relay Actuators (Fan & Mist) */}
        <div className={`bg-white p-4 rounded-xl border shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 ${
          devicesWithFansOnCount > 0 || devicesWithMistOnCount > 0 ? 'border-emerald-300 bg-emerald-50/20' : 'border-[#FDC3D1]'
        }`}>
          <div className="flex items-center justify-between text-[#826674] text-xs">
            <span>Relays Active</span>
            <div className="relative flex items-center justify-center">
              <Fan className={`h-4 w-4 ${devicesWithFansOnCount > 0 ? 'text-emerald-600 animate-fan-spin' : 'text-[#826674]'}`} />
              {(devicesWithFansOnCount > 0 || devicesWithMistOnCount > 0) && (
                <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#2E1826]">
              {devicesWithFansOnCount}
            </span>
            <span className="text-xs text-emerald-700 font-medium">
              fans · {devicesWithMistOnCount} mist
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[#826674]">
            Avg: {avgTemp}°C · {avgHum}% RH
          </div>
        </div>

        {/* Pending & Alerts */}
        <div className={`bg-white p-4 rounded-xl border shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 ${
          activeAlertsCount > 0 ? 'border-rose-300 animate-warning-glow' : 'border-[#FDC3D1]'
        }`}>
          <div className="flex items-center justify-between text-[#826674] text-xs">
            <span>Action Required</span>
            <AlertTriangle className={`h-4 w-4 ${activeAlertsCount > 0 ? 'text-rose-500 animate-pulse' : 'text-[#826674]'}`} />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-[#C72C5E]">
              {activeAlertsCount}
            </span>
            <span className="text-xs text-[#826674]">alerts</span>
          </div>
          <div className="mt-1 text-[11px] text-amber-700 font-medium">
            {pendingUsersCount} pending driver access requests
          </div>
        </div>
      </div>

      {/* Main Devices Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#2E1826]">Active ESP32 Climate Monitors</h2>
          <button
            onClick={() => navigate('/admin/devices')}
            className="text-xs font-semibold text-[#C72C5E] hover:underline flex items-center gap-1"
          >
            <span>View All Devices</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {devices.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-[#FDC3D1] text-center space-y-3">
            <Cpu className="h-8 w-8 text-[#826674] mx-auto" />
            <h3 className="text-sm font-bold text-[#2E1826]">No ESP32 Devices Registered</h3>
            <p className="text-xs text-[#826674] max-w-sm mx-auto">
              Register your first ESP32 shuttle monitor to begin collecting real-time temperature, humidity, and relay telemetry.
            </p>
            <button
              onClick={() => navigate('/admin/devices')}
              className="px-4 py-2 bg-[#FF5C89] text-white text-xs font-semibold rounded-lg shadow-xs"
            >
              Register First Device
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((device) => {
              const driver = allUsers.find((u) => u.uid === device.assignedDriverUid);
              return (
                <DeviceCard
                  key={device.deviceId}
                  device={device}
                  driver={driver}
                  onSelect={(id) => navigate(`/admin/devices/${id}`)}
                  isAdmin={true}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Alerts Section */}
      <div className="bg-white rounded-xl border border-[#FDC3D1] p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#2E1826]">Recent System Alerts</h2>
            <p className="text-xs text-[#826674]">
              Automated notifications for threshold breaches, offline timeouts, and relay events.
            </p>
          </div>
          <button
            onClick={() => navigate('/admin/alerts')}
            className="text-xs font-semibold text-[#C72C5E] hover:underline"
          >
            Manage Alerts ({alerts.length})
          </button>
        </div>

        {alerts.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No alerts triggered. System operating normally.</p>
        ) : (
          <div className="divide-y divide-[#FDC3D1]">
            {alerts.slice(0, 4).map((alert) => (
              <div key={alert.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-800'
                          : alert.severity === 'WARNING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <span className="font-mono text-[#826674]">{alert.deviceId}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-[#826674]">
                      {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[#2E1826] font-medium">{alert.message}</p>
                </div>

                {!alert.acknowledged && (
                  <button
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="shrink-0 px-2.5 py-1 text-[11px] font-semibold text-[#C72C5E] bg-[#FFF7F9] hover:bg-[#FFDBDB] rounded border border-[#FDC3D1] transition-colors"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
