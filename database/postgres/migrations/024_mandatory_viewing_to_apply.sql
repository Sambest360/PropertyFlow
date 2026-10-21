-- Mandatory viewing before a rental application.
-- Agency default lives in clients.settings.requireViewingToApply (missing key = on).

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS viewing_mode VARCHAR(20) NOT NULL DEFAULT 'IN_PERSON';

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_viewing_mode_check;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_viewing_mode_check
  CHECK (viewing_mode IN ('IN_PERSON', 'VIRTUAL'));

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS attended_marked_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS attended_marked_at TIMESTAMPTZ;

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS require_viewing_to_apply BOOLEAN NULL;

CREATE TABLE IF NOT EXISTS apply_overrides (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id          UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  applicant_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  applicant_email  VARCHAR(190),
  granted_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  reason_code      VARCHAR(40) NOT NULL
                     CHECK (reason_code IN ('VIRTUAL_VIEWING', 'OUT_OF_TOWN', 'REPEAT_TENANT', 'OTHER')),
  reason_text      TEXT NOT NULL,
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT apply_overrides_applicant_present
    CHECK (applicant_id IS NOT NULL OR (applicant_email IS NOT NULL AND length(trim(applicant_email)) > 0))
);

CREATE INDEX IF NOT EXISTS idx_apply_overrides_client ON apply_overrides (client_id);
CREATE INDEX IF NOT EXISTS idx_apply_overrides_unit_applicant
  ON apply_overrides (unit_id, applicant_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_apply_overrides_email
  ON apply_overrides (unit_id, applicant_email)
  WHERE applicant_email IS NOT NULL;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS viewing_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS apply_override_id UUID REFERENCES apply_overrides(id) ON DELETE SET NULL;

ALTER TABLE apply_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apply_overrides_select ON apply_overrides;
CREATE POLICY apply_overrides_select ON apply_overrides
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR client_id = current_app_client_id()
    OR current_app_user_role() IN ('LANDLORD', 'END_USER', 'CONTRACTOR')
  );

DROP POLICY IF EXISTS apply_overrides_mutate ON apply_overrides;
CREATE POLICY apply_overrides_mutate ON apply_overrides
  FOR ALL TO authenticated
  USING (is_super_admin() OR client_id = current_app_client_id())
  WITH CHECK (is_super_admin() OR client_id = current_app_client_id());
