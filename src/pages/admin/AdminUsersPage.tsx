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
  Crown,
  ArrowRightLeft,
  X,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../../components/common/StatusBadge';
import { UserRole, AdminLevel, UserStatus, UserProfile } from '../../types';

export const AdminUsersPage: React.FC = () => {
  const {
    allUsers,
    devices,
    currentUser,
    userProfile,
    approveUser,
    rejectUser,
    suspendUser,
    transferAdminLevel,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | UserStatus>('ALL');

  // Transfer Level Modal State
  const [transferModalUser, setTransferModalUser] = useState<UserProfile | null>(null);
  const [targetRole, setTargetRole] = useState<UserRole>('ADMIN');
  const [targetAdminLevel, setTargetAdminLevel] = useState<AdminLevel>('STANDARD');
  const [transferReason, setTransferReason] = useState<string>('');
  const [transferConfirmed, setTransferConfirmed] = useState<boolean>(false);
  const [transferLoading, setTransferLoading] = useState<boolean>(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const filteredUsers = allUsers.filter((u) => {
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
    const matchesSearch =
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.uid.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const pendingUsers = allUsers.filter((u) => u.status === 'PENDING');

  const openTransferModal = (user: UserProfile) => {
    setTransferModalUser(user);
    setTargetRole(user.role);
    setTargetAdminLevel(user.adminLevel || 'STANDARD');
    setTransferReason('');
    setTransferConfirmed(false);
    setTransferError(null);
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModalUser || !transferConfirmed) return;
    setTransferLoading(true);
    setTransferError(null);
    try {
      await transferAdminLevel(
        transferModalUser.uid,
        targetRole,
        targetRole === 'ADMIN' ? targetAdminLevel : undefined,
        transferReason.trim() || 'Staff hierarchy level transfer'
      );
      setTransferModalUser(null);
    } catch (err: any) {
      console.error('Transfer failed:', err);
      setTransferError(err?.message || 'Failed to transfer user level. Please try again.');
    } finally {
      setTransferLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">
          Driver & Staff Management
        </h1>
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
            These accounts signed in and require authorization before accessing fleet telemetry. Select an administrative or driver tier to approve.
          </p>

          <div className="divide-y divide-amber-200 bg-white rounded-lg border border-amber-200 overflow-hidden">
            {pendingUsers.map((user) => (
              <div
                key={user.uid}
                className="p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
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

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => approveUser(user.uid, 'DRIVER')}
                    className="px-3 py-1.5 bg-[#FFF7F9] hover:bg-white border border-[#FDC3D1] text-[#2E1826] font-semibold rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-[#C72C5E]" />
                    Approve as Driver
                  </button>
                  <button
                    onClick={() => approveUser(user.uid, 'ADMIN', 'STANDARD')}
                    className="px-3 py-1.5 bg-[#C72C5E] hover:bg-[#2E1826] text-white font-semibold rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Shield className="h-3.5 w-3.5 text-pink-200" />
                    Approve Standard Admin
                  </button>
                  <button
                    onClick={() => approveUser(user.uid, 'ADMIN', 'MASTER')}
                    className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white font-bold rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Crown className="h-3.5 w-3.5 text-amber-200" />
                    Approve Master Admin
                  </button>
                  <button
                    onClick={() => rejectUser(user.uid)}
                    className="px-3 py-1.5 text-rose-700 hover:bg-rose-50 font-semibold rounded-lg transition-colors cursor-pointer"
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
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-colors cursor-pointer ${
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
                <th className="py-3 px-4">Level & Role Hierarchy</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Assigned monitor</th>
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

                      {/* Role & Admin Level */}
                      <td className="py-3 px-4">
                        {user.role === 'ADMIN' ? (
                          user.adminLevel === 'MASTER' ? (
                            <span className="inline-flex items-center gap-1.5 font-bold text-[11px] px-2.5 py-1 rounded-md bg-gradient-to-r from-amber-500 via-rose-500 to-[#C72C5E] text-white shadow-2xs">
                              <Crown className="h-3.5 w-3.5 text-amber-200" />
                              <span>Master Admin</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 font-semibold text-[11px] px-2.5 py-1 rounded-md bg-[#C72C5E] text-white shadow-2xs">
                              <Shield className="h-3.5 w-3.5 text-pink-200" />
                              <span>Standard Admin</span>
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1.5 font-medium text-[11px] px-2.5 py-1 rounded-md bg-[#FFF7F9] text-[#2E1826] border border-[#FDC3D1]">
                            <UserCheck className="h-3.5 w-3.5 text-[#C72C5E]" />
                            <span>Driver</span>
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusBadge status={user.status} type="user" />
                      </td>

                      {/* Assigned Device */}
                      <td className="py-3 px-4">
                        {assignedDevice ? (
                          <div>
                            <span className="font-bold text-[#2E1826] block">{assignedDevice.displayName}</span>
                            <span className="text-[11px] text-[#826674] font-mono block truncate">
                              {assignedDevice.deviceId}
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
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Level Transfer Button */}
                          <button
                            onClick={() => openTransferModal(user)}
                            className="px-2.5 py-1 bg-[#FFF7F9] hover:bg-[#FDC3D1]/40 border border-[#FDC3D1] text-[#C72C5E] hover:text-[#2E1826] rounded-lg font-semibold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                            title="Promote, demote, or transfer admin privileges"
                          >
                            <ArrowRightLeft className="h-3 w-3" />
                            <span>Transfer Level</span>
                          </button>

                          {!isCurrent && (
                            <>
                              {user.status === 'APPROVED' ? (
                                <button
                                  onClick={() => suspendUser(user.uid)}
                                  className="px-2 py-1 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded font-medium text-[11px] cursor-pointer"
                                >
                                  Suspend
                                </button>
                              ) : user.status === 'SUSPENDED' ? (
                                <button
                                  onClick={() => approveUser(user.uid, user.role, user.adminLevel)}
                                  className="px-2 py-1 text-emerald-700 hover:bg-emerald-50 rounded font-medium text-[11px] cursor-pointer"
                                >
                                  Reactivate
                                </button>
                              ) : null}
                            </>
                          )}
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

      {/* Level Transfer Confirmation Modal */}
      {transferModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-[#FDC3D1] shadow-2xl p-6 space-y-5 animate-fadeIn">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#2E1826] flex items-center gap-2">
                  <ArrowRightLeft className="h-4 w-4 text-[#FF5C89]" />
                  Transfer Role & Admin Level
                </h3>
                <p className="text-xs text-[#826674] mt-0.5">
                  Update authorization tier for <strong>{transferModalUser.displayName}</strong> ({transferModalUser.email}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTransferModalUser(null)}
                className="p-1 rounded-lg text-[#826674] hover:text-[#2E1826] hover:bg-[#FFF7F9] cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {transferError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{transferError}</span>
              </div>
            )}

            <form onSubmit={handleExecuteTransfer} className="space-y-4 text-xs">
              {/* Hierarchy Options */}
              <div className="space-y-2.5">
                <label className="block font-bold text-[#2E1826]">
                  Select Target Tier
                </label>

                {/* Option 1: Master Admin */}
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    targetRole === 'ADMIN' && targetAdminLevel === 'MASTER'
                      ? 'border-[#FF5C89] bg-[#FFF7F9] shadow-xs'
                      : 'border-[#FDC3D1]/70 hover:border-[#FF5C89]/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="levelChoice"
                    checked={targetRole === 'ADMIN' && targetAdminLevel === 'MASTER'}
                    onChange={() => {
                      setTargetRole('ADMIN');
                      setTargetAdminLevel('MASTER');
                    }}
                    className="mt-1 text-[#FF5C89] focus:ring-[#FF5C89]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-[#2E1826]">Master Admin</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                        Tier 1 · Root
                      </span>
                    </div>
                    <p className="text-[11px] text-[#826674] mt-0.5 leading-relaxed">
                      Highest authority. Can transfer admin levels, manage system settings, register/remove ESP32 hardware, and approve all staff.
                    </p>
                  </div>
                </label>

                {/* Option 2: Standard Admin */}
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    targetRole === 'ADMIN' && targetAdminLevel === 'STANDARD'
                      ? 'border-[#FF5C89] bg-[#FFF7F9] shadow-xs'
                      : 'border-[#FDC3D1]/70 hover:border-[#FF5C89]/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="levelChoice"
                    checked={targetRole === 'ADMIN' && targetAdminLevel === 'STANDARD'}
                    onChange={() => {
                      setTargetRole('ADMIN');
                      setTargetAdminLevel('STANDARD');
                    }}
                    className="mt-1 text-[#FF5C89] focus:ring-[#FF5C89]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-[#2E1826]">Standard Admin</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800 uppercase">
                        Tier 2
                      </span>
                    </div>
                    <p className="text-[11px] text-[#826674] mt-0.5 leading-relaxed">
                      Operational dispatcher. Can manage fleet temperature limits, fan/mist overrides, driver assignments, and monitor real-time shuttle telemetry.
                    </p>
                  </div>
                </label>

                {/* Option 3: Driver */}
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    targetRole === 'DRIVER'
                      ? 'border-[#FF5C89] bg-[#FFF7F9] shadow-xs'
                      : 'border-[#FDC3D1]/70 hover:border-[#FF5C89]/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="levelChoice"
                    checked={targetRole === 'DRIVER'}
                    onChange={() => {
                      setTargetRole('DRIVER');
                    }}
                    className="mt-1 text-[#FF5C89] focus:ring-[#FF5C89]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-[#2E1826]">Driver</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 uppercase">
                        Tier 3 · Cabin
                      </span>
                    </div>
                    <p className="text-[11px] text-[#826674] mt-0.5 leading-relaxed">
                      Shuttle operator. Authorized to view cabin readings and status of specifically assigned ESP32 units only.
                    </p>
                  </div>
                </label>
              </div>

              {/* Transfer Reason Input */}
              <div>
                <label className="block font-semibold text-[#2E1826] mb-1">
                  Transfer Note / Reason <span className="font-normal text-[#826674]">(logged to system audit)</span>
                </label>
                <input
                  type="text"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  placeholder="e.g. Promoted to Master Admin, Route reassignment"
                  className="w-full bg-[#FFF7F9]/50 border border-[#FDC3D1] rounded-xl px-3.5 py-2 text-xs text-[#2E1826] focus:outline-none focus:ring-2 focus:ring-[#FF5C89]/30 focus:border-[#FF5C89]"
                />
              </div>

              {/* Confirmation Checkbox */}
              <div className="p-3 bg-[#FFF7F9]/80 rounded-xl border border-[#FDC3D1] space-y-1.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={transferConfirmed}
                    onChange={(e) => setTransferConfirmed(e.target.checked)}
                    className="mt-0.5 rounded border-[#FDC3D1] text-[#FF5C89] focus:ring-[#FF5C89] cursor-pointer"
                  />
                  <span className="text-[11px] text-[#2E1826] font-medium leading-relaxed">
                    I confirm transferring <strong>{transferModalUser.displayName}</strong> to{' '}
                    <span className="font-bold text-[#C72C5E]">
                      {targetRole === 'ADMIN' ? (targetAdminLevel === 'MASTER' ? 'Master Admin' : 'Standard Admin') : 'Driver'}
                    </span>
                    . This takes effect immediately in real-time.
                  </span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#FDC3D1]">
                <button
                  type="button"
                  onClick={() => setTransferModalUser(null)}
                  className="px-4 py-2 rounded-xl border border-[#FDC3D1] text-[#826674] hover:bg-[#FFF7F9] font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!transferConfirmed || transferLoading}
                  className="px-4 py-2 rounded-xl bg-[#FF5C89] hover:bg-[#C72C5E] text-white font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  {transferLoading ? (
                    <span>Transferring...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Confirm Level Transfer</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
