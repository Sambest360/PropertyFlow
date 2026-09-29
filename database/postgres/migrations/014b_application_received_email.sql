-- One application-received email per application.
-- Local schema change. Do not apply this to a hosted database from automation.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS received_email_at TIMESTAMPTZ;
