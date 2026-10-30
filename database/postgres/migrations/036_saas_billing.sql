-- Monthly Lekaya subscription invoices (server/saasBilling.ts also creates this on first use).
CREATE TABLE IF NOT EXISTS saas_invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number            VARCHAR(40) NOT NULL UNIQUE,
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period            CHAR(7) NOT NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date          DATE NOT NULL,
  tier_id           VARCHAR(40),
  property_count    INT NOT NULL DEFAULT 0,
  advertised_count  INT NOT NULL DEFAULT 0,
  lines             JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal          NUMERIC(14,2) NOT NULL,
  vat               NUMERIC(14,2) NOT NULL,
  total             NUMERIC(14,2) NOT NULL,
  amount_paid       NUMERIC(14,2) NOT NULL DEFAULT 0,
  status            VARCHAR(20) NOT NULL DEFAULT 'UNPAID'
                      CHECK (status IN ('UNPAID', 'PART_PAID', 'PAID', 'OVERDUE', 'VOID')),
  payments          JSONB NOT NULL DEFAULT '[]'::jsonb,
  proofs            JSONB NOT NULL DEFAULT '[]'::jsonb,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, period)
);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_status ON saas_invoices (status, due_date);
