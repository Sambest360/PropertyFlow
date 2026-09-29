--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: admin_update_user_verification(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_user_verification(p_frontend_user_id text, p_status text, p_reject_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  target users%ROWTYPE;
  meta JSONB;
  verification JSONB;
  reviewer_fe TEXT;
BEGIN
  IF NOT is_super_admin() AND NOT is_agency_staff() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO target FROM users
  WHERE metadata->>'frontend_id' = p_frontend_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF NOT is_super_admin() AND target.client_id IS DISTINCT FROM current_app_client_id() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT metadata->>'frontend_id' INTO reviewer_fe
  FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

  meta := COALESCE(target.metadata, '{}'::jsonb);
  verification := COALESCE(meta->'verification', '{}'::jsonb);
  verification := verification || jsonb_build_object(
    'status', p_status,
    'reviewedAt', to_jsonb(NOW()),
    'reviewerId', reviewer_fe,
    'rejectNote', CASE WHEN p_status = 'rejected' THEN to_jsonb(p_reject_note) ELSE verification->'rejectNote' END
  );
  meta := meta || jsonb_build_object('verification', verification);

  UPDATE users SET metadata = meta, updated_at = NOW()
  WHERE id = target.id;

  RETURN meta;
END;
$$;


--
-- Name: approve_application(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_application(p_application_ref text, p_tenancy jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  app applications%ROWTYPE;
  lease_id UUID;
  fe_lease TEXT;
BEGIN
  IF NOT is_super_admin() AND NOT is_agency_staff() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO app FROM applications
  WHERE reference_code = p_application_ref
     OR metadata->>'frontend_id' = p_application_ref
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF NOT is_super_admin() AND app.client_id IS DISTINCT FROM current_app_client_id() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE applications
  SET status = 'APPROVED', updated_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('stage', 'Approved')
  WHERE id = app.id;

  lease_id := gen_random_uuid();
  fe_lease := 'tn-' || substr(replace(lease_id::text, '-', ''), 1, 8);

  INSERT INTO leases (
    id, client_id, unit_id, tenant_id, landlord_id, agent_id,
    start_date, end_date, rent_amount, deposit_amount, status, metadata
  ) VALUES (
    lease_id,
    app.client_id,
    app.unit_id,
    app.applicant_id,
    (SELECT b.landlord_id FROM units u JOIN buildings b ON b.id = u.building_id WHERE u.id = app.unit_id),
    app.agent_id,
    COALESCE((p_tenancy->>'startDate')::date, CURRENT_DATE),
    NULLIF(p_tenancy->>'endDate', '')::date,
    COALESCE((p_tenancy->>'rent')::numeric, 0),
    COALESCE((p_tenancy->>'deposit')::numeric, 0),
    'ACTIVE',
    COALESCE(p_tenancy->'keyCollection', '{}'::jsonb)
  );

  INSERT INTO entity_id_map (entity_type, backend_id, frontend_id)
  VALUES ('tenancy', lease_id, fe_lease)
  ON CONFLICT (entity_type, backend_id) DO UPDATE SET frontend_id = EXCLUDED.frontend_id;

  UPDATE applications
  SET status = 'LEASED', updated_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('stage', 'Active Tenancy')
  WHERE id = app.id;

  RETURN jsonb_build_object('ok', true, 'tenancyId', fe_lease);
END;
$$;


--
-- Name: auth_bootstrap_needed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_bootstrap_needed() RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COUNT(*) = 0 FROM users;
$$;


--
-- Name: current_app_client_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_client_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT client_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;


--
-- Name: current_app_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;


--
-- Name: current_app_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_user_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;


--
-- Name: ensure_user_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_user_profile() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.sync_auth_user_profile(auth.uid()) IS NOT NULL;
END;
$$;


--
-- Name: get_public_marketplace_bootstrap(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_marketplace_bootstrap(p_lite boolean DEFAULT true) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'subdomain', c.subdomain,
          'status', c.status,
          'city', c.city,
          'created_at', c.created_at,
          'settings', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', c.settings->'frontend_id',
            'isGlobalConfigClient', c.settings->'isGlobalConfigClient'
          ))
        ) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(to_jsonb(b) - 'notes' ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.created_at DESC) FROM public_units u), '[]'::jsonb),
    'rooms', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM unit_rooms r), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'client_id', u.client_id,
          'email', u.email,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'role', u.role,
          'active', u.active,
          'metadata', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', u.metadata->'frontend_id',
            'frontend_role', u.metadata->'frontend_role',
            'verification', CASE WHEN jsonb_typeof(u.metadata->'verification') = 'object'
              THEN jsonb_build_object('status', u.metadata->'verification'->'status') END
          ))
        ) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))),
      '[]'::jsonb
    )
  );
$$;


--
-- Name: get_public_marketplace_bootstrap_lite(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_public_marketplace_bootstrap_lite(p_lite boolean DEFAULT true) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH lim AS (
    SELECT CASE WHEN p_lite THEN 60 ELSE 250 END AS n
  ),
  public_units AS (
    SELECT u.*
    FROM units u
    JOIN buildings b ON b.id = u.building_id
    LEFT JOIN users ll ON ll.id = b.landlord_id
    WHERE u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER')
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
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'subdomain', c.subdomain,
          'status', c.status,
          'city', c.city,
          'created_at', c.created_at,
          'settings', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', c.settings->'frontend_id',
            'isGlobalConfigClient', c.settings->'isGlobalConfigClient'
          ))
        ) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(
        (to_jsonb(b) - 'images' - 'notes')
        || jsonb_build_object('images', jsonb_build_array(b.images->0))
        ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(
        (to_jsonb(u) - 'images')
        || jsonb_build_object('images', CASE WHEN uc.cover IS NOT NULL THEN jsonb_build_array(uc.cover) ELSE '[]'::jsonb END)
        ORDER BY u.created_at DESC)
      FROM public_units u JOIN unit_cover uc ON uc.id = u.id), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'client_id', u.client_id,
          'email', u.email,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'role', u.role,
          'active', u.active,
          'metadata', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', u.metadata->'frontend_id',
            'frontend_role', u.metadata->'frontend_role',
            'verification', CASE WHEN jsonb_typeof(u.metadata->'verification') = 'object'
              THEN jsonb_build_object('status', u.metadata->'verification'->'status') END
          ))
        ) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))),
      '[]'::jsonb
    )
  );
$$;


--
-- Name: handle_new_auth_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
BEGIN
  PERFORM public.sync_auth_user_profile(NEW.id);
  RETURN NEW;
END;
$$;


--
-- Name: is_agency_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_agency_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT role IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
     FROM users WHERE auth_user_id = auth.uid() LIMIT 1),
    FALSE
  );
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'SUPER_ADMIN'
  );
$$;


--
-- Name: submit_public_listing_enquiry(text, text, text, text, text, text, text, text, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_public_listing_enquiry(p_property_fe_id text, p_action text, p_first_name text, p_last_name text, p_email text, p_phone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_slot_fe_id text DEFAULT NULL::text, p_monthly_income numeric DEFAULT NULL::numeric, p_id_number text DEFAULT NULL::text, p_interest_type text DEFAULT 'RENT'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
  WHERE u.id = v_unit_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;

  IF v_status_key NOT IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER') THEN
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

  v_lead_id := gen_random_uuid();
  INSERT INTO leads (
    id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
    interest_type, value_amount, notes, updated_at
  ) VALUES (
    v_lead_id, v_client_id, v_unit_id, v_agent_id, v_full_name,
    lower(trim(p_email)), NULLIF(trim(coalesce(p_phone, '')), ''),
    'Web Form', v_stage, v_interest, v_value, v_extra_notes, NOW()
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


--
-- Name: sync_auth_user_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_auth_user_profile(p_auth_user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  au            RECORD;
  meta          JSONB;
  total_users   INT;
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

  -- Whole-row select: the RECORD carries every column that exists, so
  -- to_jsonb(au)->>'encrypted_password' works whether or not this project
  -- generation exposes the column (a narrow SELECT cannot).
  SELECT *
  INTO au
  FROM auth.users
  WHERE id = p_auth_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  meta := COALESCE(au.raw_user_meta_data, '{}'::jsonb);

  SELECT COUNT(*) INTO total_users FROM users;

  role_fe := COALESCE(NULLIF(TRIM(meta->>'role'), ''), 'tenant');
  IF total_users = 0 THEN
    role_fe := 'super_admin';
  ELSE
    IF role_fe NOT IN ('tenant', 'landlord', 'contractor', 'applicant') THEN
      role_fe := 'tenant';
    END IF;
    IF role_fe = 'applicant' THEN role_fe := 'tenant'; END IF;
  END IF;

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

  IF role_fe = 'landlord' AND total_users > 0 THEN
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

    INSERT INTO entity_id_map (entity_type, backend_id, frontend_id)
    VALUES ('agency', client_uuid, agency_fe_id)
    ON CONFLICT (entity_type, backend_id) DO UPDATE SET frontend_id = EXCLUDED.frontend_id;
  END IF;

  INSERT INTO entity_id_map (entity_type, backend_id, frontend_id)
  VALUES ('user', user_uuid, fe_id)
  ON CONFLICT (entity_type, backend_id) DO UPDATE SET frontend_id = EXCLUDED.frontend_id;

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

  RETURN user_uuid;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    applicant_id uuid,
    agent_id uuid,
    reference_code character varying(40) NOT NULL,
    application_type character varying(20) DEFAULT 'RENTAL'::character varying NOT NULL,
    status character varying(40) DEFAULT 'SUBMITTED'::character varying NOT NULL,
    monthly_income numeric(14,2),
    id_number_or_passport character varying(50),
    uploaded_docs_json jsonb DEFAULT '{}'::jsonb,
    employment_summary character varying(255),
    message text,
    move_in_date date,
    decided_at timestamp with time zone,
    decided_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT applications_application_type_check CHECK (((application_type)::text = ANY ((ARRAY['RENTAL'::character varying, 'PURCHASE'::character varying])::text[]))),
    CONSTRAINT applications_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'SUBMITTED'::character varying, 'UNDER_REVIEW'::character varying, 'CREDIT_CHECK'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'WITHDRAWN'::character varying, 'LEASED'::character varying])::text[])))
);


