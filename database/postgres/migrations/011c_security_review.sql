-- Companion to 011_tenant_isolation.sql. apply.sh runs this in the same transaction.
-- Local rehearsal only. Does not change the 004/009 email re-link (that is migration 012).
-- Signup no longer becomes super admin: sync_auth_user_profile drops the empty-table branch.
-- The ON CONFLICT (email) update in that function is unchanged.

-- ---------------------------------------------------------------------------
-- Staff-only writes on the tables whose 003 policy was FOR ALL for any
-- same-agency user. Portal paths that are not staff stay as their own policies:
--   applications_insert_applicant / applications_update_applicant
--   messages_insert_own (and messages_mutate, same-agency messaging)
--   maintenance_tickets mutate plus tickets_contractor_update
-- Leads and bookings are staff-read as well. A tenant's own booking is not visible.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS bookings_applicant_select ON bookings;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','bookings','payments','invoices','applications','leases','documents']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_mutate ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_staff_write ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_staff_write ON %I FOR ALL TO authenticated
       USING (is_super_admin() OR (is_agency_staff() AND client_id IS NOT NULL AND client_id = current_app_client_id()))
       WITH CHECK (is_super_admin() OR (is_agency_staff() AND client_id IS NOT NULL AND client_id = current_app_client_id()))',
      t, t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_agency_staff() AND client_id IS NOT NULL AND client_id = current_app_client_id()));

DROP POLICY IF EXISTS bookings_select ON bookings;
CREATE POLICY bookings_select ON bookings FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_agency_staff() AND client_id IS NOT NULL AND client_id = current_app_client_id()));

-- Applicant writes stay limited to their own row, and the row's agency is the unit's agency.
DROP POLICY IF EXISTS applications_insert_applicant ON applications;
CREATE POLICY applications_insert_applicant ON applications
  FOR INSERT TO authenticated
  WITH CHECK (
    applicant_id = current_app_user_id()
    AND EXISTS (
      SELECT 1 FROM units u
      WHERE u.id = unit_id AND u.client_id = applications.client_id
    )
  );

-- ---------------------------------------------------------------------------
-- Views run as the invoker so RLS on the underlying tables applies.
-- ---------------------------------------------------------------------------

ALTER VIEW v_unit_summary SET (security_invoker = true);
ALTER VIEW v_unit_search_cards SET (security_invoker = true);
ALTER VIEW v_ticket_kanban SET (security_invoker = true);
ALTER VIEW v_application_pipeline SET (security_invoker = true);
ALTER VIEW v_billing_usage SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- entity_id_map belongs to one agency. Staff cannot retarget a frontend id
-- onto another agency's row. Public enquiry joins the map to the unit and
-- uses the unit's client_id.
-- ---------------------------------------------------------------------------

ALTER TABLE entity_id_map ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
CREATE INDEX IF NOT EXISTS idx_entity_id_map_client ON entity_id_map (client_id);

UPDATE entity_id_map m
SET client_id = src.owner_id
FROM (
  SELECT m2.entity_type, m2.frontend_id,
    CASE m2.entity_type
      WHEN 'unit' THEN (SELECT client_id FROM units WHERE id = m2.backend_id)
      WHEN 'property' THEN (SELECT client_id FROM units WHERE id = m2.backend_id)
      WHEN 'building' THEN (SELECT client_id FROM buildings WHERE id = m2.backend_id)
      WHEN 'agency' THEN m2.backend_id
      WHEN 'user' THEN (SELECT client_id FROM users WHERE id = m2.backend_id)
      WHEN 'viewing_slot' THEN (SELECT client_id FROM viewing_slots WHERE id = m2.backend_id)
      WHEN 'tenancy' THEN (SELECT client_id FROM leases WHERE id = m2.backend_id)
      WHEN 'lead' THEN (SELECT client_id FROM leads WHERE id = m2.backend_id)
      WHEN 'application' THEN (SELECT client_id FROM applications WHERE id = m2.backend_id)
      ELSE NULL
    END AS owner_id
  FROM entity_id_map m2
) src
WHERE m.entity_type = src.entity_type
  AND m.frontend_id = src.frontend_id
  AND src.owner_id IS NOT NULL
  AND m.client_id IS DISTINCT FROM src.owner_id;

