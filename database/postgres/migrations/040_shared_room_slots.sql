-- 040: shared accommodation — several tenants on one property, one per bed.
--
-- leases.room_slot names the bed a lease is for ("Room 2 · Bed 1"). A whole
-- property lease has no slot, so it still blocks any other overlapping lease
-- on the unit. Shared leases only clash with another lease on the same bed.
-- A shared lease that has no bed yet gets a slot unique to itself
-- ("pending:<lease id>"), set by the API, until the agency assigns a bed.
-- Add-only and safe to run more than once.

ALTER TABLE leases ADD COLUMN IF NOT EXISTS room_slot text;

DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
    FROM pg_constraint
   WHERE conname = 'leases_no_date_overlap' AND conrelid = 'public.leases'::regclass;
  IF def IS NOT NULL AND position('room_slot' in def) = 0 THEN
    ALTER TABLE leases DROP CONSTRAINT leases_no_date_overlap;
    def := NULL;
  END IF;
  IF def IS NULL THEN
    ALTER TABLE leases ADD CONSTRAINT leases_no_date_overlap
      EXCLUDE USING gist (
        unit_id WITH =,
        (COALESCE(room_slot, '')) WITH =,
        daterange(
          start_date,
          CASE WHEN end_date IS NULL THEN 'infinity'::date ELSE (end_date + 1) END,
          '[)'
        ) WITH &&
      )
      WHERE (status IN ('PENDING', 'ACTIVE', 'NOTICE'));
  END IF;
END
$$;
