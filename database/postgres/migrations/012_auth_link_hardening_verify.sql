-- 012 verification. Run with psql after 012_auth_link_hardening.sql.
-- Builds throwaway auth users, profiles, and invites, then rolls back.
-- Refuses to start unless public.users and auth.users are empty, so this is
-- not safe to point at a populated database without that rollback.
--
-- Expects auth.users columns used by scripts/seed/directAdmin.ts, and auth.uid()
-- to read request.jwt.claim.sub or request.jwt.claims ->> sub.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.insert_auth(
  p_id UUID,
  p_email TEXT,
  p_confirmed BOOLEAN,
  p_meta JSONB
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, is_sso_user,
    created_at, updated_at
  ) VALUES (
    p_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    'test-hash',
    CASE WHEN p_confirmed THEN NOW() ELSE NULL END,
    '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    COALESCE(p_meta, '{}'::jsonb),
    false,
    NOW(),
    NOW()
  );
END;
$$;

DO $$
DECLARE
  agency_a UUID := 'a1111111-1111-4111-8111-111111111111';
  agency_b UUID := 'b2222222-2222-4222-8222-222222222222';
  staff_a_auth UUID := 'a1000000-0000-4000-8000-00000000000a';
  staff_b_auth UUID := 'b2000000-0000-4000-8000-00000000000b';
  staff_a UUID;
  staff_b UUID;
  v_role TEXT;
  v_client UUID;
  v_fe TEXT;
  v_auth UUID;
  v_name TEXT;
  v_hash TEXT;
  v_count INT;
  v_clients INT;
  v_status TEXT;
  v_consumed_at TIMESTAMPTZ;
  hire UUID := '13333333-3333-4333-8333-333333333333';
  replay UUID := '14444444-4444-4444-8444-444444444444';
  bound UUID := 'b5555555-5555-4555-8555-555555555555';
  redeemer UUID := 'd6666666-6666-4666-8666-666666666666';
  attacker1 UUID := 'e7777777-7777-4777-8777-777777777771';
  attacker2 UUID := 'e7777777-7777-4777-8777-777777777772';
  attacker3 UUID := 'e7777777-7777-4777-8777-777777777773';
  linked UUID := 'f8888888-8888-4888-8888-888888888888';
  linked_attacker UUID := 'f8888888-8888-4888-8888-888888888889';
