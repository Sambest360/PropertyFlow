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
--   landlord_a_user_id public.users id of a landlord who has a published listing
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

CREATE TEMP TABLE verify_tenant_before AS
SELECT role, first_name
FROM users
WHERE id = current_setting('verify.tenant_a_user_id')::uuid;

CREATE TEMP TABLE verify_results (
  check_id text PRIMARY KEY,
  result text NOT NULL CHECK (result IN ('PASS', 'FAIL')),
  detail text NOT NULL
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.forbidden_keys(p jsonb)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  k text;
  child jsonb;
  found text[] := ARRAY[]::text[];
  acc text;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) = 'null' THEN
    RETURN '';
  END IF;
  IF jsonb_typeof(p) = 'object' THEN
    FOR k IN SELECT jsonb_object_keys(p) LOOP
      IF k IN ('password_hash', 'metadata', 'email') THEN
        found := found || k;
      END IF;
      acc := pg_temp.forbidden_keys(p -> k);
      IF acc <> '' THEN
        found := found || string_to_array(acc, ', ');
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p) = 'array' THEN
    FOR child IN SELECT value FROM jsonb_array_elements(p) LOOP
      acc := pg_temp.forbidden_keys(child);
      IF acc <> '' THEN
        found := found || string_to_array(acc, ', ');
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
  landlord_id text := current_setting('verify.landlord_a_user_id');
BEGIN
  FOREACH fname IN ARRAY ARRAY[
    'get_public_marketplace_bootstrap',
    'get_public_marketplace_bootstrap_lite'
  ]
  LOOP
    BEGIN
      SET LOCAL ROLE anon;
      IF fname = 'get_public_marketplace_bootstrap' THEN
        payload := public.get_public_marketplace_bootstrap(true);
      ELSE
        payload := public.get_public_marketplace_bootstrap_lite(true);
      END IF;
      RESET ROLE;

      bad := pg_temp.forbidden_keys(payload);
      IF payload IS NULL OR payload::text NOT LIKE '%' || landlord_id || '%' THEN
        INSERT INTO verify_results VALUES (
          'a_anon_' || CASE WHEN fname LIKE '%_lite' THEN 'bootstrap_lite' ELSE 'bootstrap' END,
          'FAIL',
          'payload missing published landlord ' || landlord_id
        );
      ELSIF bad <> '' THEN
        INSERT INTO verify_results VALUES (
          'a_anon_' || CASE WHEN fname LIKE '%_lite' THEN 'bootstrap_lite' ELSE 'bootstrap' END,
          'FAIL',
          'forbidden keys: ' || bad
        );
      ELSE
        INSERT INTO verify_results VALUES (
          'a_anon_' || CASE WHEN fname LIKE '%_lite' THEN 'bootstrap_lite' ELSE 'bootstrap' END,
          'PASS',
          'anon payload has landlord row and no password_hash, metadata, or email keys'
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
