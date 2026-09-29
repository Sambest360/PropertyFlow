-- Post-apply checks for migration 011. Each row is PASS or FAIL.
-- Mutating checks raise inside a subtransaction so the UPDATE rolls back.
-- The script commits only if the
-- tenant row used for the privilege test is unchanged.
--
-- Required psql variables (UUIDs):
--   tenant_a_auth_id   auth.users id of an END_USER in agency A
--   tenant_a_user_id   public.users id of that same person
--   staff_a_auth_id    auth.users id of an AGENCY_ADMIN in agency A
--   agency_a_id        clients.id for agency A
--   agency_b_id        clients.id for agency B (the other agency)
--   landlord_a_user_id   public.users id of a landlord who has a published listing
--   landlord_a_auth_id   auth.users id of that landlord (auth.uid())
--   unlinked_a_user_id   END_USER in agency A with no lease and no application
--   staff_a_user_id      public.users id of the agency A admin
--   noverif_landlord_id  landlord with a published unit and no verification.status
--
-- JWT shape matches migrations 002 helpers: auth.uid() reads
-- request.jwt.claim.sub, then request.jwt.claims ->> 'sub'.
-- current_app_user_id/client_id/role look up public.users.auth_user_id.

BEGIN;

-- psql substitutes these outside dollar quotes. DO blocks read the GUCs.
SELECT set_config('verify.tenant_a_auth_id', :'tenant_a_auth_id', true);
SELECT set_config('verify.tenant_a_user_id', :'tenant_a_user_id', true);
SELECT set_config('verify.staff_a_auth_id', :'staff_a_auth_id', true);
SELECT set_config('verify.agency_a_id', :'agency_a_id', true);
SELECT set_config('verify.agency_b_id', :'agency_b_id', true);
SELECT set_config('verify.landlord_a_user_id', :'landlord_a_user_id', true);
SELECT set_config('verify.landlord_a_auth_id', :'landlord_a_auth_id', true);
SELECT set_config('verify.unlinked_a_user_id', :'unlinked_a_user_id', true);
SELECT set_config('verify.staff_a_user_id', :'staff_a_user_id', true);
SELECT set_config('verify.noverif_landlord_id', :'noverif_landlord_id', true);

CREATE TEMP TABLE verify_tenant_before AS
SELECT role, first_name
FROM users
WHERE id = current_setting('verify.tenant_a_user_id')::uuid;

CREATE TEMP TABLE verify_results (
  check_id text PRIMARY KEY,
  result text NOT NULL CHECK (result IN ('PASS', 'FAIL')),
  detail text NOT NULL
) ON COMMIT DROP;

-- Keys the hardened marketplace projection is allowed to emit.
-- metadata is only verification.status. email, notes, and deposit_amount are leaks.
CREATE OR REPLACE FUNCTION pg_temp.unexpected_keys(p jsonb, path text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  k text;
  child jsonb;
  found text[] := ARRAY[]::text[];
  allowed text[];
  acc text;
  child_path text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) NOT IN ('object', 'array') THEN
    RETURN '';
  END IF;
  IF jsonb_typeof(p) = 'array' THEN
    FOR child IN SELECT value FROM jsonb_array_elements(p) LOOP
      IF jsonb_typeof(child) IN ('object', 'array') THEN
        acc := pg_temp.unexpected_keys(child, path);
        IF acc <> '' THEN
          found := found || string_to_array(acc, ', ');
        END IF;
      END IF;
    END LOOP;
  ELSE
    allowed := CASE path
      WHEN '' THEN ARRAY['clients','buildings','units','rooms','users','entity_id_map']
      WHEN 'clients' THEN ARRAY['id','company_name','subdomain','status','city','created_at','settings']
      WHEN 'clients.settings' THEN ARRAY['frontend_id','isGlobalConfigClient']
      WHEN 'buildings' THEN ARRAY[
        'id','client_id','landlord_id','name','address','suburb','city','province','grading',
        'solar_capacity_kw','has_borehole','lat','lng','place_id','formatted_address',
        'geocoded_at','images','created_at'
      ]
      WHEN 'units' THEN ARRAY[
        'id','client_id','building_id','agent_id','unit_number','title','square_meters',
        'bedrooms','bathrooms','parking','listing_type','price','rent','status_config_key',
        'description','amenities','images','featured','lat','lng','place_id',
        'formatted_address','geocoded_at','created_at'
      ]
      WHEN 'rooms' THEN ARRAY['id','unit_id','name','beds','baths','area_sqm','room_kind']
      WHEN 'users' THEN ARRAY[
        'id','landlord_id','landlord_name','client_id','email','first_name','last_name',
        'role','active','metadata'
      ]
      WHEN 'users.metadata' THEN ARRAY['frontend_id','frontend_role','verification']
      WHEN 'users.metadata.verification' THEN ARRAY['status']
      WHEN 'entity_id_map' THEN ARRAY['entity_type','backend_id','frontend_id']
      ELSE ARRAY[]::text[]
    END;
    FOR k IN SELECT jsonb_object_keys(p) LOOP
      IF NOT (k = ANY (allowed)) THEN
        found := found || (CASE WHEN path = '' THEN k ELSE path || '.' || k END);
      ELSIF k IN ('clients','buildings','units','rooms','users','entity_id_map','settings','metadata','verification') THEN
        child_path := CASE WHEN path = '' THEN k ELSE path || '.' || k END;
        acc := pg_temp.unexpected_keys(p -> k, child_path);
        IF acc <> '' THEN
          found := found || string_to_array(acc, ', ');
        END IF;
      END IF;
    END LOOP;
  END IF;
  SELECT COALESCE(string_agg(DISTINCT x, ', ' ORDER BY x), '')
    INTO acc
  FROM unnest(found) AS x;
  RETURN acc;
END;
$$;

-- (a) anon marketplace RPCs
DO $check$
DECLARE
  fname text;
  payload jsonb;
  bad text;
  check_id text;
  missing_landlord int;
  landlord_id text := current_setting('verify.landlord_a_user_id');
