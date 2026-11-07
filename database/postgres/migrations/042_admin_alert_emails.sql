-- 042: who receives the platform's admin emails (new sign-ups, listings
-- waiting for approval, escalations, compliance, storage and billing alerts).
-- Every super admin still sees these notices in the app; the email goes to
-- these addresses only (Admin -> Emails -> Admin alert emails to change them).
-- Add-only and safe to run again: an existing (edited) list is kept.

CREATE TABLE IF NOT EXISTS platform_settings (
  key         VARCHAR(80) PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO platform_settings (key, value)
VALUES ('admin_alert_emails', '{"emails":["sambampo200@gmail.com","samuel@lekayarentals.site"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;
