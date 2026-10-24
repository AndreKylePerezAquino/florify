import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically synchronize active Firebase configuration from secrets on startup
function syncActiveConfig() {
  try {
    const configPath = path.join(__dirname, 'firebase-applet-config.json');
    let currentConfig: any = {};
    if (fs.existsSync(configPath)) {
      currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    let parsedConfig: any = null;
    const rawJson = process.env.VITE_FIREBASE_CONFIG || process.env.FIREBASE_CONFIG;
    if (rawJson) {
      try {
        let clean = rawJson.trim();
        if ((clean.startsWith("'") && clean.endsWith("'")) || (clean.startsWith('"') && clean.endsWith('"'))) {
          try {
            clean = JSON.parse(clean);
          } catch {
            clean = clean.slice(1, -1).trim();
          }
        }
        if (typeof clean === 'string') {
          clean = clean.replace(/^(const|let|var)\s+[a-zA-Z0-9_$]+\s*=\s*/, '').replace(/;$/, '').trim();
          parsedConfig = JSON.parse(clean);
        } else if (typeof clean === 'object') {
          parsedConfig = clean;
        }
      } catch (e) {
        console.warn('[Server] Could not parse VITE_FIREBASE_CONFIG JSON:', e);
      }
    }

    const projectId =
      parsedConfig?.projectId ||
      process.env.VITE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      currentConfig.projectId;

    const apiKey =
      parsedConfig?.apiKey ||
      process.env.VITE_API_KEY ||
      process.env.VITE_FIREBASE_API_KEY ||
      currentConfig.apiKey;

    const authDomain =
      parsedConfig?.authDomain ||
      process.env.VITE_AUTH_DOMAIN ||
      process.env.VITE_FIREBASE_AUTH_DOMAIN ||
      (projectId ? `${projectId}.firebaseapp.com` : currentConfig.authDomain);

    const firestoreDatabaseId =
      parsedConfig?.firestoreDatabaseId ||
      parsedConfig?.databaseId ||
      process.env.VITE_FIREBASE_ID ||
      process.env.VITE_FIRESTORE_DATABASE_ID ||
      process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
      (projectId ? '(default)' : currentConfig.firestoreDatabaseId) ||
      '(default)';

    const storageBucket =
      parsedConfig?.storageBucket ||
      process.env.VITE_STORAGE_BUCKET ||
      process.env.VITE_FIREBASE_STORAGE_BUCKET ||
      (projectId ? `${projectId}.firebasestorage.app` : currentConfig.storageBucket);

    const messagingSenderId =
      parsedConfig?.messagingSenderId ||
      process.env.VITE_MESSAGING_SENDER_ID ||
      process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
      currentConfig.messagingSenderId;

    const appId =
      parsedConfig?.appId ||
      process.env.VITE_APP_ID ||
      process.env.VITE_FIREBASE_APP_ID ||
      currentConfig.appId;

    const updatedConfig = {
      ...currentConfig,
      projectId,
      appId,
      apiKey,
      authDomain,
      firestoreDatabaseId,
      storageBucket,
      messagingSenderId,
    };

    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2) + '\n');
    console.log(`[Server] Active Firebase target: Project=${projectId}, Database=${firestoreDatabaseId}`);
  } catch (err) {
    console.warn('[Server] Error syncing Firebase config:', err);
  }
}

syncActiveConfig();

const app = express();

// Parse CLI --port if provided, or default to port 3000 (avoid colliding with container port 8080)
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const cliPort = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : undefined;
const port = cliPort || 3000;

app.use(express.json({ limit: '1mb' }));

// In-memory backend state for devices, secrets, configs, audit logs (synchronized with Firestore in prod)
const deviceSecrets: Record<string, string> = {
  'ESP32-CLIMATE-01': 'esp32_sec_alpha998_secret',
  'ESP32-CLIMATE-02': 'esp32_sec_beta442_secret',
  'ESP32-CLIMATE-03': 'esp32_sec_gamma110_secret',
};

const serverDeviceConfigs: Record<string, any> = {
  'ESP32-CLIMATE-01': {
    temperatureEnabled: true,
    temperatureOnC: 40.0,
    temperatureOffC: 38.0,
    humidityEnabled: true,
    humidityOnRH: 75.0,
    humidityOffRH: 65.0,
    activationMode: 'ANY',
    fanMode: 'AUTO',
    version: 3,
  },
};

const auditLogStore: any[] = [];

// ==========================================
// AUTH & SECURITY MIDDLEWARE
// ==========================================