--
-- Name: arrears_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arrears_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    occupancy_id uuid,
    as_of date NOT NULL,
    current_cents bigint DEFAULT 0 NOT NULL,
    d30 bigint DEFAULT 0 NOT NULL,
    d60 bigint DEFAULT 0 NOT NULL,
    d90 bigint DEFAULT 0 NOT NULL,
    d90plus bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    code character varying(80) NOT NULL,
    name character varying(160) NOT NULL,
    description text,
    trigger_event character varying(80) NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb,
    actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: automation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.automation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id uuid NOT NULL,
    event_id uuid,
    status character varying(20) NOT NULL,
    result jsonb DEFAULT '{}'::jsonb,
    error_message character varying(500),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT automation_runs_status_check CHECK (((status)::text = ANY ((ARRAY['success'::character varying, 'skipped'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: billing_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_name character varying(100) NOT NULL,
    base_monthly_fee numeric(15,2) NOT NULL,
    per_sqm_rate numeric(10,4) NOT NULL,
    per_unit_rate numeric(10,2) NOT NULL,
    per_room_rate numeric(10,2) DEFAULT 0 NOT NULL,
    grade_p_premium_fee numeric(15,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    slot_id uuid,
    agent_id uuid,
    applicant_id uuid,
    visitor_name character varying(160) NOT NULL,
    visitor_email character varying(190),
    visitor_phone character varying(40),
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone,
    status character varying(40) DEFAULT 'SCHEDULED'::character varying NOT NULL,
    interest_level character varying(20) DEFAULT 'UNKNOWN'::character varying,
    feedback text,
    notes character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bookings_interest_level_check CHECK (((interest_level)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'UNKNOWN'::character varying])::text[]))),
    CONSTRAINT bookings_status_check CHECK (((status)::text = ANY ((ARRAY['SCHEDULED'::character varying, 'COMPLETED'::character varying, 'NO_SHOW'::character varying, 'CANCELLED'::character varying, 'RESCHEDULED'::character varying])::text[])))
);


--
-- Name: buildings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buildings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    landlord_id uuid,
    name character varying(200) NOT NULL,
    address character varying(255) NOT NULL,
    city character varying(120) NOT NULL,
    province character varying(80) NOT NULL,
    suburb character varying(120),
    grading character(1),
    solar_capacity_kw numeric(8,2) DEFAULT 0,
    has_borehole boolean DEFAULT false NOT NULL,
    lat numeric(10,7),
    lng numeric(10,7),
    place_id character varying(255),
    formatted_address character varying(500),
    geocoded_at timestamp with time zone,
    images jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT buildings_grading_check CHECK ((grading = ANY (ARRAY['P'::bpchar, 'A'::bpchar, 'B'::bpchar, 'C'::bpchar])))
);


--
-- Name: client_lookup_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_lookup_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    config_type character varying(60) NOT NULL,
    key_value character varying(80) NOT NULL,
    display_label character varying(160) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    billing_cycle_anchor_day integer DEFAULT 1 NOT NULL,
    status character varying(50) DEFAULT 'ACTIVE'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT client_subscriptions_billing_cycle_anchor_day_check CHECK (((billing_cycle_anchor_day >= 1) AND (billing_cycle_anchor_day <= 28))),
    CONSTRAINT client_subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'PAST_DUE'::character varying, 'CANCELLED'::character varying, 'TRIAL'::character varying])::text[])))
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name character varying(160) NOT NULL,
    subdomain character varying(80) NOT NULL,
    status character varying(40) DEFAULT 'active'::character varying NOT NULL,
    trading_as character varying(160),
    email character varying(190),
    phone character varying(40),
    city character varying(120),
    province character varying(80),
    country_code character(2) DEFAULT 'ZA'::bpchar NOT NULL,
    timezone character varying(64) DEFAULT 'Africa/Johannesburg'::character varying NOT NULL,
    currency_code character(3) DEFAULT 'ZAR'::bpchar NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clients_status_check CHECK (((status)::text = ANY ((ARRAY['trial'::character varying, 'active'::character varying, 'suspended'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: csv_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.csv_import_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    filename text NOT NULL,
    row_count integer DEFAULT 0 NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    imported_by uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT csv_import_batches_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: deposit_holdings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deposit_holdings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    occupancy_id uuid,
    unit_id uuid,
    expected_cents bigint DEFAULT 0 NOT NULL,
    held_cents bigint DEFAULT 0 NOT NULL,
    interest_accrued_cents bigint DEFAULT 0 NOT NULL,
    status text DEFAULT 'expected'::text NOT NULL,
    statutory_deadline_on date,
    interest_rate_unknown boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deposit_holdings_status_check CHECK ((status = ANY (ARRAY['expected'::text, 'held'::text, 'release_proposed'::text, 'release_approved'::text, 'refunded'::text, 'applied_to_arrears'::text, 'split'::text, 'disputed'::text])))
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    unit_id uuid,
    building_id uuid,
    application_id uuid,
    lease_id uuid,
    uploaded_by uuid,
    name character varying(255) NOT NULL,
    category character varying(40) DEFAULT 'OTHER'::character varying NOT NULL,
    status character varying(20) DEFAULT 'UPLOADED'::character varying NOT NULL,
    storage_url character varying(1000),
    mime_type character varying(120),
    file_size_bytes integer,
    note text,
    applicant_name character varying(160),
    uploaded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT documents_category_check CHECK (((category)::text = ANY ((ARRAY['TITLE'::character varying, 'COMPLIANCE'::character varying, 'LEASE'::character varying, 'INSPECTION'::character varying, 'MARKETING'::character varying, 'ID'::character varying, 'INVOICE'::character varying, 'OTHER'::character varying])::text[]))),
    CONSTRAINT documents_status_check CHECK (((status)::text = ANY ((ARRAY['REQUIRED'::character varying, 'UPLOADED'::character varying, 'VERIFIED'::character varying, 'REJECTED'::character varying])::text[])))
);


--
-- Name: entity_id_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_id_map (
    entity_type character varying(40) NOT NULL,
    frontend_id character varying(120) NOT NULL,
    backend_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    event_type character varying(80) NOT NULL,
    subject_type character varying(60) NOT NULL,
    subject_id uuid,
    actor_user_id uuid,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: internal_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid,
    unit_id uuid NOT NULL,
    client_id uuid NOT NULL,
    item_name character varying(160) NOT NULL,
    serial_number character varying(80),
    asset_type_key character varying(80) NOT NULL,
    condition_status character varying(40) DEFAULT 'GOOD'::character varying NOT NULL,
    brand character varying(80),
    purchase_value numeric(14,2),
    warranty_expires_at timestamp with time zone,
    last_inspected_at timestamp with time zone,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT internal_assets_condition_status_check CHECK (((condition_status)::text = ANY ((ARRAY['EXCELLENT'::character varying, 'GOOD'::character varying, 'FAIR'::character varying, 'DAMAGED'::character varying, 'NEEDS_REPLACEMENT'::character varying])::text[])))
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    subscription_id uuid,
    billing_period_start date NOT NULL,
    billing_period_end date NOT NULL,
    base_amount numeric(15,2) NOT NULL,
    asset_usage_amount numeric(15,2) NOT NULL,
    vat_amount numeric(15,2) NOT NULL,
    total_amount_due numeric(15,2) NOT NULL,
    payment_status character varying(50) DEFAULT 'UNPAID'::character varying NOT NULL,
    line_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoices_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['UNPAID'::character varying, 'PAID'::character varying, 'FAILED'::character varying, 'VOID'::character varying])::text[])))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    unit_id uuid,
    agent_id uuid,
    name character varying(160) NOT NULL,
    email character varying(190),
    phone character varying(40),
    channel character varying(60),
    stage character varying(80) DEFAULT 'New'::character varying NOT NULL,
    interest_type character varying(20) DEFAULT 'RENT'::character varying NOT NULL,
    value_amount numeric(14,2),
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leads_interest_type_check CHECK (((interest_type)::text = ANY ((ARRAY['BUY'::character varying, 'RENT'::character varying])::text[])))
);


