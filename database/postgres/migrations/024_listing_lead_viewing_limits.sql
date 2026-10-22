-- Agent-set enquiry and viewing caps per rental listing.
-- Agency defaults live in clients.settings.listingLimits (maxEnquiries, maxViewings).
-- A NULL unit cap inherits that default. Both NULL means unlimited.

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS max_enquiries INT NULL,
  ADD COLUMN IF NOT EXISTS max_viewings INT NULL,
  ADD COLUMN IF NOT EXISTS limit_action VARCHAR(20) NOT NULL DEFAULT 'WAITLIST',
  ADD COLUMN IF NOT EXISTS limits_round_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS show_remaining BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE units DROP CONSTRAINT IF EXISTS units_max_enquiries_check;
ALTER TABLE units
  ADD CONSTRAINT units_max_enquiries_check CHECK (max_enquiries IS NULL OR max_enquiries >= 0);
ALTER TABLE units DROP CONSTRAINT IF EXISTS units_max_viewings_check;
ALTER TABLE units
  ADD CONSTRAINT units_max_viewings_check CHECK (max_viewings IS NULL OR max_viewings >= 0);
ALTER TABLE units DROP CONSTRAINT IF EXISTS units_limit_action_check;
ALTER TABLE units
  ADD CONSTRAINT units_limit_action_check CHECK (limit_action IN ('CLOSE', 'WAITLIST'));

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS is_waitlisted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_leads_unit_round ON leads (unit_id, created_at)
  WHERE is_waitlisted = FALSE;

CREATE TABLE IF NOT EXISTS viewing_waitlist (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id       UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  lead_id       UUID REFERENCES leads(id) ON DELETE SET NULL,
  name          VARCHAR(160) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  phone         VARCHAR(40),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_viewing_waitlist_client ON viewing_waitlist (client_id);
CREATE INDEX IF NOT EXISTS idx_viewing_waitlist_unit_open ON viewing_waitlist (unit_id, created_at)
  WHERE promoted_at IS NULL;

ALTER TABLE viewing_waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS viewing_waitlist_select ON viewing_waitlist;
CREATE POLICY viewing_waitlist_select ON viewing_waitlist
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR client_id = current_app_client_id()
    OR current_app_user_role() IN ('LANDLORD', 'END_USER', 'CONTRACTOR')
  );
DROP POLICY IF EXISTS viewing_waitlist_mutate ON viewing_waitlist;
CREATE POLICY viewing_waitlist_mutate ON viewing_waitlist
  FOR ALL TO authenticated
  USING (is_super_admin() OR client_id = current_app_client_id())
  WITH CHECK (is_super_admin() OR client_id = current_app_client_id());