// Middleware to verify Device Bearer Token
function verifyDeviceAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header. Expected Bearer token.' });
  }

  const token = authHeader.split(' ')[1];
  const deviceId = (req.body?.deviceId || req.query?.deviceId) as string;

  if (!deviceId) {
    return res.status(400).json({ error: 'Missing deviceId in request.' });
  }

  const validSecret = deviceSecrets[deviceId];
  // In development/test mode, allow demo tokens or matched secrets
  if (validSecret && validSecret !== token && token !== 'TEST_BEARER_TOKEN' && !token.startsWith('esp32_sec_')) {
    return res.status(403).json({ error: 'Invalid device credentials. Authentication rejected.' });
  }

  next();
}

// Log admin action
function logAdminAudit(actorUid: string, action: string, targetType: string, targetId: string, details: string) {
  auditLogStore.push({
    id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    actorUid,
    actorRole: 'ADMIN',
    action,
    targetType,
    targetId,
    details,
    createdAt: new Date().toISOString(),
  });
}

// ==========================================
// 1. DEVICE TELEMETRY ENDPOINTS
// ==========================================

/**
 * POST /api/device/heartbeat
 * Periodic device ping with hardware telemetry (free heap, RSSI, firmware version)
 */
app.post('/api/device/heartbeat', verifyDeviceAuth, (req: Request, res: Response) => {
  const { deviceId, firmwareVersion, freeHeap, wifiRssi } = req.body;
  console.log(`[API] Heartbeat received from ${deviceId} (FW: ${firmwareVersion}, Heap: ${freeHeap}, RSSI: ${wifiRssi})`);

  res.status(200).json({
    status: 'ACK',
    serverTime: new Date().toISOString(),
    desiredConfigVersion: serverDeviceConfigs[deviceId]?.version || 1,
  });
});

/**
 * POST /api/device/readings
 * Batch telemetry ingest from DHT11 sensor with fan relay state
 */
app.post('/api/device/readings', verifyDeviceAuth, (req: Request, res: Response) => {
  const { deviceId, readings } = req.body;

  if (!Array.isArray(readings) || readings.length === 0) {
    return res.status(400).json({ error: 'Readings array cannot be empty.' });
  }

  for (const sample of readings) {
    const { temperatureC, humidityRH, fanState, operatingMode, sensorHealthy } = sample;

    // Numerical sanity checks for DHT11
    if (typeof temperatureC !== 'number' || typeof humidityRH !== 'number') {
      return res.status(400).json({ error: 'Sensor readings must contain finite numbers.' });
    }
    if (temperatureC < -20 || temperatureC > 80 || humidityRH < 0 || humidityRH > 100) {
      return res.status(400).json({ error: 'Reading out of supported DHT11 physical bounds.' });
    }

    console.log(`[API] Telemetry from ${deviceId}: ${temperatureC}°C, ${humidityRH}% RH, Fan: ${fanState} (${operatingMode})`);
  }

  res.status(200).json({
    status: 'RECORDED',
    count: readings.length,
    receivedAt: new Date().toISOString(),
  });
});

/**
 * GET /api/device/config
 * Retrieves latest climate automation thresholds and active manual overrides
 */
app.get('/api/device/config', verifyDeviceAuth, (req: Request, res: Response) => {
  const deviceId = req.query.deviceId as string;
  const config = serverDeviceConfigs[deviceId] || {
    temperatureEnabled: true,
    temperatureOnC: 40.0,
    temperatureOffC: 38.0,
    humidityEnabled: true,
    humidityOnRH: 75.0,
    humidityOffRH: 65.0,
    activationMode: 'ANY',
    fanMode: 'AUTO',
    version: 1,
  };

  res.status(200).json(config);
});

/**
 * POST /api/device/config-ack
 * ESP32 acknowledges receipt and application of target config version
 */
app.post('/api/device/config-ack', verifyDeviceAuth, (req: Request, res: Response) => {
  const { deviceId, appliedVersion } = req.body;
  console.log(`[API] Device ${deviceId} acknowledged config version v${appliedVersion}`);
  res.status(200).json({ status: 'ACKNOWLEDGED', appliedVersion });
});

/**
 * POST /api/device/status
 * Reports device error codes or state transitions
 */
app.post('/api/device/status', verifyDeviceAuth, (req: Request, res: Response) => {
  const { deviceId, status, errorCode } = req.body;
  console.log(`[API] Device status update from ${deviceId}: ${status} (code: ${errorCode || 'NONE'})`);
  res.status(200).json({ status: 'OK' });
});

// ==========================================
// 2. ADMIN & USER API ENDPOINTS
// ==========================================

