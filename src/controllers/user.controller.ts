import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { query } from '../config/db.js';
import { writeAuditLog } from '../utils/audit.js';

export async function listUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await query(
      `SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to list users' });
  }
}

export async function updateUserStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || !['super_admin', 'org_admin'].includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Admin permission required' });
      return;
    }

    const id = req.params.id as string;
    const { status } = req.body;

    if (!['active', 'suspended', 'deleted'].includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid status value' });
      return;
    }

    await query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);

    await writeAuditLog({
      actorUserId: req.user.sub,
      action: 'user.update_status',
      targetUserId: id,
      metadata: { newStatus: status },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: `User status changed to ${status}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update user status' });
  }
}

export async function updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { name, currentPassword, newPassword } = req.body;

    if (name) {
      await query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name.trim(), req.user.sub]);
    }

    if (newPassword) {
      if (!currentPassword) {
        res.status(400).json({ success: false, error: 'Current password is required to set new password' });
        return;
      }

      const u = await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [req.user.sub]);
      if (!u.rows[0] || !(await bcrypt.compare(currentPassword, u.rows[0].password_hash))) {
        res.status(400).json({ success: false, error: 'Current password incorrect' });
        return;
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.user.sub]);
    }

    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
}