BEGIN
  IF (SELECT COUNT(*) FROM public.users) <> 0 OR (SELECT COUNT(*) FROM auth.users) <> 0 THEN
    RAISE EXCEPTION '012 verify expects empty public.users and auth.users';
  END IF;

  IF position(
    'ON CONFLICT (email) DO UPDATE' in pg_get_functiondef('public.sync_auth_user_profile(uuid)'::regprocedure)
  ) > 0 THEN
    RAISE EXCEPTION 'email re-link upsert still present in sync_auth_user_profile';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth'
      AND c.relname = 'users'
      AND t.tgname IN ('on_auth_user_created', 'on_auth_user_email_confirmed')
      AND NOT t.tgisinternal
  ) <> 2 THEN
    RAISE EXCEPTION 'auth.users link triggers missing';
  END IF;

  IF has_function_privilege('authenticated', 'public.sync_auth_user_profile(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can execute sync_auth_user_profile';
  END IF;
  IF has_function_privilege('anon', 'public.sync_auth_user_profile(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute sync_auth_user_profile';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.ensure_user_profile()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute ensure_user_profile';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.redeem_invite_token(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute redeem_invite_token';
  END IF;
  IF has_table_privilege('authenticated', 'public.invites', 'SELECT')
     OR has_table_privilege('anon', 'public.invites', 'SELECT')
     OR has_table_privilege('authenticated', 'public.invites', 'INSERT') THEN
    RAISE EXCEPTION 'anon or authenticated can read or write invites';
  END IF;
  IF NOT has_table_privilege('propertyflow_api', 'public.invites', 'INSERT')
     OR NOT has_table_privilege('propertyflow_api', 'public.invites', 'UPDATE') THEN
    RAISE EXCEPTION 'propertyflow_api cannot write invites';
  END IF;
  IF has_table_privilege('propertyflow_api', 'public.users', 'INSERT')
     OR has_table_privilege('propertyflow_api', 'public.clients', 'INSERT') THEN
    RAISE EXCEPTION '012 granted propertyflow_api DML beyond invites';
  END IF;

  IF (
    SELECT string_agg(column_name, ',' ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invites'
  ) IS DISTINCT FROM 'id,email,role,agency_id,auth_user_id,token,invited_by,status,created_at,consumed_at' THEN
    RAISE EXCEPTION 'invites columns do not match the API insert shape';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.invites'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) ILIKE '%auth_user_id%auth.users%'
  ) THEN
    RAISE EXCEPTION 'invites.auth_user_id must not reference auth.users';
  END IF;

  -- Check: first user on an empty database is not a super admin, even when
  -- metadata asks for one. A later signup asking for super_admin is not either.
  PERFORM pg_temp.insert_auth(
    '11111111-1111-4111-8111-111111111111',
    'first@example.com',
    true,
    '{"first_name":"First","last_name":"User","role":"super_admin"}'::jsonb
  );
  SELECT role, client_id, metadata->>'frontend_role'
    INTO v_role, v_client, v_fe
  FROM public.users
  WHERE auth_user_id = '11111111-1111-4111-8111-111111111111';
  IF v_role IS DISTINCT FROM 'END_USER' OR v_client IS NOT NULL OR v_fe IS DISTINCT FROM 'tenant' THEN
    RAISE EXCEPTION 'first signup created privileged profile role=% client=% fe=%', v_role, v_client, v_fe;
  END IF;

  PERFORM pg_temp.insert_auth(
    '22222222-2222-4222-8222-222222222222',
    'second@example.com',
    true,
    '{"first_name":"Second","last_name":"User","role":"super_admin"}'::jsonb
  );
  SELECT role INTO v_role FROM public.users WHERE auth_user_id = '22222222-2222-4222-8222-222222222222';
  IF v_role IS DISTINCT FROM 'END_USER' THEN
    RAISE EXCEPTION 'signup created role % from super_admin metadata', v_role;
  END IF;

  SELECT COUNT(*) INTO v_clients FROM public.clients;
  PERFORM pg_temp.insert_auth(
    '33333333-3333-4333-8333-333333333331',
    'landlord@example.com',
    true,
    '{"first_name":"Lara","last_name":"Lord","role":"landlord","profile":{"company":"Lara Holdings"}}'::jsonb
  );
  SELECT role, client_id INTO v_role, v_client
  FROM public.users WHERE auth_user_id = '33333333-3333-4333-8333-333333333331';
  IF v_role IS DISTINCT FROM 'END_USER' OR v_client IS NOT NULL THEN
    RAISE EXCEPTION 'self-serve landlord signup got role=% client=%', v_role, v_client;
  END IF;
  IF (SELECT COUNT(*) FROM public.clients) <> v_clients THEN
    RAISE EXCEPTION 'signup created an agency';
  END IF;
  IF (SELECT COUNT(*) FROM public.users WHERE role = 'SUPER_ADMIN') <> 0 THEN
    RAISE EXCEPTION 'a signup created SUPER_ADMIN';
  END IF;

  INSERT INTO public.clients (id, company_name, subdomain, status)
  VALUES
    (agency_a, 'Agency A', 'agency-a', 'active'),
    (agency_b, 'Agency B', 'agency-b', 'active');

  PERFORM pg_temp.insert_auth(staff_a_auth, 'staff-a@example.com', true, '{"first_name":"Stella","last_name":"Staff"}'::jsonb);
  PERFORM pg_temp.insert_auth(staff_b_auth, 'staff-b@example.com', true, '{"first_name":"Sam","last_name":"Staff"}'::jsonb);
  UPDATE public.users SET role = 'AGENCY_ADMIN', client_id = agency_a WHERE auth_user_id = staff_a_auth;
  UPDATE public.users SET role = 'AGENCY_ADMIN', client_id = agency_b WHERE auth_user_id = staff_b_auth;
  SELECT id INTO staff_a FROM public.users WHERE auth_user_id = staff_a_auth;
  SELECT id INTO staff_b FROM public.users WHERE auth_user_id = staff_b_auth;
  IF staff_a IS NULL OR staff_b IS NULL THEN
    RAISE EXCEPTION 'staff profiles missing';
  END IF;

  -- Check: unconfirmed signup with the victim email does not take over a
  -- pre-provisioned agency admin, and does not 500.
  INSERT INTO public.users (email, password_hash, first_name, last_name, role, client_id, auth_user_id)
  VALUES ('victim-open@example.com', 'legacy-hash', 'Vera', 'Victim', 'AGENCY_ADMIN', agency_a, NULL);
  PERFORM pg_temp.insert_auth(
    attacker1,
    'victim-open@example.com',
    false,
    '{"first_name":"Adam","last_name":"Attacker","role":"super_admin"}'::jsonb
  );
  SELECT auth_user_id, role, client_id, first_name, password_hash
    INTO v_auth, v_role, v_client, v_name, v_hash
  FROM public.users WHERE email = 'victim-open@example.com';
  IF v_auth IS NOT NULL OR v_role <> 'AGENCY_ADMIN' OR v_client <> agency_a
     OR v_name <> 'Vera' OR v_hash <> 'legacy-hash' THEN
    RAISE EXCEPTION 'unconfirmed signup took over victim-open (auth=% role=% name=% hash=%)', v_auth, v_role, v_name, v_hash;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = attacker1) THEN
    RAISE EXCEPTION 'unconfirmed attacker was linked to a profile';
  END IF;

  -- Check: confirmed signup with the victim email does not take over either.
  INSERT INTO public.users (email, password_hash, first_name, last_name, role, client_id, auth_user_id)
  VALUES ('victim-confirmed@example.com', 'legacy-hash', 'Vera', 'Victim', 'AGENCY_ADMIN', agency_a, NULL);
  PERFORM pg_temp.insert_auth(
    attacker2,
    'victim-confirmed@example.com',
    true,
    '{"first_name":"Adam","last_name":"Attacker","role":"agency_admin"}'::jsonb
  );
  SELECT auth_user_id, role, client_id, first_name, password_hash
    INTO v_auth, v_role, v_client, v_name, v_hash
  FROM public.users WHERE email = 'victim-confirmed@example.com';
  IF v_auth IS NOT NULL OR v_role <> 'AGENCY_ADMIN' OR v_client <> agency_a
     OR v_name <> 'Vera' OR v_hash <> 'legacy-hash' THEN
    RAISE EXCEPTION 'confirmed signup took over victim-confirmed (auth=% role=% name=%)', v_auth, v_role, v_name;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = attacker2) THEN
    RAISE EXCEPTION 'confirmed attacker was linked to a profile';
  END IF;

  -- Check: confirming later, still with no invite, does not link.
  INSERT INTO public.users (email, password_hash, first_name, last_name, role, client_id, auth_user_id)
  VALUES ('victim-later@example.com', 'legacy-hash', 'Vera', 'Victim', 'AGENCY_ADMIN', agency_a, NULL);
  PERFORM pg_temp.insert_auth(attacker3, 'victim-later@example.com', false, '{"first_name":"Adam","last_name":"Attacker"}'::jsonb);
  UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = attacker3;
  SELECT auth_user_id, role, client_id, first_name
    INTO v_auth, v_role, v_client, v_name
  FROM public.users WHERE email = 'victim-later@example.com';
  IF v_auth IS NOT NULL OR v_role <> 'AGENCY_ADMIN' OR v_client <> agency_a OR v_name <> 'Vera' THEN
    RAISE EXCEPTION 'confirming without an invite linked victim-later (auth=% role=%)', v_auth, v_role;
  END IF;

  -- Check: case-variant signup against an already-linked profile.
  -- auth.users email uniqueness is case-sensitive in GoTrue; if this insert is
  -- rejected, the victim is still unchanged.
  PERFORM pg_temp.insert_auth(linked, 'victim-linked@example.com', true, '{"first_name":"Vera","last_name":"Victim"}'::jsonb);
  UPDATE public.users
  SET role = 'AGENCY_ADMIN', client_id = agency_a, password_hash = 'legacy-hash', first_name = 'Vera'
  WHERE auth_user_id = linked;
  BEGIN
    PERFORM pg_temp.insert_auth(
      linked_attacker,
      'Victim-Linked@example.com',
      true,
      '{"first_name":"Adam","last_name":"Attacker"}'::jsonb
    );
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  SELECT auth_user_id, role, client_id, first_name, password_hash
    INTO v_auth, v_role, v_client, v_name, v_hash
  FROM public.users WHERE lower(email) = 'victim-linked@example.com';
  IF v_auth IS DISTINCT FROM linked OR v_role <> 'AGENCY_ADMIN' OR v_client <> agency_a
     OR v_name <> 'Vera' OR v_hash <> 'legacy-hash' THEN
    RAISE EXCEPTION 'case-variant signup took over linked victim (auth=% name=% hash=%)', v_auth, v_name, v_hash;
  END IF;

  -- Check: a token invite links once, and only after the email is confirmed.
  INSERT INTO public.invites (email, role, agency_id, auth_user_id, token, invited_by, status)
  VALUES ('hire@example.com', 'client_admin', agency_a, NULL, 'tok-hire', staff_a, 'pending');
  PERFORM pg_temp.insert_auth(
    hire,
    'hire@example.com',
    false,
    '{"first_name":"Hana","last_name":"Hire","invite_token":"tok-hire"}'::jsonb
  );
  SELECT role, client_id INTO v_role, v_client FROM public.users WHERE auth_user_id = hire;
  SELECT status INTO v_status FROM public.invites WHERE token = 'tok-hire';
  IF v_role IS DISTINCT FROM 'END_USER' OR v_client IS NOT NULL OR v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'unconfirmed invite was applied early role=% client=% status=%', v_role, v_client, v_status;
  END IF;

  UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = hire;
  SELECT role, client_id, metadata->>'frontend_role'
    INTO v_role, v_client, v_fe
  FROM public.users WHERE auth_user_id = hire;
  SELECT status, auth_user_id, consumed_at
    INTO v_status, v_auth, v_consumed_at
  FROM public.invites WHERE token = 'tok-hire';
  IF v_role IS DISTINCT FROM 'AGENCY_ADMIN' OR v_client IS DISTINCT FROM agency_a OR v_fe IS DISTINCT FROM 'client_admin' THEN
    RAISE EXCEPTION 'confirmed invite did not link hire role=% client=% fe=%', v_role, v_client, v_fe;
  END IF;
  IF v_status IS DISTINCT FROM 'consumed' OR v_auth IS DISTINCT FROM hire OR v_consumed_at IS NULL THEN
    RAISE EXCEPTION 'invite was not consumed by the hire (status=% auth=% consumed_at=%)', v_status, v_auth, v_consumed_at;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.users WHERE auth_user_id = hire OR lower(email) = 'hire@example.com';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'hire link created % profiles', v_count;
  END IF;

  PERFORM public.sync_auth_user_profile(hire);
  SELECT COUNT(*) INTO v_count FROM public.users WHERE lower(email) = 'hire@example.com';
  SELECT status INTO v_status FROM public.invites WHERE token = 'tok-hire';
  IF v_count <> 1 OR v_status IS DISTINCT FROM 'consumed' THEN
    RAISE EXCEPTION 'replaying sync relinked the hire (profiles=% status=%)', v_count, v_status;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', hire::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', hire)::text, true);
  IF public.redeem_invite_token('tok-hire') THEN
    RAISE EXCEPTION 'consumed token was redeemed again';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  PERFORM pg_temp.insert_auth(
    replay,
    'replay@example.com',
    true,
    '{"first_name":"Rae","last_name":"Play","invite_token":"tok-hire"}'::jsonb
  );
  SELECT role, client_id INTO v_role, v_client FROM public.users WHERE auth_user_id = replay;
  IF v_role IS DISTINCT FROM 'END_USER' OR v_client IS NOT NULL THEN
    RAISE EXCEPTION 'replayed token granted role=% client=%', v_role, v_client;
  END IF;
  SELECT auth_user_id, role, client_id INTO v_auth, v_role, v_client
  FROM public.users WHERE lower(email) = 'hire@example.com';
  IF v_auth IS DISTINCT FROM hire OR v_role IS DISTINCT FROM 'AGENCY_ADMIN' OR v_client IS DISTINCT FROM agency_a THEN
    RAISE EXCEPTION 'replay changed the original hire profile';
  END IF;

  -- Check: binding the invite to an auth user id (no token) links on confirm, once.
  PERFORM pg_temp.insert_auth(bound, 'bound@example.com', false, '{"first_name":"Bea","last_name":"Bound"}'::jsonb);
  INSERT INTO public.invites (email, role, agency_id, invited_by, auth_user_id)
  VALUES ('bound@example.com', 'agent_admin', agency_a, staff_a, bound);
  SELECT role, client_id INTO v_role, v_client FROM public.users WHERE auth_user_id = bound;
  SELECT status INTO v_status FROM public.invites WHERE auth_user_id = bound;
  IF v_role IS DISTINCT FROM 'END_USER' OR v_client IS NOT NULL OR v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'auth-id invite applied before confirmation role=% status=%', v_role, v_status;
  END IF;
  UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = bound;
  SELECT role, client_id INTO v_role, v_client FROM public.users WHERE auth_user_id = bound;
  SELECT status INTO v_status FROM public.invites WHERE email = 'bound@example.com';
  IF v_role IS DISTINCT FROM 'AGENT_ADMIN' OR v_client IS DISTINCT FROM agency_a OR v_status IS DISTINCT FROM 'consumed' THEN
    RAISE EXCEPTION 'auth-id invite did not link once role=% client=% status=%', v_role, v_client, v_status;
  END IF;
  PERFORM public.sync_auth_user_profile(bound);
  SELECT COUNT(*) INTO v_count FROM public.users WHERE auth_user_id = bound;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'auth-id invite replay created % profiles', v_count;
  END IF;

  -- Check: redeemed token links on confirm and a second redeem fails.
  INSERT INTO public.invites (email, role, agency_id, invited_by, token)
  VALUES ('redeem@example.com', 'landlord', agency_a, staff_a, 'tok-redeem');
  PERFORM pg_temp.insert_auth(redeemer, 'redeem@example.com', false, '{"first_name":"Ren","last_name":"Deem"}'::jsonb);
  PERFORM set_config('request.jwt.claim.sub', redeemer::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', redeemer)::text, true);
  IF NOT public.redeem_invite_token('tok-redeem') THEN
    RAISE EXCEPTION 'valid token was not redeemed';
  END IF;
  SELECT role, client_id INTO v_role, v_client FROM public.users WHERE auth_user_id = redeemer;
  SELECT status INTO v_status FROM public.invites WHERE token = 'tok-redeem';
  IF v_role IS DISTINCT FROM 'END_USER' OR v_client IS NOT NULL OR v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'redeem linked before confirmation role=% status=%', v_role, v_status;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = redeemer;
  SELECT role, client_id INTO v_role, v_client FROM public.users WHERE auth_user_id = redeemer;
  SELECT status INTO v_status FROM public.invites WHERE token = 'tok-redeem';
  IF v_role IS DISTINCT FROM 'LANDLORD' OR v_client IS DISTINCT FROM agency_a OR v_status IS DISTINCT FROM 'consumed' THEN
    RAISE EXCEPTION 'redeemed token did not link on confirm role=% client=% status=%', v_role, v_client, v_status;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', redeemer::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', redeemer)::text, true);
  IF public.redeem_invite_token('tok-redeem') THEN
    RAISE EXCEPTION 'redeemed token replay succeeded';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- Check: staff of a different agency cannot authorize the link.
  INSERT INTO public.invites (email, role, agency_id, invited_by, token)
  VALUES ('cross@example.com', 'agency_admin', agency_a, staff_b, 'tok-cross');
  PERFORM pg_temp.insert_auth(
    'c0000000-0000-4000-8000-0000000000c1',
    'cross@example.com',
    true,
    '{"first_name":"Cris","last_name":"Cross","invite_token":"tok-cross"}'::jsonb
  );
  SELECT role, client_id INTO v_role, v_client
  FROM public.users WHERE auth_user_id = 'c0000000-0000-4000-8000-0000000000c1';
  SELECT status INTO v_status FROM public.invites WHERE token = 'tok-cross';
  IF v_role IS DISTINCT FROM 'END_USER' OR v_client IS NOT NULL OR v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'cross-agency invite linked role=% client=% status=%', v_role, v_client, v_status;
  END IF;

  -- Check: an invite role of super_admin does not grant it.
  INSERT INTO public.invites (email, role, agency_id, invited_by, token)
  VALUES ('boss@example.com', 'super_admin', agency_a, staff_a, 'tok-boss');
  PERFORM pg_temp.insert_auth(
    'c0000000-0000-4000-8000-0000000000c2',
    'boss@example.com',
    true,
    '{"first_name":"Bo","last_name":"Ss","invite_token":"tok-boss","role":"super_admin"}'::jsonb
  );
  SELECT role, client_id INTO v_role, v_client
  FROM public.users WHERE auth_user_id = 'c0000000-0000-4000-8000-0000000000c2';
  IF v_role IS DISTINCT FROM 'END_USER' OR v_client IS NOT NULL THEN
    RAISE EXCEPTION 'super_admin invite granted role=% client=%', v_role, v_client;
  END IF;

  -- Check: a token redeemed by a different email does not link the invited profile.
  INSERT INTO public.invites (email, role, agency_id, invited_by, token)
  VALUES ('secret@example.com', 'agency_admin', agency_a, staff_a, 'tok-secret');
  PERFORM pg_temp.insert_auth(
    'c0000000-0000-4000-8000-0000000000c3',
    'thief@example.com',
    true,
    '{"first_name":"Thi","last_name":"Ef","invite_token":"tok-secret"}'::jsonb
  );
  SELECT role, client_id INTO v_role, v_client
  FROM public.users WHERE auth_user_id = 'c0000000-0000-4000-8000-0000000000c3';
  SELECT status INTO v_status FROM public.invites WHERE token = 'tok-secret';
  IF v_role IS DISTINCT FROM 'END_USER' OR v_client IS NOT NULL OR v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'token for a different email linked thief role=% status=%', v_role, v_status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) = 'secret@example.com') THEN
    RAISE EXCEPTION 'mismatched token created the invited profile';
  END IF;

  -- Check: a token cannot be used by a different auth user once auth_user_id is set.
  INSERT INTO public.invites (email, role, agency_id, auth_user_id, token, invited_by, status)
  VALUES ('held@example.com', 'landlord', agency_a, hire, 'tok-held', staff_a, 'pending');
  PERFORM pg_temp.insert_auth(
    'c0000000-0000-4000-8000-0000000000c4',
    'held@example.com',
    true,
    '{"first_name":"Hal","last_name":"Ded","invite_token":"tok-held"}'::jsonb
  );
  SELECT role, client_id INTO v_role, v_client
  FROM public.users WHERE auth_user_id = 'c0000000-0000-4000-8000-0000000000c4';
  SELECT status, auth_user_id INTO v_status, v_auth FROM public.invites WHERE token = 'tok-held';
  IF v_role IS DISTINCT FROM 'END_USER' OR v_client IS NOT NULL
     OR v_status IS DISTINCT FROM 'pending' OR v_auth IS DISTINCT FROM hire THEN
    RAISE EXCEPTION 'bound invite was taken by another auth user role=% status=% auth=%', v_role, v_status, v_auth;
  END IF;
  SELECT role INTO v_role FROM public.users WHERE auth_user_id = hire;
  IF v_role IS DISTINCT FROM 'AGENCY_ADMIN' THEN
    RAISE EXCEPTION 'bound-token attempt changed the original hire role=%', v_role;
  END IF;

  -- Check: the API insert works when auth_user_id is not in auth.users, and a
  -- second pending row for the same email and agency is rejected.
  INSERT INTO public.invites (email, role, agency_id, auth_user_id, token, invited_by, status)
  VALUES (
    'api-shape@example.com',
    'ground_agent',
    agency_a,
    '99999999-9999-4999-8999-999999999999',
    'tok-api-shape',
    staff_a,
    'pending'
  );
  SELECT status, role INTO v_status, v_role
  FROM public.invites WHERE token = 'tok-api-shape';
  IF v_status IS DISTINCT FROM 'pending' OR v_role IS DISTINCT FROM 'ground_agent' THEN
    RAISE EXCEPTION 'API-shaped insert did not stay pending (status=% role=%)', v_status, v_role;
  END IF;
  BEGIN
    INSERT INTO public.invites (email, role, agency_id, auth_user_id, token, invited_by, status)
    VALUES (
      'API-Shape@example.com',
      'ground_agent',
      agency_a,
      '88888888-8888-4888-8888-888888888888',
      'tok-api-shape-dup',
      staff_a,
      'pending'
    );
    RAISE EXCEPTION 'duplicate pending invite for the same email and agency was accepted';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  IF (SELECT COUNT(*) FROM public.users WHERE role = 'SUPER_ADMIN') <> 0 THEN
    RAISE EXCEPTION 'SUPER_ADMIN exists after signups';
  END IF;
END;
$$;

ROLLBACK;
