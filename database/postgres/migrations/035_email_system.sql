-- Email system: one-time links (confirm email, reset / choose password),
-- a log of every email sent, and which notifications were emailed.
-- The server also creates these on first use; running this file is safe to repeat.

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     VARCHAR(30) NOT NULL,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens (user_id, purpose);

CREATE TABLE IF NOT EXISTS email_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  to_email    VARCHAR(190) NOT NULL,
  category    VARCHAR(60),
  subject     VARCHAR(300) NOT NULL,
  provider    VARCHAR(20) NOT NULL,
  status      VARCHAR(20) NOT NULL,
  error       TEXT,
  message_id  VARCHAR(200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log (created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'emailed_at'
  ) THEN
    ALTER TABLE notifications ADD COLUMN emailed_at TIMESTAMPTZ;
    ALTER TABLE notifications ADD COLUMN email_status VARCHAR(20);
    -- Existing notifications are history: never email them.
    UPDATE notifications SET emailed_at = NOW(), email_status = 'history';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_notifications_email_pending ON notifications (created_at) WHERE emailed_at IS NULL;
