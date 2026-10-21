import React from 'react';
import { ShieldX, LogOut } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface AccessDeniedPageProps {
  navigate: (path: string) => void;
}

export const AccessDeniedPage: React.FC<AccessDeniedPageProps> = ({ navigate }) => {
  const { userProfile, logout } = useApp();

  const isSuspended = userProfile?.status === 'SUSPENDED';

  return (
    <div className="min-h-screen bg-[#FFF7F9] flex flex-col justify-center items-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl border border-rose-200 shadow-sm p-8 text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
          <ShieldX className="h-8 w-8" />
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#2E1826]">
            {isSuspended ? 'Account Suspended' : 'Access Denied'}
          </h1>
          <p className="mt-2 text-sm text-[#826674] leading-relaxed">
            {isSuspended
              ? 'Your account has been suspended by an administrator. Telemetry and relay management access is currently restricted.'
              : 'Your access request was rejected or your permissions are insufficient to view this application.'}
          </p>
        </div>

        <button
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out & Return to Login
        </button>
      </div>
    </div>
  );
};