CREATE OR REPLACE FUNCTION public.entity_id_map_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  caller text;
  jwt_role text;
BEGIN
  owner_id := CASE NEW.entity_type
    WHEN 'unit' THEN (SELECT client_id FROM units WHERE id = NEW.backend_id)
    WHEN 'property' THEN (SELECT client_id FROM units WHERE id = NEW.backend_id)
    WHEN 'building' THEN (SELECT client_id FROM buildings WHERE id = NEW.backend_id)
    WHEN 'agency' THEN NEW.backend_id
    WHEN 'user' THEN (SELECT client_id FROM users WHERE id = NEW.backend_id)
    WHEN 'viewing_slot' THEN (SELECT client_id FROM viewing_slots WHERE id = NEW.backend_id)
    WHEN 'tenancy' THEN (SELECT client_id FROM leases WHERE id = NEW.backend_id)
    WHEN 'lead' THEN (SELECT client_id FROM leads WHERE id = NEW.backend_id)
    WHEN 'application' THEN (SELECT client_id FROM applications WHERE id = NEW.backend_id)
    ELSE NULL
  END;

  IF owner_id IS NOT NULL THEN
    IF NEW.client_id IS NULL THEN
      NEW.client_id := owner_id;
    ELSIF NEW.client_id IS DISTINCT FROM owner_id THEN
      RAISE EXCEPTION 'entity_id_map client does not own backend_id';
    END IF;
  END IF;

  jwt_role := nullif(btrim(coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    CASE
      WHEN nullif(current_setting('request.jwt.claims', true), '') IS NULL THEN NULL
      ELSE nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    END
  )), '');
  caller := current_user;

  IF caller IN ('anon', 'authenticated')
     OR coalesce(jwt_role, '') IN ('anon', 'authenticated')
  THEN
    IF NOT is_super_admin() AND (
      NOT is_agency_staff()
      OR NEW.client_id IS NULL
      OR NEW.client_id IS DISTINCT FROM current_app_client_id()
    ) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.entity_id_map_guard() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.entity_id_map_guard() TO authenticated, service_role;

DROP TRIGGER IF EXISTS entity_id_map_guard ON entity_id_map;
CREATE TRIGGER entity_id_map_guard
  BEFORE INSERT OR UPDATE ON entity_id_map
  FOR EACH ROW EXECUTE FUNCTION public.entity_id_map_guard();

DROP POLICY IF EXISTS entity_id_map_select ON entity_id_map;
CREATE POLICY entity_id_map_select ON entity_id_map
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR client_id = current_app_client_id()
  );

DROP POLICY IF EXISTS entity_id_map_mutate ON entity_id_map;
DROP POLICY IF EXISTS entity_id_map_staff_write ON entity_id_map;
CREATE POLICY entity_id_map_staff_write ON entity_id_map
  FOR ALL TO authenticated
  USING (is_super_admin() OR (is_agency_staff() AND client_id = current_app_client_id()))
  WITH CHECK (is_super_admin() OR (is_agency_staff() AND client_id = current_app_client_id()));

-- ---------------------------------------------------------------------------
-- Enquiry: ignore ID and income, rate-limit per listing and contact, and
-- resolve the listing only when the map row belongs to that unit's agency.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public_enquiry_hits (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id      uuid NOT NULL,
  contact_key  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_public_enquiry_hits_window
  ON public_enquiry_hits (unit_id, contact_key, created_at);