--
-- Name: leases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    application_id uuid,
    tenant_id uuid,
    landlord_id uuid,
    agent_id uuid,
    lease_reference character varying(60) NOT NULL,
    status character varying(40) DEFAULT 'PENDING'::character varying NOT NULL,
    start_date date NOT NULL,
    end_date date,
    rent_amount numeric(14,2) NOT NULL,
    deposit_amount numeric(14,2) DEFAULT 0 NOT NULL,
    rent_due_day smallint DEFAULT 1 NOT NULL,
    document_url character varying(500),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leases_rent_due_day_check CHECK (((rent_due_day >= 1) AND (rent_due_day <= 28))),
    CONSTRAINT leases_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACTIVE'::character varying, 'NOTICE'::character varying, 'ENDED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: maintenance_ticket_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_ticket_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author_id uuid,
    body text NOT NULL,
    status_after character varying(40),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: maintenance_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    lease_id uuid,
    asset_id uuid,
    reported_by uuid,
    assigned_to uuid,
    contractor_id uuid,
    category_key character varying(80),
    title character varying(200) NOT NULL,
    description text NOT NULL,
    priority character varying(20) DEFAULT 'MEDIUM'::character varying NOT NULL,
    status character varying(40) DEFAULT 'OPEN'::character varying NOT NULL,
    warranty_covered boolean DEFAULT false NOT NULL,
    escalated_at timestamp with time zone,
    sla_due_at timestamp with time zone,
    cost_estimate numeric(12,2),
    cost_actual numeric(12,2),
    photos jsonb DEFAULT '[]'::jsonb,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT maintenance_tickets_priority_check CHECK (((priority)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'URGENT'::character varying, 'EMERGENCY'::character varying])::text[]))),
    CONSTRAINT maintenance_tickets_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'TRIAGED'::character varying, 'IN_PROGRESS'::character varying, 'AWAITING_PARTS'::character varying, 'RESOLVED'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: media_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    building_id uuid,
    unit_id uuid,
    kind character varying(20) DEFAULT 'IMAGE'::character varying NOT NULL,
    storage_url character varying(1000) NOT NULL,
    caption character varying(255),
    sort_order integer DEFAULT 0 NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_assets_kind_check CHECK (((kind)::text = ANY ((ARRAY['IMAGE'::character varying, 'FLOOR_PLAN'::character varying, 'VIDEO'::character varying, 'OTHER'::character varying])::text[])))
);


--
-- Name: message_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_threads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    unit_id uuid,
    application_id uuid,
    subject character varying(255) NOT NULL,
    routes_to character varying(20) DEFAULT 'AGENT'::character varying NOT NULL,
    participant_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT message_threads_routes_to_check CHECK (((routes_to)::text = ANY ((ARRAY['AGENCY'::character varying, 'AGENT'::character varying])::text[])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    thread_id uuid NOT NULL,
    client_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    user_id uuid NOT NULL,
    title character varying(200) NOT NULL,
    body text NOT NULL,
    link_path character varying(500),
    resource_type character varying(40),
    action_type character varying(20),
    broadcast_id uuid,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    unit_id uuid,
    lease_id uuid,
    application_id uuid,
    party_user_id uuid,
    party_name character varying(160) NOT NULL,
    payment_type character varying(40) NOT NULL,
    amount numeric(14,2) NOT NULL,
    paid_amount numeric(14,2),
    status character varying(20) DEFAULT 'DUE'::character varying NOT NULL,
    due_date date NOT NULL,
    paid_at timestamp with time zone,
    method character varying(40),
    reference character varying(120),
    notes text,
    landlord_visible boolean DEFAULT true NOT NULL,
    recorded_by uuid,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_payment_type_check CHECK (((payment_type)::text = ANY ((ARRAY['DEPOSIT'::character varying, 'FIRST_MONTH_RENT'::character varying, 'RENT'::character varying, 'SALE_DEPOSIT'::character varying, 'COMMISSION'::character varying, 'REFUND'::character varying, 'OTHER'::character varying])::text[]))),
    CONSTRAINT payments_status_check CHECK (((status)::text = ANY ((ARRAY['DUE'::character varying, 'PAID'::character varying, 'OVERDUE'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: payout_instructions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payout_instructions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    occupancy_id uuid,
    unit_id uuid,
    payee_type text DEFAULT 'landlord'::text NOT NULL,
    payee_id text,
    bank_account_id text,
    amount_cents bigint NOT NULL,
    bucket_code text DEFAULT 'owner_payable'::text NOT NULL,
    status text DEFAULT 'proposed'::text NOT NULL,
    proposed_by uuid,
    approved_by uuid,
    submitted_at timestamp with time zone,
    settled_at timestamp with time zone,
    partner_payout_id text,
    failure_reason text,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payout_instructions_amount_cents_check CHECK ((amount_cents > 0)),
    CONSTRAINT payout_instructions_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'pending_approval'::text, 'approved'::text, 'submitted'::text, 'settled'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(80) NOT NULL,
    description character varying(255)
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role character varying(40) NOT NULL,
    permission_id uuid NOT NULL
);


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid NOT NULL,
    client_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    room_kind character varying(40) NOT NULL,
    beds smallint DEFAULT 0 NOT NULL,
    baths numeric(3,1) DEFAULT 0 NOT NULL,
    area_sqm numeric(8,2),
    layout_x numeric(5,2),
    layout_y numeric(5,2),
    layout_w numeric(5,2),
    layout_h numeric(5,2),
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rooms_layout_h_check CHECK (((layout_h IS NULL) OR ((layout_h >= (0)::numeric) AND (layout_h <= (100)::numeric)))),
    CONSTRAINT rooms_layout_w_check CHECK (((layout_w IS NULL) OR ((layout_w >= (0)::numeric) AND (layout_w <= (100)::numeric)))),
    CONSTRAINT rooms_layout_x_check CHECK (((layout_x IS NULL) OR ((layout_x >= (0)::numeric) AND (layout_x <= (100)::numeric)))),
    CONSTRAINT rooms_layout_y_check CHECK (((layout_y IS NULL) OR ((layout_y >= (0)::numeric) AND (layout_y <= (100)::numeric)))),
    CONSTRAINT rooms_room_kind_check CHECK (((room_kind)::text = ANY ((ARRAY['bedroom'::character varying, 'bathroom'::character varying, 'kitchen'::character varying, 'living'::character varying, 'dining'::character varying, 'study'::character varying, 'garage'::character varying, 'other'::character varying])::text[])))
);


--
-- Name: suite_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suite_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    resource character varying(40) NOT NULL,
    actions jsonb DEFAULT '["created", "updated", "deleted"]'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    popup_enabled boolean DEFAULT true NOT NULL,
    popup_duration_ms integer DEFAULT 6000 NOT NULL,
    notify_roles jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trust_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trust_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    trust_transaction_id uuid NOT NULL,
    occupancy_id uuid,
    bucket_code text DEFAULT 'unallocated'::text NOT NULL,
    charge_id uuid,
    amount_cents bigint NOT NULL,
    allocated_by uuid,
    allocated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trust_allocations_amount_cents_check CHECK ((amount_cents > 0))
);


--
-- Name: trust_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trust_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    direction text NOT NULL,
    amount_cents bigint NOT NULL,
    currency text DEFAULT 'ZAR'::text NOT NULL,
    value_date date NOT NULL,
    posted_at timestamp with time zone DEFAULT now() NOT NULL,
    partner_txn_id text,
    bank_ref text,
    description text DEFAULT ''::text NOT NULL,
    counterparty_hash text,
    status text DEFAULT 'received'::text NOT NULL,
    raw_payload_document_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trust_transactions_amount_cents_check CHECK ((amount_cents >= 0)),
    CONSTRAINT trust_transactions_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT trust_transactions_status_check CHECK ((status = ANY (ARRAY['received'::text, 'recognised'::text, 'allocated'::text, 'split_allocated'::text, 'unallocated'::text, 'reversed'::text])))
);


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    building_id uuid NOT NULL,
    client_id uuid NOT NULL,
    unit_number character varying(40) NOT NULL,
    square_meters numeric(10,2),
    bedrooms smallint DEFAULT 0 NOT NULL,
    bathrooms numeric(3,1) DEFAULT 0 NOT NULL,
    parking smallint DEFAULT 0 NOT NULL,
    listing_type character varying(20) DEFAULT 'NOT_LISTED'::character varying NOT NULL,
    price numeric(14,2),
    rent numeric(14,2),
    status_config_key character varying(80) DEFAULT 'AVAILABLE'::character varying NOT NULL,
    agent_id uuid,
    title character varying(200),
    description text,
    amenities jsonb DEFAULT '[]'::jsonb,
    images jsonb DEFAULT '[]'::jsonb,
    featured boolean DEFAULT false NOT NULL,
    deposit_amount numeric(14,2),
    lat numeric(10,7),
    lng numeric(10,7),
    place_id character varying(255),
    formatted_address character varying(500),
    geocoded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT units_listing_type_check CHECK (((listing_type)::text = ANY ((ARRAY['RENT'::character varying, 'SALE'::character varying, 'BOTH'::character varying, 'NOT_LISTED'::character varying])::text[])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    email character varying(190) NOT NULL,
    password_hash character varying(255),
    first_name character varying(80) NOT NULL,
    last_name character varying(80) NOT NULL,
    phone character varying(40),
    role character varying(40) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    avatar_url character varying(500),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_user_id uuid,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['SUPER_ADMIN'::character varying, 'AGENCY_ADMIN'::character varying, 'AGENT_ADMIN'::character varying, 'GROUND_AGENT'::character varying, 'LANDLORD'::character varying, 'END_USER'::character varying, 'CONTRACTOR'::character varying])::text[])))
);


--
-- Name: v_application_pipeline; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_application_pipeline AS
 SELECT a.id,
    a.reference_code,
    a.application_type,
    a.status,
    a.submitted_at,
    c.company_name AS client_name,
    u.unit_number,
    u.title AS unit_title,
    b.name AS building_name,
    concat(app.first_name, ' ', app.last_name) AS applicant_name,
    concat(ag.first_name, ' ', ag.last_name) AS agent_name
   FROM (((((public.applications a
     JOIN public.clients c ON ((c.id = a.client_id)))
     JOIN public.units u ON ((u.id = a.unit_id)))
     JOIN public.buildings b ON ((b.id = u.building_id)))
     LEFT JOIN public.users app ON ((app.id = a.applicant_id)))
     LEFT JOIN public.users ag ON ((ag.id = a.agent_id)));


