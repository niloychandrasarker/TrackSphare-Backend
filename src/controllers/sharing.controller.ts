import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { query } from '../config/db.js';
import { writeAuditLog } from '../utils/audit.js';

export async function startSharing(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      res.status(400).json({ success: false, error: 'deviceId is required' });
      return;
    }

    const dev = await query<{ user_id: string; sharing_enabled: boolean }>(
      'SELECT user_id, sharing_enabled FROM devices WHERE id = $1',
      [deviceId]
    );

    if (!dev.rows[0]) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    const isAdmin = req.user && ['super_admin', 'org_admin'].includes(req.user.role);
    if (req.user && !isAdmin && dev.rows[0].user_id !== req.user.sub) {
      res.status(403).json({ success: false, error: 'Device not owned by you' });
      return;
    }

    await query('UPDATE devices SET sharing_enabled = TRUE, status = \'active\', updated_at = NOW() WHERE id = $1', [deviceId]);
    await query('INSERT INTO sharing_sessions (device_id) VALUES ($1)', [deviceId]);

    if (req.user) {
      await writeAuditLog({ actorUserId: req.user.sub, action: 'sharing.start', targetDeviceId: deviceId, ipAddress: req.ip });
    }

    res.json({ success: true, message: 'Location sharing started', sharingEnabled: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to start sharing' });
  }
}

export async function stopSharing(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      res.status(400).json({ success: false, error: 'deviceId is required' });
      return;
    }

    const dev = await query<{ user_id: string }>(
      'SELECT user_id FROM devices WHERE id = $1',
      [deviceId]
    );

    if (!dev.rows[0]) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    const isAdmin = req.user && ['super_admin', 'org_admin'].includes(req.user.role);
    if (req.user && !isAdmin && dev.rows[0].user_id !== req.user.sub) {
      res.status(403).json({ success: false, error: 'Device not owned by you' });
      return;
    }

    await query('UPDATE devices SET sharing_enabled = FALSE, updated_at = NOW() WHERE id = $1', [deviceId]);
    await query('UPDATE sharing_sessions SET status = \'stopped\', stopped_at = NOW() WHERE device_id = $1 AND status = \'active\'', [deviceId]);

    if (req.user) {
      await writeAuditLog({ actorUserId: req.user.sub, action: 'sharing.stop', targetDeviceId: deviceId, ipAddress: req.ip });
    }

    res.json({ success: true, message: 'Location sharing stopped', sharingEnabled: false });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to stop sharing' });
  }
}

export async function getSharingStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { deviceId } = req.query;
    const dev = await query<{ sharing_enabled: boolean; last_seen_at: Date }>(
      'SELECT sharing_enabled, last_seen_at FROM devices WHERE id = $1',
      [deviceId]
    );

    if (!dev.rows[0]) {
      res.status(404).json({ success: false, error: 'Device not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        deviceId,
        sharingEnabled: dev.rows[0].sharing_enabled,
        lastSeenAt: dev.rows[0].last_seen_at,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to get sharing status' });
  }
}
