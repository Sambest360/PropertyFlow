-- PayFast ITN audit log.
-- Migration numbers 011, 012, and 013 are reserved.
-- Local schema change. Do not apply this to a hosted database from automation.
--
-- The API connects as the database owner/superuser, which is not subject to
-- forced RLS. anon and authenticated have no privileges and no policy, so the
-- table is readable by the server only.

CREATE TABLE IF NOT EXISTS payfast_itn_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_body         TEXT NOT NULL,
  headers          JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_ip        TEXT,
  pf_payment_id    TEXT,
  payment_status   TEXT,
  signature_valid  BOOLEAN,
  validate_passed  BOOLEAN,
  outcome          TEXT NOT NULL,
  CONSTRAINT payfast_itn_events_pf_status_key UNIQUE (pf_payment_id, payment_status)
);

ALTER TABLE payfast_itn_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payfast_itn_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE payfast_itn_events FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE payfast_itn_events FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE payfast_itn_events FROM authenticated';
  END IF;
END $$;