--
-- Name: v_billing_usage; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_billing_usage AS
 SELECT b.client_id,
    cs.plan_id,
    count(DISTINCT u.id) AS unit_count,
    count(r.id) AS room_count,
    COALESCE(sum(u.square_meters), (0)::numeric) AS total_gla_sqm,
    count(DISTINCT b.id) FILTER (WHERE (b.grading = 'P'::bpchar)) AS grade_p_building_count,
    COALESCE(sum((u.square_meters * bp.per_sqm_rate)), (0)::numeric) AS sqm_charge,
    ((count(DISTINCT u.id))::numeric * bp.per_unit_rate) AS unit_charge,
    ((count(r.id))::numeric * bp.per_room_rate) AS room_charge,
    ((count(DISTINCT b.id) FILTER (WHERE (b.grading = 'P'::bpchar)))::numeric * bp.grade_p_premium_fee) AS grading_premium
   FROM ((((public.buildings b
     JOIN public.units u ON ((u.building_id = b.id)))
     LEFT JOIN public.rooms r ON ((r.unit_id = u.id)))
     JOIN public.client_subscriptions cs ON (((cs.client_id = b.client_id) AND ((cs.status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'TRIAL'::character varying, 'PAST_DUE'::character varying])::text[])))))
     JOIN public.billing_plans bp ON ((bp.id = cs.plan_id)))
  GROUP BY b.client_id, cs.plan_id, bp.per_unit_rate, bp.per_room_rate, bp.grade_p_premium_fee;


--
-- Name: v_ticket_kanban; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ticket_kanban AS
 SELECT t.id,
    t.client_id,
    t.unit_id,
    t.asset_id,
    t.title,
    t.priority,
    t.status,
        CASE
            WHEN ((t.status)::text = ANY ((ARRAY['OPEN'::character varying, 'TRIAGED'::character varying])::text[])) THEN 'OPEN'::text
            WHEN ((t.status)::text = ANY ((ARRAY['RESOLVED'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])) THEN 'RESOLVED'::text
            ELSE 'IN_PROGRESS'::text
        END AS kanban_column,
    t.category_key,
    t.warranty_covered,
    t.cost_actual,
    t.escalated_at,
    t.created_at,
    a.item_name AS asset_name,
    a.brand AS asset_brand,
    a.condition_status AS asset_condition,
    a.purchase_value AS asset_purchase_value,
    a.warranty_expires_at,
        CASE
            WHEN ((a.condition_status)::text = 'NEEDS_REPLACEMENT'::text) THEN 'REPLACE'::text
            WHEN (((a.condition_status)::text = 'DAMAGED'::text) AND (COALESCE(a.purchase_value, (0)::numeric) >= (15000)::numeric) AND (NOT t.warranty_covered)) THEN 'REPLACE'::text
            WHEN ((a.condition_status)::text = ANY ((ARRAY['FAIR'::character varying, 'DAMAGED'::character varying, 'GOOD'::character varying])::text[])) THEN 'REPAIR'::text
            WHEN (a.id IS NULL) THEN 'UNKNOWN'::text
            ELSE 'MONITOR'::text
        END AS disposition,
        CASE a.condition_status
            WHEN 'EXCELLENT'::text THEN 95
            WHEN 'GOOD'::text THEN 80
            WHEN 'FAIR'::text THEN 55
            WHEN 'DAMAGED'::text THEN 30
            WHEN 'NEEDS_REPLACEMENT'::text THEN 10
            ELSE 50
        END AS health_score
   FROM (public.maintenance_tickets t
     LEFT JOIN public.internal_assets a ON ((a.id = t.asset_id)));


--
-- Name: v_unit_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_unit_summary AS
 SELECT u.id,
    u.unit_number,
    u.title,
    u.listing_type,
    u.status_config_key,
    u.rent,
    u.price,
    u.deposit_amount,
    COALESCE(u.deposit_amount,
        CASE
            WHEN (((u.listing_type)::text = ANY ((ARRAY['RENT'::character varying, 'BOTH'::character varying])::text[])) AND (u.rent IS NOT NULL)) THEN (u.rent * (2)::numeric)
            WHEN (((u.listing_type)::text = ANY ((ARRAY['SALE'::character varying, 'BOTH'::character varying])::text[])) AND (u.price IS NOT NULL)) THEN round((u.price * 0.10), 2)
            ELSE NULL::numeric
        END) AS deposit_resolved,
        CASE
            WHEN (((u.listing_type)::text = ANY ((ARRAY['RENT'::character varying, 'BOTH'::character varying])::text[])) AND (u.rent IS NOT NULL)) THEN (u.rent + COALESCE(u.deposit_amount, (u.rent * (2)::numeric)))
            WHEN (((u.listing_type)::text = ANY ((ARRAY['SALE'::character varying, 'BOTH'::character varying])::text[])) AND (u.price IS NOT NULL)) THEN COALESCE(u.deposit_amount, round((u.price * 0.10), 2))
            ELSE NULL::numeric
        END AS total_entry_fees,
    u.bedrooms,
    u.bathrooms,
    u.square_meters,
    u.featured,
    COALESCE((u.images ->> 0), (b.images ->> 0)) AS primary_image,
    b.name AS building_name,
    b.suburb,
    b.city,
    b.province,
    b.grading,
    b.solar_capacity_kw,
    b.has_borehole,
    ((b.solar_capacity_kw >= (3)::numeric) OR (b.has_borehole AND (b.solar_capacity_kw > (0)::numeric)) OR (COALESCE((u.amenities)::text, ''::text) ~* 'generator|inverter|solar|ups'::text)) AS is_load_shedding_free,
    ((b.grading = 'P'::bpchar) OR ((b.solar_capacity_kw >= (20)::numeric) AND b.has_borehole)) AS is_premium_tier,
    c.company_name AS client_name,
    c.subdomain,
    concat(agent.first_name, ' ', agent.last_name) AS agent_name,
    concat(ll.first_name, ' ', ll.last_name) AS landlord_name
   FROM ((((public.units u
     JOIN public.buildings b ON ((b.id = u.building_id)))
     JOIN public.clients c ON ((c.id = u.client_id)))
     LEFT JOIN public.users agent ON ((agent.id = u.agent_id)))
     LEFT JOIN public.users ll ON ((ll.id = b.landlord_id)));


--
-- Name: v_unit_search_cards; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_unit_search_cards AS
 SELECT u.id,
    u.client_id,
    u.building_id,
    u.unit_number,
    u.title,
    u.listing_type,
    u.status_config_key AS status_key,
    u.bedrooms,
    u.bathrooms,
    u.parking,
    u.square_meters,
    u.rent,
    u.price,
    s.deposit_resolved AS deposit,
    s.total_entry_fees,
    u.featured,
    s.primary_image,
    u.amenities,
    COALESCE(u.lat, b.lat) AS lat,
    COALESCE(u.lng, b.lng) AS lng,
    COALESCE(u.place_id, b.place_id) AS place_id,
    COALESCE(u.formatted_address, b.formatted_address, (concat_ws(', '::text, b.address, b.suburb, b.city, b.province))::character varying) AS formatted_address,
    COALESCE(u.geocoded_at, b.geocoded_at) AS geocoded_at,
    s.is_load_shedding_free,
    s.is_premium_tier,
    b.name AS building_name,
    b.suburb,
    b.city,
    b.province,
    b.grading,
    b.solar_capacity_kw,
    b.has_borehole,
    u.created_at,
    u.updated_at
   FROM ((public.units u
     JOIN public.buildings b ON ((b.id = u.building_id)))
     JOIN public.v_unit_summary s ON ((s.id = u.id)));


--
-- Name: vendor_category_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_category_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    category_key character varying(80) NOT NULL,
    contractor_user_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: viewing_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.viewing_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    agent_id uuid,
    slot_date date NOT NULL,
    slot_time character varying(8) NOT NULL,
    capacity smallint DEFAULT 3 NOT NULL,
    booked_count smallint DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'OPEN'::character varying NOT NULL,
    title character varying(160),
    notes character varying(500),
    duration_minutes smallint DEFAULT 30,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT viewing_slots_booked_count_check CHECK ((booked_count >= 0)),
    CONSTRAINT viewing_slots_capacity_check CHECK ((capacity > 0)),
    CONSTRAINT viewing_slots_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'FULL'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: applications applications_client_id_reference_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_client_id_reference_code_key UNIQUE (client_id, reference_code);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: arrears_snapshots arrears_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arrears_snapshots
    ADD CONSTRAINT arrears_snapshots_pkey PRIMARY KEY (id);


--
-- Name: automation_rules automation_rules_client_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_client_id_code_key UNIQUE (client_id, code);


--
-- Name: automation_rules automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);


--
-- Name: automation_runs automation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_pkey PRIMARY KEY (id);


--
-- Name: billing_plans billing_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: buildings buildings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buildings
    ADD CONSTRAINT buildings_pkey PRIMARY KEY (id);


--
-- Name: client_lookup_configs client_lookup_configs_client_id_config_type_key_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_lookup_configs
    ADD CONSTRAINT client_lookup_configs_client_id_config_type_key_value_key UNIQUE (client_id, config_type, key_value);


