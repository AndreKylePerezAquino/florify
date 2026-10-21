import React from 'react';
import {
  Thermometer,
  Radio,
  UserCheck,
  ShieldCheck,
  Cpu,
  Inbox,
  AlertTriangle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DeviceCard } from '../../components/common/DeviceCard';

interface DriverDashboardPageProps {
  navigate: (path: string) => void;
}

export const DriverDashboardPage: React.FC<DriverDashboardPageProps> = ({ navigate }) => {
  const { currentUser, userProfile, devices, allUsers } = useApp();

  const activeDriverUid = currentUser?.uid;
  const currentDriver = userProfile;

  // Filter devices assigned to this driver
  const assignedDevices = devices.filter((d) => d.assignedDriverUid === activeDriverUid);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">
              Driver Shuttle Monitor
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#FFF7F9] text-[#C72C5E] border border-[#FDC3D1]">
              Read-Only Telemetry
            </span>
          </div>
          <p className="text-xs text-[#826674] mt-0.5">
            Welcome, <strong>{currentDriver?.displayName || 'Driver'}</strong>. View live cabin climate conditions and fan relay operations for your assigned shuttle.
          </p>
        </div>
      </div>

      {/* Driver Security Notice Banner */}
      <div className="bg-white rounded-xl border border-[#FDC3D1] p-4 shadow-xs flex items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[#FFF7F9] text-[#C72C5E] flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <span className="font-semibold text-[#2E1826]">Direct ESP32 Assignment Active</span>
            <p className="text-[#826674]">
              You have access exclusively to ESP32 units registered to your driver profile. Remote controls and threshold settings are managed by fleet dispatch.
            </p>
          </div>
        </div>
      </div>

      {/* Assigned Devices List */}
      <div>
        <h2 className="text-sm font-bold text-[#2E1826] mb-3">
          Assigned Cabin Monitor Units ({assignedDevices.length})
        </h2>

        {assignedDevices.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#FDC3D1] p-8 text-center space-y-3">
            <Inbox className="h-8 w-8 text-[#826674] mx-auto" />
            <h3 className="text-sm font-bold text-[#2E1826]">No Shuttle Devices Currently Assigned</h3>
            <p className="text-xs text-[#826674] max-w-sm mx-auto">
              Your driver account ({currentDriver?.email}) has no active ESP32 device assignments. An administrator will assign your shuttle monitor unit before route departure.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assignedDevices.map((device) => (
              <DeviceCard
                key={device.deviceId}
                device={device}
                driver={currentDriver}
                onSelect={(id) => navigate(`/driver/devices/${id}`)}
                isAdmin={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
