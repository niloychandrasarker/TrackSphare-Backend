import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { query } from '../config/db.js';
import { writeAuditLog } from '../utils/audit.js';

export async function registerDevice(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { name, model, androidVersion, appVersion } = req.body;
    const result = await query<{ id: string; name: string; sharing_enabled: boolean; created_at: Date }>(
      `INSERT INTO devices (user_id, name, model, android_version, app_version)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, sharing_enabled, created_at`,
      [req.user.sub, name || 'My Android Device', model || null, androidVersion || null, appVersion || null]
    );

    const device = result.rows[0];
    await writeAuditLog({
      actorUserId: req.user.sub,
      action: 'device.register',
      targetDeviceId: device.id,
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: device });
  } catch (err: any) {
    console.error('Register device error:', err);
    res.status(500).json({ success: false, error: 'Failed to register device' });
  }
}

export async function getDevices(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const isAdmin = ['super_admin', 'org_admin'].includes(req.user.role);

    let result;
    if (isAdmin) {
      result = await query(
        `SELECT d.id, d.name, d.model, d.sharing_enabled, d.status, d.last_seen_at, d.battery_level, 
                COALESCE(d.image_url, u.avatar_url) as image_url,
                COALESCE(d.user_name, u.name, 'Administrator') as user_name,
                COALESCE(u.name, 'Administrator') as owner_name, COALESCE(u.email, 'admin@tracksphere.com') as owner_email
         FROM devices d
         LEFT JOIN users u ON u.id = d.user_id
         ORDER BY d.last_seen_at DESC NULLS LAST`
      );
    } else {
      result = await query(
        `SELECT d.id, d.name, d.model, d.sharing_enabled, d.status, d.last_seen_at, d.battery_level,
                COALESCE(d.image_url, u.avatar_url) as image_url,
                COALESCE(d.user_name, u.name, 'Device Owner') as user_name,
                COALESCE(u.name, 'Device Owner') as owner_name, COALESCE(u.email, '') as owner_email
         FROM devices d
         LEFT JOIN users u ON u.id = d.user_id
         WHERE d.user_id = $1 AND d.status = 'active'
         UNION
         SELECT d.id, d.name, d.model, d.sharing_enabled, d.status, d.last_seen_at, d.battery_level,
                COALESCE(d.image_url, u.avatar_url) as image_url,
                COALESCE(d.user_name, u.name, 'Device Owner') as user_name,
                COALESCE(u.name, 'Device Owner') as owner_name, COALESCE(u.email, '') as owner_email
         FROM devices d
         LEFT JOIN users u ON u.id = d.user_id
         JOIN device_viewers dv ON dv.device_id = d.id
         WHERE dv.viewer_user_id = $1 AND dv.status = 'active' AND d.status = 'active'
         ORDER BY last_seen_at DESC NULLS LAST`,
        [req.user.sub]
      );
    }

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch devices' });
  }
}

export async function registerMobileDevice(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { deviceId, name, model, androidVersion, appVersion, batteryLevel, userName, imageUrl } = req.body;

    let targetUserId = req.user?.sub;
    if (!targetUserId) {
      const adminRes = await query<{ id: string }>('SELECT id FROM users WHERE role = $1 ORDER BY created_at ASC LIMIT 1', ['super_admin']);
      targetUserId = adminRes.rows[0]?.id;
    }

    if (!targetUserId) {
      res.status(500).json({ success: false, error: 'No user account found to bind device' });
      return;
    }

    const devName = name || 'Mobile Android Device';
    const devModel = model || 'honor';

    let result;
    if (deviceId) {
      result = await query<{ id: string; name: string; model: string; sharing_enabled: boolean; status: string; image_url: string; user_name: string }>(
        `INSERT INTO devices (id, user_id, name, model, android_version, app_version, status, sharing_enabled, last_seen_at, battery_level, image_url, user_name)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', TRUE, NOW(), $7, $8, $9)
         ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             model = EXCLUDED.model,
             status = 'active',
             sharing_enabled = TRUE,
             last_seen_at = NOW(),
             battery_level = COALESCE(EXCLUDED.battery_level, devices.battery_level),
             image_url = COALESCE(EXCLUDED.image_url, devices.image_url),
             user_name = COALESCE(EXCLUDED.user_name, devices.user_name)
         RETURNING id, name, model, sharing_enabled, status, image_url, user_name`,
        [deviceId, targetUserId, devName, devModel, androidVersion || null, appVersion || null, batteryLevel || null, imageUrl || null, userName || null]
      );
    } else {
      result = await query<{ id: string; name: string; model: string; sharing_enabled: boolean; status: string; image_url: string; user_name: string }>(
        `INSERT INTO devices (user_id, name, model, android_version, app_version, status, sharing_enabled, last_seen_at, battery_level, image_url, user_name)
         VALUES ($1, $2, $3, $4, $5, 'active', TRUE, NOW(), $6, $7, $8)
         RETURNING id, name, model, sharing_enabled, status, image_url, user_name`,
        [targetUserId, devName, devModel, androidVersion || null, appVersion || null, batteryLevel || null, imageUrl || null, userName || null]
      );
    }

    // Update user profile only if the user explicitly logged in
    if (req.user?.sub && (userName || imageUrl)) {
      await query(
        `UPDATE users 
         SET name = COALESCE($1, name),
             avatar_url = COALESCE($2, avatar_url)
         WHERE id = $3`,
        [userName || null, imageUrl || null, req.user.sub]
      ).catch(() => {});
    }

    const device = result.rows[0];

    // Auto grant consent
    await query(
      `INSERT INTO consent_records (device_id, user_id, purpose, status, policy_version, ip_address)
       VALUES ($1, $2, 'location_sharing', 'granted', '1.2', $3)
       ON CONFLICT DO NOTHING`,
      [device.id, targetUserId, req.ip]
    ).catch(() => {});

    res.status(200).json({ success: true, data: device });
  } catch (err: any) {
    console.error('Mobile register device error:', err);
    res.status(500).json({ success: false, error: 'Failed to bind mobile device' });
  }
}

