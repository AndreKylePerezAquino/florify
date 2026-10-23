import React from 'react';
import { DeviceStatus, FanState } from '../../types';

interface StatusBadgeProps {
  status: DeviceStatus | FanState | 'APPROVED' | 'PENDING' | 'REJECTED' | 'SUSPENDED';
  type?: 'device' | 'fan' | 'user';
  isOnline?: boolean;
  showLabel?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, type = 'device', isOnline }) => {
  // Operational status colors: green (healthy), amber (warning), red (critical), gray (offline)
  if (type === 'device') {
    switch (status) {
      case 'SENSOR_ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-50/90 px-2 py-0.5 rounded-md border border-rose-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            SENSOR ERROR
          </span>
        );
      case 'DISABLED':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            DISABLED
          </span>
        );
      default:
        if (isOnline) {
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50/90 px-2 py-0.5 rounded-md border border-emerald-200 shadow-2xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              (ACTIVE) connected
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-md border border-slate-200">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            disconnected
          </span>
        );
    }
  }

  if (type === 'fan') {
    switch (status) {
      case 'ON':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50/90 px-2 py-0.5 rounded-md border border-emerald-200 shadow-2xs transition-colors">
            <span className="relative flex h-2 w-2">
              <span className="animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            RELAY ACTIVE (ON)
          </span>
        );
      case 'OFF':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            STANDBY (OFF)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            UNKNOWN
          </span>
        );
    }
  }

  // User status
  switch (status) {
    case 'APPROVED':
      return <span className="text-xs font-medium text-emerald-700">Approved</span>;
    case 'PENDING':
      return <span className="text-xs font-medium text-amber-700">Pending Review</span>;
    case 'REJECTED':
      return <span className="text-xs font-medium text-rose-600">Rejected</span>;
    case 'SUSPENDED':
      return <span className="text-xs font-medium text-slate-500">Suspended</span>;
    default:
      return <span className="text-xs text-slate-500">{status}</span>;
  }
};
