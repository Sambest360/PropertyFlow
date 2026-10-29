-- 031: building addresses that picked up ", <unit number>" on every listing save
-- (the listing's display address was written back as the building address).
-- Strips every trailing ", <unit number>" for the building's own units. Safe to re-run.
DO $$
DECLARE
  r RECORD;
  addr TEXT;
  suffix TEXT;
BEGIN
  FOR r IN
    SELECT DISTINCT b.id AS building_id, u.unit_number
      FROM buildings b
      JOIN units u ON u.building_id = b.id
     WHERE u.unit_number IS NOT NULL
       AND u.unit_number NOT IN ('HOUSE', 'MAIN', '')
       AND b.address ILIKE '%, ' || u.unit_number
  LOOP
    SELECT address INTO addr FROM buildings WHERE id = r.building_id;
    suffix := ', ' || r.unit_number;
    WHILE lower(addr) LIKE '%' || lower(suffix) AND length(addr) > length(suffix) LOOP
      addr := rtrim(left(addr, length(addr) - length(suffix)));
    END LOOP;
    UPDATE buildings SET address = addr, updated_at = NOW() WHERE id = r.building_id;
  END LOOP;
END $$;