ALTER TABLE public_enquiry_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public_enquiry_hits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION submit_public_listing_enquiry(
  p_property_fe_id   TEXT,
  p_action           TEXT,
  p_first_name       TEXT,
  p_last_name        TEXT,
  p_email            TEXT,
  p_phone            TEXT DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL,
  p_slot_fe_id       TEXT DEFAULT NULL,
  p_monthly_income   NUMERIC DEFAULT NULL,
  p_id_number        TEXT DEFAULT NULL,
  p_interest_type    TEXT DEFAULT 'RENT'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id       UUID;
  v_client_id     UUID;
  v_agent_id      UUID;
  v_slot_id       UUID;
  v_lead_id       UUID;
  v_booking_id    UUID;
  v_full_name     TEXT;
  v_stage         TEXT;
  v_interest      TEXT;
  v_value         NUMERIC;
  v_status_key    TEXT;
  v_listing_type  TEXT;
  v_slot_date     DATE;
  v_slot_time     TEXT;
  v_slot_cap      INT;
  v_slot_booked   INT;
  v_slot_status   TEXT;
  v_extra_notes   TEXT;
  v_contact       TEXT;
  v_recent        INT;
BEGIN
  -- Accepted so existing callers keep the same signature. Not stored.
  PERFORM p_monthly_income, p_id_number;

  IF p_property_fe_id IS NULL OR trim(p_property_fe_id) = '' THEN
    RAISE EXCEPTION 'property_required';
  END IF;

  IF p_action NOT IN ('lead', 'viewing') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  IF p_first_name IS NULL OR trim(p_first_name) = ''
     OR p_last_name IS NULL OR trim(p_last_name) = ''
     OR p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'contact_required';
  END IF;

  SELECT u.id, u.client_id, u.agent_id, u.status_config_key, u.listing_type,
         COALESCE(u.price, u.rent, 0)
  INTO v_unit_id, v_client_id, v_agent_id, v_status_key, v_listing_type, v_value
  FROM entity_id_map m
  JOIN units u ON u.id = m.backend_id
  WHERE m.entity_type IN ('unit', 'property')
    AND m.frontend_id = trim(p_property_fe_id)
    AND (m.client_id IS NULL OR m.client_id = u.client_id)
  LIMIT 1;

  IF v_unit_id IS NULL OR v_client_id IS NULL THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;

  IF v_status_key NOT IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER') THEN
    RAISE EXCEPTION 'property_not_public';
  END IF;

  v_contact := lower(trim(p_email));
  SELECT count(*) INTO v_recent
  FROM public_enquiry_hits h
  WHERE h.unit_id = v_unit_id
    AND h.contact_key = v_contact
    AND h.created_at > now() - interval '1 hour';
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'enquiry_rate_limited';
  END IF;
  INSERT INTO public_enquiry_hits (unit_id, contact_key) VALUES (v_unit_id, v_contact);

  v_full_name := trim(p_first_name) || ' ' || trim(p_last_name);
  v_interest := CASE WHEN upper(coalesce(p_interest_type, 'RENT')) = 'BUY' THEN 'BUY' ELSE 'RENT' END;
  v_extra_notes := NULLIF(trim(coalesce(p_notes, '')), '');

  IF p_action = 'lead' THEN
    v_stage := 'New Lead';
  ELSIF p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> '' THEN
    v_stage := 'Viewing Scheduled';
  ELSE
    v_stage := 'Viewing Requested';
  END IF;

  v_lead_id := gen_random_uuid();
  INSERT INTO leads (
    id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
    interest_type, value_amount, notes, updated_at
  ) VALUES (
    v_lead_id, v_client_id, v_unit_id, v_agent_id, v_full_name,
    v_contact, NULLIF(trim(coalesce(p_phone, '')), ''),
    'Web Form', v_stage, v_interest, v_value, v_extra_notes, NOW()
  );

  IF p_action = 'viewing' AND p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> '' THEN
    SELECT m.backend_id INTO v_slot_id
    FROM entity_id_map m
    JOIN viewing_slots vs ON vs.id = m.backend_id
    WHERE m.entity_type = 'viewing_slot'
      AND m.frontend_id = trim(p_slot_fe_id)
      AND vs.unit_id = v_unit_id
      AND vs.client_id = v_client_id
      AND (m.client_id IS NULL OR m.client_id = vs.client_id)
    LIMIT 1;

    IF v_slot_id IS NULL THEN
      RAISE EXCEPTION 'slot_not_found';
    END IF;

    SELECT slot_date, slot_time, capacity, booked_count, status
    INTO v_slot_date, v_slot_time, v_slot_cap, v_slot_booked, v_slot_status
    FROM viewing_slots
    WHERE id = v_slot_id AND unit_id = v_unit_id AND client_id = v_client_id
    FOR UPDATE;

    IF v_slot_date IS NULL THEN
      RAISE EXCEPTION 'slot_not_found';
    END IF;

    IF v_slot_status <> 'OPEN' OR v_slot_booked >= v_slot_cap THEN
      RAISE EXCEPTION 'slot_unavailable';
    END IF;

    v_booking_id := gen_random_uuid();
    INSERT INTO bookings (
      id, client_id, unit_id, slot_id, agent_id, visitor_name, visitor_email, visitor_phone,
      starts_at, status, notes, updated_at
    ) VALUES (
      v_booking_id, v_client_id, v_unit_id, v_slot_id, v_agent_id, v_full_name,
      v_contact, NULLIF(trim(coalesce(p_phone, '')), ''),
      (v_slot_date::text || 'T' || v_slot_time || ':00')::timestamptz,
      'SCHEDULED', v_extra_notes, NOW()
    );

    UPDATE viewing_slots
    SET booked_count = booked_count + 1,
        status = CASE WHEN booked_count + 1 >= capacity THEN 'FULL' ELSE status END,
        updated_at = NOW()
    WHERE id = v_slot_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', v_lead_id,
    'booking_id', v_booking_id,
    'stage', v_stage
  );
