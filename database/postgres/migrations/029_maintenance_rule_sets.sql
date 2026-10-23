-- 029: maintenance responsibility rules (who fixes what).
--
-- maintenance_rule_sets
--   client_id NULL            platform template (seeded below, one per property_type)
--   client_id, unit_id NULL   agency default for a property_type
--   client_id, unit_id        rule set for one unit (usually from its lease / conduct rules)
-- A set is never edited in place once tickets use it: an update writes a new
-- version and deactivates the old one, so a ticket's rule_item_id snapshot
-- keeps the rule that applied when it was logged.
--
-- Seeded templates are defaults only: check them against the lease and, for
-- sectional title, the body corporate conduct rules (STSMA).

CREATE TABLE IF NOT EXISTS maintenance_rule_sets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID REFERENCES clients(id) ON DELETE CASCADE,
  unit_id               UUID REFERENCES units(id) ON DELETE CASCADE,
  property_type         VARCHAR(40)
                          CHECK (property_type IS NULL OR property_type IN ('house', 'apartment', 'townhouse', 'room')),
  name                  VARCHAR(160) NOT NULL,
  source_document_id    UUID REFERENCES documents(id) ON DELETE SET NULL,
  source_url            VARCHAR(1000),
  body_corporate_email  VARCHAR(190),
  version               INT NOT NULL DEFAULT 1 CHECK (version >= 1),
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT maintenance_rule_sets_unit_needs_client CHECK (unit_id IS NULL OR client_id IS NOT NULL),
  CONSTRAINT maintenance_rule_sets_default_needs_type CHECK (unit_id IS NOT NULL OR property_type IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_rule_sets_client ON maintenance_rule_sets (client_id);
-- One active set per unit, per agency default type, per platform template type.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_sets_unit_active
  ON maintenance_rule_sets (unit_id) WHERE active AND unit_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_sets_agency_default_active
  ON maintenance_rule_sets (client_id, property_type) WHERE active AND unit_id IS NULL AND client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_sets_platform_active
  ON maintenance_rule_sets (property_type) WHERE active AND client_id IS NULL;

CREATE TABLE IF NOT EXISTS maintenance_rule_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id           UUID NOT NULL REFERENCES maintenance_rule_sets(id) ON DELETE CASCADE,
  category_key          VARCHAR(80) NOT NULL,
  label                 VARCHAR(200) NOT NULL,
  room_group            VARCHAR(40) NOT NULL DEFAULT 'general',
  responsible_party     VARCHAR(20) NOT NULL
                          CHECK (responsible_party IN ('LANDLORD', 'TENANT', 'BODY_CORPORATE', 'SHARED')),
  guidance_text         TEXT NOT NULL DEFAULT '',
  clause_ref            VARCHAR(80),
  tenant_can_log        BOOLEAN NOT NULL DEFAULT TRUE,
  default_priority      VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
                          CHECK (default_priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY')),
  vendor_category_key   VARCHAR(80),
  is_safety             BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order            INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_set_id, category_key)
);

CREATE INDEX IF NOT EXISTS idx_rule_items_set ON maintenance_rule_items (rule_set_id);

ALTER TABLE maintenance_tickets
  ADD COLUMN IF NOT EXISTS responsible_party VARCHAR(20),
  ADD COLUMN IF NOT EXISTS rule_item_id UUID REFERENCES maintenance_rule_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_safety_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS responsibility_overridden_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

ALTER TABLE maintenance_tickets DROP CONSTRAINT IF EXISTS maintenance_tickets_responsible_party_check;
ALTER TABLE maintenance_tickets
  ADD CONSTRAINT maintenance_tickets_responsible_party_check
  CHECK (responsible_party IS NULL OR responsible_party IN ('LANDLORD', 'TENANT', 'BODY_CORPORATE', 'SHARED'));

CREATE INDEX IF NOT EXISTS idx_tickets_responsible_party ON maintenance_tickets (client_id, responsible_party);

-- RLS (same shape as 023_units_delete_rls.sql). Node persist uses DATABASE_URL
-- and bypasses RLS; these policies guard direct Supabase client reads/writes.
ALTER TABLE maintenance_rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_rule_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_rule_sets_select ON maintenance_rule_sets;
CREATE POLICY maintenance_rule_sets_select ON maintenance_rule_sets
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR client_id IS NULL
    OR client_id = current_app_client_id()
  );

DROP POLICY IF EXISTS maintenance_rule_sets_insert ON maintenance_rule_sets;
CREATE POLICY maintenance_rule_sets_insert ON maintenance_rule_sets
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
    )
  );

DROP POLICY IF EXISTS maintenance_rule_sets_update ON maintenance_rule_sets;
CREATE POLICY maintenance_rule_sets_update ON maintenance_rule_sets
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
    )
  );