BEGIN
  FOREACH fname IN ARRAY ARRAY[
    'get_public_marketplace_bootstrap',
    'get_public_marketplace_bootstrap_lite'
  ]
  LOOP
    check_id := 'a_anon_' || CASE WHEN fname LIKE '%_lite' THEN 'bootstrap_lite' ELSE 'bootstrap' END;
    BEGIN
      SET LOCAL ROLE anon;
      IF fname = 'get_public_marketplace_bootstrap' THEN
        payload := public.get_public_marketplace_bootstrap(true);
      ELSE
        payload := public.get_public_marketplace_bootstrap_lite(true);
      END IF;
      RESET ROLE;

      bad := pg_temp.unexpected_keys(payload, '');
      SELECT count(*) INTO missing_landlord
      FROM jsonb_array_elements(COALESCE(payload -> 'users', '[]'::jsonb)) AS u(value)
      WHERE NOT (u.value ? 'landlord_id' AND u.value ? 'landlord_name');

      IF payload IS NULL OR payload::text NOT LIKE '%' || landlord_id || '%' THEN
        INSERT INTO verify_results VALUES (
          check_id, 'FAIL', 'payload missing published landlord ' || landlord_id
        );
      ELSIF bad <> '' THEN
        INSERT INTO verify_results VALUES (
          check_id, 'FAIL', 'keys outside the allow-list: ' || bad
        );
      ELSIF missing_landlord > 0 THEN
        INSERT INTO verify_results VALUES (
          check_id, 'FAIL', 'a user object is missing landlord_id or landlord_name'
        );
      ELSE
        INSERT INTO verify_results VALUES (
          check_id,
          'PASS',
          'anon payload uses only allow-listed keys and landlord_id'
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO verify_results VALUES (
        'a_anon_' || CASE WHEN fname LIKE '%_lite' THEN 'bootstrap_lite' ELSE 'bootstrap' END,
        'FAIL',
        SQLERRM
      );
    END;
  END LOOP;
END
$check$;

-- buildings.notes is internal. Both public RPCs must omit the key even when the column is set.
DO $check$
DECLARE
  fname text;
  payload jsonb;
  bad text := '';
  n_notes int;
BEGIN
  FOREACH fname IN ARRAY ARRAY[
    'get_public_marketplace_bootstrap',
    'get_public_marketplace_bootstrap_lite'
  ]
  LOOP
    SET LOCAL ROLE anon;
    IF fname = 'get_public_marketplace_bootstrap' THEN
      payload := public.get_public_marketplace_bootstrap(true);
    ELSE
      payload := public.get_public_marketplace_bootstrap_lite(true);
    END IF;
    RESET ROLE;
    SELECT count(*) INTO n_notes
    FROM jsonb_array_elements(COALESCE(payload->'buildings', '[]'::jsonb)) AS b(value)
    WHERE b.value ? 'notes';
    IF n_notes > 0 OR payload::text LIKE '%INTERNAL-NOTE-LEAK%' OR payload::text LIKE '%"notes"%' THEN
      bad := bad || fname || ' notes=' || n_notes || ' ';
    END IF;
  END LOOP;
  INSERT INTO verify_results VALUES (
    'a_buildings_notes_absent',
    CASE WHEN bad = '' THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN bad = '' THEN 'neither public RPC emits buildings.notes' ELSE bad END
  );
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO verify_results VALUES ('a_buildings_notes_absent', 'FAIL', SQLERRM);
END
$check$;

-- isGlobalConfigClient must stay a JSON boolean. The string 'false' is truthy in the guest mapper.
DO $check$
DECLARE
  fname text;
  payload jsonb;
  flag jsonb;
  agency text := current_setting('verify.agency_a_id');
  bad text := '';
BEGIN
  FOREACH fname IN ARRAY ARRAY[
    'get_public_marketplace_bootstrap',
    'get_public_marketplace_bootstrap_lite'
  ]
  LOOP
    SET LOCAL ROLE anon;
    IF fname = 'get_public_marketplace_bootstrap' THEN
      payload := public.get_public_marketplace_bootstrap(true);
    ELSE
      payload := public.get_public_marketplace_bootstrap_lite(true);
    END IF;
    RESET ROLE;
    SELECT c.value->'settings'->'isGlobalConfigClient'
      INTO flag
    FROM jsonb_array_elements(COALESCE(payload->'clients', '[]'::jsonb)) AS c(value)
    WHERE c.value->>'id' = agency;
    IF flag IS NULL
       OR jsonb_typeof(flag) <> 'boolean'
       OR flag <> 'false'::jsonb THEN
      bad := bad || fname || '=' || COALESCE(jsonb_typeof(flag), 'missing') || ' ';
    END IF;
  END LOOP;
  INSERT INTO verify_results VALUES (
    'a_client_flag_is_boolean',
    CASE WHEN bad = '' THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN bad = '' THEN 'isGlobalConfigClient is JSON false' ELSE bad END
  );
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO verify_results VALUES ('a_client_flag_is_boolean', 'FAIL', SQLERRM);
END
$check$;

-- verification.status is emitted only when stored. A missing status is not filled in as approved.
DO $check$
DECLARE
  fname text;
  payload jsonb;
  stored jsonb;
  missing jsonb;
  landlord text := current_setting('verify.landlord_a_user_id');
  noverif text := current_setting('verify.noverif_landlord_id');
  bad text := '';
BEGIN
  FOREACH fname IN ARRAY ARRAY[
    'get_public_marketplace_bootstrap',
    'get_public_marketplace_bootstrap_lite'
  ]
  LOOP
    SET LOCAL ROLE anon;
    IF fname = 'get_public_marketplace_bootstrap' THEN
      payload := public.get_public_marketplace_bootstrap(true);
    ELSE
      payload := public.get_public_marketplace_bootstrap_lite(true);
    END IF;
    RESET ROLE;

    SELECT u.value
      INTO stored
    FROM jsonb_array_elements(COALESCE(payload->'users', '[]'::jsonb)) AS u(value)
    WHERE u.value->>'id' = landlord OR u.value->>'landlord_id' = landlord;

    SELECT u.value
      INTO missing
    FROM jsonb_array_elements(COALESCE(payload->'users', '[]'::jsonb)) AS u(value)
    WHERE u.value->>'id' = noverif OR u.value->>'landlord_id' = noverif;

    IF stored IS NULL
       OR jsonb_typeof(stored->'metadata'->'verification'->'status') <> 'string'
       OR stored->'metadata'->'verification'->>'status' <> 'approved' THEN
      bad := bad || fname || ' stored=' || COALESCE(stored->'metadata'->'verification'->>'status', 'absent') || ' ';
    END IF;
    IF missing IS NULL
       OR COALESCE(missing->'metadata'->'verification'->>'status', '') <> '' THEN
      bad := bad || fname || ' missing=' || COALESCE(missing->'metadata'->'verification'->>'status', 'no-row') || ' ';
    END IF;
  END LOOP;
  INSERT INTO verify_results VALUES (
    'a_verification_only_when_stored',
    CASE WHEN bad = '' THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN bad = '' THEN 'status copied when stored and omitted when absent' ELSE bad END
  );
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO verify_results VALUES ('a_verification_only_when_stored', 'FAIL', SQLERRM);
END
$check$;

-- Default privileges grant EXECUTE to anon and authenticated. Helpers must still be closed.
DO $check$
DECLARE
  sig text;
  detail text := '';
  present boolean := false;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.marketplace_user_json(public.users)',
    'public.marketplace_client_json(public.clients)',
    'public.marketplace_building_json(public.buildings, boolean)',
    'public.marketplace_unit_json(public.units, jsonb)',
    'public.marketplace_room_json(public.rooms)',
    'public.marketplace_entity_json(public.entity_id_map)'
  ]
  LOOP
    IF to_regprocedure(sig) IS NULL THEN
      CONTINUE;
    END IF;
    present := true;
    IF has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE')
       OR has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE') THEN
      detail := detail || sig || ' ';
    END IF;
  END LOOP;
  IF NOT present THEN
    INSERT INTO verify_results VALUES (
      'e_marketplace_helpers_locked', 'PASS', 'marketplace helpers are not created yet'
    );
  ELSIF detail = '' THEN
    INSERT INTO verify_results VALUES (
      'e_marketplace_helpers_locked', 'PASS', 'anon and authenticated cannot execute marketplace helpers'
    );
  ELSE
    INSERT INTO verify_results VALUES (
      'e_marketplace_helpers_locked', 'FAIL', 'still executable: ' || detail
    );
  END IF;