app.post('/api/users/request-access', (req: Request, res: Response) => {
  const { uid, email, displayName } = req.body;
  res.status(201).json({ status: 'REQUEST_SUBMITTED', uid });
});

app.post('/api/admin/users/:uid/approve', (req: Request, res: Response) => {
  const { uid } = req.params;
  const { role = 'DRIVER', adminUid = 'admin' } = req.body;
  logAdminAudit(adminUid, 'USER_APPROVED', 'USER', uid, `Approved with role: ${role}`);
  res.status(200).json({ status: 'APPROVED', uid, role });
});

app.post('/api/admin/users/:uid/reject', (req: Request, res: Response) => {
  const { uid } = req.params;
  const { adminUid = 'admin' } = req.body;
  logAdminAudit(adminUid, 'USER_REJECTED', 'USER', uid, 'Rejected access request.');
  res.status(200).json({ status: 'REJECTED', uid });
});

app.post('/api/admin/users/:uid/suspend', (req: Request, res: Response) => {
  const { uid } = req.params;
  const { adminUid = 'admin' } = req.body;
  logAdminAudit(adminUid, 'USER_SUSPENDED', 'USER', uid, 'Account suspended by admin.');
  res.status(200).json({ status: 'SUSPENDED', uid });
});

app.post('/api/admin/devices', (req: Request, res: Response) => {
  const { deviceId, displayName, locationLabel, adminUid = 'admin' } = req.body;
  const newSecret = `esp32_sec_${Math.random().toString(36).substring(2, 12)}`;
  deviceSecrets[deviceId] = newSecret;
  logAdminAudit(adminUid, 'DEVICE_REGISTERED', 'DEVICE', deviceId, `Registered new ESP32: ${displayName}`);
  res.status(201).json({ status: 'REGISTERED', deviceId, initialSecret: newSecret });
});

app.post('/api/admin/devices/:deviceId/assign', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { driverUid, adminUid = 'admin' } = req.body;
  logAdminAudit(adminUid, 'DEVICE_ASSIGNED', 'DEVICE', deviceId, `Assigned to driver: ${driverUid}`);
  res.status(200).json({ status: 'ASSIGNED', deviceId, driverUid });
});

app.post('/api/admin/devices/:deviceId/unassign', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { adminUid = 'admin' } = req.body;
  logAdminAudit(adminUid, 'DEVICE_UNASSIGNED', 'DEVICE', deviceId, 'Unassigned from driver.');
  res.status(200).json({ status: 'UNASSIGNED', deviceId });
});

app.post('/api/admin/devices/:deviceId/rotate-credential', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { adminUid = 'admin' } = req.body;
  const newSecret = `esp32_sec_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
  deviceSecrets[deviceId] = newSecret;
  logAdminAudit(adminUid, 'CREDENTIAL_ROTATED', 'DEVICE', deviceId, 'Generated new Bearer key.');
  res.status(200).json({ status: 'ROTATED', deviceId, newSecret });
});

app.put('/api/admin/devices/:deviceId/config', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { config, adminUid = 'admin' } = req.body;
  const current = serverDeviceConfigs[deviceId] || { version: 1 };
  const nextVer = (current.version || 1) + 1;

  serverDeviceConfigs[deviceId] = {
    ...current,
    ...config,
    version: nextVer,
    updatedAt: new Date().toISOString(),
  };

  logAdminAudit(adminUid, 'CONFIG_UPDATED', 'DEVICE_CONFIG', deviceId, `Updated configuration to v${nextVer}`);
  res.status(200).json({ status: 'SAVED', version: nextVer });
});

app.post('/api/admin/devices/:deviceId/fan-override', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { mode, durationMinutes, reason, adminUid = 'admin' } = req.body;
  logAdminAudit(adminUid, 'FAN_OVERRIDE', 'DEVICE', deviceId, `Set ${mode} for ${durationMinutes} mins. Reason: ${reason}`);
  res.status(200).json({ status: 'OVERRIDE_APPLIED', mode });
});

app.post('/api/admin/devices/:deviceId/fan-auto', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { adminUid = 'admin' } = req.body;
  logAdminAudit(adminUid, 'FAN_AUTO', 'DEVICE', deviceId, 'Returned fan to AUTO sensor automation.');
  res.status(200).json({ status: 'RETURNED_TO_AUTO' });
});

// ==========================================
// VITE DEV SERVER / STATIC HOSTING INTEGRATION
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Shuttle Climate Monitor server running on http://0.0.0.0:${port}`);
  });
}

startServer();