--
-- Name: client_lookup_configs client_lookup_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_lookup_configs
    ADD CONSTRAINT client_lookup_configs_pkey PRIMARY KEY (id);


--
-- Name: client_subscriptions client_subscriptions_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_subscriptions
    ADD CONSTRAINT client_subscriptions_client_id_key UNIQUE (client_id);


--
-- Name: client_subscriptions client_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_subscriptions
    ADD CONSTRAINT client_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: clients clients_subdomain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_subdomain_key UNIQUE (subdomain);


--
-- Name: csv_import_batches csv_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csv_import_batches
    ADD CONSTRAINT csv_import_batches_pkey PRIMARY KEY (id);


--
-- Name: deposit_holdings deposit_holdings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposit_holdings
    ADD CONSTRAINT deposit_holdings_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: entity_id_map entity_id_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_id_map
    ADD CONSTRAINT entity_id_map_pkey PRIMARY KEY (entity_type, frontend_id);


--
-- Name: event_log event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_pkey PRIMARY KEY (id);


--
-- Name: internal_assets internal_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_assets
    ADD CONSTRAINT internal_assets_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: leases leases_client_id_lease_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_client_id_lease_reference_key UNIQUE (client_id, lease_reference);


--
-- Name: leases leases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_pkey PRIMARY KEY (id);


--
-- Name: maintenance_ticket_updates maintenance_ticket_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_ticket_updates
    ADD CONSTRAINT maintenance_ticket_updates_pkey PRIMARY KEY (id);


--
-- Name: maintenance_tickets maintenance_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_tickets
    ADD CONSTRAINT maintenance_tickets_pkey PRIMARY KEY (id);


--
-- Name: media_assets media_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_pkey PRIMARY KEY (id);


--
-- Name: message_threads message_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payout_instructions payout_instructions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_instructions
    ADD CONSTRAINT payout_instructions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_code_key UNIQUE (code);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role, permission_id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: suite_alerts suite_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suite_alerts
    ADD CONSTRAINT suite_alerts_pkey PRIMARY KEY (id);


--
-- Name: trust_allocations trust_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_allocations
    ADD CONSTRAINT trust_allocations_pkey PRIMARY KEY (id);


--
-- Name: trust_transactions trust_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_transactions
    ADD CONSTRAINT trust_transactions_pkey PRIMARY KEY (id);


--
-- Name: units units_building_id_unit_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_building_id_unit_number_key UNIQUE (building_id, unit_number);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: users users_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vendor_category_routes vendor_category_routes_client_id_category_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_category_routes
    ADD CONSTRAINT vendor_category_routes_client_id_category_key_key UNIQUE (client_id, category_key);


--
-- Name: vendor_category_routes vendor_category_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_category_routes
    ADD CONSTRAINT vendor_category_routes_pkey PRIMARY KEY (id);


--
-- Name: viewing_slots viewing_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viewing_slots
    ADD CONSTRAINT viewing_slots_pkey PRIMARY KEY (id);


--
-- Name: idx_applications_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_client ON public.applications USING btree (client_id);


--
-- Name: idx_applications_client_applicant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_client_applicant ON public.applications USING btree (client_id, applicant_id, status);


--
-- Name: idx_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status ON public.applications USING btree (client_id, status);


--
-- Name: idx_applications_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_unit ON public.applications USING btree (unit_id);


--
-- Name: idx_applications_unit_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_unit_status ON public.applications USING btree (unit_id, status);


--
-- Name: idx_arrears_client_asof; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_arrears_client_asof ON public.arrears_snapshots USING btree (client_id, as_of DESC);


--
-- Name: idx_assets_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_client ON public.internal_assets USING btree (client_id);


--
-- Name: idx_assets_health; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_health ON public.internal_assets USING btree (client_id, condition_status, purchase_value);


--
-- Name: idx_assets_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_room ON public.internal_assets USING btree (room_id);


--
-- Name: idx_assets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_type ON public.internal_assets USING btree (client_id, asset_type_key);


--
-- Name: idx_assets_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_unit ON public.internal_assets USING btree (unit_id);


--
-- Name: idx_automation_rules_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_automation_rules_client ON public.automation_rules USING btree (client_id);


--
-- Name: idx_bookings_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_client ON public.bookings USING btree (client_id);


--
-- Name: idx_bookings_schedule_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_schedule_composite ON public.bookings USING btree (client_id, agent_id, starts_at, ends_at);


--
-- Name: idx_bookings_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_starts ON public.bookings USING btree (unit_id, starts_at);


--
-- Name: idx_bookings_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_unit ON public.bookings USING btree (unit_id);


--
-- Name: idx_bookings_unit_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_unit_scheduled ON public.bookings USING btree (unit_id, starts_at) WHERE ((status)::text = 'SCHEDULED'::text);


--
-- Name: idx_buildings_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buildings_city ON public.buildings USING btree (city, suburb);


--
-- Name: idx_buildings_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buildings_client ON public.buildings USING btree (client_id);


--
-- Name: idx_buildings_client_landlord; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buildings_client_landlord ON public.buildings USING btree (client_id, landlord_id);


--
-- Name: idx_buildings_geo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buildings_geo ON public.buildings USING btree (lat, lng) WHERE ((lat IS NOT NULL) AND (lng IS NOT NULL));


--
-- Name: idx_buildings_landlord; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buildings_landlord ON public.buildings USING btree (landlord_id);


--
-- Name: idx_buildings_utility_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buildings_utility_tier ON public.buildings USING btree (client_id, grading, solar_capacity_kw, has_borehole);


--
-- Name: idx_client_lookup_configs_composite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_lookup_configs_composite ON public.client_lookup_configs USING btree (client_id, config_type, key_value);


--
-- Name: idx_client_subscriptions_billing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_subscriptions_billing ON public.client_subscriptions USING btree (client_id, plan_id, status);


--
-- Name: idx_client_subscriptions_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_subscriptions_plan ON public.client_subscriptions USING btree (plan_id);


--
-- Name: idx_clients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_status ON public.clients USING btree (status);


--
-- Name: idx_clients_subdomain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_subdomain ON public.clients USING btree (subdomain);


--
-- Name: idx_deposit_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deposit_client ON public.deposit_holdings USING btree (client_id);


--
-- Name: idx_documents_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_category ON public.documents USING btree (client_id, category);


--
-- Name: idx_documents_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_client ON public.documents USING btree (client_id);


--
-- Name: idx_documents_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_documents_unit ON public.documents USING btree (unit_id);


--
-- Name: idx_entity_id_map_backend; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_entity_id_map_backend ON public.entity_id_map USING btree (entity_type, backend_id);


--
-- Name: idx_entity_id_map_frontend; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_entity_id_map_frontend ON public.entity_id_map USING btree (entity_type, frontend_id);


--
-- Name: idx_event_log_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_log_client ON public.event_log USING btree (client_id);


--
-- Name: idx_event_log_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_log_subject ON public.event_log USING btree (subject_type, subject_id);


--
-- Name: idx_event_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_log_type ON public.event_log USING btree (event_type, created_at);


--
-- Name: idx_internal_assets_unit_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_assets_unit_type ON public.internal_assets USING btree (unit_id, asset_type_key);


--
-- Name: idx_invoices_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_client ON public.invoices USING btree (client_id);


--
-- Name: idx_invoices_client_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_client_period ON public.invoices USING btree (client_id, billing_period_start, billing_period_end);


--
-- Name: idx_invoices_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_period ON public.invoices USING btree (billing_period_start, billing_period_end);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (client_id, payment_status);


--
-- Name: idx_leads_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_agent ON public.leads USING btree (agent_id);


--
-- Name: idx_leads_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_client ON public.leads USING btree (client_id);


--
-- Name: idx_leads_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_stage ON public.leads USING btree (client_id, stage);


--
-- Name: idx_leases_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leases_client ON public.leases USING btree (client_id);


--
-- Name: idx_leases_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leases_status ON public.leases USING btree (client_id, status);


--
-- Name: idx_leases_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leases_tenant ON public.leases USING btree (tenant_id);


--
-- Name: idx_leases_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leases_unit ON public.leases USING btree (unit_id);


--
-- Name: idx_leases_unit_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leases_unit_active ON public.leases USING btree (unit_id, status) WHERE ((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ACTIVE'::character varying])::text[]));


--
-- Name: idx_leases_unit_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leases_unit_tenant ON public.leases USING btree (unit_id, tenant_id, status);


--
-- Name: idx_leases_unit_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leases_unit_tenant_status ON public.leases USING btree (unit_id, tenant_id, status);


--
-- Name: idx_lookup_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lookup_client ON public.client_lookup_configs USING btree (client_id);


--
-- Name: idx_lookup_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lookup_type ON public.client_lookup_configs USING btree (client_id, config_type);


--
-- Name: idx_maintenance_tickets_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_tickets_lookup ON public.maintenance_tickets USING btree (client_id, status, priority);


--
-- Name: idx_maintenance_tickets_unit_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_tickets_unit_asset ON public.maintenance_tickets USING btree (unit_id, asset_id);


--
-- Name: idx_maintenance_tickets_unit_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_maintenance_tickets_unit_status ON public.maintenance_tickets USING btree (unit_id, status);


--
-- Name: idx_media_building; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_building ON public.media_assets USING btree (building_id);


--
-- Name: idx_media_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_client ON public.media_assets USING btree (client_id);


--
-- Name: idx_media_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_unit ON public.media_assets USING btree (unit_id);


--
-- Name: idx_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);


--
-- Name: idx_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_thread ON public.messages USING btree (thread_id, created_at);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id) WHERE (read_at IS NULL);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_payments_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_client ON public.payments USING btree (client_id);