END
$check$;

DO $check$
DECLARE
  sig text;
  ok boolean := true;
  detail text := '';
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_public_marketplace_bootstrap(boolean)',
    'public.get_public_marketplace_bootstrap_lite(boolean)'
  ]
  LOOP
    IF to_regprocedure(sig) IS NULL
       OR NOT has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE')
       OR NOT has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE') THEN
      ok := false;
      detail := detail || sig || ' ';
    END IF;
  END LOOP;
  INSERT INTO verify_results VALUES (
    'e_public_rpcs_executable',
    CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN ok THEN 'anon and authenticated can execute both marketplace RPCs'
         ELSE 'missing grant: ' || detail END
  );
END
$check$;

DO $check$
DECLARE
  sig text;
  anon_detail text := '';
  auth_detail text := '';
  present boolean := false;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.building_has_public_listing(uuid)',
    'public.viewing_slot_on_public_listing(uuid)'
  ]
  LOOP
    IF to_regprocedure(sig) IS NULL THEN
      CONTINUE;
    END IF;
    present := true;
    IF has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE') THEN
      anon_detail := anon_detail || sig || ' ';
    END IF;
    IF NOT has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE') THEN
      auth_detail := auth_detail || sig || ' ';
    END IF;
  END LOOP;
  IF NOT present THEN
    INSERT INTO verify_results VALUES ('e_rls_helpers_anon_denied', 'PASS', 'listing helpers are not created yet');
    INSERT INTO verify_results VALUES ('e_rls_helpers_authenticated', 'PASS', 'listing helpers are not created yet');
  ELSE
    INSERT INTO verify_results VALUES (
      'e_rls_helpers_anon_denied',
      CASE WHEN anon_detail = '' THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN anon_detail = '' THEN 'anon cannot execute listing helpers' ELSE anon_detail END
    );
    INSERT INTO verify_results VALUES (
      'e_rls_helpers_authenticated',
      CASE WHEN auth_detail = '' THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN auth_detail = '' THEN 'authenticated can execute listing helpers' ELSE 'missing: ' || auth_detail END
    );
  END IF;
END
$check$;

