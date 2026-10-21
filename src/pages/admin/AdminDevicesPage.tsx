import React, { useState } from 'react';
import {
  Cpu,
  Plus,
  Search,
  Filter,
  UserCheck,
  UserMinus,
  Settings,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../../components/common/StatusBadge';
import { FirmwareGuideModal } from '../../components/modals/FirmwareGuideModal';
import { DeviceStatus } from '../../types';

interface AdminDevicesPageProps {
  navigate: (path: string) => void;
}

export const AdminDevicesPage: React.FC<AdminDevicesPageProps> = ({ navigate }) => {
  const {
    devices,
    allUsers,
    registerDevice,
    assignDevice,
    toggleDeviceStatus,
    rotateDeviceCredential,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | DeviceStatus>('ALL');
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [firmwareModalOpen, setFirmwareModalOpen] = useState(false);
  const [selectedFirmwareDeviceId, setSelectedFirmwareDeviceId] = useState('ESP32-FLORIFY-01');

  // New device form state
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newLocationLabel, setNewLocationLabel] = useState('');
  const [newDriverUid, setNewDriverUid] = useState<string>('');
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Assignment modal state
  const [assigningDeviceId, setAssigningDeviceId] = useState<string | null>(null);
  const [selectedDriverForAssign, setSelectedDriverForAssign] = useState<string>('');

  // Credential rotation modal state
  const [rotatedCredential, setRotatedCredential] = useState<{ id: string; key: string } | null>(null);

  const approvedDrivers = allUsers.filter((u) => u.role === 'DRIVER' && u.status === 'APPROVED');

  const filteredDevices = devices.filter((d) => {
    const matchesStatus = statusFilter === 'ALL' || d.status === statusFilter;
    const matchesSearch =
      d.deviceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.locationLabel && d.locationLabel.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

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

    // Check duplicate
    if (devices.some((d) => d.deviceId.toUpperCase() === newDeviceId.trim().toUpperCase())) {
      setRegisterError('A device with this ID already exists.');
      return;
    }

    try {
      await registerDevice(
        newDeviceId,
        newDisplayName,
        newLocationLabel || undefined,
        newDriverUid || null
      );
      setIsRegisterModalOpen(false);
      setNewDeviceId('');
      setNewDisplayName('');
      setNewLocationLabel('');
      setNewDriverUid('');
      setRegisterError(null);
    } catch (err: any) {
      setRegisterError(err?.message || 'Failed to register device.');
    }
  };

  const handleAssignSubmit = async () => {
    if (!assigningDeviceId) return;
    await assignDevice(assigningDeviceId, selectedDriverForAssign || null);
    setAssigningDeviceId(null);
  };

  const handleRotate = async (deviceId: string) => {
    const secret = await rotateDeviceCredential(deviceId);
    setRotatedCredential({ id: deviceId, key: secret });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">ESP32 Device Management</h1>
          <p className="text-xs text-[#826674] mt-0.5">
            Register hardware nodes, assign dedicated drivers (1:1 ratio), and manage device access credentials.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              setSelectedFirmwareDeviceId(devices[0]?.deviceId || 'ESP32-FLORIFY-01');
              setFirmwareModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#FFF7F9] hover:bg-[#FFDBDB] border border-[#FDC3D1] text-[#C72C5E] text-xs font-semibold rounded-xl shadow-xs transition-all active:scale-[0.98] cursor-pointer"
          >
            <Cpu className="h-4 w-4" />
            ESP32 Code & Wiring
          </button>
          <button
            onClick={() => {
              handleGenerateId();
              setIsRegisterModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#FF5C89] hover:bg-[#C72C5E] text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Register Device
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#FDC3D1] shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-[#826674]" />
          <input
            type="text"
            placeholder="Search by Device ID, Name, or Location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1 overflow-x-auto text-xs">
          {(['ALL', 'ONLINE', 'OFFLINE', 'SENSOR_ERROR', 'DISABLED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
                statusFilter === st
                  ? 'bg-[#FF5C89] text-white shadow-xs'
                  : 'bg-[#FFF7F9] text-[#826674] hover:text-[#C72C5E]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Devices Table / List */}
      <div className="bg-white rounded-xl border border-[#FDC3D1] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#FDC3D1] bg-[#FFF7F9]/50 text-[#826674] font-semibold">
                <th className="py-3 px-4">Device ID & Name</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Assigned Driver</th>
                <th className="py-3 px-4">Latest Climate</th>
                <th className="py-3 px-4">Relay Channels</th>
                <th className="py-3 px-4">Config Sync</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FDC3D1]">
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#826674]">
                    No devices match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredDevices.map((device) => {
                  const assignedDriver = allUsers.find((u) => u.uid === device.assignedDriverUid);
                  const isSync = device.reportedConfigVersion === device.desiredConfigVersion;

                  return (
                    <tr key={device.deviceId} className="hover:bg-[#FFF7F9]/30 transition-colors">
                      {/* Name & ID */}
                      <td className="py-3 px-4">
                        <button
                          onClick={() => navigate(`/admin/devices/${device.deviceId}`)}
                          className="font-bold text-[#2E1826] hover:text-[#C72C5E] text-left block"
                        >
                          {device.displayName}
                        </button>
                        <div className="font-mono text-[11px] text-[#826674]">
                          {device.deviceId}
                          {device.locationLabel && ` · ${device.locationLabel}`}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusBadge status={device.status} type="device" />
                      </td>

                      {/* Assigned Driver */}
                      <td className="py-3 px-4">
                        {assignedDriver ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[#2E1826]">{assignedDriver.displayName}</span>
                            <button
                              onClick={() => {
                                setAssigningDeviceId(device.deviceId);
                                setSelectedDriverForAssign(device.assignedDriverUid || '');
                              }}
                              className="text-[10px] text-[#C72C5E] hover:underline"
                            >
                              (change)
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAssigningDeviceId(device.deviceId);
                              setSelectedDriverForAssign('');
                            }}
                            className="text-[#C72C5E] hover:underline italic font-medium"
                          >
                            + Assign Driver
                          </button>
                        )}
                      </td>

                      {/* Climate */}
                      <td className="py-3 px-4 font-mono tabular-nums">
                        {device.latestTemperatureC !== undefined ? (
                          <div>
                            <span className="font-bold text-[#C72C5E]">
                              {device.latestTemperatureC.toFixed(1)}°C
                            </span>
                            <span className="text-[#826674] ml-2">
                              {device.latestHumidityRH?.toFixed(1)}% RH
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">No telemetry</span>
                        )}
                      </td>

                      {/* Relay Channels (Fan & Mist) */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono font-semibold px-2 py-0.5 rounded text-[11px] ${
                              device.latestFanState === 'ON'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                            title="Relay: Shuttle Cooling Fan (GPIO 26)"
                          >
                            Fan: {device.latestFanState}
                          </span>
                          <span
                            className={`font-mono font-semibold px-2 py-0.5 rounded text-[11px] ${
                              device.latestMistState === 'ON'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                            title="Relay: Evaporative Mist Solenoid (GPIO 27)"
                          >
                            Mist: {device.latestMistState || 'OFF'}
                          </span>
                        </div>
                      </td>

                      {/* Config Sync */}
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span
                          className={isSync ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}
                          title={`Reported v${device.reportedConfigVersion} / Target v${device.desiredConfigVersion}`}
                        >
                          v{device.reportedConfigVersion} / v{device.desiredConfigVersion}{' '}
                          {isSync ? '✓' : '⟳'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedFirmwareDeviceId(device.deviceId);
                              setFirmwareModalOpen(true);
                            }}
                            className="p-1.5 rounded hover:bg-[#FFF7F9] text-[#826674] hover:text-[#C72C5E] cursor-pointer"
                            title="ESP32 C++ Code & Wiring Pinout"
                          >
                            <Cpu className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/admin/devices/${device.deviceId}`)}
                            className="p-1.5 rounded hover:bg-[#FFF7F9] text-[#C72C5E] cursor-pointer"
                            title="Device Details & Historical Graphs"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/admin/devices/${device.deviceId}/settings`)}
                            className="p-1.5 rounded hover:bg-[#FFF7F9] text-[#826674] hover:text-[#C72C5E] cursor-pointer"
                            title="Automation Settings"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleRotate(device.deviceId)}
                            className="p-1.5 rounded hover:bg-[#FFF7F9] text-[#826674] hover:text-[#C72C5E] cursor-pointer"
                            title="Rotate Device Secret"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Device Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#FDC3D1] shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#FDC3D1] pb-3">
              <h3 className="text-base font-bold text-[#2E1826]">Register New ESP32 Device</h3>
              <button onClick={() => setIsRegisterModalOpen(false)} className="text-[#826674]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {registerError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {registerError}
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#2E1826] mb-1">
                  Unique Device ID (Hardware Key)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newDeviceId}
                    onChange={(e) => setNewDeviceId(e.target.value)}
                    placeholder="e.g. ESP32-SHUTTLE-04"
                    className="flex-1 bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-1.5 font-mono text-xs uppercase"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateId}
                    className="px-2.5 py-1.5 bg-[#FFF7F9] text-[#C72C5E] border border-[#FDC3D1] rounded-lg font-semibold hover:bg-[#FFDBDB]"
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#2E1826] mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="e.g. West Shuttle Cabin A"
                  className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#2E1826] mb-1">
                  Location Label (Optional)
                </label>
                <input
                  type="text"
                  value={newLocationLabel}
                  onChange={(e) => setNewLocationLabel(e.target.value)}
                  placeholder="e.g. Downtown Terminal Bay 2"
                  className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#2E1826] mb-1">
                  Assign Active Driver (Optional, 1:1)
                </label>
                <select
                  value={newDriverUid}
                  onChange={(e) => setNewDriverUid(e.target.value)}
                  className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-1.5 text-xs"
                >
                  <option value="">-- Leave Unassigned --</option>
                  {approvedDrivers.map((d) => (
                    <option key={d.uid} value={d.uid}>
                      {d.displayName} ({d.email})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#826674] mt-1">
                  Each ESP32 is assigned directly to one driver. No vehicle records exist.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#FDC3D1]">
                <button
                  type="button"
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-[#826674] hover:text-[#2E1826]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#FF5C89] text-white rounded-lg hover:bg-[#C72C5E]"
                >
                  Confirm Registration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Driver Modal */}
      {assigningDeviceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-[#FDC3D1] shadow-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#2E1826]">
              Assign Driver to {assigningDeviceId}
            </h3>
            <p className="text-xs text-[#826674]">
              Assigning a driver grants read-only telemetry access to this device. An ESP32 can only be assigned to one driver at a time.
            </p>

            <select
              value={selectedDriverForAssign}
              onChange={(e) => setSelectedDriverForAssign(e.target.value)}
              className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg px-3 py-2 text-xs text-[#2E1826]"
            >
              <option value="">-- Unassigned (No Active Driver) --</option>
              {approvedDrivers.map((d) => (
                <option key={d.uid} value={d.uid}>
                  {d.displayName} ({d.email})
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAssigningDeviceId(null)}
                className="px-3 py-1.5 text-xs font-semibold text-[#826674]"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignSubmit}
                className="px-4 py-1.5 text-xs font-semibold bg-[#FF5C89] text-white rounded-lg hover:bg-[#C72C5E]"
              >
                Save Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rotated Credential Modal */}
      {rotatedCredential && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#FDC3D1] shadow-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <h3 className="text-sm font-bold">New Hardware Secret Generated</h3>
            </div>
            <p className="text-xs text-[#826674]">
              Save this Bearer credential in the ESP32 firmware config. It will not be shown again.
            </p>
            <div className="p-3 bg-slate-900 text-emerald-400 font-mono text-xs rounded-lg break-all select-all">
              {rotatedCredential.key}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setRotatedCredential(null)}
                className="px-4 py-1.5 text-xs font-semibold bg-[#FF5C89] text-white rounded-lg"
              >
                I have saved this key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ESP32 Firmware & Wiring Guide Modal */}
      <FirmwareGuideModal
        isOpen={firmwareModalOpen}
        onClose={() => setFirmwareModalOpen(false)}
        deviceId={selectedFirmwareDeviceId}
      />
    </div>
  );
};