END;
$$;

REVOKE ALL ON FUNCTION submit_public_listing_enquiry(
  text, text, text, text, text, text, text, text, numeric, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION submit_public_listing_enquiry(
  text, text, text, text, text, text, text, text, numeric, text, text
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Application screening. ID and income on applications are columns, not a
-- parseable notes format, so existing notes are left as they are.
-- Enquiry notes in the "Monthly income:" / "ID/Passport:" shape are no longer
-- written. New screening rows are the place those values belong.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS application_screening (
  application_id              uuid PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  id_type                     text CHECK (id_type IN ('sa_id', 'passport')),
  id_number                   text,
  gross_monthly_income_cents  bigint,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_screening_income_nonneg
    CHECK (gross_monthly_income_cents IS NULL OR gross_monthly_income_cents >= 0)
);

INSERT INTO application_screening (application_id, id_type, id_number, gross_monthly_income_cents)
SELECT a.id,
       CASE
         WHEN btrim(coalesce(a.id_number_or_passport, '')) ~ '^[0-9]{13}$' THEN 'sa_id'
         WHEN btrim(coalesce(a.id_number_or_passport, '')) <> '' THEN 'passport'
         ELSE NULL
       END,
       NULLIF(btrim(coalesce(a.id_number_or_passport, '')), ''),
       CASE
         WHEN a.monthly_income IS NULL THEN NULL
         WHEN a.monthly_income >= 0 THEN (a.monthly_income * 100)::bigint
         ELSE NULL
       END
FROM applications a
WHERE (a.id_number_or_passport IS NOT NULL AND btrim(a.id_number_or_passport) <> '')
   OR a.monthly_income IS NOT NULL
ON CONFLICT (application_id) DO NOTHING;

ALTER TABLE application_screening ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_screening FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE application_screening FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE application_screening TO authenticated;

DROP POLICY IF EXISTS application_screening_applicant ON application_screening;
CREATE POLICY application_screening_applicant ON application_screening
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = application_screening.application_id
        AND a.applicant_id = current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = application_screening.application_id
        AND a.applicant_id = current_app_user_id()
    )
  );

