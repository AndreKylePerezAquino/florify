import React, { useState } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Radio,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../../components/common/StatusBadge';
import { UserRole, UserStatus } from '../../types';

export const AdminUsersPage: React.FC = () => {
  const {
    allUsers,
    devices,
    currentUser,
    approveUser,
    rejectUser,
    suspendUser,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | UserStatus>('ALL');

  const filteredUsers = allUsers.filter((u) => {
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
    const matchesSearch =
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.uid.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const pendingUsers = allUsers.filter((u) => u.status === 'PENDING');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">
          Driver & Administrator Access Management
        </h1>
        <p className="text-xs text-[#826674] mt-0.5">
          Review pending Google sign-in access requests, assign RBAC roles, and govern driver credentials.
        </p>
      </div>

      {/* Pending Access Requests Section (Priority) */}
      {pendingUsers.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-700" />
            <h2 className="text-sm font-bold text-amber-900">
              Pending Access Requests ({pendingUsers.length})
            </h2>
          </div>
          <p className="text-xs text-amber-800">
            These users signed in via Google and require administrative authorization before accessing shuttle telemetry.
          </p>

          <div className="divide-y divide-amber-200 bg-white rounded-lg border border-amber-200 overflow-hidden">
            {pendingUsers.map((user) => (
              <div
                key={user.uid}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <span className="font-bold text-[#2E1826] text-sm block">
                    {user.displayName}
                  </span>
                  <span className="font-mono text-[#826674]">{user.email}</span>
                  <span className="text-slate-400 mx-2">·</span>
                  <span className="text-[#826674]">
                    Requested on {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => approveUser(user.uid, 'DRIVER')}
                    className="px-3 py-1.5 bg-[#FF5C89] hover:bg-[#C72C5E] text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Approve as Driver
                  </button>
                  <button
                    onClick={() => approveUser(user.uid, 'ADMIN')}
                    className="px-3 py-1.5 bg-white border border-[#FDC3D1] text-[#C72C5E] hover:bg-[#FFF7F9] font-semibold rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Approve as Admin
                  </button>
                  <button
                    onClick={() => rejectUser(user.uid)}
                    className="px-3 py-1.5 text-rose-700 hover:bg-rose-50 font-semibold rounded-lg transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#FDC3D1] shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-[#826674]" />
          <input
            type="text"
            placeholder="Search by name, email, or UID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto text-xs">
          {(['ALL', 'APPROVED', 'PENDING', 'SUSPENDED', 'REJECTED'] as const).map((st) => (
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

      {/* All Users Table */}
      <div className="bg-white rounded-xl border border-[#FDC3D1] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#FDC3D1] bg-[#FFF7F9]/50 text-[#826674] font-semibold">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Assigned ESP32 Monitor</th>
                <th className="py-3 px-4">Approval Details</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FDC3D1]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#826674]">
                    No accounts match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const assignedDevice = devices.find((d) => d.assignedDriverUid === user.uid);
                  const isCurrent = user.uid === currentUser?.uid;

                  return (
                    <tr key={user.uid} className="hover:bg-[#FFF7F9]/30 transition-colors">
                      {/* User Info */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-full bg-[#FF5C89] text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                            {user.displayName.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-[#2E1826] block">
                              {user.displayName} {isCurrent && <span className="text-[10px] text-[#C72C5E]">(You)</span>}
                            </span>
                            <span className="font-mono text-[11px] text-[#826674]">{user.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold font-mono text-[11px] px-2 py-0.5 rounded ${
                            user.role === 'ADMIN'
                              ? 'bg-[#C72C5E] text-white'
                              : 'bg-[#FFF7F9] text-[#C72C5E] border border-[#FDC3D1]'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusBadge status={user.status} type="user" />
                      </td>

                      {/* Assigned Device */}
                      <td className="py-3 px-4">
                        {assignedDevice ? (
                          <div className="font-mono">
                            <span className="font-semibold text-[#2E1826]">{assignedDevice.deviceId}</span>
                            <span className="text-[11px] text-[#826674] block truncate">
                              {assignedDevice.displayName}
                            </span>
                          </div>
                        ) : (
                          <span className="italic text-slate-400">None</span>
                        )}
                      </td>

                      {/* Approval Info */}
                      <td className="py-3 px-4 text-[#826674] text-[11px]">
                        {user.approvedAt ? (
                          <span>
                            Approved {new Date(user.approvedAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <span>Pending or Unapproved</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {!isCurrent && (
                          <div className="flex items-center justify-end gap-1.5">
                            {user.status === 'APPROVED' ? (
                              <button
                                onClick={() => suspendUser(user.uid)}
                                className="px-2 py-1 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded font-medium"
                              >
                                Suspend
                              </button>
                            ) : user.status === 'SUSPENDED' ? (
                              <button
                                onClick={() => approveUser(user.uid, user.role)}
                                className="px-2 py-1 text-emerald-700 hover:bg-emerald-50 rounded font-medium"
                              >
                                Reactivate
                              </button>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