-- Sets are deactivated, never deleted (tickets keep their rule snapshot).
DROP POLICY IF EXISTS maintenance_rule_sets_delete ON maintenance_rule_sets;
CREATE POLICY maintenance_rule_sets_delete ON maintenance_rule_sets
  FOR DELETE TO authenticated
  USING (is_super_admin());

DROP POLICY IF EXISTS maintenance_rule_items_select ON maintenance_rule_items;
CREATE POLICY maintenance_rule_items_select ON maintenance_rule_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM maintenance_rule_sets s
      WHERE s.id = rule_set_id
        AND (is_super_admin() OR s.client_id IS NULL OR s.client_id = current_app_client_id())
    )
  );

DROP POLICY IF EXISTS maintenance_rule_items_mutate ON maintenance_rule_items;
CREATE POLICY maintenance_rule_items_mutate ON maintenance_rule_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM maintenance_rule_sets s
      WHERE s.id = rule_set_id
        AND (
          is_super_admin()
          OR (
            current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT', 'AGENT')
            AND s.client_id = current_app_client_id()
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maintenance_rule_sets s
      WHERE s.id = rule_set_id
        AND (
          is_super_admin()
          OR (
            current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT', 'AGENT')
            AND s.client_id = current_app_client_id()
          )
        )
    )
  );

-- Platform templates: default, check against lease and conduct rules.
-- Mirrors SEED_RULE_ITEMS in src/lib/maintenanceRules.ts (pinned by a test).
INSERT INTO maintenance_rule_sets (id, client_id, unit_id, property_type, name, version, active) VALUES
  ('00000000-0000-4029-8000-000000000001', NULL, NULL, 'house', 'House: default, check against lease and conduct rules', 1, TRUE),
  ('00000000-0000-4029-8000-000000000002', NULL, NULL, 'apartment', 'Apartment: default, check against lease and conduct rules', 1, TRUE),
  ('00000000-0000-4029-8000-000000000003', NULL, NULL, 'townhouse', 'Townhouse: default, check against lease and conduct rules', 1, TRUE),
  ('00000000-0000-4029-8000-000000000004', NULL, NULL, 'room', 'Room: default, check against lease and conduct rules', 1, TRUE)
ON CONFLICT (id) DO NOTHING;