--
-- Name: idx_payments_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_due ON public.payments USING btree (due_date, status);


--
-- Name: idx_payments_lease; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_lease ON public.payments USING btree (lease_id);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (client_id, status);


--
-- Name: idx_payout_client_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payout_client_status ON public.payout_instructions USING btree (client_id, status);


--
-- Name: idx_rooms_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rooms_client ON public.rooms USING btree (client_id);


--
-- Name: idx_rooms_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rooms_unit ON public.rooms USING btree (unit_id);


--
-- Name: idx_suite_alerts_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suite_alerts_client ON public.suite_alerts USING btree (client_id);


--
-- Name: idx_suite_alerts_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suite_alerts_resource ON public.suite_alerts USING btree (resource);


--
-- Name: idx_threads_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_threads_client ON public.message_threads USING btree (client_id);


--
-- Name: idx_ticket_updates_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_updates_ticket ON public.maintenance_ticket_updates USING btree (ticket_id);


--
-- Name: idx_tickets_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_asset ON public.maintenance_tickets USING btree (asset_id);


--
-- Name: idx_tickets_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_client ON public.maintenance_tickets USING btree (client_id);


--
-- Name: idx_tickets_kanban_cursor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_kanban_cursor ON public.maintenance_tickets USING btree (client_id, status, priority, created_at DESC, id DESC);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_status ON public.maintenance_tickets USING btree (client_id, status);


--
-- Name: idx_tickets_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_unit ON public.maintenance_tickets USING btree (unit_id);


--
-- Name: idx_trust_txn_client_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trust_txn_client_date ON public.trust_transactions USING btree (client_id, value_date DESC);


--
-- Name: idx_trust_txn_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trust_txn_status ON public.trust_transactions USING btree (client_id, status);


--
-- Name: idx_units_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_agent ON public.units USING btree (agent_id);


--
-- Name: idx_units_building; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_building ON public.units USING btree (building_id);


--
-- Name: idx_units_building_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_building_status ON public.units USING btree (building_id, status_config_key, listing_type);


--
-- Name: idx_units_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_client ON public.units USING btree (client_id);


--
-- Name: idx_units_feed_cursor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_feed_cursor ON public.units USING btree (client_id, created_at DESC, id DESC);


--
-- Name: idx_units_geo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_geo ON public.units USING btree (lat, lng) WHERE ((lat IS NOT NULL) AND (lng IS NOT NULL));


--
-- Name: idx_units_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_listing ON public.units USING btree (listing_type);


--
-- Name: idx_units_price_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_price_range ON public.units USING btree (client_id, listing_type, price) WHERE ((price IS NOT NULL) AND ((listing_type)::text = ANY ((ARRAY['SALE'::character varying, 'BOTH'::character varying])::text[])));


--
-- Name: idx_units_rent_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_rent_range ON public.units USING btree (client_id, listing_type, rent) WHERE ((rent IS NOT NULL) AND ((listing_type)::text = ANY ((ARRAY['RENT'::character varying, 'BOTH'::character varying])::text[])));


--
-- Name: idx_units_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_status ON public.units USING btree (client_id, status_config_key);


--
-- Name: idx_users_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_client ON public.users USING btree (client_id);


--
-- Name: idx_users_client_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_client_role ON public.users USING btree (client_id, role);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_vendor_routes_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vendor_routes_client ON public.vendor_category_routes USING btree (client_id);


--
-- Name: idx_viewing_slots_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_viewing_slots_agent ON public.viewing_slots USING btree (agent_id, slot_date);


--
-- Name: idx_viewing_slots_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_viewing_slots_client ON public.viewing_slots USING btree (client_id);


--
-- Name: idx_viewing_slots_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_viewing_slots_unit ON public.viewing_slots USING btree (unit_id, slot_date);


--
-- Name: applications applications_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: applications applications_applicant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: applications applications_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: applications applications_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: applications applications_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: arrears_snapshots arrears_snapshots_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arrears_snapshots
    ADD CONSTRAINT arrears_snapshots_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: automation_rules automation_rules_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_rules
    ADD CONSTRAINT automation_rules_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: automation_runs automation_runs_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_log(id) ON DELETE SET NULL;


