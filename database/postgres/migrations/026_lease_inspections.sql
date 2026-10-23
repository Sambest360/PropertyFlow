-- 026: Lease-scoped move-in / move-out inspections (Rental Housing Act s5(3)).
-- Application PCR packs are unchanged. Idempotent: safe to re-run.
--
-- Photos and the inspection PDF are documents rows (category INSPECTION, note
-- 'inspection-file:*'); inspection_items.photos / internal_assets.photos hold
-- [{documentId, uploadedAt, uploadedBy, uploaderRole, mimeType, bytes}].

-- Files are stored inline as data URLs in documents.storage_url, which was
-- VARCHAR(1000) (too short for a compressed photo or a PDF).
ALTER TABLE documents ALTER COLUMN storage_url TYPE TEXT;

ALTER TABLE internal_assets
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE internal_assets DROP CONSTRAINT IF EXISTS internal_assets_quantity_positive;
ALTER TABLE internal_assets
  ADD CONSTRAINT internal_assets_quantity_positive CHECK (quantity > 0);

CREATE TABLE IF NOT EXISTS inventory_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  property_type   VARCHAR(40) NOT NULL CHECK (property_type IN ('house', 'apartment', 'room')),
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, property_type)
);

CREATE INDEX IF NOT EXISTS idx_inventory_templates_client ON inventory_templates (client_id);

CREATE TABLE IF NOT EXISTS inspections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id                 UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  lease_id                UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  type                    VARCHAR(20) NOT NULL CHECK (type IN ('MOVE_IN', 'MOVE_OUT', 'ROUTINE')),
  status                  VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
                            CHECK (status IN ('DRAFT', 'AWAITING_SIGNATURES', 'SIGNED', 'DISPUTED')),
  scheduled_at            TIMESTAMPTZ,
  conducted_at            TIMESTAMPTZ,
  tenant_attended         BOOLEAN NOT NULL DEFAULT TRUE,
  baseline_inspection_id  UUID REFERENCES inspections(id) ON DELETE SET NULL,
  pdf_document_id         UUID REFERENCES documents(id) ON DELETE SET NULL,
  dispute_note            TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspections_client ON inspections (client_id);
CREATE INDEX IF NOT EXISTS idx_inspections_lease ON inspections (lease_id, type);
CREATE INDEX IF NOT EXISTS idx_inspections_unit ON inspections (unit_id);

CREATE TABLE IF NOT EXISTS inspection_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  inspection_id   UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  asset_id        UUID REFERENCES internal_assets(id) ON DELETE SET NULL,
  room_id         UUID REFERENCES rooms(id) ON DELETE SET NULL,
  item_name       VARCHAR(160) NOT NULL,
  quantity        INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  condition       VARCHAR(40),
  outcome         VARCHAR(20) CHECK (outcome IS NULL OR outcome IN ('OK', 'DAMAGED', 'MISSING', 'WEAR_AND_TEAR')),
  notes           TEXT,
  photos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  tenant_comment  TEXT,
  addendum        BOOLEAN NOT NULL DEFAULT FALSE,
  added_at        TIMESTAMPTZ,
  tenant_agreed   BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspection_items_inspection ON inspection_items (inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_items_client ON inspection_items (client_id);

CREATE TABLE IF NOT EXISTS inspection_signatures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  inspection_id   UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  signer_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  role            VARCHAR(20) NOT NULL CHECK (role IN ('TENANT', 'AGENT', 'LANDLORD')),
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip              VARCHAR(80),
  method          VARCHAR(20) NOT NULL DEFAULT 'IN_APP' CHECK (method IN ('IN_APP', 'ESIGN')),
  witness_note    TEXT,
  tenant_declined BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (inspection_id, role)
);

CREATE INDEX IF NOT EXISTS idx_inspection_signatures_client ON inspection_signatures (client_id);