-- @seed-items-begin
-- house
INSERT INTO maintenance_rule_items (rule_set_id, category_key, label, room_group, responsible_party, guidance_text, clause_ref, tenant_can_log, default_priority, vendor_category_key, is_safety, sort_order) VALUES
  ('00000000-0000-4029-8000-000000000001', 'ROOF_LEAK', 'Roof leak', 'exterior', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'HIGH', 'STRUCTURAL', FALSE, 1),
  ('00000000-0000-4029-8000-000000000001', 'GEYSER_BURST', 'Geyser burst or leaking', 'bathroom', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor. Switch the geyser off at the board and close the water inlet if you can.', NULL, TRUE, 'URGENT', 'PLUMBING', TRUE, 2),
  ('00000000-0000-4029-8000-000000000001', 'ELECTRICAL_FAULT', 'Electrical fault (plugs, wiring, DB board tripping)', 'electrical', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor. Do not touch exposed wiring.', NULL, TRUE, 'HIGH', 'ELECTRICAL', TRUE, 3),
  ('00000000-0000-4029-8000-000000000001', 'STRUCTURAL_CRACKS', 'Structural cracks in walls or ceilings', 'exterior', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'MEDIUM', 'STRUCTURAL', FALSE, 4),
  ('00000000-0000-4029-8000-000000000001', 'PLUMBING_PIPES', 'Leaking or burst pipes, taps, toilet cistern', 'plumbing', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'HIGH', 'PLUMBING', FALSE, 5),
  ('00000000-0000-4029-8000-000000000001', 'APPLIANCE_FAILURE', 'Stove, oven or other appliance supplied with the home', 'kitchen', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'MEDIUM', 'APPLIANCE_FAILURE', FALSE, 6),
  ('00000000-0000-4029-8000-000000000001', 'BROKEN_WINDOW_TENANT', 'Window broken by me or a visitor', 'living', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'MEDIUM', NULL, FALSE, 7),
  ('00000000-0000-4029-8000-000000000001', 'DRAIN_BLOCKED_MISUSE', 'Drain or toilet blocked (wipes, fat, hair)', 'bathroom', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'MEDIUM', 'PLUMBING', FALSE, 8),
  ('00000000-0000-4029-8000-000000000001', 'LIGHT_BULBS', 'Light bulbs', 'living', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'LOW', NULL, FALSE, 9),
  ('00000000-0000-4029-8000-000000000001', 'GARDEN', 'Garden upkeep', 'outside', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'LOW', NULL, FALSE, 10)
ON CONFLICT (rule_set_id, category_key) DO NOTHING;
-- apartment
INSERT INTO maintenance_rule_items (rule_set_id, category_key, label, room_group, responsible_party, guidance_text, clause_ref, tenant_can_log, default_priority, vendor_category_key, is_safety, sort_order) VALUES
  ('00000000-0000-4029-8000-000000000002', 'GEYSER_BURST', 'Geyser burst or leaking', 'bathroom', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor. Switch the geyser off at the board and close the water inlet if you can.', NULL, TRUE, 'URGENT', 'PLUMBING', TRUE, 1),
  ('00000000-0000-4029-8000-000000000002', 'ELECTRICAL_FAULT', 'Electrical fault (plugs, wiring, DB board tripping)', 'electrical', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor. Do not touch exposed wiring.', NULL, TRUE, 'HIGH', 'ELECTRICAL', TRUE, 2),
  ('00000000-0000-4029-8000-000000000002', 'STRUCTURAL_CRACKS', 'Structural cracks in walls or ceilings', 'exterior', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'MEDIUM', 'STRUCTURAL', FALSE, 3),
  ('00000000-0000-4029-8000-000000000002', 'PLUMBING_PIPES', 'Leaking or burst pipes, taps, toilet cistern', 'plumbing', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'HIGH', 'PLUMBING', FALSE, 4),
  ('00000000-0000-4029-8000-000000000002', 'APPLIANCE_FAILURE', 'Stove, oven or other appliance supplied with the home', 'kitchen', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'MEDIUM', 'APPLIANCE_FAILURE', FALSE, 5),
  ('00000000-0000-4029-8000-000000000002', 'BROKEN_WINDOW_TENANT', 'Window broken by me or a visitor', 'living', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'MEDIUM', NULL, FALSE, 6),
  ('00000000-0000-4029-8000-000000000002', 'DRAIN_BLOCKED_MISUSE', 'Drain or toilet blocked (wipes, fat, hair)', 'bathroom', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'MEDIUM', 'PLUMBING', FALSE, 7),
  ('00000000-0000-4029-8000-000000000002', 'LIGHT_BULBS', 'Light bulbs', 'living', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'LOW', NULL, FALSE, 8),
  ('00000000-0000-4029-8000-000000000002', 'LIFT', 'Lift broken', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'HIGH', NULL, FALSE, 9),
  ('00000000-0000-4029-8000-000000000002', 'COMMON_PASSAGE_LIGHTS', 'Passage or stairwell lights', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'MEDIUM', NULL, FALSE, 10),
  ('00000000-0000-4029-8000-000000000002', 'PERIMETER_WALL', 'Perimeter wall or electric fence', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'HIGH', NULL, TRUE, 11),
  ('00000000-0000-4029-8000-000000000002', 'POOL', 'Complex pool', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'LOW', NULL, FALSE, 12),
  ('00000000-0000-4029-8000-000000000002', 'COMPLEX_GATE_MOTOR', 'Complex gate or gate motor', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'HIGH', NULL, TRUE, 13),
  ('00000000-0000-4029-8000-000000000002', 'SECTIONAL_TITLE_ROOF', 'Roof leak (complex roof)', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'HIGH', NULL, FALSE, 14)
ON CONFLICT (rule_set_id, category_key) DO NOTHING;
-- townhouse
INSERT INTO maintenance_rule_items (rule_set_id, category_key, label, room_group, responsible_party, guidance_text, clause_ref, tenant_can_log, default_priority, vendor_category_key, is_safety, sort_order) VALUES
  ('00000000-0000-4029-8000-000000000003', 'GEYSER_BURST', 'Geyser burst or leaking', 'bathroom', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor. Switch the geyser off at the board and close the water inlet if you can.', NULL, TRUE, 'URGENT', 'PLUMBING', TRUE, 1),
  ('00000000-0000-4029-8000-000000000003', 'ELECTRICAL_FAULT', 'Electrical fault (plugs, wiring, DB board tripping)', 'electrical', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor. Do not touch exposed wiring.', NULL, TRUE, 'HIGH', 'ELECTRICAL', TRUE, 2),
  ('00000000-0000-4029-8000-000000000003', 'STRUCTURAL_CRACKS', 'Structural cracks in walls or ceilings', 'exterior', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'MEDIUM', 'STRUCTURAL', FALSE, 3),
  ('00000000-0000-4029-8000-000000000003', 'PLUMBING_PIPES', 'Leaking or burst pipes, taps, toilet cistern', 'plumbing', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'HIGH', 'PLUMBING', FALSE, 4),
  ('00000000-0000-4029-8000-000000000003', 'APPLIANCE_FAILURE', 'Stove, oven or other appliance supplied with the home', 'kitchen', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'MEDIUM', 'APPLIANCE_FAILURE', FALSE, 5),
  ('00000000-0000-4029-8000-000000000003', 'BROKEN_WINDOW_TENANT', 'Window broken by me or a visitor', 'living', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'MEDIUM', NULL, FALSE, 6),
  ('00000000-0000-4029-8000-000000000003', 'DRAIN_BLOCKED_MISUSE', 'Drain or toilet blocked (wipes, fat, hair)', 'bathroom', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'MEDIUM', 'PLUMBING', FALSE, 7),
  ('00000000-0000-4029-8000-000000000003', 'LIGHT_BULBS', 'Light bulbs', 'living', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'LOW', NULL, FALSE, 8),
  ('00000000-0000-4029-8000-000000000003', 'GARDEN', 'Garden upkeep', 'outside', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'LOW', NULL, FALSE, 9),
  ('00000000-0000-4029-8000-000000000003', 'COMMON_PASSAGE_LIGHTS', 'Passage or stairwell lights', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'MEDIUM', NULL, FALSE, 10),
  ('00000000-0000-4029-8000-000000000003', 'PERIMETER_WALL', 'Perimeter wall or electric fence', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'HIGH', NULL, TRUE, 11),
  ('00000000-0000-4029-8000-000000000003', 'POOL', 'Complex pool', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'LOW', NULL, FALSE, 12),
  ('00000000-0000-4029-8000-000000000003', 'COMPLEX_GATE_MOTOR', 'Complex gate or gate motor', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'HIGH', NULL, TRUE, 13),
  ('00000000-0000-4029-8000-000000000003', 'SECTIONAL_TITLE_ROOF', 'Roof leak (complex roof)', 'common', 'BODY_CORPORATE', 'This is common property. The body corporate (managing agent) fixes it; your agency will forward the report.', NULL, TRUE, 'HIGH', NULL, FALSE, 14)
ON CONFLICT (rule_set_id, category_key) DO NOTHING;
-- room
INSERT INTO maintenance_rule_items (rule_set_id, category_key, label, room_group, responsible_party, guidance_text, clause_ref, tenant_can_log, default_priority, vendor_category_key, is_safety, sort_order) VALUES
  ('00000000-0000-4029-8000-000000000004', 'ROOF_LEAK', 'Roof leak', 'exterior', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'HIGH', 'STRUCTURAL', FALSE, 1),
  ('00000000-0000-4029-8000-000000000004', 'GEYSER_BURST', 'Geyser burst or leaking', 'bathroom', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor. Switch the geyser off at the board and close the water inlet if you can.', NULL, TRUE, 'URGENT', 'PLUMBING', TRUE, 2),
  ('00000000-0000-4029-8000-000000000004', 'ELECTRICAL_FAULT', 'Electrical fault (plugs, wiring, DB board tripping)', 'electrical', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor. Do not touch exposed wiring.', NULL, TRUE, 'HIGH', 'ELECTRICAL', TRUE, 3),
  ('00000000-0000-4029-8000-000000000004', 'STRUCTURAL_CRACKS', 'Structural cracks in walls or ceilings', 'exterior', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'MEDIUM', 'STRUCTURAL', FALSE, 4),
  ('00000000-0000-4029-8000-000000000004', 'PLUMBING_PIPES', 'Leaking or burst pipes, taps, toilet cistern', 'plumbing', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'HIGH', 'PLUMBING', FALSE, 5),
  ('00000000-0000-4029-8000-000000000004', 'APPLIANCE_FAILURE', 'Stove, oven or other appliance supplied with the home', 'kitchen', 'LANDLORD', 'Your landlord fixes this. The agency will arrange a contractor.', NULL, TRUE, 'MEDIUM', 'APPLIANCE_FAILURE', FALSE, 6),
  ('00000000-0000-4029-8000-000000000004', 'BROKEN_WINDOW_TENANT', 'Window broken by me or a visitor', 'living', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'MEDIUM', NULL, FALSE, 7),
  ('00000000-0000-4029-8000-000000000004', 'DRAIN_BLOCKED_MISUSE', 'Drain or toilet blocked (wipes, fat, hair)', 'bathroom', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'MEDIUM', 'PLUMBING', FALSE, 8),
  ('00000000-0000-4029-8000-000000000004', 'LIGHT_BULBS', 'Light bulbs', 'living', 'TENANT', 'This is usually your responsibility under the lease. You can still log it; the agency will confirm and may quote you.', NULL, TRUE, 'LOW', NULL, FALSE, 9)
ON CONFLICT (rule_set_id, category_key) DO NOTHING;
-- @seed-items-end
