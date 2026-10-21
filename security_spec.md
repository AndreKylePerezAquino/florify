# Security Specification: Shuttle Climate Monitor

## 1. Data Invariants

1. **User Identity Invariant**: A user document at `/users/{userId}` can only be created by the authenticated user whose `request.auth.uid == userId`. On creation, the role MUST be `DRIVER` and status MUST be `PENDING`. No client can elevate themselves to `ADMIN` or set their status to `APPROVED`.
2. **Admin Supremacy & Bootstrap Invariant**: The designated runtime root administrator (`newroskoto@gmail.com`) with `email_verified == true` or users with `role == 'ADMIN'` and `status == 'APPROVED'` have administrative read privileges across user profiles, all devices, configurations, alerts, and audit logs.
3. **Driver Assignment Isolation Invariant**: Drivers may read ONLY devices where `resource.data.assignedDriverUid == request.auth.uid`. No driver may read, query, or enumerate devices belonging to other drivers or unassigned devices.
4. **Driver Readings & Alerts Scoping**: Readings at `/devices/{deviceId}/readings/{readingId}` and device documents can only be read by an admin or the driver actively assigned to that device (`get(/databases/$(database)/documents/devices/$(deviceId)).data.assignedDriverUid == request.auth.uid`).
5. **Driver Configuration Lockdown**: Configuration at `/devices/{deviceId}/config/current` contains sensitive threshold and override parameters; only administrators can read this document from the client SDK (devices access it through server-side authenticated endpoints).
6. **Authoritative Device State Lockdown**: Browser clients CANNOT write or update device readings, device status, heartbeat records, or configuration. Only trusted server endpoints (Cloud Functions / Express backend) using server credentials write authoritative device metrics.
7. **Audit Log Immutability**: `/auditLogs/{logId}` can only be read by authorized administrators. No browser client can create, update, or delete audit logs.
8. **No Vehicle Information**: All telemetry is attached directly to the ESP32 `deviceId` and its active driver UID. There are no vehicle entities.

## 2. Dirty Dozen Threat Payloads

1. **Self-Promotion Attack**: Non-admin user attempts `setDoc` at `/users/{attackerUid}` with `role: "ADMIN", status: "APPROVED"`. Expected: `PERMISSION_DENIED`.
2. **Ghost Field User Pollution**: User attempts to inject `{ isSuperuser: true, bypass: true }` into `/users/{uid}`. Expected: `PERMISSION_DENIED`.
3. **Profile Hijack Attack**: Authenticated user `uid_A` attempts to read or write `/users/uid_B`. Expected: `PERMISSION_DENIED`.
4. **Cross-Driver Device Snooping**: Driver `uid_A` attempts to `getDoc` or query `/devices/{dev_B}` assigned to `uid_B`. Expected: `PERMISSION_DENIED`.
5. **Driver Reading Interception**: Driver `uid_A` attempts to list readings under `/devices/{dev_B}/readings/`. Expected: `PERMISSION_DENIED`.
6. **Driver Threshold Tampering**: Driver attempts `setDoc` or `updateDoc` on `/devices/{deviceId}/config/current` to disable high-temperature automation. Expected: `PERMISSION_DENIED`.
7. **Driver Fan Override Forgery**: Driver attempts to set `fanMode: "FORCE_ON"` or modify `desiredConfigVersion` directly on `/devices/{deviceId}`. Expected: `PERMISSION_DENIED`.
8. **Fake Sensor Telemetry Injection**: Malicious client attempts `addDoc` to `/devices/{deviceId}/readings` with bogus 150°C temperature. Expected: `PERMISSION_DENIED`.
9. **Fake Device Heartbeat Injection**: Malicious client attempts to update `status: "ONLINE"` or `latestTemperatureC` on `/devices/{deviceId}`. Expected: `PERMISSION_DENIED`.
10. **Audit Log Erasure/Tampering**: Authenticated user attempts `deleteDoc` or update on `/auditLogs/{logId}`. Expected: `PERMISSION_DENIED`.
11. **ID Injection & Poisoning**: Malicious client sends 2000-character gibberish document ID with path traversal sequences. Expected: `PERMISSION_DENIED`.
12. **Unverified Email Spoof**: Attacker creates account claiming `newroskoto@gmail.com` with `email_verified: false` to gain admin read access. Expected: `PERMISSION_DENIED`.