CREATE TABLE IF NOT EXISTS deposit_deductions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  lease_id            UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  inspection_item_id  UUID REFERENCES inspection_items(id) ON DELETE SET NULL,
  description         VARCHAR(255) NOT NULL,
  amount_cents        INT NOT NULL CHECK (amount_cents >= 0),
  evidence            JSONB NOT NULL DEFAULT '[]'::jsonb,
  status              VARCHAR(20) NOT NULL DEFAULT 'SUGGESTED'
                        CHECK (status IN ('SUGGESTED', 'APPROVED', 'REJECTED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_deductions_lease ON deposit_deductions (lease_id, status);
CREATE INDEX IF NOT EXISTS idx_deposit_deductions_client ON deposit_deductions (client_id);

-- Tighter than the generic END_USER select: a tenant or landlord sees only their lease.
CREATE OR REPLACE FUNCTION public.inspection_row_visible(p_client uuid, p_lease uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND p_client IS NOT DISTINCT FROM current_app_client_id()
    )
    OR EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = p_lease
        AND (
          (current_app_user_role() = 'END_USER' AND l.tenant_id = current_app_user_id())
          OR (current_app_user_role() = 'LANDLORD' AND l.landlord_id = current_app_user_id())
        )
    );
$$;

ALTER TABLE inventory_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_templates_select ON inventory_templates;
CREATE POLICY inventory_templates_select ON inventory_templates
  FOR SELECT TO authenticated
  USING (is_super_admin() OR client_id = current_app_client_id());
DROP POLICY IF EXISTS inventory_templates_mutate ON inventory_templates;
CREATE POLICY inventory_templates_mutate ON inventory_templates
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  );

ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inspections_select ON inspections;
CREATE POLICY inspections_select ON inspections
  FOR SELECT TO authenticated
  USING (inspection_row_visible(client_id, lease_id));
DROP POLICY IF EXISTS inspections_mutate ON inspections;
CREATE POLICY inspections_mutate ON inspections
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  );

ALTER TABLE inspection_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inspection_items_select ON inspection_items;
CREATE POLICY inspection_items_select ON inspection_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_items.inspection_id
        AND inspection_row_visible(i.client_id, i.lease_id)
    )
  );
DROP POLICY IF EXISTS inspection_items_mutate ON inspection_items;
CREATE POLICY inspection_items_mutate ON inspection_items
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  );

ALTER TABLE inspection_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inspection_signatures_select ON inspection_signatures;
CREATE POLICY inspection_signatures_select ON inspection_signatures
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_signatures.inspection_id
        AND inspection_row_visible(i.client_id, i.lease_id)
    )
  );
DROP POLICY IF EXISTS inspection_signatures_mutate ON inspection_signatures;
CREATE POLICY inspection_signatures_mutate ON inspection_signatures
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  );

ALTER TABLE deposit_deductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deposit_deductions_select ON deposit_deductions;
CREATE POLICY deposit_deductions_select ON deposit_deductions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leases l
      WHERE l.id = deposit_deductions.lease_id
        AND inspection_row_visible(l.client_id, l.id)
    )
  );
DROP POLICY IF EXISTS deposit_deductions_mutate ON deposit_deductions;
CREATE POLICY deposit_deductions_mutate ON deposit_deductions
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() = 'LANDLORD'
      AND EXISTS (
        SELECT 1 FROM leases l
        WHERE l.id = deposit_deductions.lease_id
          AND l.landlord_id = current_app_user_id()
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() = 'LANDLORD'
      AND EXISTS (
        SELECT 1 FROM leases l
        WHERE l.id = deposit_deductions.lease_id
          AND l.landlord_id = current_app_user_id()
      )
    )
  );

-- documents_select (003) lets any END_USER / LANDLORD read every document row.
-- Inspection files get the lease rule on top (RESTRICTIVE: ANDed with it).
DROP POLICY IF EXISTS documents_inspection_files_scope ON documents;
CREATE POLICY documents_inspection_files_scope ON documents
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    category <> 'INSPECTION'
    OR COALESCE(note, '') NOT LIKE 'inspection-file:%'
    OR (lease_id IS NOT NULL AND inspection_row_visible(client_id, lease_id))
    OR (
      lease_id IS NULL
      AND (
        is_super_admin()
        OR (
          current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
          AND client_id = current_app_client_id()
        )
      )
    )
  );
