import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../config/db.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { writeAuditLog } from '../utils/audit.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ success: false, error: 'Name, email and password are required' });
      return;
    }

    const assignedRole = ['guardian', 'org_admin'].includes(role) ? role : 'device_user';
    const emailLower = email.toLowerCase().trim();

    const existing = await query('SELECT id FROM users WHERE email = $1', [emailLower]);
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(409).json({ success: false, error: 'User with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await query<{ id: string; name: string; email: string; role: string }>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role`,
      [name.trim(), emailLower, passwordHash, assignedRole]
    );

    const user = result.rows[0];
    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role as any });
    const refreshToken = signRefreshToken(user.id);

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    await writeAuditLog({
      actorUserId: user.id,
      action: 'user.register',
      targetUserId: user.id,
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: { user, accessToken, refreshToken },
    });
  } catch (err: any) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, error: 'Server error during registration' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required' });
      return;
    }

    const emailLower = email.toLowerCase().trim();
    const result = await query<{ id: string; name: string; email: string; password_hash: string; role: string; status: string }>(
      'SELECT id, name, email, password_hash, role, status FROM users WHERE email = $1',
      [emailLower]
    );

    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ success: false, error: 'Invalid email or password' });
      return;
    }

    if (user.status !== 'active') {
      res.status(403).json({ success: false, error: 'Account is suspended or deactivated' });
      return;
    }

    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role as any });
    const refreshToken = signRefreshToken(user.id);

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [user.id]);
    await query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [user.id, tokenHash, expiresAt]);

    await writeAuditLog({
      actorUserId: user.id,
      action: 'user.login',
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        accessToken,
        refreshToken,
      },
    });
  } catch (err: any) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Server error during login' });
  }
}

export async function adminLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ success: false, error: 'Email and password required' });
      return;
    }

    const emailLower = email.toLowerCase().trim();
    const result = await query<{ id: string; name: string; email: string; password_hash: string; role: string; status: string }>(
      'SELECT id, name, email, password_hash, role, status FROM users WHERE email = $1',
      [emailLower]
    );

    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    if (!['super_admin', 'org_admin'].includes(user.role)) {
      res.status(403).json({ success: false, error: 'Access denied: Admin credentials required' });
      return;
    }

    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role as any });
    const refreshToken = signRefreshToken(user.id);

    await writeAuditLog({
      actorUserId: user.id,
      action: 'admin.login',
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        accessToken,
        refreshToken,
      },
    });
  } catch (err: any) {
    console.error('Admin Login error:', err);
    res.status(500).json({ success: false, error: 'Server error during admin login' });
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await query<{ id: string; name: string; email: string; role: string; status: string; created_at: Date }>(
      'SELECT id, name, email, role, status, created_at FROM users WHERE id = $1',
      [req.user.sub]
    );

    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (req.user) {
      await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.sub]);
      await writeAuditLog({ actorUserId: req.user.sub, action: 'user.logout', ipAddress: req.ip });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
}
