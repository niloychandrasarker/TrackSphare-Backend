import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { query } from '../config/db.js';
import { writeAuditLog } from '../utils/audit.js';
import crypto from 'crypto';

export function toValidUuid(rawId?: string | null): string {
  if (!rawId || typeof rawId !== 'string') {
    return '9f2f6062-af23-48fa-abc3-cb2c42f9ec96';
  }
  const trimmed = rawId.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  // Deterministic UUID from raw ID string
  const hash = crypto.createHash('md5').update('tracksphere-dev-' + trimmed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function uploadLocation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const rawDevId = req.body?.deviceId || req.body?.id || req.query?.id || req.query?.deviceId || req.headers['x-device-id'] || '377204';
    const computedUuid = toValidUuid(String(rawDevId));

    const rawLat = req.body?.latitude ?? req.query?.lat ?? req.query?.latitude;
    const rawLng = req.body?.longitude ?? req.query?.lon ?? req.query?.lng ?? req.query?.longitude;

    if (rawLat === undefined || rawLng === undefined) {
      res.status(400).json({ success: false, error: 'Missing latitude or longitude' });
      return;
    }

    const latNum = parseFloat(String(rawLat));
    const lngNum = parseFloat(String(rawLng));
    if (isNaN(latNum) || isNaN(lngNum)) {
      res.status(400).json({ success: false, error: 'Invalid latitude or longitude numbers' });
      return;
    }

    const rawAcc = req.body?.accuracy ?? req.query?.accuracy ?? req.query?.hdop;
    const accuracy = rawAcc != null ? parseFloat(String(rawAcc)) : 5.0;

    const rawAlt = req.body?.altitude ?? req.query?.altitude;
    const altitude = rawAlt != null ? parseFloat(String(rawAlt)) : null;

    const rawSpeed = req.body?.speed ?? req.query?.speed;
    const speed = rawSpeed != null ? parseFloat(String(rawSpeed)) : null;

    const rawBatt = req.body?.batteryLevel ?? req.query?.batt ?? req.query?.battery;
    const batteryLevel = rawBatt != null ? Math.round(parseFloat(String(rawBatt))) : null;

    let recordedAt = req.body?.recordedAt;
    if (!recordedAt && req.query?.timestamp) {
      const ts = Number(req.query.timestamp);
      recordedAt = ts > 10000000000 ? new Date(ts).toISOString() : new Date(ts * 1000).toISOString();
    }
    if (!recordedAt) {
      recordedAt = new Date().toISOString();
    }

    const rawDevName = req.body?.name || req.query?.name;
    const rawUserName = req.body?.userName || req.body?.user_name || req.query?.userName || req.query?.user_name;
    const rawImageUrl = req.body?.imageUrl || req.body?.image_url || req.query?.imageUrl || req.query?.image_url;

    // Check if device exists by UUID or matching name/model
    const dev = await query<{ id: string; user_id: string; sharing_enabled: boolean; status: string; name: string }>(
      `SELECT id, user_id, sharing_enabled, status, name 
       FROM devices 
       WHERE id = $1 OR name ILIKE $2 OR model ILIKE $2 
       LIMIT 1`,
      [computedUuid, String(rawDevId)]
    );

    let deviceId = dev.rows[0]?.id || computedUuid;
    let targetUserId = req.user?.sub;

    if (!dev.rows[0]) {
      // Find admin user to associate device with
      const adminRes = await query<{ id: string }>('SELECT id FROM users WHERE role = $1 ORDER BY created_at ASC LIMIT 1', ['super_admin']);
      targetUserId = targetUserId || adminRes.rows[0]?.id;

      const devName = rawDevName ? String(rawDevName) : `Device (${rawDevId})`;
      const uName = rawUserName ? String(rawUserName) : `Device ${rawDevId}`;
      const imgUrl = rawImageUrl ? String(rawImageUrl) : null;

      // Auto-register device with the raw ID or provided custom name in DB
      await query(
        `INSERT INTO devices (id, user_id, name, model, user_name, image_url, status, sharing_enabled, last_seen_at, battery_level)
         VALUES ($1, $2, $3, $7, $4, $5, 'active', TRUE, NOW(), $6)
         ON CONFLICT (id) DO UPDATE SET 
            status = 'active', 
            sharing_enabled = TRUE, 
            last_seen_at = NOW(), 
            battery_level = COALESCE($6, devices.battery_level),
            name = COALESCE($3, devices.name),
            user_name = COALESCE($4, devices.user_name),
            image_url = COALESCE($5, devices.image_url),
            model = COALESCE($7, devices.model)`,
        [deviceId, targetUserId, devName, uName, imgUrl, batteryLevel, String(rawDevId)]
      );
    } else {
      deviceId = dev.rows[0].id;
      // If user is authenticated, ensure ownership unless admin
      if (req.user && !['super_admin', 'org_admin'].includes(req.user.role) && dev.rows[0].user_id !== req.user.sub) {
        res.status(403).json({ success: false, error: 'You do not own this device' });
        return;
      }

      await query(
        `UPDATE devices 
         SET status = 'active', sharing_enabled = TRUE, last_seen_at = NOW(), 
             battery_level = COALESCE($2, battery_level),
             name = COALESCE($3, name),
             user_name = COALESCE($4, user_name),
             image_url = COALESCE($5, image_url)
         WHERE id = $1`,
        [deviceId, batteryLevel, rawDevName || null, rawUserName || null, rawImageUrl || null]
      );
    }

    // Insert location point
    const result = await query<{ id: number }>(
      `INSERT INTO locations (device_id, latitude, longitude, accuracy, altitude, speed, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [deviceId, latNum, lngNum, accuracy, altitude, speed, recordedAt]
    );

    res.status(200).json({
      success: true,
      data: {
        locationId: result.rows[0].id,
        deviceId,
        latitude: latNum,
        longitude: lngNum,
        recordedAt
      }
    });
  } catch (err: any) {
    console.error('Upload location error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload location' });
  }
}

export async function getLatestLocation(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { deviceId } = req.query;
    if (!deviceId) {
      res.status(400).json({ success: false, error: 'deviceId query parameter is required' });
      return;
    }

    const isAdmin = ['super_admin', 'org_admin'].includes(req.user.role);

    // Verify permission
    if (!isAdmin) {
      const authCheck = await query(
        `SELECT d.id FROM devices d
         LEFT JOIN device_viewers dv ON dv.device_id = d.id
         WHERE d.id = $1 AND (d.user_id = $2 OR (dv.viewer_user_id = $2 AND dv.status = 'active'))`,
        [deviceId, req.user.sub]
      );
      if (!authCheck.rows[0]) {
        res.status(403).json({ success: false, error: 'Access denied to this device' });
        return;
      }
    }

    const loc = await query(
      `SELECT id, latitude, longitude, accuracy, altitude, speed, recorded_at, received_at
       FROM locations
       WHERE device_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [deviceId]
    );

    if (!loc.rows[0]) {
      res.status(404).json({ success: false, error: 'No location records found for this device' });
      return;
    }

    res.json({ success: true, data: loc.rows[0] });
  } catch (err: any) {
    console.error('Latest location error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch latest location' });
  }
}