export async function inviteViewer(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const deviceId = req.params.id as string;
    const { viewerEmail, accessType } = req.body;

    const devCheck = await query('SELECT user_id FROM devices WHERE id = $1 AND status = \'active\'', [deviceId]);
    if (!devCheck.rows[0] || devCheck.rows[0].user_id !== req.user.sub) {
      res.status(403).json({ success: false, error: 'Device not found or not owned by you' });
      return;
    }

    const viewerRes = await query('SELECT id FROM users WHERE email = $1 AND status = \'active\'', [viewerEmail.toLowerCase()]);
    if (!viewerRes.rows[0]) {
      res.status(404).json({ success: false, error: 'Viewer user not found' });
      return;
    }

    const viewerId = viewerRes.rows[0].id;
    if (viewerId === req.user.sub) {
      res.status(400).json({ success: false, error: 'Cannot invite yourself' });
      return;
    }

    await query(
      `INSERT INTO device_viewers (device_id, viewer_user_id, access_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (device_id, viewer_user_id)
       DO UPDATE SET status = 'active', access_type = EXCLUDED.access_type, revoked_at = NULL`,
      [deviceId, viewerId, accessType || 'viewer']
    );

    await writeAuditLog({
      actorUserId: req.user.sub,
      action: 'viewer.invite',
      targetDeviceId: deviceId,
      targetUserId: viewerId,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Viewer invited successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to invite viewer' });
  }
}

export async function revokeViewer(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const deviceId = req.params.id as string;
    const viewerId = req.params.viewerId as string;

    const devCheck = await query('SELECT user_id FROM devices WHERE id = $1 AND status = \'active\'', [deviceId]);
    if (!devCheck.rows[0] || devCheck.rows[0].user_id !== req.user.sub) {
      res.status(403).json({ success: false, error: 'Device not found or not owned by you' });
      return;
    }

    await query(
      `UPDATE device_viewers SET status = 'revoked', revoked_at = NOW()
       WHERE device_id = $1 AND viewer_user_id = $2`,
      [deviceId, viewerId]
    );

    await writeAuditLog({
      actorUserId: req.user.sub,
      action: 'viewer.revoke',
      targetDeviceId: deviceId,
      targetUserId: viewerId,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Viewer grant revoked' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to revoke viewer' });
  }
}

export async function getViewers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const deviceId = req.params.id as string;

    const result = await query(
      `SELECT dv.id, dv.viewer_user_id, dv.access_type, dv.status, dv.invited_at, u.name, u.email
       FROM device_viewers dv
       JOIN users u ON u.id = dv.viewer_user_id
       WHERE dv.device_id = $1 AND dv.status = 'active'`,
      [deviceId]
    );

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch viewers' });
  }
}

export async function deleteDevice(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const deviceId = req.params.id as string;
    const dev = await query('SELECT user_id FROM devices WHERE id = $1', [deviceId]);
    if (!dev.rows[0] || dev.rows[0].user_id !== req.user.sub) {
      res.status(403).json({ success: false, error: 'Device not found or unauthorized' });
      return;
    }

    await query(`UPDATE devices SET status = 'revoked', sharing_enabled = FALSE, updated_at = NOW() WHERE id = $1`, [deviceId]);
    await query(`UPDATE sharing_sessions SET status = 'stopped', stopped_at = NOW() WHERE device_id = $1 AND status = 'active'`, [deviceId]);

    await writeAuditLog({
      actorUserId: req.user.sub,
      action: 'device.revoke',
      targetDeviceId: deviceId,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Device revoked successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to revoke device' });
  }
}
