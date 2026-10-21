import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';

import { LoginPage } from './pages/public/LoginPage';
import { PendingApprovalPage } from './pages/public/PendingApprovalPage';
import { AccessDeniedPage } from './pages/public/AccessDeniedPage';

import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import { AdminDevicesPage } from './pages/admin/AdminDevicesPage';
import { AdminDeviceDetailPage } from './pages/admin/AdminDeviceDetailPage';
import { AdminDeviceSettingsPage } from './pages/admin/AdminDeviceSettingsPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminAlertsPage } from './pages/admin/AdminAlertsPage';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage';

import { DriverDashboardPage } from './pages/driver/DriverDashboardPage';
import { DriverDeviceDetailPage } from './pages/driver/DriverDeviceDetailPage';

import { ProfilePage } from './pages/shared/ProfilePage';
import { InteractiveGardenPage } from './pages/shared/InteractiveGardenPage';
import { NotFoundPage } from './pages/shared/NotFoundPage';

const AppContent: React.FC = () => {
  const { currentUser, userProfile, loadingAuth } = useApp();

  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname && window.location.pathname !== '/'
      ? window.location.pathname
      : '/login';
  });

  // Sync state with browser URL
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    setCurrentPath(path);
    window.history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle Route Guards based on authenticated Firebase user & Firestore profile
  useEffect(() => {
    if (loadingAuth) return;

    if (!currentUser) {
      if (currentPath !== '/login') {
        navigate('/login');
      }
      return;
    }

    if (currentUser && userProfile) {
      if (userProfile.status === 'PENDING') {
        if (currentPath !== '/pending-approval') {
          navigate('/pending-approval');
        }
        return;
      }

      if (userProfile.status === 'REJECTED' || userProfile.status === 'SUSPENDED') {
        if (currentPath !== '/access-denied') {
          navigate('/access-denied');
        }
        return;
      }

      // Approved users: redirect from entry screens to authorized dashboard
      if (currentPath === '/login' || currentPath === '/pending-approval' || currentPath === '/') {
        navigate(userProfile.role === 'ADMIN' ? '/admin' : '/driver');
        return;
      }

      // Guard: Drivers cannot access /admin routes
      if (userProfile.role === 'DRIVER' && currentPath.startsWith('/admin')) {
        navigate('/driver');
        return;
      }
    }
  }, [currentUser, userProfile, loadingAuth, currentPath]);

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#FFF7F9] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-3 border-[#FF5C89] border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-[#C72C5E]">Connecting to Shuttle Climate Network...</span>
        </div>
      </div>
    );
  }

  // Router view selector
  const renderRoute = () => {
    // Public routes
    if (currentPath === '/login') {
      return <LoginPage navigate={navigate} />;
    }
    if (currentPath === '/pending-approval') {
      return <PendingApprovalPage navigate={navigate} />;
    }
    if (currentPath === '/access-denied') {
      return <AccessDeniedPage navigate={navigate} />;
    }

    // Admin routes
    if (currentPath === '/admin') {
      return <AdminOverviewPage navigate={navigate} />;
    }
    if (currentPath === '/admin/devices') {
      return <AdminDevicesPage navigate={navigate} />;
    }
    if (currentPath.startsWith('/admin/devices/') && currentPath.endsWith('/settings')) {
      const parts = currentPath.split('/');
      const deviceId = parts[3];
      return <AdminDeviceSettingsPage deviceId={deviceId} navigate={navigate} />;
    }
    if (currentPath.startsWith('/admin/devices/')) {
      const parts = currentPath.split('/');
      const deviceId = parts[3];
      return <AdminDeviceDetailPage deviceId={deviceId} navigate={navigate} />;
    }
    if (currentPath === '/admin/users') {
      return <AdminUsersPage />;
    }
    if (currentPath === '/admin/alerts') {
      return <AdminAlertsPage />;
    }
    if (currentPath === '/admin/audit-logs') {
      return <AdminAuditLogsPage />;
    }

    // Driver routes
    if (currentPath === '/driver') {
      return <DriverDashboardPage navigate={navigate} />;
    }
    if (currentPath.startsWith('/driver/devices/')) {
      const parts = currentPath.split('/');
      const deviceId = parts[3];
      return <DriverDeviceDetailPage deviceId={deviceId} navigate={navigate} />;
    }

    // Shared routes
    if (currentPath === '/profile') {
      return <ProfilePage navigate={navigate} />;
    }
    if (currentPath === '/garden') {
      return <InteractiveGardenPage navigate={navigate} />;
    }

    return <NotFoundPage navigate={navigate} />;
  };

  const isPublicStandaloneRoute =
    currentPath === '/login' ||
    currentPath === '/pending-approval' ||
    currentPath === '/access-denied';

  return (
    <div className="min-h-screen bg-[#FFF7F9] flex flex-col font-sans text-[#2E1826]">
      {!isPublicStandaloneRoute && (
        <Navbar currentPath={currentPath} navigate={navigate} />
      )}

      <main className="flex-1">
        {isPublicStandaloneRoute ? (
          renderRoute()
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {renderRoute()}
          </div>
        )}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
