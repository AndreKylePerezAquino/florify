import React, { createContext, useContext, useEffect, useState, useMemo, useRef, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  deleteField,
} from 'firebase/firestore';
import {
  auth,
  db,
  signInWithGoogle,
  signInWithEmail,
  registerWithEmail,
  sendPasswordReset,
  signOutUser,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  UserProfile,
  UserRole,
  UserStatus,
  Device,
  DeviceConfig,
  Alert,
  AuditLog,
} from '../types';

interface AppContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loadingAuth: boolean;
  isAdminClaimed: boolean;
  checkAdminClaimed: () => Promise<boolean>;
  devices: Device[];
  deviceConfigs: Record<string, DeviceConfig>;
  alerts: Alert[];
  auditLogs: AuditLog[];
  allUsers: UserProfile[];
  pendingUsersCount: number;
  activeAlertsCount: number;
  devicesWithFansOnCount: number;
  login: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signupWithEmail: (
    email: string,
    password: string,
    displayName: string,
    asAdmin?: boolean,
    adminSetupCode?: string
  ) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  approveUser: (uid: string, role?: UserRole) => Promise<void>;
  rejectUser: (uid: string) => Promise<void>;
  suspendUser: (uid: string) => Promise<void>;
  registerDevice: (deviceId: string, displayName: string, locationLabel?: string, driverUid?: string | null) => Promise<void>;
  assignDevice: (deviceId: string, driverUid: string | null) => Promise<void>;
  updateConfig: (deviceId: string, config: Partial<DeviceConfig>) => Promise<void>;
  setFanOverride: (deviceId: string, mode: 'FORCE_ON' | 'FORCE_OFF', durationMinutes: number, reason: string) => Promise<void>;
  returnToAuto: (deviceId: string) => Promise<void>;
  toggleDeviceStatus: (deviceId: string, active: boolean) => Promise<void>;
  rotateDeviceCredential: (deviceId: string) => Promise<string>;
  acknowledgeAlert: (alertId: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Environment configured master admin credentials
const ENV_ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.trim();
const ENV_ADMIN_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined)?.trim();
const ENV_ADMIN_USERNAME = (import.meta.env.VITE_ADMIN_USERNAME as string | undefined)?.trim();

const isEnvAdminEmail = (emailToCheck?: string | null): boolean => {
  if (!emailToCheck) return false;
  const lower = emailToCheck.trim().toLowerCase();
  if (ENV_ADMIN_EMAIL && lower === ENV_ADMIN_EMAIL.toLowerCase()) return true;
  if (ENV_ADMIN_USERNAME && lower === `${ENV_ADMIN_USERNAME.toLowerCase()}@florify.internal`) return true;
  return false;
};

/**
 * Strips properties whose value is undefined, which Firestore rejects as invalid data.
 */
