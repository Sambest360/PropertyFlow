ALTER TABLE units ADD COLUMN IF NOT EXISTS idempotency_key text NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_units_idempotency_key
  ON units (idempotency_key) WHERE idempotency_key IS NOT NULL;
