import React from 'react';
import { User, LogOut, ShieldCheck, Mail, KeyRound, Clock, ArrowLeft } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface ProfilePageProps {
  navigate: (path: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ navigate }) => {
  const { currentUser, userProfile, logout } = useApp();

  const role = userProfile?.role || 'DRIVER';

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(role === 'ADMIN' ? '/admin' : '/driver')}
          className="p-1.5 rounded-lg border border-[#FDC3D1] bg-white hover:bg-[#FFF7F9] text-[#C72C5E] cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">User Profile</h1>
      </div>

      <div className="bg-white rounded-2xl border border-[#FDC3D1] shadow-xs p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-[#FF5C89] text-white flex items-center justify-center font-bold text-xl uppercase shadow-xs">
            {userProfile?.displayName?.charAt(0) || 'U'}
          </div>
          <div>
            <h2 className="text-base font-bold text-[#2E1826]">
              {userProfile?.displayName || 'User'}
            </h2>
            <p className="text-xs font-mono text-[#826674]">
              {userProfile?.email || currentUser?.email || ''}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded bg-[#FFF7F9] text-[#C72C5E] border border-[#FDC3D1]">
                ROLE: {role}
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                ACTIVE
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-[#FDC3D1] pt-4 divide-y divide-[#FDC3D1] text-xs">
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-[#826674] flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-[#C72C5E]" />
              Account UID
            </span>
            <span className="font-mono text-[#2E1826] truncate max-w-[240px]">
              {userProfile?.uid || currentUser?.uid || 'simulated-user-uid'}
            </span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <span className="text-[#826674] flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#C72C5E]" />
              Authentication Provider
            </span>
            <span className="font-medium text-[#2E1826]">Google Identity (OAuth 2.0)</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <span className="text-[#826674] flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[#C72C5E]" />
              Approval Date
            </span>
            <span className="text-[#2E1826]">
              {userProfile?.approvedAt ? new Date(userProfile.approvedAt).toLocaleDateString() : 'Approved at setup'}
            </span>
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
