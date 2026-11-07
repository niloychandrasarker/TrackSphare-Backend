import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { query } from '../config/db.js';

export async function getDashboardSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [users, devices, sharing, stale] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*) AS count FROM users WHERE status = 'active'`),
      query<{ count: string }>(`SELECT COUNT(*) AS count FROM devices WHERE status = 'active'`),
      query<{ enabled: string; disabled: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE sharing_enabled = TRUE) AS enabled,
           COUNT(*) FILTER (WHERE sharing_enabled = FALSE) AS disabled
         FROM devices WHERE status = 'active'`
      ),
      query<{ recent: string; stale: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE last_seen_at > NOW() - INTERVAL '10 minutes') AS recent,
           COUNT(*) FILTER (WHERE last_seen_at <= NOW() - INTERVAL '10 minutes' OR last_seen_at IS NULL) AS stale
         FROM devices WHERE status = 'active'`
      ),
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
    res.status(500).json({ success: false, error: 'Failed to fetch summary' });
  }
}

export async function getAllUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await query(
      `SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
}

export async function getAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 200);
    const offset = parseInt(req.query.offset as string || '0', 10);

    const [logs, count] = await Promise.all([
      query(
        `SELECT id, actor_user_id, action, target_device_id, target_user_id, metadata, ip_address, created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query<{ count: string }>('SELECT COUNT(*) AS count FROM audit_logs'),
    ]);

    res.json({
      success: true,
      data: {
        logs: logs.rows,
        total: parseInt(count.rows[0]?.count ?? '0', 10),
        limit,
        offset,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
  }
}