-- authenticated must not be able to read users.password_hash
DO $check$
DECLARE
  got text;
  tenant_auth text := current_setting('verify.tenant_a_auth_id');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', tenant_auth, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', tenant_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
  BEGIN
    SELECT password_hash INTO got
    FROM users
    WHERE auth_user_id = tenant_auth::uuid;
    RESET ROLE;
    INSERT INTO verify_results VALUES (
      'a_password_hash_column',
      'FAIL',
      'authenticated selected password_hash'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    INSERT INTO verify_results VALUES (
      'a_password_hash_column',
      'PASS',
      'authenticated cannot select users.password_hash'
    );
  END;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO verify_results VALUES ('a_password_hash_column', 'FAIL', SQLERRM);
END
$check$;

-- (b) tenant JWT cannot see the other agency's rows
DO $check$
DECLARE
  tables text[] := ARRAY[
    'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
    'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
    'maintenance_tickets', 'message_threads', 'messages', 'notifications',
    'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
    'event_log'
  ];
  tbl text;
  total bigint;
  seen bigint;
  agency_b uuid := current_setting('verify.agency_b_id')::uuid;
  tenant_auth text := current_setting('verify.tenant_a_auth_id');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', tenant_auth, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', tenant_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );

  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I WHERE client_id = $1', tbl)
        INTO total
        USING agency_b;
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT count(*) FROM %I WHERE client_id = $1', tbl)
        INTO seen
        USING agency_b;
      RESET ROLE;

      IF total = 0 THEN
        INSERT INTO verify_results VALUES (
          'b_end_user_' || tbl,
          'FAIL',
          'no agency B row to prove isolation'
        );
      ELSIF seen = 0 THEN
        INSERT INTO verify_results VALUES (
          'b_end_user_' || tbl,
          'PASS',
          format('hid %s other-agency rows', total)
        );
      ELSE
        INSERT INTO verify_results VALUES (
          'b_end_user_' || tbl,
          'FAIL',
          format('saw %s of %s other-agency rows', seen, total)
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO verify_results VALUES ('b_end_user_' || tbl, 'FAIL', SQLERRM);
    END;
  END LOOP;
END
$check$;

-- (d) agency staff still see every row of their own agency
DO $check$
DECLARE
  tables text[] := ARRAY[
    'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
    'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
    'maintenance_tickets', 'message_threads', 'messages', 'notifications',
    'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
    'event_log'
  ];
  tbl text;
  total bigint;
  seen bigint;
  agency_a uuid := current_setting('verify.agency_a_id')::uuid;
  staff_auth text := current_setting('verify.staff_a_auth_id');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', staff_auth, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );

  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM %I WHERE client_id = $1', tbl)
        INTO total
        USING agency_a;
      SET LOCAL ROLE authenticated;
      EXECUTE format('SELECT count(id) FROM %I WHERE client_id = $1', tbl)
        INTO seen
        USING agency_a;
      RESET ROLE;

      IF total = 0 THEN
        INSERT INTO verify_results VALUES (
          'd_staff_' || tbl,
          'FAIL',
          'no agency A row to prove staff read'
        );
      ELSIF seen = total THEN
        INSERT INTO verify_results VALUES (
          'd_staff_' || tbl,
          'PASS',
          format('staff sees %s own-agency rows', seen)
        );
      ELSE
        INSERT INTO verify_results VALUES (
          'd_staff_' || tbl,
          'FAIL',
          format('staff sees %s of %s own-agency rows', seen, total)
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      INSERT INTO verify_results VALUES ('d_staff_' || tbl, 'FAIL', SQLERRM);
    END;
  END LOOP;

  -- users: explicit columns (password_hash is not granted after 011)
  BEGIN
    EXECUTE 'SELECT count(*) FROM users WHERE client_id = $1'
      INTO total
      USING agency_a;
    SET LOCAL ROLE authenticated;
    EXECUTE $q$
      SELECT count(id) FROM users
      WHERE client_id = $1
    $q$
      INTO seen
      USING agency_a;
    RESET ROLE;
    IF seen = total AND total > 0 THEN
      INSERT INTO verify_results VALUES (
        'd_staff_users',
        'PASS',
        format('staff sees %s own-agency user rows without password_hash', seen)
      );
    ELSE
      INSERT INTO verify_results VALUES (
        'd_staff_users',
        'FAIL',
        format('staff sees %s of %s users', seen, total)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO verify_results VALUES ('d_staff_users', 'FAIL', SQLERRM);
  END;
END
$check$;

-- tenant still sees their own notification and application
DO $check$
DECLARE
  n_note bigint;
  n_app bigint;
  tenant_auth text := current_setting('verify.tenant_a_auth_id');
  tenant_user uuid := current_setting('verify.tenant_a_user_id')::uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', tenant_auth, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', tenant_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n_note FROM notifications WHERE user_id = tenant_user;
  SELECT count(*) INTO n_app FROM applications WHERE applicant_id = tenant_user;
  RESET ROLE;

  INSERT INTO verify_results VALUES (
    'd_tenant_own_notification',
    CASE WHEN n_note >= 1 THEN 'PASS' ELSE 'FAIL' END,
    format('own notifications visible: %s', n_note)
  );
  INSERT INTO verify_results VALUES (
    'd_tenant_own_application',
    CASE WHEN n_app >= 1 THEN 'PASS' ELSE 'FAIL' END,
    format('own applications visible: %s', n_app)
  );
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO verify_results VALUES ('d_tenant_own_notification', 'FAIL', SQLERRM);
  INSERT INTO verify_results VALUES ('d_tenant_own_application', 'FAIL', SQLERRM);
END
$check$;

-- Landlord sees tenants and applicants on their own buildings, not staff or an unlinked END_USER.
DO $check$
DECLARE
  landlord_auth text := current_setting('verify.landlord_a_auth_id');
  tenant_user uuid := current_setting('verify.tenant_a_user_id')::uuid;
  staff_user uuid := current_setting('verify.staff_a_user_id')::uuid;
  unlinked uuid := current_setting('verify.unlinked_a_user_id')::uuid;
  n_tenant bigint;
  n_staff bigint;
  n_unlinked bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', landlord_auth, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', landlord_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SELECT count(id) INTO n_tenant FROM users WHERE id = tenant_user;
  SELECT count(id) INTO n_staff FROM users WHERE id = staff_user;
  SELECT count(id) INTO n_unlinked FROM users WHERE id = unlinked;
  RESET ROLE;

  INSERT INTO verify_results VALUES (
    'b_landlord_sees_linked_tenant',
    CASE WHEN n_tenant >= 1 THEN 'PASS' ELSE 'FAIL' END,
    format('landlord sees %s linked tenant rows', n_tenant)
  );
  INSERT INTO verify_results VALUES (
    'b_landlord_hides_staff',
    CASE WHEN n_staff = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('landlord sees %s staff rows', n_staff)
  );
  INSERT INTO verify_results VALUES (
    'b_landlord_hides_unlinked_tenant',
    CASE WHEN n_unlinked = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('landlord sees %s unlinked end-user rows', n_unlinked)
  );
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO verify_results VALUES ('b_landlord_sees_linked_tenant', 'FAIL', SQLERRM);
  INSERT INTO verify_results VALUES ('b_landlord_hides_staff', 'FAIL', SQLERRM);
  INSERT INTO verify_results VALUES ('b_landlord_hides_unlinked_tenant', 'FAIL', SQLERRM);
END
$check$;

-- (c) authenticated user cannot change privilege columns; a normal name edit still sticks
DO $check$
DECLARE
  tenant_auth text := current_setting('verify.tenant_a_auth_id');
  tenant_user uuid := current_setting('verify.tenant_a_user_id')::uuid;
  agency_a uuid := current_setting('verify.agency_a_id')::uuid;
  agency_b uuid := current_setting('verify.agency_b_id')::uuid;
  v_role text;
  v_client uuid;
  v_active boolean;
  v_auth uuid;
  v_first text;
  v_fe_role text;
  v_perms text;
  v_ver text;
  v_nick text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', tenant_auth, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', tenant_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );

  -- Exception subtransaction rolls the UPDATE back. Plpgsql variables keep
  -- the values observed after the UPDATE, which is what the checks assert.
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE users SET
      first_name = 'Renamed',
      role = 'SUPER_ADMIN',
      client_id = agency_b,
      active = false,
      metadata = jsonb_build_object(
        'frontend_role', 'super_admin',
        'enabledPermissions', jsonb_build_array('all'),
        'verification', jsonb_build_object('status', 'approved'),
        'nickname', 'kept'
      )
    WHERE id = tenant_user;
    RESET ROLE;

    SELECT role, client_id, active, auth_user_id, first_name,
           metadata->>'frontend_role',
           metadata->>'enabledPermissions',
           metadata->'verification'->>'status',
           metadata->>'nickname'
      INTO v_role, v_client, v_active, v_auth, v_first,
           v_fe_role, v_perms, v_ver, v_nick
    FROM users
    WHERE id = tenant_user;
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM IS DISTINCT FROM 'probe_rollback' THEN
      v_role := 'ERROR:' || SQLERRM;
    END IF;
  END;

  IF v_role LIKE 'ERROR:%' THEN
    INSERT INTO verify_results VALUES ('c_role', 'FAIL', v_role);
    INSERT INTO verify_results VALUES ('c_client_id', 'FAIL', v_role);
    INSERT INTO verify_results VALUES ('c_active', 'FAIL', v_role);
    INSERT INTO verify_results VALUES ('c_frontend_role', 'FAIL', v_role);
    INSERT INTO verify_results VALUES ('c_enabled_permissions', 'FAIL', v_role);
    INSERT INTO verify_results VALUES ('c_verification', 'FAIL', v_role);
    INSERT INTO verify_results VALUES ('c_first_name', 'FAIL', v_role);
    INSERT INTO verify_results VALUES ('c_nickname', 'FAIL', v_role);
  ELSE
  INSERT INTO verify_results VALUES (
    'c_role',
    CASE WHEN v_role = 'END_USER' THEN 'PASS' ELSE 'FAIL' END,
    'role after self-update: ' || COALESCE(v_role, 'null')
  );
  INSERT INTO verify_results VALUES (
    'c_client_id',
    CASE WHEN v_client = agency_a THEN 'PASS' ELSE 'FAIL' END,
    'client_id after self-update: ' || COALESCE(v_client::text, 'null')
  );
  INSERT INTO verify_results VALUES (
    'c_active',
    CASE WHEN v_active IS TRUE THEN 'PASS' ELSE 'FAIL' END,
    'active after self-update: ' || COALESCE(v_active::text, 'null')
  );
  INSERT INTO verify_results VALUES (
    'c_frontend_role',
    CASE WHEN v_fe_role = 'tenant' THEN 'PASS' ELSE 'FAIL' END,
    'metadata.frontend_role: ' || COALESCE(v_fe_role, 'null')
  );
  INSERT INTO verify_results VALUES (
    'c_enabled_permissions',
    CASE WHEN v_perms = '["portal.tenant"]' THEN 'PASS' ELSE 'FAIL' END,
    'metadata.enabledPermissions: ' || COALESCE(v_perms, 'null')
  );
  INSERT INTO verify_results VALUES (
    'c_verification',
    CASE WHEN v_ver = 'not_required' THEN 'PASS' ELSE 'FAIL' END,
    'metadata.verification.status: ' || COALESCE(v_ver, 'null')
  );
  INSERT INTO verify_results VALUES (
    'c_first_name',
    CASE WHEN v_first = 'Renamed' THEN 'PASS' ELSE 'FAIL' END,
    'unprivileged first_name: ' || COALESCE(v_first, 'null')
  );
  INSERT INTO verify_results VALUES (
    'c_nickname',
    CASE WHEN v_nick = 'kept' THEN 'PASS' ELSE 'FAIL' END,
    'unprivileged metadata.nickname: ' || COALESCE(v_nick, 'null')
  );
  END IF;

  -- auth_user_id is also covered by users_update_own WITH CHECK. Either the
  -- trigger or that policy must leave the column unchanged.
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE users SET auth_user_id = '33333333-3333-4333-8333-333333333333'
    WHERE id = tenant_user;
    RESET ROLE;
    SELECT auth_user_id INTO v_auth FROM users WHERE id = tenant_user;
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM IS DISTINCT FROM 'probe_rollback' THEN
      SELECT auth_user_id INTO v_auth FROM users WHERE id = tenant_user;
    END IF;
  END;

  INSERT INTO verify_results VALUES (
    'c_auth_user_id',
    CASE WHEN v_auth = tenant_auth::uuid THEN 'PASS' ELSE 'FAIL' END,
    'auth_user_id after self-update: ' || COALESCE(v_auth::text, 'null')
  );
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO verify_results VALUES ('c_role', 'FAIL', SQLERRM);
END
$check$;

-- service_role and a direct admin session (no client JWT) can still change role.
-- Both probes roll the UPDATE back. PostgREST's service key is SET ROLE service_role
-- with a role claim of service_role. A direct admin is the login role with the JWT cleared.
DO $check$
DECLARE
  tenant_user uuid := current_setting('verify.tenant_a_user_id')::uuid;
  v_role text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'service_role')::text,
    true
  );
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE users SET role = 'SUPER_ADMIN' WHERE id = tenant_user;
    RESET ROLE;
    SELECT role INTO v_role FROM users WHERE id = tenant_user;
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM IS DISTINCT FROM 'probe_rollback' THEN
      v_role := 'ERROR:' || SQLERRM;
    END IF;
  END;
  INSERT INTO verify_results VALUES (
    'c_service_role_can_set_role',
    CASE WHEN v_role = 'SUPER_ADMIN' THEN 'PASS' ELSE 'FAIL' END,
    'role after service_role update: ' || COALESCE(v_role, 'null')
  );

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  v_role := NULL;
  BEGIN
    RESET ROLE;
    UPDATE users SET role = 'SUPER_ADMIN' WHERE id = tenant_user;
    SELECT role INTO v_role FROM users WHERE id = tenant_user;
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IS DISTINCT FROM 'probe_rollback' THEN
      v_role := 'ERROR:' || SQLERRM;
    END IF;
  END;
  INSERT INTO verify_results VALUES (
    'c_direct_admin_can_set_role',
    CASE WHEN v_role = 'SUPER_ADMIN' THEN 'PASS' ELSE 'FAIL' END,
    'role after direct admin update: ' || COALESCE(v_role, 'null')
  );
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO verify_results VALUES ('c_service_role_can_set_role', 'FAIL', SQLERRM);
  INSERT INTO verify_results VALUES ('c_direct_admin_can_set_role', 'FAIL', SQLERRM);
