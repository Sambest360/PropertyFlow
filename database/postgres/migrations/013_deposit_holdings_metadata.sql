-- D2 deposit follow-ups: reject / cancel / refund audit fields live in
-- deposit_holdings.metadata (rejected/cancelled/refund by + at, refund split).
-- Additive and idempotent. Apply before deploying the D2 routes.
ALTER TABLE deposit_holdings
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