--
-- Name: automation_runs automation_runs_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.automation_runs
    ADD CONSTRAINT automation_runs_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.automation_rules(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_applicant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.viewing_slots(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: buildings buildings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buildings
    ADD CONSTRAINT buildings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: buildings buildings_landlord_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buildings
    ADD CONSTRAINT buildings_landlord_id_fkey FOREIGN KEY (landlord_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: client_lookup_configs client_lookup_configs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_lookup_configs
    ADD CONSTRAINT client_lookup_configs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_subscriptions client_subscriptions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_subscriptions
    ADD CONSTRAINT client_subscriptions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_subscriptions client_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_subscriptions
    ADD CONSTRAINT client_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.billing_plans(id);


--
-- Name: csv_import_batches csv_import_batches_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.csv_import_batches
    ADD CONSTRAINT csv_import_batches_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: deposit_holdings deposit_holdings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposit_holdings
    ADD CONSTRAINT deposit_holdings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: documents documents_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE SET NULL;


--
-- Name: documents documents_building_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_building_id_fkey FOREIGN KEY (building_id) REFERENCES public.buildings(id) ON DELETE SET NULL;


--
-- Name: documents documents_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: documents documents_lease_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_lease_id_fkey FOREIGN KEY (lease_id) REFERENCES public.leases(id) ON DELETE SET NULL;


--
-- Name: documents documents_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE SET NULL;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: event_log event_log_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: event_log event_log_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_log
    ADD CONSTRAINT event_log_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: internal_assets internal_assets_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_assets
    ADD CONSTRAINT internal_assets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: internal_assets internal_assets_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_assets
    ADD CONSTRAINT internal_assets_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;


--
-- Name: internal_assets internal_assets_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_assets
    ADD CONSTRAINT internal_assets_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.client_subscriptions(id) ON DELETE SET NULL;


--
-- Name: leads leads_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leads leads_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: leads leads_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE SET NULL;


--
-- Name: leases leases_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leases leases_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE SET NULL;


--
-- Name: leases leases_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: leases leases_landlord_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_landlord_id_fkey FOREIGN KEY (landlord_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leases leases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leases leases_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leases
    ADD CONSTRAINT leases_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: maintenance_ticket_updates maintenance_ticket_updates_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_ticket_updates
    ADD CONSTRAINT maintenance_ticket_updates_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: maintenance_ticket_updates maintenance_ticket_updates_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_ticket_updates
    ADD CONSTRAINT maintenance_ticket_updates_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE;


--
-- Name: maintenance_tickets maintenance_tickets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_tickets
    ADD CONSTRAINT maintenance_tickets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.internal_assets(id) ON DELETE SET NULL;


--
-- Name: maintenance_tickets maintenance_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_tickets
    ADD CONSTRAINT maintenance_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: maintenance_tickets maintenance_tickets_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_tickets
    ADD CONSTRAINT maintenance_tickets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: maintenance_tickets maintenance_tickets_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_tickets
    ADD CONSTRAINT maintenance_tickets_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: maintenance_tickets maintenance_tickets_lease_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_tickets
    ADD CONSTRAINT maintenance_tickets_lease_id_fkey FOREIGN KEY (lease_id) REFERENCES public.leases(id) ON DELETE SET NULL;


--
-- Name: maintenance_tickets maintenance_tickets_reported_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_tickets
    ADD CONSTRAINT maintenance_tickets_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: maintenance_tickets maintenance_tickets_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_tickets
    ADD CONSTRAINT maintenance_tickets_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: media_assets media_assets_building_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_building_id_fkey FOREIGN KEY (building_id) REFERENCES public.buildings(id) ON DELETE CASCADE;


--
-- Name: media_assets media_assets_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: media_assets media_assets_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_assets
    ADD CONSTRAINT media_assets_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: message_threads message_threads_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE SET NULL;


--
-- Name: message_threads message_threads_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: message_threads message_threads_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_threads
    ADD CONSTRAINT message_threads_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE SET NULL;


--
-- Name: messages messages_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: messages messages_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.message_threads(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applications(id) ON DELETE SET NULL;


--
-- Name: payments payments_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: payments payments_lease_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_lease_id_fkey FOREIGN KEY (lease_id) REFERENCES public.leases(id) ON DELETE SET NULL;


--
-- Name: payments payments_party_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_party_user_id_fkey FOREIGN KEY (party_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE SET NULL;


--
-- Name: payout_instructions payout_instructions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payout_instructions
    ADD CONSTRAINT payout_instructions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: rooms rooms_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: rooms rooms_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: suite_alerts suite_alerts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suite_alerts
    ADD CONSTRAINT suite_alerts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: trust_allocations trust_allocations_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_allocations
    ADD CONSTRAINT trust_allocations_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: trust_allocations trust_allocations_trust_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_allocations
    ADD CONSTRAINT trust_allocations_trust_transaction_id_fkey FOREIGN KEY (trust_transaction_id) REFERENCES public.trust_transactions(id) ON DELETE CASCADE;


--
-- Name: trust_transactions trust_transactions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trust_transactions
    ADD CONSTRAINT trust_transactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: units units_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: units units_building_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_building_id_fkey FOREIGN KEY (building_id) REFERENCES public.buildings(id) ON DELETE CASCADE;


--
-- Name: units units_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: users users_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;


--
-- Name: vendor_category_routes vendor_category_routes_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_category_routes
    ADD CONSTRAINT vendor_category_routes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: vendor_category_routes vendor_category_routes_contractor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_category_routes
    ADD CONSTRAINT vendor_category_routes_contractor_user_id_fkey FOREIGN KEY (contractor_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: viewing_slots viewing_slots_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viewing_slots
    ADD CONSTRAINT viewing_slots_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: viewing_slots viewing_slots_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viewing_slots
    ADD CONSTRAINT viewing_slots_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: viewing_slots viewing_slots_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.viewing_slots
    ADD CONSTRAINT viewing_slots_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

--
-- Name: applications applications_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY applications_mutate ON public.applications TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: applications applications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY applications_select ON public.applications FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: applications applications_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY applications_tenant_read ON public.applications FOR SELECT TO authenticated USING (((public.current_app_user_role() = 'END_USER'::text) AND (applicant_id = public.current_app_user_id())));


--
-- Name: arrears_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.arrears_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings bookings_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_mutate ON public.bookings TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: bookings bookings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_select ON public.bookings FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: buildings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

--
-- Name: buildings buildings_landlord_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buildings_landlord_read ON public.buildings FOR SELECT TO authenticated USING (((public.current_app_user_role() = 'LANDLORD'::text) AND (landlord_id = public.current_app_user_id())));


--
-- Name: buildings buildings_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buildings_mutate ON public.buildings TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: buildings buildings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buildings_select ON public.buildings FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: client_lookup_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_lookup_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: client_lookup_configs client_lookup_configs_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_lookup_configs_mutate ON public.client_lookup_configs TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: client_lookup_configs client_lookup_configs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_lookup_configs_select ON public.client_lookup_configs FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: client_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: client_subscriptions client_subscriptions_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_subscriptions_mutate ON public.client_subscriptions TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: client_subscriptions client_subscriptions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_subscriptions_select ON public.client_subscriptions FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: clients clients_mutate_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_mutate_admin ON public.clients TO authenticated USING ((public.is_super_admin() OR ((id = public.current_app_client_id()) AND public.is_agency_staff()))) WITH CHECK ((public.is_super_admin() OR ((id = public.current_app_client_id()) AND public.is_agency_staff())));


--
-- Name: clients clients_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_select_scoped ON public.clients FOR SELECT TO authenticated USING ((public.is_super_admin() OR (id = public.current_app_client_id())));


--
-- Name: csv_import_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.csv_import_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: deposit_holdings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deposit_holdings ENABLE ROW LEVEL SECURITY;

--
-- Name: documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

--
-- Name: documents documents_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_mutate ON public.documents TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: documents documents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: entity_id_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entity_id_map ENABLE ROW LEVEL SECURITY;

--
-- Name: entity_id_map entity_id_map_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_id_map_mutate ON public.entity_id_map TO authenticated USING ((public.is_super_admin() OR public.is_agency_staff())) WITH CHECK ((public.is_super_admin() OR public.is_agency_staff()));


--
-- Name: entity_id_map entity_id_map_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entity_id_map_select ON public.entity_id_map FOR SELECT TO authenticated USING (true);


--
-- Name: event_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;

--
-- Name: event_log event_log_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_log_mutate ON public.event_log TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: event_log event_log_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_log_select ON public.event_log FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: internal_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.internal_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: internal_assets internal_assets_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_assets_mutate ON public.internal_assets TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: internal_assets internal_assets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_assets_select ON public.internal_assets FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_mutate ON public.invoices TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: invoices invoices_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_mutate ON public.leads TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: leads leads_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: leases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leases ENABLE ROW LEVEL SECURITY;

--
-- Name: leases leases_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leases_mutate ON public.leases TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: leases leases_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leases_select ON public.leases FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: leases leases_tenant_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leases_tenant_read ON public.leases FOR SELECT TO authenticated USING (((public.current_app_user_role() = 'END_USER'::text) AND (tenant_id = public.current_app_user_id())));


--
-- Name: maintenance_ticket_updates maintenance_ticket_updates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY maintenance_ticket_updates_insert ON public.maintenance_ticket_updates FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.maintenance_tickets mt
  WHERE ((mt.id = maintenance_ticket_updates.ticket_id) AND (public.is_super_admin() OR (mt.client_id = public.current_app_client_id()))))));


--
-- Name: maintenance_ticket_updates maintenance_ticket_updates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY maintenance_ticket_updates_select ON public.maintenance_ticket_updates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.maintenance_tickets mt
  WHERE ((mt.id = maintenance_ticket_updates.ticket_id) AND (public.is_super_admin() OR (mt.client_id = public.current_app_client_id()) OR (mt.reported_by = public.current_app_user_id()) OR (mt.assigned_to = public.current_app_user_id()) OR (mt.contractor_id = public.current_app_user_id()))))));


--
-- Name: maintenance_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: maintenance_tickets maintenance_tickets_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY maintenance_tickets_mutate ON public.maintenance_tickets TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: maintenance_tickets maintenance_tickets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY maintenance_tickets_select ON public.maintenance_tickets FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: message_threads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;

--
-- Name: message_threads message_threads_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_threads_mutate ON public.message_threads TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: message_threads message_threads_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY message_threads_select ON public.message_threads FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_mutate ON public.messages TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: messages messages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_mutate ON public.notifications TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: notifications notifications_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_mutate ON public.payments TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: payments payments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: payout_instructions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payout_instructions ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms rooms_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rooms_mutate ON public.rooms TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: rooms rooms_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rooms_select ON public.rooms FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: suite_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suite_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: suite_alerts suite_alerts_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suite_alerts_mutate ON public.suite_alerts TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: suite_alerts suite_alerts_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suite_alerts_select ON public.suite_alerts FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: maintenance_tickets tickets_contractor_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_contractor_read ON public.maintenance_tickets FOR SELECT TO authenticated USING (((public.current_app_user_role() = 'CONTRACTOR'::text) AND (contractor_id = public.current_app_user_id())));


--
-- Name: maintenance_tickets tickets_contractor_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_contractor_update ON public.maintenance_tickets FOR UPDATE TO authenticated USING (((public.current_app_user_role() = 'CONTRACTOR'::text) AND (contractor_id = public.current_app_user_id()))) WITH CHECK (((public.current_app_user_role() = 'CONTRACTOR'::text) AND (contractor_id = public.current_app_user_id())));


--
-- Name: trust_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trust_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: arrears_snapshots trust_read_arrears_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trust_read_arrears_snapshots ON public.arrears_snapshots FOR SELECT TO authenticated USING (true);


--
-- Name: csv_import_batches trust_read_csv_import_batches; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trust_read_csv_import_batches ON public.csv_import_batches FOR SELECT TO authenticated USING (true);


--
-- Name: deposit_holdings trust_read_deposit_holdings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trust_read_deposit_holdings ON public.deposit_holdings FOR SELECT TO authenticated USING (true);


--
-- Name: payout_instructions trust_read_payout_instructions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trust_read_payout_instructions ON public.payout_instructions FOR SELECT TO authenticated USING (true);


--
-- Name: trust_allocations trust_read_trust_allocations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trust_read_trust_allocations ON public.trust_allocations FOR SELECT TO authenticated USING (true);


--
-- Name: trust_transactions trust_read_trust_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY trust_read_trust_transactions ON public.trust_transactions FOR SELECT TO authenticated USING (true);


--
-- Name: trust_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trust_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

--
-- Name: units units_landlord_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY units_landlord_read ON public.units FOR SELECT TO authenticated USING (((public.current_app_user_role() = 'LANDLORD'::text) AND (EXISTS ( SELECT 1
   FROM public.buildings b
  WHERE ((b.id = units.building_id) AND (b.landlord_id = public.current_app_user_id()))))));


--
-- Name: units units_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY units_mutate ON public.units TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: units units_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY units_select ON public.units FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_insert_admin ON public.users FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR public.is_agency_staff()));


--
-- Name: users users_select_agency; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_agency ON public.users FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((client_id IS NOT NULL) AND (client_id = public.current_app_client_id()) AND public.is_agency_staff())));


--
-- Name: users users_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_own ON public.users FOR SELECT TO authenticated USING ((auth_user_id = auth.uid()));


--
-- Name: users users_select_self_agency; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_self_agency ON public.users FOR SELECT TO authenticated USING (((client_id IS NOT NULL) AND (client_id = public.current_app_client_id())));


--
-- Name: users users_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own ON public.users FOR UPDATE TO authenticated USING (((auth_user_id = auth.uid()) OR public.is_super_admin())) WITH CHECK (((auth_user_id = auth.uid()) OR public.is_super_admin()));


--
-- Name: viewing_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.viewing_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: viewing_slots viewing_slots_mutate; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY viewing_slots_mutate ON public.viewing_slots TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()))) WITH CHECK ((public.is_super_admin() OR (client_id = public.current_app_client_id())));


