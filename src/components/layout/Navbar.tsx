import React, { useState } from 'react';
import {
  User as UserIcon,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface NavbarProps {
  currentPath: string;
  navigate: (path: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPath, navigate }) => {
  const {
    currentUser,
    userProfile,
    logout,
    activeAlertsCount,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const role = userProfile?.role || 'DRIVER';

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#FDC3D1] px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 h-16">
        {/* Zone 1: Single text element Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate(role === 'ADMIN' ? '/admin' : '/driver')}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
          >
            <div className="h-9 w-9 rounded-lg bg-[#FFF7F9] border border-[#FDC3D1] flex items-center justify-center p-1 group-hover:scale-105 transition-transform overflow-hidden shadow-xs">
              <img
                src="/logo.png"
                alt="Florify"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-[#C72C5E] whitespace-nowrap block">
                Florify
              </span>
              <span className="text-[11px] text-[#826674] hidden sm:block whitespace-nowrap">
                ESP32 + DHT11 Cabin Telemetry
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#826674]">
          {role === 'ADMIN' ? (
            <>
              <button
                onClick={() => navigate('/admin')}
                className={`whitespace-nowrap transition-colors hover:text-[#C72C5E] cursor-pointer ${
                  currentPath === '/admin' ? 'text-[#C72C5E] font-semibold' : ''
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => navigate('/admin/devices')}
                className={`whitespace-nowrap transition-colors hover:text-[#C72C5E] cursor-pointer ${
                  currentPath.startsWith('/admin/devices') ? 'text-[#C72C5E] font-semibold' : ''
                }`}
              >
                Devices
              </button>
              <button
                onClick={() => navigate('/admin/users')}
                className={`whitespace-nowrap transition-colors hover:text-[#C72C5E] cursor-pointer ${
                  currentPath === '/admin/users' ? 'text-[#C72C5E] font-semibold' : ''
                }`}
              >
                Drivers & Staff
              </button>
              <button
                onClick={() => navigate('/admin/alerts')}
                className={`whitespace-nowrap transition-colors hover:text-[#C72C5E] cursor-pointer flex items-center gap-1.5 ${
                  currentPath === '/admin/alerts' ? 'text-[#C72C5E] font-semibold' : ''
                }`}
              >
                Alerts
                {activeAlertsCount > 0 && (
                  <span className="relative inline-flex items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF5C89] opacity-75" />
                    <span className="relative inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold bg-[#C72C5E] text-white">
                      {activeAlertsCount}
                    </span>
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate('/admin/audit-logs')}
                className={`whitespace-nowrap transition-colors hover:text-[#C72C5E] cursor-pointer ${
                  currentPath === '/admin/audit-logs' ? 'text-[#C72C5E] font-semibold' : ''
                }`}
              >
                Audit Logs
              </button>
              <button
                onClick={() => navigate('/garden')}
                className={`whitespace-nowrap transition-colors hover:text-[#C72C5E] cursor-pointer flex items-center gap-1.5 ${
                  currentPath === '/garden' ? 'text-[#C72C5E] font-semibold' : ''
                }`}
              >
                <span className="text-base">🌸</span>
                <span>Garden</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/driver')}
                className={`whitespace-nowrap transition-colors hover:text-[#C72C5E] cursor-pointer ${
                  currentPath === '/driver' ? 'text-[#C72C5E] font-semibold' : ''
                }`}
              >
                My Shuttle Devices
              </button>
              <button
                onClick={() => navigate('/garden')}
                className={`whitespace-nowrap transition-colors hover:text-[#C72C5E] cursor-pointer flex items-center gap-1.5 ${
                  currentPath === '/garden' ? 'text-[#C72C5E] font-semibold' : ''
                }`}
              >
                <span className="text-base">🌸</span>
                <span>Garden</span>
              </button>
              <button
                onClick={() => navigate('/profile')}
                className={`whitespace-nowrap transition-colors hover:text-[#C72C5E] cursor-pointer ${
                  currentPath === '/profile' ? 'text-[#C72C5E] font-semibold' : ''
                }`}
              >
                Driver Profile
              </button>
            </>
          )}
        </nav>

        {/* Zone 3: 1 primary action cluster (User Profile) */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[#FFF7F9] text-[#2E1826] transition-colors cursor-pointer"
            >
              <div className="h-8 w-8 rounded-full bg-[#FF5C89] text-white flex items-center justify-center font-bold text-xs uppercase overflow-hidden">
                {userProfile?.displayName ? (
                  userProfile.displayName.charAt(0)
                ) : (
                  <UserIcon className="h-4 w-4" />
                )}
              </div>
            </button>

            {profileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-[#FDC3D1] py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-4 py-2 border-b border-[#FDC3D1]">
                  <p className="text-xs font-semibold text-[#C72C5E]">
                    {userProfile?.displayName || 'User'}
                  </p>
                  <p className="text-[11px] text-[#826674] truncate font-mono">
                    {userProfile?.email || currentUser?.email || ''}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-[#C72C5E] uppercase bg-[#FFF7F9] px-1.5 py-0.5 rounded border border-[#FDC3D1]">
                      Role: {role}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Approved
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    navigate('/profile');
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-[#2E1826] hover:bg-[#FFF7F9] flex items-center gap-2 cursor-pointer"
                >
                  <UserIcon className="h-3.5 w-3.5 text-[#826674]" />
                  Account Profile
                </button>

                <div className="border-t border-[#FDC3D1] mt-1 pt-1">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      logout();
                      navigate('/login');
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-[#826674] hover:text-[#C72C5E] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#FDC3D1] py-3 px-2 space-y-1">
          {role === 'ADMIN' ? (
            <>
              <button
                onClick={() => {
                  navigate('/admin');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  currentPath === '/admin' ? 'bg-[#FFF7F9] text-[#C72C5E]' : 'text-[#2E1826]'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => {
                  navigate('/admin/devices');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  currentPath.startsWith('/admin/devices') ? 'bg-[#FFF7F9] text-[#C72C5E]' : 'text-[#2E1826]'
                }`}
              >
                Devices
              </button>
              <button
                onClick={() => {
                  navigate('/admin/users');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  currentPath === '/admin/users' ? 'bg-[#FFF7F9] text-[#C72C5E]' : 'text-[#2E1826]'
                }`}
              >
                Drivers & Staff
              </button>
              <button
                onClick={() => {
                  navigate('/admin/alerts');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between ${
                  currentPath === '/admin/alerts' ? 'bg-[#FFF7F9] text-[#C72C5E]' : 'text-[#2E1826]'
                }`}
              >
                <span>Alerts</span>
                {activeAlertsCount > 0 && (
                  <span className="text-xs bg-[#C72C5E] text-white px-2 py-0.5 rounded-full font-bold">
                    {activeAlertsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  navigate('/admin/audit-logs');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  currentPath === '/admin/audit-logs' ? 'bg-[#FFF7F9] text-[#C72C5E]' : 'text-[#2E1826]'
                }`}
              >
                Audit Logs
              </button>
              <button
                onClick={() => {
                  navigate('/garden');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                  currentPath === '/garden' ? 'bg-[#FFF7F9] text-[#C72C5E]' : 'text-[#2E1826]'
                }`}
              >
                <span>🌸</span>
                <span>Interactive Garden</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  navigate('/driver');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  currentPath === '/driver' ? 'bg-[#FFF7F9] text-[#C72C5E]' : 'text-[#2E1826]'
                }`}
              >
                My Shuttle Devices
              </button>
              <button
                onClick={() => {
                  navigate('/garden');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                  currentPath === '/garden' ? 'bg-[#FFF7F9] text-[#C72C5E]' : 'text-[#2E1826]'
                }`}
              >
                <span>🌸</span>
                <span>Interactive Garden</span>
              </button>
              <button
                onClick={() => {
                  navigate('/profile');
                  setMobileMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  currentPath === '/profile' ? 'bg-[#FFF7F9] text-[#C72C5E]' : 'text-[#2E1826]'
                }`}
              >
                Driver Profile
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
};
