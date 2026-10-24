import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Search,
  Clock,
  Radio,
  User as UserIcon,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AlertSeverity } from '../../types';

export const AdminAlertsPage: React.FC = () => {
  const { alerts, allUsers, acknowledgeAlert } = useApp();

  const [severityFilter, setSeverityFilter] = useState<'ALL' | AlertSeverity>('ALL');
  const [showOnlyUnacknowledged, setShowOnlyUnacknowledged] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAlerts = alerts.filter((a) => {
    const matchesSeverity = severityFilter === 'ALL' || a.severity === severityFilter;
    const matchesAck = showOnlyUnacknowledged ? !a.acknowledged : true;
    const matchesSearch =
      a.deviceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSeverity && matchesAck && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">System Alerts</h1>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#FDC3D1] shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-[#826674]" />
          <input
            type="text"
            placeholder="Search by device ID, alert type, or message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer text-[#2E1826] font-semibold pr-2 border-r border-[#FDC3D1]">
            <input
              type="checkbox"
              checked={showOnlyUnacknowledged}
              onChange={(e) => setShowOnlyUnacknowledged(e.target.checked)}
              className="accent-[#FF5C89]"
            />
            <span>Unacknowledged Only</span>
          </label>

          {(['ALL', 'CRITICAL', 'WARNING', 'INFO'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors ${
                severityFilter === sev
                  ? 'bg-[#FF5C89] text-white shadow-xs'
                  : 'bg-[#FFF7F9] text-[#826674] hover:text-[#C72C5E]'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts Stream */}
      <div className="bg-white rounded-xl border border-[#FDC3D1] shadow-xs divide-y divide-[#FDC3D1] overflow-hidden">
        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center text-[#826674] text-xs space-y-1">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto" />
            <p className="font-semibold text-[#2E1826]">No active alerts matching criteria</p>
            <p>All shuttle cabins are within configured temperature and humidity parameters.</p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const driver = allUsers.find((u) => u.uid === alert.assignedDriverUidAtCreation);
            return (
              <div
                key={alert.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs transition-all duration-200 ${
                  !alert.acknowledged
                    ? alert.severity === 'CRITICAL'
                      ? 'bg-rose-50/40 border-l-4 border-l-rose-500 animate-warning-glow'
                      : 'bg-[#FFF7F9]/40 border-l-4 border-l-[#FF5C89]'
                    : 'hover:bg-[#FFF7F9]/20'
                }`}
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded transition-transform ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-800 animate-pulse'
                          : alert.severity === 'WARNING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {alert.severity}
                    </span>
                    <span className="font-mono font-bold text-[#2E1826]">{alert.deviceId}</span>
                    <span className="text-[#826674] font-mono text-[11px] bg-[#FFF7F9] px-1.5 py-0.5 rounded border border-[#FDC3D1]">
                      {alert.type}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-[#826674] flex items-center gap-1 font-mono">
                      <Clock className="h-3 w-3" />
                      {new Date(alert.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm font-medium text-[#2E1826] leading-snug">
                    {alert.message}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-[#826674]">
                    {driver && (
                      <span className="flex items-center gap-1">
                        <UserIcon className="h-3 w-3 text-[#C72C5E]" />
                        Driver at event: <strong className="text-[#2E1826]">{driver.displayName}</strong>
                      </span>
                    )}
                    <span>Source: {alert.source}</span>
                    {alert.acknowledged && (
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Acknowledged
                      </span>
                    )}
                  </div>
                </div>

                {!alert.acknowledged && (
                  <button
                    onClick={() => acknowledgeAlert(alert.id)}
                    className="self-start sm:self-auto px-3.5 py-1.5 bg-[#FF5C89] hover:bg-[#C72C5E] active:scale-[0.98] text-white font-semibold rounded-lg shadow-xs transition-all whitespace-nowrap text-xs cursor-pointer"
                  >
                    Acknowledge Alert
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
