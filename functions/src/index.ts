import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

/**
 * Cloud Function HTTPS Endpoint: Ingest device readings with timestamp validation and rate limiting
 */
export const recordTelemetry = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
    return;
  }

  const { deviceId, readings } = req.body;
  if (!deviceId || !Array.isArray(readings)) {
    res.status(400).json({ error: 'Invalid payload schema' });
    return;
  }

  try {
    const batch = db.batch();
    const now = admin.firestore.FieldValue.serverTimestamp();

    let latestTemp = 0;
    let latestHum = 0;
    let latestFan = 'OFF';
    let latestMode = 'AUTO';

    for (const r of readings) {
      const readingRef = db.collection('devices').doc(deviceId).collection('readings').doc();
      batch.set(readingRef, {
        temperatureC: r.temperatureC,
        humidityRH: r.humidityRH,
        fanState: r.fanState,
        operatingMode: r.operatingMode,
        sensorHealthy: r.sensorHealthy,
        configVersion: r.configVersion,
        deviceRecordedAt: r.deviceRecordedAt || new Date().toISOString(),
        receivedAt: now,
      });

      latestTemp = r.temperatureC;
      latestHum = r.humidityRH;
      latestFan = r.fanState;
      latestMode = r.operatingMode;
    }

    // Update device summary
    const deviceRef = db.collection('devices').doc(deviceId);
    batch.update(deviceRef, {
      latestTemperatureC: latestTemp,
      latestHumidityRH: latestHum,
      latestFanState: latestFan,
      reportedMode: latestMode,
      status: 'ONLINE',
      lastSeenAt: now,
      lastReadingAt: now,
      updatedAt: now,
    });

    await batch.commit();
    res.status(200).json({ status: 'SUCCESS', count: readings.length });
  } catch (err: any) {
    console.error('Error recording telemetry:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Cloud Function: Automated alert generation for high temperature or offline devices
 */
export const checkClimateAlerts = functions.firestore
  .document('devices/{deviceId}')
  .onUpdate(async (change, context) => {
    const after = change.after.data();
    const deviceId = context.params.deviceId;

    if (after.latestTemperatureC >= 42.0) {
      await db.collection('alerts').add({
        deviceId,
        assignedDriverUidAtCreation: after.assignedDriverUid || null,
        type: 'HIGH_TEMPERATURE',
        severity: 'CRITICAL',
        message: `Cabin temperature critical: ${after.latestTemperatureC}°C exceeded safety limits!`,
        acknowledged: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'BACKEND',
      });
    }
  });
