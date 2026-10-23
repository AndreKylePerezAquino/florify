import React from 'react';
import {
  Inbox,
  User,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DriverTelemetryCard } from '../../components/common/DriverTelemetryCard';

interface DriverDashboardPageProps {
  navigate: (path: string) => void;
}

export const DriverDashboardPage: React.FC<DriverDashboardPageProps> = ({ navigate }) => {
  const { currentUser, userProfile, devices } = useApp();

  const activeDriverUid = currentUser?.uid;
  const currentDriver = userProfile;

  // Filter devices assigned to this driver
  const assignedDevices = devices.filter((d) => d.assignedDriverUid === activeDriverUid);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">
            Driver Shuttle Monitor
          </h1>
          <p className="text-xs text-[#826674] mt-0.5">
            Welcome, <strong>{currentDriver?.displayName || 'Driver'}</strong>. Live cabin climate telemetry for your assigned shuttle.
          </p>
        </div>

        {/* Quick Driver Profile Link */}
        <div className="self-start sm:self-auto">
          <button
            onClick={() => navigate('/profile')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#FDC3D1] hover:bg-[#FFF7F9] text-[#2E1826] hover:text-[#C72C5E] text-xs font-semibold rounded-xl shadow-2xs transition-colors cursor-pointer"
          >
            <User className="h-3.5 w-3.5 text-[#C72C5E]" />
            <span>Driver Profile</span>
          </button>
        </div>
      </div>

      {/* Assigned Devices Telemetry Grid */}
      <div>
        {assignedDevices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#FDC3D1] p-8 text-center space-y-3 shadow-xs">
            <Inbox className="h-9 w-9 text-[#826674] mx-auto" />
            <h3 className="text-sm font-bold text-[#2E1826]">No Shuttle Assigned Currently</h3>
            <p className="text-xs text-[#826674] max-w-sm mx-auto leading-relaxed">
              Your driver account ({currentDriver?.email}) has no active shuttle monitor assigned yet. Fleet dispatch will pair your route before departure.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5">
            {assignedDevices.map((device) => (
              <DriverTelemetryCard
                key={device.deviceId}
                device={device}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
