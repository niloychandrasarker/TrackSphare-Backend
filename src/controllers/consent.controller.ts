import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { query } from '../config/db.js';
import { writeAuditLog } from '../utils/audit.js';

export async function grantConsent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { deviceId, purpose = 'location_sharing', policyVersion = '1.0' } = req.body;
    let userId = req.user?.sub;
    if (!userId) {
      const dev = await query<{ user_id: string }>('SELECT user_id FROM devices WHERE id = $1', [deviceId]);
      userId = dev.rows[0]?.user_id;
    }

    if (userId) {
      await query(
        `INSERT INTO consent_records (device_id, user_id, purpose, status, policy_version, ip_address)
         VALUES ($1, $2, $3, 'granted', $4, $5)`,
        [deviceId, userId, purpose, policyVersion, req.ip]
      );
      await writeAuditLog({ actorUserId: userId, action: 'consent.grant', targetDeviceId: deviceId, ipAddress: req.ip });
    }

    res.json({ success: true, message: 'Consent granted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to grant consent' });
  }
}

export async function revokeConsent(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { deviceId, purpose = 'location_sharing' } = req.body;
    let userId = req.user?.sub;
    if (!userId) {
      const dev = await query<{ user_id: string }>('SELECT user_id FROM devices WHERE id = $1', [deviceId]);
      userId = dev.rows[0]?.user_id;
    }

    if (userId) {
      await query(
        `INSERT INTO consent_records (device_id, user_id, purpose, status, policy_version, ip_address)
         VALUES ($1, $2, $3, 'revoked', '1.0', $4)`,
        [deviceId, userId, purpose, req.ip]
      );
      await writeAuditLog({ actorUserId: userId, action: 'consent.revoke', targetDeviceId: deviceId, ipAddress: req.ip });
    }

    await query('UPDATE devices SET sharing_enabled = FALSE, updated_at = NOW() WHERE id = $1', [deviceId]);
    await query('UPDATE sharing_sessions SET status = \'stopped\', stopped_at = NOW() WHERE device_id = $1 AND status = \'active\'', [deviceId]);

    res.json({ success: true, message: 'Consent revoked. Sharing stopped.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to revoke consent' });
  }
}