export async function getLiveLocations(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const isAdmin = ['super_admin', 'org_admin'].includes(req.user.role);

    let deviceIds: string[] = [];
    if (isAdmin) {
      const res = await query<{ id: string }>('SELECT id FROM devices WHERE status = \'active\' AND sharing_enabled = TRUE');
      deviceIds = res.rows.map(r => r.id);
    } else {
      const res = await query<{ id: string }>(
        `SELECT d.id FROM devices d
         LEFT JOIN device_viewers dv ON dv.device_id = d.id
         WHERE (d.user_id = $1 OR (dv.viewer_user_id = $1 AND dv.status = 'active'))
           AND d.status = 'active' AND d.sharing_enabled = TRUE`,
        [req.user.sub]
      );
      deviceIds = res.rows.map(r => r.id);
    }

    if (deviceIds.length === 0) {
      res.json({ success: true, data: [] });
      return;
    }

    const placeholders = deviceIds.map((_, i) => `$${i + 1}`).join(',');
    const locationsResult = await query(
      `SELECT DISTINCT ON (l.device_id)
         l.device_id, d.name AS device_name, COALESCE(d.user_name, u.name) AS user_name,
         l.latitude, l.longitude, l.accuracy, d.battery_level,
         l.recorded_at, l.received_at, d.image_url, u.avatar_url
       FROM locations l
       JOIN devices d ON d.id = l.device_id
       JOIN users u ON u.id = d.user_id
       WHERE l.device_id IN (${placeholders})
       ORDER BY l.device_id, l.recorded_at DESC`,
      deviceIds
    );

    res.json({ success: true, data: locationsResult.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to get live locations' });
  }
}

export async function getLocationHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { deviceId, from, to, limit = '500', offset = '0' } = req.query;
    if (!deviceId) {
      res.status(400).json({ success: false, error: 'deviceId is required' });
      return;
    }

    const computedUuid = toValidUuid(String(deviceId));
    const devRes = await query<{ id: string }>(
      `SELECT id FROM devices WHERE id = $1 OR name ILIKE $2 OR model ILIKE $2 LIMIT 1`,
      [computedUuid, String(deviceId)]
    );
    const validDeviceId = devRes.rows[0]?.id || computedUuid;

    const conditions: string[] = ['device_id = $1'];
    const params: unknown[] = [validDeviceId];
    let idx = 2;

    if (from) { conditions.push(`recorded_at >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`recorded_at <= $${idx++}`); params.push(to); }

    const whereClause = conditions.join(' AND ');

    const countPromise = query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM locations WHERE ${whereClause}`,
      [...params]
    );

    const dataParams = [...params, parseInt(limit as string, 10), parseInt(offset as string, 10)];
    const dataPromise = query(
      `SELECT id, latitude, longitude, accuracy, recorded_at, received_at
       FROM locations
       WHERE ${whereClause}
       ORDER BY recorded_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      dataParams
    );

    const [count, rows] = await Promise.all([countPromise, dataPromise]);

    res.json({
      success: true,
      data: {
        locations: rows.rows,
        pagination: {
          total: parseInt(count.rows[0]?.count || '0', 10),
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
        },
      },
    });
  } catch (err: any) {
    console.error('Failed to fetch history:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
}
