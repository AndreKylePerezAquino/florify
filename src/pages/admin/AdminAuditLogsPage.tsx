import React, { useState } from 'react';
import {
  FileText,
  Search,
  Filter,
  Shield,
  Clock,
  User as UserIcon,
  CheckCircle2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AdminAuditLogsPage: React.FC = () => {
  const { auditLogs } = useApp();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredLogs = auditLogs.filter((log) => {
    return (
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.targetId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.actorUid.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">Administrative Audit Trail</h1>
        <p className="text-xs text-[#826674] mt-0.5">
          Immutable server-side audit logs recording security assignments, threshold modifications, and fan overrides.
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#FDC3D1] shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-[#826674]" />
          <input
            type="text"
            placeholder="Search audit trail by action, device, actor, or details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#FFF7F9]/40 border border-[#FDC3D1] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#2E1826] focus:outline-none focus:border-[#FF5C89]"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-[#FDC3D1] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#FDC3D1] bg-[#FFF7F9]/50 text-[#826674] font-semibold">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Entity</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#FDC3D1]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#826674]">
                    No audit log records match the search filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#FFF7F9]/30 transition-colors">
                    {/* Timestamp */}
                    <td className="py-3 px-4 font-mono text-[#826674] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 font-mono">
                      <span className="font-bold text-[#C72C5E] bg-[#FFF7F9] px-2 py-0.5 rounded border border-[#FDC3D1] text-[11px]">
                        {log.action}
                      </span>
                    </td>

                    {/* Target */}
                    <td className="py-3 px-4 font-mono text-[#2E1826]">
                      <span className="font-bold">{log.targetId}</span>
                      <span className="text-[10px] text-[#826674] block font-sans uppercase">
                        {log.targetType}
                      </span>
                    </td>

                    {/* Actor */}
                    <td className="py-3 px-4 text-[#826674] font-mono text-[11px]">
                      <span className="font-semibold text-[#2E1826] block">{log.actorRole}</span>
                      <span className="truncate max-w-[120px] block">{log.actorUid}</span>
                    </td>

                    {/* Details */}
                    <td className="py-3 px-4 text-[#2E1826] leading-relaxed max-w-md">
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