--
-- Name: viewing_slots viewing_slots_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY viewing_slots_select ON public.viewing_slots FOR SELECT TO authenticated USING ((public.is_super_admin() OR (client_id = public.current_app_client_id()) OR (public.current_app_user_role() = ANY (ARRAY['LANDLORD'::text, 'END_USER'::text, 'CONTRACTOR'::text]))));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION admin_update_user_verification(p_frontend_user_id text, p_status text, p_reject_note text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_update_user_verification(p_frontend_user_id text, p_status text, p_reject_note text) TO anon;
GRANT ALL ON FUNCTION public.admin_update_user_verification(p_frontend_user_id text, p_status text, p_reject_note text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_update_user_verification(p_frontend_user_id text, p_status text, p_reject_note text) TO service_role;


--
-- Name: FUNCTION approve_application(p_application_ref text, p_tenancy jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.approve_application(p_application_ref text, p_tenancy jsonb) TO anon;
GRANT ALL ON FUNCTION public.approve_application(p_application_ref text, p_tenancy jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.approve_application(p_application_ref text, p_tenancy jsonb) TO service_role;


--
-- Name: FUNCTION auth_bootstrap_needed(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.auth_bootstrap_needed() TO anon;
GRANT ALL ON FUNCTION public.auth_bootstrap_needed() TO authenticated;
GRANT ALL ON FUNCTION public.auth_bootstrap_needed() TO service_role;


--
-- Name: FUNCTION current_app_client_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_app_client_id() TO anon;
GRANT ALL ON FUNCTION public.current_app_client_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_app_client_id() TO service_role;


--
-- Name: FUNCTION current_app_user_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_app_user_id() TO anon;
GRANT ALL ON FUNCTION public.current_app_user_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_app_user_id() TO service_role;


--
-- Name: FUNCTION current_app_user_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.current_app_user_role() TO anon;
GRANT ALL ON FUNCTION public.current_app_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.current_app_user_role() TO service_role;


--
-- Name: FUNCTION ensure_user_profile(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_user_profile() TO anon;
GRANT ALL ON FUNCTION public.ensure_user_profile() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_user_profile() TO service_role;


--
-- Name: FUNCTION get_public_marketplace_bootstrap(p_lite boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_public_marketplace_bootstrap(p_lite boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_public_marketplace_bootstrap(p_lite boolean) TO anon;
GRANT ALL ON FUNCTION public.get_public_marketplace_bootstrap(p_lite boolean) TO authenticated;
GRANT ALL ON FUNCTION public.get_public_marketplace_bootstrap(p_lite boolean) TO service_role;


--
-- Name: FUNCTION get_public_marketplace_bootstrap_lite(p_lite boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_public_marketplace_bootstrap_lite(p_lite boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_public_marketplace_bootstrap_lite(p_lite boolean) TO anon;
GRANT ALL ON FUNCTION public.get_public_marketplace_bootstrap_lite(p_lite boolean) TO authenticated;
GRANT ALL ON FUNCTION public.get_public_marketplace_bootstrap_lite(p_lite boolean) TO service_role;


--
-- Name: FUNCTION handle_new_auth_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_auth_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_auth_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_auth_user() TO service_role;


--
-- Name: FUNCTION is_agency_staff(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_agency_staff() TO anon;
GRANT ALL ON FUNCTION public.is_agency_staff() TO authenticated;
GRANT ALL ON FUNCTION public.is_agency_staff() TO service_role;


--
-- Name: FUNCTION is_super_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_super_admin() TO anon;
GRANT ALL ON FUNCTION public.is_super_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_super_admin() TO service_role;


--
-- Name: FUNCTION submit_public_listing_enquiry(p_property_fe_id text, p_action text, p_first_name text, p_last_name text, p_email text, p_phone text, p_notes text, p_slot_fe_id text, p_monthly_income numeric, p_id_number text, p_interest_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_public_listing_enquiry(p_property_fe_id text, p_action text, p_first_name text, p_last_name text, p_email text, p_phone text, p_notes text, p_slot_fe_id text, p_monthly_income numeric, p_id_number text, p_interest_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_public_listing_enquiry(p_property_fe_id text, p_action text, p_first_name text, p_last_name text, p_email text, p_phone text, p_notes text, p_slot_fe_id text, p_monthly_income numeric, p_id_number text, p_interest_type text) TO anon;
GRANT ALL ON FUNCTION public.submit_public_listing_enquiry(p_property_fe_id text, p_action text, p_first_name text, p_last_name text, p_email text, p_phone text, p_notes text, p_slot_fe_id text, p_monthly_income numeric, p_id_number text, p_interest_type text) TO authenticated;
GRANT ALL ON FUNCTION public.submit_public_listing_enquiry(p_property_fe_id text, p_action text, p_first_name text, p_last_name text, p_email text, p_phone text, p_notes text, p_slot_fe_id text, p_monthly_income numeric, p_id_number text, p_interest_type text) TO service_role;


--
-- Name: FUNCTION sync_auth_user_profile(p_auth_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_auth_user_profile(p_auth_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.sync_auth_user_profile(p_auth_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sync_auth_user_profile(p_auth_user_id uuid) TO service_role;


--
-- Name: TABLE applications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.applications TO authenticated;
GRANT ALL ON TABLE public.applications TO service_role;


--
-- Name: TABLE arrears_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.arrears_snapshots TO service_role;


--
-- Name: TABLE automation_rules; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.automation_rules TO authenticated;
GRANT ALL ON TABLE public.automation_rules TO service_role;


--
-- Name: TABLE automation_runs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.automation_runs TO authenticated;
GRANT ALL ON TABLE public.automation_runs TO service_role;


--
-- Name: TABLE billing_plans; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.billing_plans TO authenticated;
GRANT ALL ON TABLE public.billing_plans TO service_role;


--
-- Name: TABLE bookings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.bookings TO authenticated;
GRANT ALL ON TABLE public.bookings TO service_role;


--
-- Name: TABLE buildings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.buildings TO authenticated;
GRANT ALL ON TABLE public.buildings TO service_role;


--
-- Name: TABLE client_lookup_configs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.client_lookup_configs TO authenticated;
GRANT ALL ON TABLE public.client_lookup_configs TO service_role;


--
-- Name: TABLE client_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.client_subscriptions TO authenticated;
GRANT ALL ON TABLE public.client_subscriptions TO service_role;


--
-- Name: TABLE clients; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.clients TO authenticated;
GRANT ALL ON TABLE public.clients TO service_role;


--
-- Name: TABLE csv_import_batches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.csv_import_batches TO service_role;


--
-- Name: TABLE deposit_holdings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.deposit_holdings TO service_role;


--
-- Name: TABLE documents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;


--
-- Name: TABLE entity_id_map; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.entity_id_map TO authenticated;
GRANT ALL ON TABLE public.entity_id_map TO service_role;


--
-- Name: TABLE event_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.event_log TO authenticated;
GRANT ALL ON TABLE public.event_log TO service_role;


--
-- Name: TABLE internal_assets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.internal_assets TO authenticated;
GRANT ALL ON TABLE public.internal_assets TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- Name: TABLE leads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.leads TO authenticated;
GRANT ALL ON TABLE public.leads TO service_role;


--
-- Name: TABLE leases; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.leases TO authenticated;
GRANT ALL ON TABLE public.leases TO service_role;


--
-- Name: TABLE maintenance_ticket_updates; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.maintenance_ticket_updates TO authenticated;
GRANT ALL ON TABLE public.maintenance_ticket_updates TO service_role;


--
-- Name: TABLE maintenance_tickets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.maintenance_tickets TO authenticated;
GRANT ALL ON TABLE public.maintenance_tickets TO service_role;


--
-- Name: TABLE media_assets; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.media_assets TO authenticated;
GRANT ALL ON TABLE public.media_assets TO service_role;


--
-- Name: TABLE message_threads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.message_threads TO authenticated;
GRANT ALL ON TABLE public.message_threads TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE payments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.payments TO authenticated;
GRANT ALL ON TABLE public.payments TO service_role;


--
-- Name: TABLE payout_instructions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payout_instructions TO service_role;


--
-- Name: TABLE permissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.permissions TO authenticated;
GRANT ALL ON TABLE public.permissions TO service_role;


--
-- Name: TABLE role_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.role_permissions TO authenticated;
GRANT ALL ON TABLE public.role_permissions TO service_role;


--
-- Name: TABLE rooms; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.rooms TO authenticated;
GRANT ALL ON TABLE public.rooms TO service_role;


--
-- Name: TABLE suite_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.suite_alerts TO authenticated;
GRANT ALL ON TABLE public.suite_alerts TO service_role;


--
-- Name: TABLE trust_allocations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trust_allocations TO service_role;


--
-- Name: TABLE trust_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trust_transactions TO service_role;


--
-- Name: TABLE units; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.units TO authenticated;
GRANT ALL ON TABLE public.units TO service_role;


--
-- Name: TABLE users; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;


--
-- Name: TABLE v_application_pipeline; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_application_pipeline TO authenticated;
GRANT ALL ON TABLE public.v_application_pipeline TO service_role;


--
-- Name: TABLE v_billing_usage; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_billing_usage TO authenticated;
GRANT ALL ON TABLE public.v_billing_usage TO service_role;


--
-- Name: TABLE v_ticket_kanban; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_ticket_kanban TO authenticated;
GRANT ALL ON TABLE public.v_ticket_kanban TO service_role;


--
-- Name: TABLE v_unit_summary; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_unit_summary TO authenticated;
GRANT ALL ON TABLE public.v_unit_summary TO service_role;


--
-- Name: TABLE v_unit_search_cards; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.v_unit_search_cards TO authenticated;
GRANT ALL ON TABLE public.v_unit_search_cards TO service_role;


--
-- Name: TABLE vendor_category_routes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.vendor_category_routes TO authenticated;
GRANT ALL ON TABLE public.vendor_category_routes TO service_role;


--
-- Name: TABLE viewing_slots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.viewing_slots TO authenticated;
GRANT ALL ON TABLE public.viewing_slots TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE ubuntu IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE ubuntu IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE ubuntu IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- PostgreSQL database dump complete
--


