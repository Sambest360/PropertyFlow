-- P2.2: freeze per-application journey config at create time.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS journey_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS journey_version int;
