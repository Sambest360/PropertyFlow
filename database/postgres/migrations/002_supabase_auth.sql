-- Supabase Auth integration: link auth.users → public.users, signup trigger, basic RLS.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- RLS helper functions (SECURITY DEFINER — safe row lookups for policies)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_client_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'SUPER_ADMIN'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_agency_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
     FROM users WHERE auth_user_id = auth.uid() LIMIT 1),
    FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_bootstrap_needed()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) = 0 FROM users;
$$;

GRANT EXECUTE ON FUNCTION public.auth_bootstrap_needed() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- New Supabase Auth user → public.users (+ optional landlord portfolio)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
BEGIN
  meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);

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

  first_name := COALESCE(NULLIF(TRIM(meta->>'first_name'), ''), split_part(COALESCE(NEW.email, 'user'), '@', 1));
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
    NEW.id,
    client_uuid,
    lower(trim(NEW.email)),
    NULL,
    first_name,
    last_name,
    phone,
    db_role,
    TRUE,
    user_metadata,
    NOW()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Basic RLS: users + clients
-- ---------------------------------------------------------------------------

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own ON users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS users_select_agency ON users;
CREATE POLICY users_select_agency ON users
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      client_id IS NOT NULL
      AND client_id = current_app_client_id()
      AND is_agency_staff()
    )
  );

DROP POLICY IF EXISTS users_select_self_agency ON users;
CREATE POLICY users_select_self_agency ON users
  FOR SELECT TO authenticated
  USING (
    client_id IS NOT NULL
    AND client_id = current_app_client_id()
  );

DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR is_super_admin())
  WITH CHECK (auth_user_id = auth.uid() OR is_super_admin());

DROP POLICY IF EXISTS users_insert_admin ON users;
CREATE POLICY users_insert_admin ON users
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR is_agency_staff());

DROP POLICY IF EXISTS clients_select_scoped ON clients;
CREATE POLICY clients_select_scoped ON clients
  FOR SELECT TO authenticated
  USING (is_super_admin() OR id = current_app_client_id());

DROP POLICY IF EXISTS clients_mutate_admin ON clients;
CREATE POLICY clients_mutate_admin ON clients
  FOR ALL TO authenticated
  USING (is_super_admin() OR (id = current_app_client_id() AND is_agency_staff()))
  WITH CHECK (is_super_admin() OR (id = current_app_client_id() AND is_agency_staff()));

-- Authenticated role can use tables; anon cannot read data directly.
GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