DROP POLICY IF EXISTS application_screening_staff ON application_screening;
CREATE POLICY application_screening_staff ON application_screening
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = application_screening.application_id
        AND is_agency_staff()
        AND a.client_id = current_app_client_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = application_screening.application_id
        AND is_agency_staff()
        AND a.client_id = current_app_client_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Trust ledgers: staff of that agency only. No write policies existed; none
-- are added. Anon has no grant.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'trust_transactions','trust_allocations','payout_instructions',
    'deposit_holdings','arrears_snapshots','csv_import_batches'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS trust_read_%1$s ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS trust_staff_%1$s ON %1$I', t);
    EXECUTE format(
      'CREATE POLICY trust_staff_%1$s ON %1$I FOR SELECT TO authenticated
       USING (is_super_admin() OR (is_agency_staff() AND client_id IS NOT NULL AND client_id = current_app_client_id()))',
      t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- anon cannot read public tables. Privileged definers that are not part of
-- the anon or authenticated API lose EXECUTE. Staff still call
-- admin_update_user_verification and approve_application as authenticated.
-- ---------------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

REVOKE ALL ON FUNCTION public.admin_update_user_verification(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_application(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_verification(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_application(text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_auth_user_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_user_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- First signup is a normal tenant (or the requested portal role), never super admin.
-- Email ON CONFLICT body below is the 009 statement, unchanged, for migration 012.
CREATE OR REPLACE FUNCTION public.sync_auth_user_profile(p_auth_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  au            RECORD;
  meta          JSONB;
  role_fe       TEXT;
  db_role       TEXT;
  short_id      TEXT;
  fe_id         TEXT;
  user_uuid     UUID;
  first_name    TEXT;
  last_name     TEXT;
  phone         TEXT;
  client_uuid   UUID;
  agency_fe_id  TEXT;
  user_metadata JSONB;
  existing_id   UUID;
BEGIN
  SELECT id INTO existing_id FROM users WHERE auth_user_id = p_auth_user_id LIMIT 1;
  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  SELECT *
  INTO au
  FROM auth.users
  WHERE id = p_auth_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  meta := COALESCE(au.raw_user_meta_data, '{}'::jsonb);

  role_fe := COALESCE(NULLIF(TRIM(meta->>'role'), ''), 'tenant');
  IF role_fe NOT IN ('tenant', 'landlord', 'contractor', 'applicant') THEN
    role_fe := 'tenant';
  END IF;
  IF role_fe = 'applicant' THEN role_fe := 'tenant'; END IF;

  db_role := CASE role_fe
    WHEN 'super_admin' THEN 'SUPER_ADMIN'
    WHEN 'client_admin' THEN 'AGENCY_ADMIN'
    WHEN 'agency_admin' THEN 'AGENCY_ADMIN'
    WHEN 'agent_admin' THEN 'AGENT_ADMIN'
    WHEN 'agent' THEN 'GROUND_AGENT'
    WHEN 'ground_agent' THEN 'GROUND_AGENT'
    WHEN 'landlord' THEN 'LANDLORD'
    WHEN 'contractor' THEN 'CONTRACTOR'
    ELSE 'END_USER'
  END;

  first_name := COALESCE(NULLIF(TRIM(meta->>'first_name'), ''), split_part(COALESCE(au.email, 'user'), '@', 1));
  last_name := COALESCE(NULLIF(TRIM(meta->>'last_name'), ''), 'User');
  phone := NULLIF(TRIM(meta->>'phone'), '');

  short_id := substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  fe_id := 'u-' || short_id;
  user_uuid := gen_random_uuid();
  client_uuid := NULL;

  user_metadata := jsonb_build_object(
    'frontend_id', fe_id,
    'frontend_role', role_fe,
    'mustChangePassword', false
  );

  IF role_fe IN ('landlord', 'contractor') THEN
    user_metadata := user_metadata || jsonb_build_object(
      'verification', jsonb_build_object(
        'status', 'pending',
        'submittedAt', to_jsonb(NOW()),
        'profile', COALESCE(meta->'profile', '{}'::jsonb),
        'documents', COALESCE(meta->'documents', '[]'::jsonb)
      )
    );
    IF meta->'profile'->>'company' IS NOT NULL THEN
      user_metadata := user_metadata || jsonb_build_object('company', meta->'profile'->>'company');
    END IF;
    IF meta->'profile'->>'idNumberOrPassport' IS NOT NULL THEN
      user_metadata := user_metadata || jsonb_build_object('idNumberOrPassport', meta->'profile'->>'idNumberOrPassport');
    END IF;
  ELSIF role_fe IN ('tenant', 'applicant') THEN
    user_metadata := user_metadata || jsonb_build_object(
      'verification', jsonb_build_object('status', 'not_required')
    );
  END IF;

  IF role_fe = 'landlord' THEN
    agency_fe_id := 'ag-ll-' || short_id;
    client_uuid := gen_random_uuid();
    INSERT INTO clients (id, company_name, subdomain, status, city, settings, updated_at)
    VALUES (
      client_uuid,
      COALESCE(NULLIF(TRIM(meta->'profile'->>'company'), ''), first_name || ' ' || last_name || ' Portfolio'),
      'll-' || short_id,
      'active',
      '',
      jsonb_build_object(
        'frontend_id', agency_fe_id,
        'enabledPermissions', jsonb_build_array(
          'assets.view', 'assets.manage', 'listings.publish', 'leads.view',
          'applications.view', 'viewings.manage', 'maintenance.view', 'documents.view',
          'payments.view', 'reports.view', 'messages.manage', 'portal.owner',
          'portal.tenant', 'portal.contractor'
        ),
        'portfolio', true
      ),
      NOW()
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO entity_id_map (entity_type, backend_id, frontend_id, client_id)
    VALUES ('agency', client_uuid, agency_fe_id, client_uuid)
    ON CONFLICT (entity_type, backend_id) DO UPDATE
      SET frontend_id = EXCLUDED.frontend_id, client_id = EXCLUDED.client_id;
  END IF;

  INSERT INTO entity_id_map (entity_type, backend_id, frontend_id, client_id)
  VALUES ('user', user_uuid, fe_id, client_uuid)
  ON CONFLICT (entity_type, backend_id) DO UPDATE
    SET frontend_id = EXCLUDED.frontend_id,
        client_id = COALESCE(EXCLUDED.client_id, entity_id_map.client_id);

  INSERT INTO users (
    id, auth_user_id, client_id, email, password_hash,
    first_name, last_name, phone, role, active, metadata, updated_at
  ) VALUES (
    user_uuid,
    p_auth_user_id,
    client_uuid,
    lower(trim(au.email)),
    NULLIF(to_jsonb(au)->>'encrypted_password', ''),
    first_name,
    last_name,
    phone,
    db_role,
    TRUE,
    user_metadata,
    NOW()
  )
  ON CONFLICT (email) DO UPDATE SET
    auth_user_id = EXCLUDED.auth_user_id,
    password_hash = COALESCE(NULLIF(EXCLUDED.password_hash, ''), NULLIF(users.password_hash, '')),
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    metadata = users.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO user_uuid;

  UPDATE entity_id_map
  SET client_id = (SELECT u.client_id FROM users u WHERE u.id = user_uuid)
  WHERE entity_type = 'user' AND backend_id = user_uuid;

  RETURN user_uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_auth_user_profile(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Table owner bypasses RLS unless it is forced. The Hono API must not connect
-- as the owner. service_role has BYPASSRLS and is not a substitute.
-- ---------------------------------------------------------------------------

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'clients',
    'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
    'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
    'maintenance_tickets', 'message_threads', 'messages', 'notifications',
    'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
    'event_log', 'entity_id_map',
    'trust_transactions', 'trust_allocations', 'payout_instructions',
    'deposit_holdings', 'arrears_snapshots', 'csv_import_batches',
    'application_screening'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