END
$check$;

-- Security-review cases (section D) that are database checks.
-- Case 7 is an API request-forgery check and is not asserted here.
-- Case 10 (email re-link on signup) is migration 012 and is not asserted here.
DO $check$
DECLARE
  agency_a uuid := current_setting('verify.agency_a_id')::uuid;
  agency_b uuid := current_setting('verify.agency_b_id')::uuid;
  tenant_auth text := current_setting('verify.tenant_a_auth_id');
  staff_auth text := current_setting('verify.staff_a_auth_id');
  landlord_auth text := current_setting('verify.landlord_a_auth_id');
  tenant_user uuid := current_setting('verify.tenant_a_user_id')::uuid;
  contractor_auth uuid;
  payload text;
  seen bigint;
  bad boolean;
  vuln boolean;
  limited boolean;
  notes_text text;
  landed uuid;
  app_id uuid := '11111111-1111-4111-8111-000000000601';
  n bigint;
  def text;
BEGIN
  SELECT auth_user_id INTO contractor_auth
  FROM users
  WHERE client_id = agency_a AND role = 'CONTRACTOR'
  LIMIT 1;

  -- d1. anon marketplace payload has no password hash, phone, auth id, or notes.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  payload := public.get_public_marketplace_bootstrap(true)::text
          || public.get_public_marketplace_bootstrap_lite(true)::text;
  RESET ROLE;
  bad := payload ILIKE '%password_hash%'
      OR payload ILIKE '%auth_user_id%'
      OR payload ILIKE '%INTERNAL-NOTE-LEAK%'
      OR payload LIKE '%"notes"%'
      OR payload LIKE '%"phone"%';
  INSERT INTO verify_results VALUES (
    'd1_anon_rpc_no_secrets',
    CASE WHEN bad THEN 'FAIL' ELSE 'PASS' END,
    CASE WHEN bad THEN 'anon payload still has a secret field' ELSE 'anon payload omitted secret fields' END
  );

  -- d2. anon cannot read public tables or views.
  bad := false;
  FOREACH notes_text IN ARRAY ARRAY[
    'users','clients','buildings','units','leads','applications','leases','bookings',
    'payments','documents','invoices','entity_id_map',
    'v_unit_summary','v_unit_search_cards','v_ticket_kanban','v_application_pipeline','v_billing_usage',
    'trust_transactions','trust_allocations','payout_instructions','deposit_holdings','arrears_snapshots','csv_import_batches'
  ]
  LOOP
    BEGIN
      SET LOCAL ROLE anon;
      EXECUTE format('SELECT count(*) FROM %I', notes_text) INTO n;
      RESET ROLE;
      IF n > 0 THEN
        bad := true;
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
    WHEN OTHERS THEN
      RESET ROLE;
      IF SQLSTATE <> '42501' THEN
        bad := true;
      END IF;
    END;
  END LOOP;
  INSERT INTO verify_results VALUES (
    'd2_anon_catalog_denied',
    CASE WHEN bad THEN 'FAIL' ELSE 'PASS' END,
    CASE WHEN bad THEN 'anon read a public table or view' ELSE 'anon reads are denied or empty' END
  );

  -- d3. landlord, tenant, contractor see no leads or bookings in their own agency.
  bad := false;
  FOREACH notes_text IN ARRAY ARRAY[landlord_auth, tenant_auth, contractor_auth::text]
  LOOP
    PERFORM set_config('request.jwt.claim.sub', notes_text, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', notes_text, 'role', 'authenticated', 'aud', 'authenticated')::text,
      true
    );
    SET LOCAL ROLE authenticated;
    EXECUTE 'SELECT count(*) FROM leads WHERE client_id = $1' INTO seen USING agency_a;
    IF seen > 0 THEN bad := true; END IF;
    EXECUTE 'SELECT count(*) FROM bookings WHERE client_id = $1' INTO seen USING agency_a;
    IF seen > 0 THEN bad := true; END IF;
    RESET ROLE;
  END LOOP;
  INSERT INTO verify_results VALUES (
    'd3_nonstaff_leads_bookings',
    CASE WHEN bad OR contractor_auth IS NULL THEN 'FAIL' ELSE 'PASS' END,
    'non-staff lead/booking rows visible in agency A: ' || bad::text
  );

  -- d4. cross-agency writes are denied.
  vuln := false;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', tenant_auth, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', tenant_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
      true
    );
    SET LOCAL ROLE authenticated;
    INSERT INTO leads (client_id, name, email, stage)
    VALUES (agency_b, 'Cross', 'cross@example.test', 'New');
    vuln := true;
    RESET ROLE;
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM = 'probe_rollback' THEN
      NULL;
    END IF;
  END;
  INSERT INTO verify_results VALUES (
    'd4_cross_agency_writes',
    CASE WHEN vuln THEN 'FAIL' ELSE 'PASS' END,
    CASE WHEN vuln THEN 'cross-agency lead insert succeeded' ELSE 'cross-agency lead insert denied' END
  );

  -- d5. same-agency non-staff cannot write leads, bookings, payments, or documents.
  vuln := false;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', tenant_auth, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', tenant_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
      true
    );
    BEGIN
      SET LOCAL ROLE authenticated;
      INSERT INTO leads (client_id, name, email, stage)
      VALUES (agency_a, 'Self', 'self-lead@example.test', 'New');
      vuln := true;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      SET LOCAL ROLE authenticated;
      INSERT INTO bookings (client_id, unit_id, visitor_name, starts_at)
      VALUES (agency_a, '11111111-1111-4111-8111-000000000201', 'Self', now());
      vuln := true;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      SET LOCAL ROLE authenticated;
      INSERT INTO payments (client_id, party_name, payment_type, amount, due_date)
      VALUES (agency_a, 'Self', 'RENT', 1, CURRENT_DATE);
      vuln := true;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      SET LOCAL ROLE authenticated;
      INSERT INTO documents (client_id, name) VALUES (agency_a, 'Self doc');
      vuln := true;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RESET ROLE;
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;
  INSERT INTO verify_results VALUES (
    'd5_nonstaff_same_agency_writes',
    CASE WHEN vuln THEN 'FAIL' ELSE 'PASS' END,
    CASE WHEN vuln THEN 'non-staff wrote a staff-only table' ELSE 'non-staff writes denied' END
  );

  -- d6. tenant cannot move their client_id onto agency B.
  vuln := false;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', tenant_auth, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', tenant_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
      true
    );
    SET LOCAL ROLE authenticated;
    UPDATE users SET client_id = agency_b WHERE id = tenant_user;
    RESET ROLE;
    SELECT client_id INTO landed FROM users WHERE id = tenant_user;
    vuln := landed IS DISTINCT FROM agency_a;
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM IS DISTINCT FROM 'probe_rollback' THEN
      SELECT client_id INTO landed FROM users WHERE id = tenant_user;
      vuln := landed IS DISTINCT FROM agency_a;
    END IF;
  END;
  INSERT INTO verify_results VALUES (
    'd6_client_id_not_pivoted',
    CASE WHEN vuln THEN 'FAIL' ELSE 'PASS' END,
    'client_id after pivot attempt: ' || COALESCE(landed::text, 'unchanged-or-denied')
  );

  -- d8. the five views only return agency A for a user in A.
  bad := false;
  PERFORM set_config('request.jwt.claim.sub', tenant_auth, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', tenant_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO seen FROM v_unit_summary WHERE client_name = 'Agency B';
  IF seen > 0 THEN bad := true; END IF;
  SELECT count(*) INTO seen FROM v_unit_search_cards WHERE client_id = agency_b;
  IF seen > 0 THEN bad := true; END IF;
  SELECT count(*) INTO seen FROM v_ticket_kanban WHERE client_id = agency_b;
  IF seen > 0 THEN bad := true; END IF;
  SELECT count(*) INTO seen FROM v_application_pipeline WHERE client_name = 'Agency B';
  IF seen > 0 THEN bad := true; END IF;
  SELECT count(*) INTO seen FROM v_billing_usage WHERE client_id = agency_b;
  IF seen > 0 THEN bad := true; END IF;
  SELECT count(*) INTO seen FROM v_unit_search_cards WHERE client_id = agency_a;
  IF seen = 0 THEN bad := true; END IF;
  RESET ROLE;
  INSERT INTO verify_results VALUES (
    'd8_views_agency_scoped',
    CASE WHEN bad THEN 'FAIL' ELSE 'PASS' END,
    'views leaked agency B or hid agency A: ' || bad::text
  );

  -- d9. staff cannot retarget agency A's listing onto agency B, and enquiry stays in A.
  vuln := false;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', staff_auth, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', staff_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
      true
    );
    SET LOCAL ROLE authenticated;
    UPDATE entity_id_map
    SET backend_id = '22222222-2222-4222-8222-000000000201'
    WHERE entity_type = 'property' AND frontend_id = 'p-a';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN vuln := true; END IF;
    RESET ROLE;
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLERRM = 'probe_rollback' AND vuln THEN
      NULL;
    ELSIF SQLERRM IS DISTINCT FROM 'probe_rollback' THEN
      vuln := false;
    END IF;
  END;
  limited := false;
  notes_text := NULL;
  landed := NULL;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.submit_public_listing_enquiry(
      'p-a', 'lead', 'Enq', 'Tester', 'enquiry-land@example.test',
      NULL, 'hello', NULL, 25000, '8001015009087', 'RENT'
    );
    RESET ROLE;
    SELECT client_id, notes INTO landed, notes_text
    FROM leads WHERE email = 'enquiry-land@example.test' ORDER BY updated_at DESC LIMIT 1;
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;
  INSERT INTO verify_results VALUES (
    'd9_entity_map_no_cross_agency',
    CASE
      WHEN vuln OR landed IS DISTINCT FROM agency_a THEN 'FAIL'
      ELSE 'PASS'
    END,
    'map rewrite allowed=' || vuln::text || ' enquiry client=' || COALESCE(landed::text, 'null')
  );

  -- Enquiry no longer stores ID or income, and the sixth call in an hour is refused.
  vuln := false;
  limited := false;
  BEGIN
    SET LOCAL ROLE anon;
    FOR n IN 1..5 LOOP
      PERFORM public.submit_public_listing_enquiry(
        'p-a', 'lead', 'Rate', 'Limit', 'enquiry-rate@example.test',
        NULL, NULL, NULL, 25000, '8001015009087', 'RENT'
      );
    END LOOP;
    BEGIN
      PERFORM public.submit_public_listing_enquiry(
        'p-a', 'lead', 'Rate', 'Limit', 'enquiry-rate@example.test',
        NULL, NULL, NULL, 25000, '8001015009087', 'RENT'
      );
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'enquiry_rate_limited' THEN
        limited := true;
      END IF;
    END;
    RESET ROLE;
    SELECT COALESCE(bool_or(
      COALESCE(notes, '') LIKE '%ID/Passport%'
      OR COALESCE(notes, '') LIKE '%Monthly income%'
    ), false)
    INTO vuln
    FROM leads
    WHERE email = 'enquiry-rate@example.test';
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;
  INSERT INTO verify_results VALUES (
    'd_enquiry_no_id_income',
    CASE WHEN vuln THEN 'FAIL' ELSE 'PASS' END,
    'enquiry notes stored id or income: ' || vuln::text
  );
  INSERT INTO verify_results VALUES (
    'd_enquiry_rate_limited',
    CASE WHEN limited THEN 'PASS' ELSE 'FAIL' END,
    'sixth enquiry for the same listing and email was limited: ' || limited::text
  );

  -- Screening: negative income refused; landlord cannot read it; applicant can.
  IF to_regclass('public.application_screening') IS NULL THEN
    INSERT INTO verify_results VALUES ('d_screening_rls', 'FAIL', 'application_screening is missing');
    INSERT INTO verify_results VALUES ('d_screening_income_nonneg', 'FAIL', 'application_screening is missing');
  ELSE
    vuln := false;
    BEGIN
      INSERT INTO application_screening (application_id, gross_monthly_income_cents)
      VALUES (app_id, -1);
      vuln := true;
      RAISE EXCEPTION 'probe_rollback';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'probe_rollback' THEN
        NULL;
      END IF;
    END;
    INSERT INTO verify_results VALUES (
      'd_screening_income_nonneg',
      CASE WHEN vuln THEN 'FAIL' ELSE 'PASS' END,
      'negative income accepted: ' || vuln::text
    );

    INSERT INTO application_screening (application_id, id_type, id_number, gross_monthly_income_cents)
    VALUES (app_id, 'sa_id', '8001015009087', 2500000)
    ON CONFLICT (application_id) DO UPDATE
      SET id_number = EXCLUDED.id_number, gross_monthly_income_cents = EXCLUDED.gross_monthly_income_cents;
    PERFORM set_config('request.jwt.claim.sub', tenant_auth, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', tenant_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
      true
    );
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO seen FROM application_screening WHERE application_id = app_id;
    RESET ROLE;
    bad := seen <> 1;
    PERFORM set_config('request.jwt.claim.sub', landlord_auth, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', landlord_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
      true
    );
    SET LOCAL ROLE authenticated;
    BEGIN
      SELECT count(*) INTO n FROM application_screening WHERE application_id = app_id;
    EXCEPTION WHEN insufficient_privilege THEN
      n := 0;
    END;
    RESET ROLE;
    IF n > 0 THEN bad := true; END IF;
    DELETE FROM application_screening WHERE application_id = app_id;
    INSERT INTO verify_results VALUES (
      'd_screening_rls',
      CASE WHEN bad THEN 'FAIL' ELSE 'PASS' END,
      'applicant saw ' || seen::text || ', landlord saw ' || COALESCE(n::text, 'null')
    );
  END IF;

  -- Trust rows are visible to agency staff only.
  INSERT INTO trust_transactions (client_id, direction, amount_cents, value_date, description)
  VALUES (agency_a, 'in', 100, CURRENT_DATE, 'rehearse A'),
         (agency_b, 'in', 100, CURRENT_DATE, 'rehearse B');
  bad := false;
  FOREACH notes_text IN ARRAY ARRAY[landlord_auth, tenant_auth, contractor_auth::text]
  LOOP
    PERFORM set_config('request.jwt.claim.sub', notes_text, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', notes_text, 'role', 'authenticated', 'aud', 'authenticated')::text,
      true
    );
    BEGIN
      SET LOCAL ROLE authenticated;
      SELECT count(*) INTO seen FROM trust_transactions
      WHERE description IN ('rehearse A', 'rehearse B');
      RESET ROLE;
      IF seen > 0 THEN bad := true; END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RESET ROLE;
    END;
  END LOOP;
  BEGIN
    SET LOCAL ROLE anon;
    SELECT count(*) INTO seen FROM trust_transactions
    WHERE description IN ('rehearse A', 'rehearse B');
    RESET ROLE;
    IF seen > 0 THEN bad := true; END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
  END;
  PERFORM set_config('request.jwt.claim.sub', staff_auth, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', staff_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
    true
  );
  SET LOCAL ROLE authenticated;
  SELECT count(*) FILTER (WHERE client_id = agency_a),
         count(*) FILTER (WHERE client_id = agency_b)
  INTO seen, n
  FROM trust_transactions
  WHERE description IN ('rehearse A', 'rehearse B');
  RESET ROLE;
  IF seen <> 1 OR n <> 0 THEN bad := true; END IF;
  DELETE FROM trust_transactions WHERE description IN ('rehearse A', 'rehearse B');
  INSERT INTO verify_results VALUES (
    'd_trust_staff_only',
    CASE WHEN bad THEN 'FAIL' ELSE 'PASS' END,
    'staff A=' || COALESCE(seen::text, 'null') || ' staff B=' || COALESCE(n::text, 'null')
  );

  -- Portal writes that must keep working.
  vuln := false;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', tenant_auth, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', tenant_auth, 'role', 'authenticated', 'aud', 'authenticated')::text,
      true
    );
    BEGIN
      SET LOCAL ROLE authenticated;
      INSERT INTO applications (client_id, unit_id, applicant_id, reference_code, status)
      VALUES (
        agency_a,
        '11111111-1111-4111-8111-000000000201',
        tenant_user,
        'APP-REHEARSE',
        'SUBMITTED'
      );
    EXCEPTION WHEN OTHERS THEN
      vuln := true;
    END;
    BEGIN
      SET LOCAL ROLE authenticated;
      INSERT INTO messages (thread_id, client_id, from_user_id, body)
      VALUES (
        '11111111-1111-4111-8111-000000000d01',
        agency_a,
        tenant_user,
        'portal ping'
      );
    EXCEPTION WHEN OTHERS THEN
      vuln := true;
    END;
    BEGIN
      SET LOCAL ROLE authenticated;
      INSERT INTO maintenance_tickets (client_id, unit_id, reported_by, title, description)
      VALUES (agency_a, '11111111-1111-4111-8111-000000000201', tenant_user, 'Portal leak', 'Drip');
    EXCEPTION WHEN OTHERS THEN
      vuln := true;
    END;
    RESET ROLE;
    RAISE EXCEPTION 'probe_rollback';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
  END;
  INSERT INTO verify_results VALUES (
    'p_portal_writes_kept',
    CASE WHEN vuln THEN 'FAIL' ELSE 'PASS' END,
    'applicant application, tenant message, or tenant ticket was denied: ' || vuln::text
  );

  -- Privileged definers are not executable by anon.
  bad := has_function_privilege('anon', 'public.admin_update_user_verification(text,text,text)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.approve_application(text,jsonb)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.sync_auth_user_profile(uuid)', 'EXECUTE')
      OR has_function_privilege('anon', 'public.handle_new_auth_user()', 'EXECUTE');
  INSERT INTO verify_results VALUES (
    'd_anon_privileged_execute',
    CASE WHEN bad THEN 'FAIL' ELSE 'PASS' END,
    'anon can execute a privileged definer: ' || bad::text
  );

  -- Signup must not promote the first user. The 009 body still has that branch until 011c.
  def := pg_get_functiondef('public.sync_auth_user_profile(uuid)'::regprocedure);
  INSERT INTO verify_results VALUES (
    'd_signup_not_super_admin',
    CASE WHEN def LIKE '%total_users = 0%' THEN 'FAIL' ELSE 'PASS' END,
    CASE
      WHEN def LIKE '%total_users = 0%' THEN 'profile sync still promotes an empty users table'
      ELSE 'profile sync does not promote the first user'
    END
  );
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO verify_results VALUES ('d1_anon_rpc_no_secrets', 'FAIL', SQLERRM);
END
$check$;

-- Privilege probes roll back to savepoints. Refuse to commit if they did not.
DO $check$
DECLARE
  tenant_user uuid := current_setting('verify.tenant_a_user_id')::uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM users u
    CROSS JOIN verify_tenant_before b
    WHERE u.id = tenant_user
      AND (u.role IS DISTINCT FROM b.role OR u.first_name IS DISTINCT FROM b.first_name)
  ) THEN
    RAISE EXCEPTION 'verify.sql mutated the tenant row used for the privilege probe';
  END IF;
END
$check$;

SELECT check_id, result, detail
FROM verify_results
ORDER BY check_id;

SELECT 'SUMMARY',
       CASE WHEN count(*) FILTER (WHERE result <> 'PASS') = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*) FILTER (WHERE result = 'PASS') || ' pass, ' ||
       count(*) FILTER (WHERE result <> 'PASS') || ' fail, ' ||
       count(*) || ' checks'
FROM verify_results;

COMMIT;
