-- 038: SMS notifications (server/sms.ts) and super-admin listing approvals
-- (server/listingApprovals.ts). Add-only and safe to run again; the server also
-- creates these on first use, this just makes the release explicit.

-- SMS log: every text attempt (number masked, no message body).
CREATE TABLE IF NOT EXISTS sms_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  to_masked   VARCHAR(30) NOT NULL,
  category    VARCHAR(60),
  provider    VARCHAR(20) NOT NULL,
  status      VARCHAR(20) NOT NULL,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_log_created ON sms_log (created_at DESC);

-- Which notifications were texted. On the first run older notifications are
-- marked as history so they are never texted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'sms_at'
  ) THEN
    ALTER TABLE notifications ADD COLUMN sms_at TIMESTAMPTZ;
    ALTER TABLE notifications ADD COLUMN sms_status VARCHAR(20);
    UPDATE notifications SET sms_at = NOW(), sms_status = 'history';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_notifications_sms_pending ON notifications (created_at) WHERE sms_at IS NULL;

-- Listing approvals: only a super admin makes a listing live. No FK on
-- unit_id: the gate runs just before a brand-new unit row is written.
CREATE TABLE IF NOT EXISTS listing_approvals (
  unit_id        UUID PRIMARY KEY,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  reviewed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  note           TEXT
);
CREATE INDEX IF NOT EXISTS idx_listing_approvals_status ON listing_approvals (status, requested_at DESC);
