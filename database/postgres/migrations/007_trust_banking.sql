-- Trust & Banking tables (GO#5 P0-7): immutable cashbook, allocations,
-- payouts, deposit holdings, arrears snapshots, CSV import batches.
-- Money is stored as BIGINT cents + ISO currency code (ZAR).

CREATE TABLE IF NOT EXISTS trust_transactions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  direction             text NOT NULL CHECK (direction IN ('in','out')),
  amount_cents          bigint NOT NULL CHECK (amount_cents >= 0),
  currency              text NOT NULL DEFAULT 'ZAR',
  value_date            date NOT NULL,
  posted_at             timestamptz NOT NULL DEFAULT NOW(),
  partner_txn_id        text,
  bank_ref              text,
  description           text NOT NULL DEFAULT '',
  counterparty_hash     text,
  status                text NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received','recognised','allocated','split_allocated','unallocated','reversed')),
  raw_payload_document_id uuid,
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trust_allocations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trust_transaction_id  uuid NOT NULL REFERENCES trust_transactions(id) ON DELETE CASCADE,
  occupancy_id          uuid,
  bucket_code           text NOT NULL DEFAULT 'unallocated',
  charge_id             uuid,
  amount_cents          bigint NOT NULL CHECK (amount_cents > 0),
  allocated_by          uuid,
  allocated_at          timestamptz NOT NULL DEFAULT NOW(),
  created_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payout_instructions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  occupancy_id          uuid,
  unit_id               uuid,
  payee_type            text NOT NULL DEFAULT 'landlord',
  payee_id              text,
  bank_account_id       text,
  amount_cents          bigint NOT NULL CHECK (amount_cents > 0),
  bucket_code           text NOT NULL DEFAULT 'owner_payable',
  status                text NOT NULL DEFAULT 'proposed'
                        CHECK (status IN ('proposed','pending_approval','approved','submitted','settled','failed','cancelled')),
  proposed_by           uuid,
  approved_by           uuid,
  submitted_at          timestamptz,
  settled_at            timestamptz,
  partner_payout_id     text,
  failure_reason        text,
  idempotency_key       text,
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deposit_holdings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  occupancy_id          uuid,
  unit_id               uuid,
  expected_cents        bigint NOT NULL DEFAULT 0,
  held_cents            bigint NOT NULL DEFAULT 0,
  interest_accrued_cents bigint NOT NULL DEFAULT 0,
  status                text NOT NULL DEFAULT 'expected'
                        CHECK (status IN ('expected','held','release_proposed','release_approved','refunded','applied_to_arrears','split','disputed')),
  statutory_deadline_on date,
  interest_rate_unknown boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arrears_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  occupancy_id          uuid,
  as_of                 date NOT NULL,
  current_cents         bigint NOT NULL DEFAULT 0,
  d30                   bigint NOT NULL DEFAULT 0,
  d60                   bigint NOT NULL DEFAULT 0,
  d90                   bigint NOT NULL DEFAULT 0,
  d90plus               bigint NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS csv_import_batches (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filename              text NOT NULL,
  row_count             int NOT NULL DEFAULT 0,
  imported_at           timestamptz NOT NULL DEFAULT NOW(),
  imported_by           uuid,
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','completed','failed')),
  created_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trust_txn_client_date ON trust_transactions (client_id, value_date DESC);
CREATE INDEX IF NOT EXISTS idx_trust_txn_status ON trust_transactions (client_id, status);
CREATE INDEX IF NOT EXISTS idx_payout_client_status ON payout_instructions (client_id, status);
CREATE INDEX IF NOT EXISTS idx_deposit_client ON deposit_holdings (client_id);
CREATE INDEX IF NOT EXISTS idx_arrears_client_asof ON arrears_snapshots (client_id, as_of DESC);

-- Anon read for the guest marketplace is NOT wanted here; auth-only.
ALTER TABLE trust_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE arrears_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE csv_import_batches ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their agency's trust data (demo-grade policy).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'trust_transactions','trust_allocations','payout_instructions',
    'deposit_holdings','arrears_snapshots','csv_import_batches'
  ] LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS trust_read_%1$s ON %1$I;
       CREATE POLICY trust_read_%1$s ON %1$I FOR SELECT TO authenticated USING (true);',
      t
    );
  END LOOP;
END $$;