function cleanFirestoreData<T extends Record<string, any>>(obj: T): T {
  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = value;
    }
  }
  return clean as T;
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isAdminClaimed, setIsAdminClaimed] = useState<boolean>(false);
  const pendingRegistrationRef = useRef<{ asAdmin: boolean; displayName: string } | null>(null);

  // Pure production state - zero mock fixtures
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceConfigs, setDeviceConfigs] = useState<Record<string, DeviceConfig>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // Check if system administrator has already been claimed
  const checkAdminClaimed = async (): Promise<boolean> => {
    try {
      const claimSnap = await getDoc(doc(db, 'system', 'adminClaim'));
      const claimed = claimSnap.exists();
      setIsAdminClaimed(claimed);
      return claimed;
    } catch (e) {
      console.warn('Notice checking system/adminClaim:', e);
      return false;
    }
  };

  useEffect(() => {
    checkAdminClaimed();
  }, []);

  // Monitor Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userDocRef);

          const isEnvAdmin = isEnvAdminEmail(user.email);
          const userEmailLower = user.email?.toLowerCase();
          const isBootstrapEmail =
            userEmailLower === 'andrekyle26o@gmail.com' ||
            userEmailLower === 'newroskoto@gmail.com' ||
            isEnvAdmin;

          if (snap.exists()) {
            const data = snap.data() as UserProfile;
            // Root bootstrap and env admin accounts automatically maintain ADMIN + APPROVED
            if (isBootstrapEmail && (data.role !== 'ADMIN' || data.status !== 'APPROVED')) {
              const updated: Partial<UserProfile> = {
                role: 'ADMIN',
                status: 'APPROVED',
                updatedAt: new Date().toISOString(),
                approvedBy: isEnvAdmin ? 'ENV_ADMIN_CONFIG' : 'SYSTEM_BOOTSTRAP',
              };
              await updateDoc(userDocRef, updated);
              setUserProfile({ ...data, ...updated } as UserProfile);
            } else {
              setUserProfile(data);
            }

            // Sync admin claimed flag if this user is an admin
            if (data.role === 'ADMIN' && data.status === 'APPROVED') {
              setIsAdminClaimed(true);
            }
          } else {
            // New user registration flow
            const pendingData = pendingRegistrationRef.current;
            pendingRegistrationRef.current = null;

            let willBeAdmin = isBootstrapEmail;
            if (!willBeAdmin && pendingData?.asAdmin) {
              try {
                const claimSnap = await getDoc(doc(db, 'system', 'adminClaim'));
                if (!claimSnap.exists()) {
                  willBeAdmin = true;
                }
              } catch (e) {
                console.warn('Admin claim status check notice:', e);
                willBeAdmin = true;
              }
            }

            const initialRole: UserRole = willBeAdmin ? 'ADMIN' : 'DRIVER';
            const initialStatus: UserStatus = willBeAdmin ? 'APPROVED' : 'PENDING';

            const newProfileData: Record<string, any> = {
              uid: user.uid,
              displayName: pendingData?.displayName || user.displayName || user.email?.split('@')[0] || 'User',
              email: user.email || '',
              role: initialRole,
              status: initialStatus,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            // Only attach optional fields if they have concrete valid values (Firestore rejects undefined)
            if (user.photoURL) {
              newProfileData.photoURL = user.photoURL;
            }

            if (willBeAdmin) {
              newProfileData.approvedAt = new Date().toISOString();
              newProfileData.approvedBy = isEnvAdmin
                ? 'ENV_ADMIN_CONFIG'
                : isBootstrapEmail
                ? 'SYSTEM_BOOTSTRAP'
                : 'ONE_TIME_ADMIN_CREATION';
            }

            await setDoc(userDocRef, cleanFirestoreData(newProfileData));

            if (willBeAdmin) {
              try {
                await setDoc(doc(db, 'system', 'adminClaim'), {
                  claimedBy: user.uid,
                  email: user.email || '',
                  claimedAt: new Date().toISOString(),
                  source: isEnvAdmin ? 'ENV_ADMIN_CONFIG' : isBootstrapEmail ? 'SYSTEM_BOOTSTRAP' : 'ONE_TIME_ADMIN_SETUP',
                });
                setIsAdminClaimed(true);
              } catch (claimErr) {
                console.warn('System adminClaim doc notice:', claimErr);
              }
            }

            setUserProfile(newProfileData as UserProfile);
          }
        } catch (err) {
          console.error('Error fetching or creating user profile in Firestore:', err);
        }
      } else {
        setUserProfile(null);
        setDevices([]);
        setAlerts([]);
        setAllUsers([]);
        setAuditLogs([]);
      }
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  // Listen to Firestore real-time collections when user is authenticated and approved
  useEffect(() => {
    if (!currentUser || !userProfile || userProfile.status !== 'APPROVED') {
      setDevices([]);
      setAlerts([]);
      setAllUsers([]);
      setAuditLogs([]);
      return;
    }

    const isAdmin = userProfile.role === 'ADMIN';

    // 1. Devices listener
    let devicesQuery;
    if (isAdmin) {
      devicesQuery = collection(db, 'devices');
    } else {
      // Drivers only get devices directly assigned to their account
      devicesQuery = query(collection(db, 'devices'), where('assignedDriverUid', '==', currentUser.uid));
    }

    const unsubDevices = onSnapshot(
      devicesQuery,
      (snapshot) => {
        const devList: Device[] = [];
        snapshot.forEach((d) => devList.push(d.data() as Device));
        setDevices(devList);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'devices');
      }
    );

    // 2. Alerts listener
    let alertsQuery;
    if (isAdmin) {
      alertsQuery = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'), limit(50));
    } else {
      alertsQuery = query(collection(db, 'alerts'), orderBy('createdAt', 'desc'), limit(20));
    }

    const unsubAlerts = onSnapshot(
      alertsQuery,
      (snapshot) => {
        const alertList: Alert[] = [];
        snapshot.forEach((d) => alertList.push({ id: d.id, ...(d.data() as Omit<Alert, 'id'>) }));
        setAlerts(alertList);
      },
      (error) => {
        console.warn('Alerts listener notice:', error.message);
      }
    );

    // 3. Admin listeners (Users, Audit Logs)
    let unsubUsers = () => {};
    let unsubAudit = () => {};

    if (isAdmin) {
      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          const uList: UserProfile[] = [];
          snapshot.forEach((d) => uList.push(d.data() as UserProfile));
          setAllUsers(uList);
        },
        (error) => {
          console.warn('Users listener notice:', error.message);
        }
      );

      const auditQuery = query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(100));
      unsubAudit = onSnapshot(
        auditQuery,
        (snapshot) => {
          const logs: AuditLog[] = [];
          snapshot.forEach((d) => logs.push({ id: d.id, ...(d.data() as Omit<AuditLog, 'id'>) }));
          setAuditLogs(logs);
        },
        (error) => {
          console.warn('Audit logs listener notice:', error.message);
        }
      );
    }

    return () => {
      unsubDevices();
      unsubAlerts();
      unsubUsers();
      unsubAudit();
    };
  }, [currentUser, userProfile]);

  // Auth actions
  const login = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Google Sign-In failed:', error);
      throw error;
    }
  };

  const loginWithEmail = async (identifier: string, password: string) => {
    const rawId = identifier.trim();
    let targetEmail = rawId;

    // Check if entered credentials match the configured admin environment variables
    const isMatchingAdminUsername =
      !!ENV_ADMIN_USERNAME && rawId.toLowerCase() === ENV_ADMIN_USERNAME.toLowerCase();
    const isMatchingAdminPrefix =
      !!ENV_ADMIN_EMAIL &&
      !rawId.includes('@') &&
      rawId.toLowerCase() === ENV_ADMIN_EMAIL.split('@')[0].toLowerCase();
    const isMatchingAdminEmail =
      !!ENV_ADMIN_EMAIL && rawId.toLowerCase() === ENV_ADMIN_EMAIL.toLowerCase();

    const isEnvAdminAttempt = isMatchingAdminUsername || isMatchingAdminPrefix || isMatchingAdminEmail;
    const isEnvPasswordValid = ENV_ADMIN_PASSWORD ? password === ENV_ADMIN_PASSWORD : true;
    const isEnvAdminMatch = isEnvAdminAttempt && isEnvPasswordValid;

    // If identifier doesn't have an email domain, resolve it
    if (!targetEmail.includes('@')) {
      if (ENV_ADMIN_EMAIL && (isMatchingAdminUsername || isMatchingAdminPrefix)) {
        targetEmail = ENV_ADMIN_EMAIL;
      } else {
        targetEmail = `${rawId}@florify.internal`;
      }
    }

    try {
      await signInWithEmail(targetEmail, password);
    } catch (error: any) {
      // If entered credentials match the configured VITE_ADMIN credentials and account is not found in Firebase Auth yet,
      // register it on-the-fly with admin privileges
      const isNotFoundOrInvalid =
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/invalid-login-credentials';

      if (isEnvAdminMatch && isNotFoundOrInvalid) {
        try {
          pendingRegistrationRef.current = { asAdmin: true, displayName: 'System Administrator' };
          await registerWithEmail(targetEmail, password, 'System Administrator');
          return;
        } catch (regError) {
          console.warn('Auto-registering env admin account in Firebase failed:', regError);
          throw error;
        }
      }

      console.error('Email Sign-In failed:', error);
      throw error;
    }
  };

  const signupWithEmail = async (
    email: string,
    password: string,
    displayName: string,
    asAdmin: boolean = false,
    _adminSetupCode?: string
  ) => {
    try {
      const willBeAdmin = asAdmin || isEnvAdminEmail(email);
      pendingRegistrationRef.current = { asAdmin: willBeAdmin, displayName: displayName.trim() };
      await registerWithEmail(email, password, displayName);
    } catch (error) {
      pendingRegistrationRef.current = null;
      console.error('Email Sign-Up failed:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordReset(email);
    } catch (error) {
      console.error('Password reset failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    await signOutUser();
    setUserProfile(null);
  };

  // User management actions
  const logAuditEvent = async (
    action: string,
    targetType: string,
    targetId: string,
    details: string
  ) => {
    if (!currentUser) return;
    try {
      const logDocRef = doc(collection(db, 'auditLogs'));
      await setDoc(logDocRef, cleanFirestoreData({
        actorUid: currentUser.uid,
        actorRole: userProfile?.role || 'ADMIN',
        action,
        targetType,
        targetId,
        details,
        createdAt: new Date().toISOString(),
      }));
    } catch (e) {
      console.warn('Notice writing audit log:', e);
    }
  };

  const approveUser = async (uid: string, role: UserRole = 'DRIVER') => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'APPROVED',
        role,
        approvedAt: new Date().toISOString(),
        approvedBy: currentUser?.uid || 'admin',
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent('USER_APPROVED', 'USER', uid, `Approved user ${uid} as ${role}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const rejectUser = async (uid: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'REJECTED',
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent('USER_REJECTED', 'USER', uid, `Rejected user application for ${uid}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const suspendUser = async (uid: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'SUSPENDED',
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent('USER_SUSPENDED', 'USER', uid, `Suspended account ${uid}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  // Device management actions
  const registerDevice = async (
    deviceId: string,
    displayName: string,
    locationLabel?: string,
    driverUid: string | null = null
  ) => {
    const cleanId = deviceId.trim().toUpperCase();
    const newDevice: Record<string, any> = {
      deviceId: cleanId,
      displayName: displayName.trim(),
      assignedDriverUid: driverUid || null,
      active: true,
      status: 'OFFLINE',
      firmwareVersion: 'v2.1.0-prod',
      sensorType: 'DHT11',
      latestFanState: 'OFF',
      reportedMode: 'AUTO',
      reportedConfigVersion: 1,
      desiredConfigVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (locationLabel?.trim()) {
      newDevice.locationLabel = locationLabel.trim();
    }

    const initialConfig: DeviceConfig = {
      temperatureEnabled: true,
      temperatureOnC: 40.0,
      temperatureOffC: 38.0,
      humidityEnabled: true,
      humidityOnRH: 75.0,
      humidityOffRH: 65.0,
      activationMode: 'ANY',
      fanMode: 'AUTO',
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.uid || 'admin',
      version: 1,
    };

    try {
      await setDoc(doc(db, 'devices', cleanId), cleanFirestoreData(newDevice));
      await setDoc(doc(db, 'devices', cleanId, 'config', 'current'), cleanFirestoreData(initialConfig));
      await logAuditEvent('DEVICE_REGISTERED', 'DEVICE', cleanId, `Registered ESP32 device ${displayName.trim()} (${cleanId})`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `devices/${cleanId}`);
    }
  };

  const assignDevice = async (deviceId: string, driverUid: string | null) => {
    try {
      await updateDoc(doc(db, 'devices', deviceId), {
        assignedDriverUid: driverUid,
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent(
        'DEVICE_ASSIGNED',
        'DEVICE',
        deviceId,
        driverUid ? `Assigned to driver UID: ${driverUid}` : 'Unassigned driver from device'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `devices/${deviceId}`);
    }
  };

  const updateConfig = async (deviceId: string, partialConfig: Partial<DeviceConfig>) => {
    const configRef = doc(db, 'devices', deviceId, 'config', 'current');
    const existingSnap = await getDoc(configRef);
    const existing = existingSnap.exists() ? (existingSnap.data() as DeviceConfig) : { version: 1 };

    const ext = existing as any;
    const newVersion = (ext.version || 1) + 1;
    const updated: Record<string, any> = {
      temperatureEnabled: partialConfig.temperatureEnabled ?? ext.temperatureEnabled ?? true,
      temperatureOnC: partialConfig.temperatureOnC ?? ext.temperatureOnC ?? 40.0,
      temperatureOffC: partialConfig.temperatureOffC ?? ext.temperatureOffC ?? 38.0,
      humidityEnabled: partialConfig.humidityEnabled ?? ext.humidityEnabled ?? true,
      humidityOnRH: partialConfig.humidityOnRH ?? ext.humidityOnRH ?? 75.0,
      humidityOffRH: partialConfig.humidityOffRH ?? ext.humidityOffRH ?? 65.0,
      activationMode: partialConfig.activationMode ?? ext.activationMode ?? 'ANY',
      fanMode: partialConfig.fanMode ?? ext.fanMode ?? 'AUTO',
      version: newVersion,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.uid || 'admin',
    };

    if (partialConfig.overrideExpiresAt !== undefined) {
      updated.overrideExpiresAt = partialConfig.overrideExpiresAt;
    }
    if (partialConfig.overrideReason !== undefined) {
      updated.overrideReason = partialConfig.overrideReason;
    }

    try {
      await setDoc(configRef, cleanFirestoreData(updated));
      await updateDoc(doc(db, 'devices', deviceId), {
        desiredConfigVersion: newVersion,
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent('CONFIG_UPDATED', 'CONFIG', deviceId, `Updated configuration to v${newVersion}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `devices/${deviceId}/config/current`);
    }
  };

  const setFanOverride = async (
    deviceId: string,
    mode: 'FORCE_ON' | 'FORCE_OFF',
    durationMinutes: number,
    reason: string
  ) => {
    const expiry = new Date(Date.now() + durationMinutes * 60000).toISOString();
    await updateConfig(deviceId, {
      fanMode: mode,
      overrideExpiresAt: expiry,
      overrideReason: reason,
    });
    await logAuditEvent('FAN_OVERRIDE', 'DEVICE', deviceId, `Manual fan override to ${mode} (${durationMinutes}m): ${reason}`);
  };

  const returnToAuto = async (deviceId: string) => {
    const configRef = doc(db, 'devices', deviceId, 'config', 'current');
    const existingSnap = await getDoc(configRef);
    const existing = existingSnap.exists() ? (existingSnap.data() as DeviceConfig) : { version: 1 };
    const newVersion = (existing.version || 1) + 1;

    try {
      await updateDoc(configRef, {
        fanMode: 'AUTO',
        overrideExpiresAt: deleteField(),
        overrideReason: deleteField(),
        version: newVersion,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.uid || 'admin',
      });
      await updateDoc(doc(db, 'devices', deviceId), {
        desiredConfigVersion: newVersion,
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent('FAN_RETURN_AUTO', 'DEVICE', deviceId, 'Returned fan actuation to AUTO sensor hysteresis');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `devices/${deviceId}/config/current`);
    }
  };

  const toggleDeviceStatus = async (deviceId: string, active: boolean) => {
    try {
      await updateDoc(doc(db, 'devices', deviceId), {
        active,
        status: active ? 'ONLINE' : 'DISABLED',
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent('DEVICE_STATUS_TOGGLED', 'DEVICE', deviceId, `Device toggled to ${active ? 'ACTIVE' : 'DISABLED'}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `devices/${deviceId}`);
    }
  };

  const rotateDeviceCredential = async (deviceId: string): Promise<string> => {
    const newSecret = `esp32_sec_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
    await logAuditEvent('CREDENTIAL_ROTATED', 'DEVICE', deviceId, 'Regenerated ESP32 authentication pre-shared key');
    return newSecret;
  };

  const acknowledgeAlert = async (alertId: string) => {
    try {
      await updateDoc(doc(db, 'alerts', alertId), {
        acknowledged: true,
        acknowledgedBy: currentUser?.uid || 'admin',
        acknowledgedAt: new Date().toISOString(),
      });
      await logAuditEvent('ALERT_ACKNOWLEDGED', 'ALERT', alertId, `Acknowledged system alert ${alertId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `alerts/${alertId}`);
    }
  };

  // Metrics derived from live Firestore collections
  const pendingUsersCount = useMemo(() => {
    return allUsers.filter((u) => u.status === 'PENDING').length;
  }, [allUsers]);

  const activeAlertsCount = useMemo(() => {
    return alerts.filter((a) => !a.acknowledged).length;
  }, [alerts]);

  const devicesWithFansOnCount = useMemo(() => {
    return devices.filter((d) => d.latestFanState === 'ON').length;
  }, [devices]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        userProfile,
        loadingAuth,
        isAdminClaimed,
        checkAdminClaimed,
        devices,
        deviceConfigs,
        alerts,
        auditLogs,
        allUsers,
        pendingUsersCount,
        activeAlertsCount,
        devicesWithFansOnCount,
        login,
        loginWithEmail,
        signupWithEmail,
        resetPassword,
        logout,
        approveUser,
        rejectUser,
        suspendUser,
        registerDevice,
        assignDevice,
        updateConfig,
        setFanOverride,
        returnToAuto,
        toggleDeviceStatus,
        rotateDeviceCredential,
        acknowledgeAlert,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
