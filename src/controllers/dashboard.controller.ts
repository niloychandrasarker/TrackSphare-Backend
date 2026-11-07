import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { query } from '../config/db.js';

export async function getDashboardSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const isAdmin = ['super_admin', 'org_admin'].includes(req.user.role);

    let usersQuery = `SELECT COUNT(*) AS count FROM users WHERE status = 'active'`;
    let devicesQuery = `SELECT COUNT(*) AS count FROM devices WHERE status = 'active'`;
    let sharingQuery = `
      SELECT
        COUNT(*) FILTER (WHERE sharing_enabled = TRUE) AS enabled,
        COUNT(*) FILTER (WHERE sharing_enabled = FALSE) AS disabled
      FROM devices WHERE status = 'active'
    `;
    let staleQuery = `
      SELECT
        COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '10 minutes') AS recent,
        COUNT(*) FILTER (WHERE last_seen_at <= NOW() - INTERVAL '10 minutes' OR last_seen_at IS NULL) AS stale
      FROM devices WHERE status = 'active'
    `;

    // If regular user, restrict to their own devices
    if (!isAdmin) {
      devicesQuery = `SELECT COUNT(*) AS count FROM devices WHERE user_id = '${req.user.sub}' AND status = 'active'`;
      sharingQuery = `
        SELECT
          COUNT(*) FILTER (WHERE sharing_enabled = TRUE) AS enabled,
          COUNT(*) FILTER (WHERE sharing_enabled = FALSE) AS disabled
        FROM devices WHERE user_id = '${req.user.sub}' AND status = 'active'
      `;
      staleQuery = `
        SELECT
          COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '10 minutes') AS recent,
          COUNT(*) FILTER (WHERE last_seen_at <= NOW() - INTERVAL '10 minutes' OR last_seen_at IS NULL) AS stale
        FROM devices WHERE user_id = '${req.user.sub}' AND status = 'active'
      `;
    }

    const [users, devices, sharing, stale] = await Promise.all([
      query<{ count: string }>(usersQuery),
      query<{ count: string }>(devicesQuery),
      query<{ enabled: string; disabled: string }>(sharingQuery),
      query<{ recent: string; stale: string }>(staleQuery),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers: parseInt(users.rows[0]?.count ?? '0', 10),
        registeredDevices: parseInt(devices.rows[0]?.count ?? '0', 10),
        sharingEnabled: parseInt(sharing.rows[0]?.enabled ?? '0', 10),
        sharingDisabled: parseInt(sharing.rows[0]?.disabled ?? '0', 10),
        recentlyUpdated: parseInt(stale.rows[0]?.recent ?? '0', 10),
        stale: parseInt(stale.rows[0]?.stale ?? '0', 10),
      },
    });
  } catch (err: any) {
    console.error('Summary error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch summary metrics' });
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
         l.device_id, d.name AS device_name, COALESCE(u.name, 'Device Owner') AS user_name,
         COALESCE(d.image_url, u.avatar_url) AS image_url,
         l.latitude, l.longitude, l.accuracy, d.battery_level,
         l.recorded_at, l.received_at
       FROM locations l
       JOIN devices d ON d.id = l.device_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE l.device_id IN (${placeholders})
       ORDER BY l.device_id, l.recorded_at DESC`,
      deviceIds
    );

    const sanitized = locationsResult.rows.map(r => ({
      ...r,
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      accuracy: r.accuracy != null ? parseFloat(r.accuracy) : null,
      battery_level: r.battery_level != null ? parseInt(r.battery_level, 10) : null,
    }));

    res.json({ success: true, data: sanitized });
  } catch (err: any) {
    console.error('Live locations error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve live locations' });
  }
}
