-- DQ-M2 Mode A: dual-control actors for deposit release (in-app status only).
-- Does not broaden RLS; does not invent bank/partner settlement.

ALTER TABLE deposit_holdings
  ADD COLUMN IF NOT EXISTS release_proposed_by uuid,
  ADD COLUMN IF NOT EXISTS release_approved_by uuid;
