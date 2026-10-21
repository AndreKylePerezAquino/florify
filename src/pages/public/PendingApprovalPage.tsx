import React from 'react';
import { Clock, ShieldAlert, LogOut, RefreshCw, Mail } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface PendingApprovalPageProps {
  navigate: (path: string) => void;
}

export const PendingApprovalPage: React.FC<PendingApprovalPageProps> = ({ navigate }) => {
  const { currentUser, userProfile, logout } = useApp();

  return (
    <div className="min-h-screen bg-[#FFF7F9] flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#FDC3D1] shadow-sm p-8 text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
          <Clock className="h-8 w-8" />
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">
            Access Request Pending Approval
          </h1>
          <p className="mt-2 text-sm text-[#826674] leading-relaxed">
            Your account has been authenticated, but your driver access request is waiting for administrator review.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#FFF7F9] border border-[#FDC3D1] text-left text-xs space-y-2">
          <div className="flex items-center justify-between text-[#826674]">
            <span>Account Email:</span>
            <span className="font-mono font-medium text-[#2E1826]">{currentUser?.email}</span>
          </div>
          <div className="flex items-center justify-between text-[#826674]">
            <span>Requested Role:</span>
            <span className="font-semibold text-[#C72C5E]">DRIVER</span>
          </div>
          <div className="flex items-center justify-between text-[#826674]">
            <span>Status:</span>
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              PENDING REVIEW
            </span>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#FF5C89] text-white text-xs font-semibold hover:bg-[#C72C5E] transition-colors shadow-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Check Approval Status
          </button>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-[#FDC3D1] bg-white text-rose-600 text-xs font-semibold hover:bg-rose-50 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
