import { query } from '../config/db.js';

export async function writeAuditLog({
  actorUserId,
  action,
  targetDeviceId,
  targetUserId,
  metadata,
  ipAddress,
}: {
  actorUserId?: string | null;
  action: string;
  targetDeviceId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}) {
  try {
    await query(
      `INSERT INTO audit_logs (actor_user_id, action, target_device_id, target_user_id, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        actorUserId ?? null,
        action,
        targetDeviceId ?? null,
        targetUserId ?? null,
        metadata ? JSON.stringify(metadata) : null,
        ipAddress ?? null,
      ]
    );
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}
