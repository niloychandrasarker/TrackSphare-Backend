-- TrackSphere Performance Indexes

-- Users
CREATE INDEX IF NOT EXISTS idx_users_email  ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- Devices
CREATE INDEX IF NOT EXISTS idx_devices_user_id        ON devices (user_id);
CREATE INDEX IF NOT EXISTS idx_devices_sharing_enabled ON devices (sharing_enabled);
CREATE INDEX IF NOT EXISTS idx_devices_status          ON devices (status);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen_at    ON devices (last_seen_at DESC);

-- Device Viewers
CREATE INDEX IF NOT EXISTS idx_device_viewers_device_id      ON device_viewers (device_id);
CREATE INDEX IF NOT EXISTS idx_device_viewers_viewer_user_id ON device_viewers (viewer_user_id);
CREATE INDEX IF NOT EXISTS idx_device_viewers_status         ON device_viewers (status);

-- Consent Records
CREATE INDEX IF NOT EXISTS idx_consent_records_device_id ON consent_records (device_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_user_id   ON consent_records (user_id);

-- Sharing Sessions
CREATE INDEX IF NOT EXISTS idx_sharing_sessions_device_id ON sharing_sessions (device_id);
CREATE INDEX IF NOT EXISTS idx_sharing_sessions_status    ON sharing_sessions (status);

-- Locations (most critical — high volume)
CREATE INDEX IF NOT EXISTS idx_locations_device_id              ON locations (device_id);
CREATE INDEX IF NOT EXISTS idx_locations_recorded_at            ON locations (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_locations_device_id_recorded_at  ON locations (device_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_locations_received_at            ON locations (received_at DESC);

-- Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id    ON audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_device_id ON audit_logs (target_device_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at       ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action           ON audit_logs (action);

-- Refresh Tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

-- Organization Members
CREATE INDEX IF NOT EXISTS idx_org_members_org_id  ON organization_members (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON organization_members (user_id);