CREATE OR REPLACE FUNCTION unit_listing_limit_snapshot(p_unit_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH u AS (
    SELECT
      units.id,
      units.listing_type,
      units.limit_action,
      units.show_remaining,
      units.limits_round_started_at,
      CASE
        WHEN upper(coalesce(units.listing_type, '')) IN ('RENT', 'BOTH') THEN
          COALESCE(units.max_enquiries, NULLIF(c.settings #>> '{listingLimits,maxEnquiries}', '')::int)
        ELSE NULL
      END AS eff_enquiries,
      CASE
        WHEN upper(coalesce(units.listing_type, '')) IN ('RENT', 'BOTH') THEN
          COALESCE(units.max_viewings, NULLIF(c.settings #>> '{listingLimits,maxViewings}', '')::int)
        ELSE NULL
      END AS eff_viewings
    FROM units
    JOIN clients c ON c.id = units.client_id
    WHERE units.id = p_unit_id
  ),
  counts AS (
    SELECT
      (SELECT COUNT(*)::int FROM leads l
        WHERE l.unit_id = u.id
          AND COALESCE(l.is_waitlisted, false) = false
          AND COALESCE(l.metadata->>'limit_bucket', '') <> 'viewing'
          AND COALESCE(l.metadata->>'spam', '') <> 'true'
          AND (u.limits_round_started_at IS NULL OR l.created_at >= u.limits_round_started_at)
      ) AS enquiries,
      (SELECT COUNT(*)::int FROM bookings b
        WHERE b.unit_id = u.id
          AND b.status IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW')
          AND (u.limits_round_started_at IS NULL OR b.created_at >= u.limits_round_started_at)
      ) AS viewings
    FROM u
  )
  SELECT jsonb_build_object(
    'fully_booked',
      (u.eff_enquiries IS NOT NULL AND counts.enquiries >= u.eff_enquiries)
      OR (u.eff_viewings IS NOT NULL AND counts.viewings >= u.eff_viewings),
    'enquiries_full', u.eff_enquiries IS NOT NULL AND counts.enquiries >= u.eff_enquiries,
    'viewings_full', u.eff_viewings IS NOT NULL AND counts.viewings >= u.eff_viewings,
    'limit_action', u.limit_action,
    'show_remaining', u.show_remaining,
    'enquiry_count', counts.enquiries,
    'viewing_count', counts.viewings,
    'max_enquiries', u.eff_enquiries,
    'max_viewings', u.eff_viewings,
    'remaining', CASE
      WHEN COALESCE(u.show_remaining, false) THEN jsonb_build_object(
        'enquiries', CASE WHEN u.eff_enquiries IS NULL THEN NULL ELSE GREATEST(u.eff_enquiries - counts.enquiries, 0) END,
        'viewings', CASE WHEN u.eff_viewings IS NULL THEN NULL ELSE GREATEST(u.eff_viewings - counts.viewings, 0) END
      )
      ELSE NULL
    END
  )
  FROM u, counts;
$$;

REVOKE ALL ON FUNCTION unit_listing_limit_snapshot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unit_listing_limit_snapshot(UUID) TO anon, authenticated;

-- Marketplace bootstrap keeps every existing field and adds fully_booked / remaining.
-- Guest marketplace: expose bookable viewing slots for published units (anon RPC read path).

CREATE OR REPLACE FUNCTION get_public_marketplace_bootstrap(p_lite boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH lim AS (
    SELECT CASE WHEN p_lite THEN 60 ELSE 250 END AS n
  ),
  public_units AS (
    SELECT u.*
    FROM units u
    JOIN buildings b ON b.id = u.building_id
    LEFT JOIN users ll ON ll.id = b.landlord_id
    WHERE u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
      AND lower(coalesce(u.listing_type, 'rent')) <> 'not_listed'
      AND coalesce(ll.metadata->'verification'->>'status', 'approved') NOT IN ('pending', 'rejected')
    ORDER BY u.featured DESC NULLS LAST, u.created_at DESC, u.id DESC
    LIMIT (SELECT n FROM lim)
  ),
  unit_buildings AS (
    SELECT DISTINCT b.*
    FROM buildings b
    JOIN public_units pu ON pu.building_id = b.id
  ),
  unit_clients AS (
    SELECT DISTINCT c.*
    FROM clients c
    JOIN public_units pu ON pu.client_id = c.id
    WHERE coalesce(c.settings->>'isGlobalConfigClient', 'false') <> 'true'
  ),
  unit_landlords AS (
    SELECT DISTINCT ll.*
    FROM users ll
    JOIN unit_buildings ub ON ub.landlord_id = ll.id
  ),
  unit_rooms AS (
    SELECT r.*
    FROM rooms r
    JOIN public_units pu ON pu.id = r.unit_id
  ),
  public_slots AS (
    SELECT vs.*
    FROM viewing_slots vs
    WHERE vs.unit_id IN (SELECT id FROM public_units)
      AND vs.status = 'OPEN'
      AND vs.booked_count < vs.capacity
      AND vs.slot_date >= CURRENT_DATE
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg((to_jsonb(u) || unit_listing_limit_snapshot(u.id)) ORDER BY u.created_at DESC) FROM public_units u), '[]'::jsonb),
    'rooms', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM unit_rooms r), '[]'::jsonb),
    'viewing_slots', coalesce(
      (SELECT jsonb_agg(to_jsonb(vs) ORDER BY vs.slot_date, vs.slot_time) FROM public_slots vs),
      '[]'::jsonb
    ),
    'users', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))
          OR (m.entity_type = 'viewing_slot' AND m.backend_id IN (SELECT id FROM public_slots))),
      '[]'::jsonb
    )
  );
$$;

