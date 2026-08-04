-- Idempotent profile sync for auth.users → public.users (trigger fallback + repair).

CREATE OR REPLACE FUNCTION public.sync_auth_user_profile(p_auth_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
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

  SELECT id, email, raw_user_meta_data
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
    NULL,
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
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    metadata = users.metadata || EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO user_uuid;

  RETURN user_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  PERFORM public.sync_auth_user_profile(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.sync_auth_user_profile(auth.uid()) IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;
