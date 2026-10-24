-- FICA / credit screening checks (server-side, provider-backed).
-- The agency is the FICA accountable institution; Lekaya is the POPIA operator.
-- Full provider results are stored AES-256-GCM encrypted by the API
-- (server/screeningCrypto.ts) and cleared by /api/cron/screening-purge after
-- retain_until. Summaries and the append-only audit stay.
-- Node persist uses DATABASE_URL and bypasses RLS; these policies protect
-- browser-side reads (agency staff of the row's client, or the consenting subject).

-- -----------------------------------------------------------------------------
-- Consents (given by the subject only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS screening_consents (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  application_id         UUID REFERENCES applications(id) ON DELETE SET NULL,
  subject_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  subject_name           VARCHAR(160) NOT NULL,
  subject_id_last4       VARCHAR(4),
  subject_id_encrypted   BYTEA,
  subject_id_key_id      VARCHAR(40),
  check_types            TEXT[] NOT NULL,
  consent_text_version   VARCHAR(40) NOT NULL,
  consent_text_hash      CHAR(64) NOT NULL,
  typed_name             VARCHAR(160) NOT NULL,
  accepted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ NOT NULL,
  ip                     VARCHAR(64),
  user_agent             TEXT,
  withdrawn_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT screening_consents_check_types_check CHECK (
    cardinality(check_types) > 0
    AND check_types <@ ARRAY['ID_VERIFY', 'LIVENESS', 'BANK_AVS', 'CREDIT', 'RENTAL_HISTORY']::text[]
  )
);

CREATE INDEX IF NOT EXISTS idx_screening_consents_client ON screening_consents (client_id);
CREATE INDEX IF NOT EXISTS idx_screening_consents_application ON screening_consents (application_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_screening_consents_subject ON screening_consents (subject_user_id);

-- -----------------------------------------------------------------------------
-- Checks (one row per provider attempt; a fallback retry links previous_check_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS screening_checks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  application_id     UUID REFERENCES applications(id) ON DELETE SET NULL,
  consent_id         UUID NOT NULL REFERENCES screening_consents(id) ON DELETE RESTRICT,
  check_type         VARCHAR(20) NOT NULL
                       CHECK (check_type IN ('ID_VERIFY', 'LIVENESS', 'BANK_AVS', 'CREDIT', 'RENTAL_HISTORY')),
  provider           VARCHAR(40) NOT NULL,
  provider_ref       VARCHAR(160),
  status             VARCHAR(20) NOT NULL DEFAULT 'REQUESTED'
                       CHECK (status IN ('REQUESTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'REFER', 'ERROR', 'CANCELLED')),
  result_summary     JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_encrypted   BYTEA,
  result_key_id      VARCHAR(40),
  retain_until       TIMESTAMPTZ,
  purged_at          TIMESTAMPTZ,
  attempt            INT NOT NULL DEFAULT 1,
  previous_check_id  UUID REFERENCES screening_checks(id) ON DELETE SET NULL,
  requested_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_screening_checks_client ON screening_checks (client_id);
CREATE INDEX IF NOT EXISTS idx_screening_checks_application ON screening_checks (application_id, check_type, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_screening_checks_provider_ref ON screening_checks (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_screening_checks_purge ON screening_checks (retain_until)
  WHERE result_encrypted IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Audit (append-only: no UPDATE / DELETE / TRUNCATE, even for the table owner)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS screening_check_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  check_id        UUID REFERENCES screening_checks(id) ON DELETE RESTRICT,
  consent_id      UUID REFERENCES screening_consents(id) ON DELETE RESTRICT,
  action          VARCHAR(30) NOT NULL
                    CHECK (action IN (
                      'CONSENT_GIVEN', 'CONSENT_WITHDRAWN', 'REQUESTED', 'REUSED',
                      'STATUS_CHANGED', 'WEBHOOK', 'CHARGED', 'VIEWED_FULL', 'PURGED'
                    )),
  actor_user_id   UUID REFERENCES users(id) ON DELETE RESTRICT,
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_screening_check_audit_client ON screening_check_audit (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_screening_check_audit_check ON screening_check_audit (check_id, created_at);

CREATE OR REPLACE FUNCTION screening_check_audit_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'screening_check_audit is append-only (% blocked)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS screening_check_audit_no_update ON screening_check_audit;
CREATE TRIGGER screening_check_audit_no_update
  BEFORE UPDATE OR DELETE ON screening_check_audit
  FOR EACH ROW EXECUTE FUNCTION screening_check_audit_block();

DROP TRIGGER IF EXISTS screening_check_audit_no_truncate ON screening_check_audit;
CREATE TRIGGER screening_check_audit_no_truncate
  BEFORE TRUNCATE ON screening_check_audit
  FOR EACH STATEMENT EXECUTE FUNCTION screening_check_audit_block();

REVOKE UPDATE, DELETE, TRUNCATE ON screening_check_audit FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON screening_check_audit FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON screening_check_audit FROM anon';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Charges (one per billable check; ERROR / CANCELLED never charge)
-- invoice_id has no FK: invoices are persisted asynchronously from the client.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS screening_charges (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  check_id       UUID NOT NULL REFERENCES screening_checks(id) ON DELETE RESTRICT,
  provider       VARCHAR(40) NOT NULL,
  check_type     VARCHAR(20) NOT NULL,
  cost_cents     INT NOT NULL CHECK (cost_cents >= 0),
  markup_bps     INT NOT NULL DEFAULT 0 CHECK (markup_bps >= 0),
  price_cents    INT NOT NULL CHECK (price_cents >= 0),
  payer          VARCHAR(20) NOT NULL DEFAULT 'AGENCY' CHECK (payer IN ('AGENCY', 'APPLICANT')),
  billing_month  DATE NOT NULL,
  invoice_id     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (check_id)
);

CREATE INDEX IF NOT EXISTS idx_screening_charges_client_month ON screening_charges (client_id, billing_month);

-- Platform price list (SUPER_ADMIN): price = cost x (1 + markup_bps / 10000).
CREATE TABLE IF NOT EXISTS screening_provider_prices (
  provider     VARCHAR(40) NOT NULL,
  check_type   VARCHAR(20) NOT NULL
                 CHECK (check_type IN ('ID_VERIFY', 'LIVENESS', 'BANK_AVS', 'CREDIT', 'RENTAL_HISTORY')),
  cost_cents   INT NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  markup_bps   INT NOT NULL DEFAULT 0 CHECK (markup_bps >= 0),
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, check_type)
);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE screening_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS screening_consents_select ON screening_consents;
CREATE POLICY screening_consents_select ON screening_consents
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
    )
    OR subject_user_id = current_app_user_id()
  );
DROP POLICY IF EXISTS screening_consents_insert ON screening_consents;
CREATE POLICY screening_consents_insert ON screening_consents
  FOR INSERT TO authenticated
  WITH CHECK (subject_user_id = current_app_user_id());

ALTER TABLE screening_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS screening_checks_select ON screening_checks;
CREATE POLICY screening_checks_select ON screening_checks
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
    )
  );

ALTER TABLE screening_check_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS screening_check_audit_select ON screening_check_audit;
CREATE POLICY screening_check_audit_select ON screening_check_audit
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN')
      AND client_id = current_app_client_id()
    )
  );

ALTER TABLE screening_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS screening_charges_select ON screening_charges;
CREATE POLICY screening_charges_select ON screening_charges
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN')
      AND client_id = current_app_client_id()
    )
  );

ALTER TABLE screening_provider_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS screening_provider_prices_select ON screening_provider_prices;
CREATE POLICY screening_provider_prices_select ON screening_provider_prices
  FOR SELECT TO authenticated
  USING (true);
DROP POLICY IF EXISTS screening_provider_prices_mutate ON screening_provider_prices;
CREATE POLICY screening_provider_prices_mutate ON screening_provider_prices
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