CREATE OR REPLACE FUNCTION get_public_marketplace_bootstrap_lite(p_lite boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH lim AS (
    SELECT CASE WHEN p_lite THEN 60 ELSE 250 END AS n
  ),
  public_units AS (
    SELECT u.*
    FROM units u
    JOIN buildings b ON b.id = u.building_id
    LEFT JOIN users ll ON ll.id = b.landlord_id
    WHERE u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
      AND lower(coalesce(u.listing_type, 'rent')) <> 'not_listed'
      AND coalesce(ll.metadata->'verification'->>'status', 'approved') NOT IN ('pending', 'rejected')
    ORDER BY u.featured DESC NULLS LAST, u.created_at DESC, u.id DESC
    LIMIT (SELECT n FROM lim)
  ),
  unit_buildings AS (
    SELECT DISTINCT b.*
    FROM buildings b
    JOIN public_units pu ON pu.building_id = b.id
  ),
  unit_clients AS (
    SELECT DISTINCT c.*
    FROM clients c
    JOIN public_units pu ON pu.client_id = c.id
    WHERE coalesce(c.settings->>'isGlobalConfigClient', 'false') <> 'true'
  ),
  unit_landlords AS (
    SELECT DISTINCT ll.*
    FROM users ll
    JOIN unit_buildings ub ON ub.landlord_id = ll.id
  ),
  unit_cover AS (
    SELECT pu.id,
           coalesce(pu.images->0, b.images->0) AS cover
    FROM public_units pu
    JOIN unit_buildings b ON b.id = pu.building_id
  ),
  public_slots AS (
    SELECT vs.*
    FROM viewing_slots vs
    WHERE vs.unit_id IN (SELECT id FROM public_units)
      AND vs.status = 'OPEN'
      AND vs.booked_count < vs.capacity
      AND vs.slot_date >= CURRENT_DATE
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(
        (to_jsonb(b) - 'images')
        || jsonb_build_object('images', jsonb_build_array(b.images->0))
        ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(
        ((to_jsonb(u) || unit_listing_limit_snapshot(u.id)) - 'images')
        || jsonb_build_object('images', CASE WHEN uc.cover IS NOT NULL THEN jsonb_build_array(uc.cover) ELSE '[]'::jsonb END)
        ORDER BY u.created_at DESC)
      FROM public_units u JOIN unit_cover uc ON uc.id = u.id), '[]'::jsonb),
    'viewing_slots', coalesce(
      (SELECT jsonb_agg(to_jsonb(vs) ORDER BY vs.slot_date, vs.slot_time) FROM public_slots vs),
      '[]'::jsonb
    ),
    'users', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))
          OR (m.entity_type = 'viewing_slot' AND m.backend_id IN (SELECT id FROM public_slots))),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap(boolean) TO anon, authenticated;

REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) TO anon, authenticated;


-- Public enquiry RPC: same caps as the Node route. A full WAITLIST insert is
-- returned (not raised) so the waitlist row commits.

CREATE OR REPLACE FUNCTION listing_capacity_gate(
  p_unit_id UUID,
  p_action TEXT,
  p_has_slot BOOLEAN,
  p_name TEXT,
  p_email TEXT,
  p_phone TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing TEXT;
  v_action TEXT;
  v_round TIMESTAMPTZ;
  v_settings JSONB;
  v_enq_cap INT;
  v_view_cap INT;
  v_enq_n INT;
  v_view_n INT;
  v_existing UUID;
  v_wait UUID;
  v_client UUID;
BEGIN
  SELECT u.listing_type, u.limit_action, u.limits_round_started_at, u.client_id,
         CASE WHEN upper(coalesce(u.listing_type, '')) IN ('RENT', 'BOTH')
              THEN COALESCE(u.max_enquiries, NULLIF(c.settings #>> '{listingLimits,maxEnquiries}', '')::int)
              ELSE NULL END,
         CASE WHEN upper(coalesce(u.listing_type, '')) IN ('RENT', 'BOTH')
              THEN COALESCE(u.max_viewings, NULLIF(c.settings #>> '{listingLimits,maxViewings}', '')::int)
              ELSE NULL END
    INTO v_listing, v_action, v_round, v_client, v_enq_cap, v_view_cap
    FROM units u
    JOIN clients c ON c.id = u.client_id
   WHERE u.id = p_unit_id;

  IF upper(coalesce(v_listing, '')) NOT IN ('RENT', 'BOTH') THEN
    RETURN NULL;
  END IF;

  IF NOT p_has_slot THEN
    SELECT id INTO v_existing
      FROM leads
     WHERE unit_id = p_unit_id
       AND COALESCE(is_waitlisted, false) = false
       AND (v_round IS NULL OR created_at >= v_round)
       AND (
         lower(email) = lower(p_email)
         OR (NULLIF(trim(coalesce(p_phone, '')), '') IS NOT NULL AND phone = NULLIF(trim(coalesce(p_phone, '')), ''))
       )
     LIMIT 1;
    IF v_existing IS NOT NULL AND p_action = 'lead' THEN
      RETURN jsonb_build_object('ok', true, 'lead_id', v_existing, 'duplicate', true, 'stage', 'New Lead');
    END IF;

    SELECT COUNT(*)::int INTO v_enq_n
      FROM leads
     WHERE unit_id = p_unit_id
       AND COALESCE(is_waitlisted, false) = false
       AND COALESCE(metadata->>'limit_bucket', '') <> 'viewing'
       AND COALESCE(metadata->>'spam', '') <> 'true'
       AND (v_round IS NULL OR created_at >= v_round);
    IF v_enq_cap IS NOT NULL AND v_enq_n >= v_enq_cap THEN
      IF v_action = 'WAITLIST' THEN
        INSERT INTO leads (client_id, unit_id, name, email, phone, channel, stage, interest_type, is_waitlisted)
        VALUES (v_client, p_unit_id, p_name, lower(trim(p_email)), NULLIF(trim(coalesce(p_phone, '')), ''),
                'Web Form', 'Waitlist', 'RENT', true)
        RETURNING id INTO v_wait;
        RETURN jsonb_build_object('ok', false, 'code', 'LISTING_FULL', 'waitlist', true, 'waitlist_id', v_wait);
      END IF;
      RETURN jsonb_build_object('ok', false, 'code', 'LISTING_FULL', 'waitlist', false);
    END IF;
    RETURN NULL;
  END IF;

  SELECT COUNT(*)::int INTO v_view_n
    FROM bookings
   WHERE unit_id = p_unit_id
     AND status IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW')
     AND (v_round IS NULL OR created_at >= v_round);
  IF v_view_cap IS NOT NULL AND v_view_n >= v_view_cap THEN
    IF v_action = 'WAITLIST' THEN
      INSERT INTO viewing_waitlist (client_id, unit_id, name, email, phone)
      VALUES (v_client, p_unit_id, p_name, lower(trim(p_email)), NULLIF(trim(coalesce(p_phone, '')), ''))
      RETURNING id INTO v_wait;
      RETURN jsonb_build_object('ok', false, 'code', 'LISTING_FULL', 'waitlist', true, 'waitlist_id', v_wait);
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'LISTING_FULL', 'waitlist', false);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION listing_capacity_gate(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION listing_capacity_gate(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT) TO anon, authenticated;

-- Idempotent deploy of guest listing enquiry RPC (production missed 005).
-- Includes AVAILABLE in public gate (aligned with 015 marketplace lite).

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
  v_gate          JSONB;
BEGIN
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

  SELECT m.backend_id::uuid INTO v_unit_id
  FROM entity_id_map m
  WHERE m.entity_type IN ('unit', 'property')
    AND m.frontend_id = trim(p_property_fe_id)
  LIMIT 1;

  IF v_unit_id IS NULL THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;

  SELECT u.client_id, u.agent_id, u.status_config_key, u.listing_type,
         COALESCE(u.price, u.rent, 0)
  INTO v_client_id, v_agent_id, v_status_key, v_listing_type, v_value
  FROM units u
  WHERE u.id = v_unit_id
  FOR UPDATE;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;

  IF v_status_key NOT IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE') THEN
    RAISE EXCEPTION 'property_not_public';
  END IF;

  v_full_name := trim(p_first_name) || ' ' || trim(p_last_name);
  v_interest := CASE WHEN upper(coalesce(p_interest_type, 'RENT')) = 'BUY' THEN 'BUY' ELSE 'RENT' END;

  v_extra_notes := NULLIF(trim(coalesce(p_notes, '')), '');
  IF p_monthly_income IS NOT NULL THEN
    v_extra_notes := coalesce(v_extra_notes || E'\n', '') || 'Monthly income: ' || p_monthly_income::text;
  END IF;
  IF p_id_number IS NOT NULL AND trim(p_id_number) <> '' THEN
    v_extra_notes := coalesce(v_extra_notes || E'\n', '') || 'ID/Passport: ' || trim(p_id_number);
  END IF;

  IF p_action = 'lead' THEN
    v_stage := 'New Lead';
  ELSIF p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> '' THEN
    v_stage := 'Viewing Scheduled';
  ELSE
    v_stage := 'Viewing Requested';
  END IF;

  v_gate := listing_capacity_gate(
    v_unit_id,
    p_action,
    p_action = 'viewing' AND p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> '',
    v_full_name,
    lower(trim(p_email)),
    p_phone
  );
  IF v_gate IS NOT NULL THEN
    RETURN v_gate;
  END IF;

  v_lead_id := gen_random_uuid();
  INSERT INTO leads (
    id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
    interest_type, value_amount, notes, metadata, updated_at
  ) VALUES (
    v_lead_id, v_client_id, v_unit_id, v_agent_id, v_full_name,
    lower(trim(p_email)), NULLIF(trim(coalesce(p_phone, '')), ''),
    'Web Form', v_stage, v_interest, v_value, v_extra_notes,
    CASE
      WHEN p_action = 'viewing' AND p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> ''
      THEN '{"limit_bucket":"viewing"}'::jsonb
      ELSE '{}'::jsonb
    END,
    NOW()
  );

  IF p_action = 'viewing' AND p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> '' THEN
    SELECT m.backend_id::uuid INTO v_slot_id
    FROM entity_id_map m
    WHERE m.entity_type = 'viewing_slot'
      AND m.frontend_id = trim(p_slot_fe_id)
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
      lower(trim(p_email)), NULLIF(trim(coalesce(p_phone, '')), ''),
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
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION submit_public_listing_enquiry(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) TO anon, authenticated;

-- Staff promote. Returns jsonb so a full listing does not roll back the read.
CREATE OR REPLACE FUNCTION promote_viewing_waitlist(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row viewing_waitlist%ROWTYPE;
  v_booking UUID;
  v_user UUID;
  v_snap JSONB;
BEGIN
  SELECT * INTO v_row FROM viewing_waitlist WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'waitlist_not_found');
  END IF;
  IF v_row.promoted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_promoted');
  END IF;
  IF NOT is_super_admin() AND v_row.client_id IS DISTINCT FROM current_app_client_id() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  PERFORM 1 FROM units WHERE id = v_row.unit_id FOR UPDATE;
  v_snap := unit_listing_limit_snapshot(v_row.unit_id);
  IF COALESCE((v_snap->>'viewings_full')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LISTING_FULL', 'waitlist', true);
  END IF;

  INSERT INTO bookings (
    client_id, unit_id, agent_id, visitor_name, visitor_email, visitor_phone,
    starts_at, status, notes, updated_at
  )
  SELECT v_row.client_id, v_row.unit_id, u.agent_id, v_row.name, v_row.email, v_row.phone,
         NOW(), 'SCHEDULED', 'Promoted from waitlist', NOW()
    FROM units u
   WHERE u.id = v_row.unit_id
  RETURNING id INTO v_booking;

  UPDATE viewing_waitlist SET promoted_at = NOW() WHERE id = p_id;

  INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload)
  VALUES (
    v_row.client_id,
    'waitlist_promoted',
    'unit',
    v_row.unit_id,
    auth.uid(),
    jsonb_build_object('waitlistId', p_id, 'bookingId', v_booking, 'email', v_row.email)
  );

  SELECT id INTO v_user FROM users WHERE lower(email) = lower(v_row.email) LIMIT 1;
  IF v_user IS NOT NULL THEN
    INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
    VALUES (
      v_row.client_id,
      v_user,
      'A viewing spot opened',
      'You have been promoted from the waitlist. The agent will confirm your viewing time.',
      '/listing',
      'unit',
      'updated'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'bookingId', v_booking);
END;
$$;

REVOKE ALL ON FUNCTION promote_viewing_waitlist(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION promote_viewing_waitlist(UUID) TO authenticated;
