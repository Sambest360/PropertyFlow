-- 013 verification. Run after 013_storage.sql.
-- Check 1 prints one row. Every column should match the expected value in its name.
-- Check 2 runs the contract refusals inside a transaction and rolls back.
-- Expect refused = true for all five cases.

-- Check 1: buckets, limits, and the absence of an UPDATE policy.
SELECT
  (SELECT public FROM storage.buckets WHERE id = 'property-media') AS media_private_expect_false,
  (SELECT public FROM storage.buckets WHERE id = 'documents') AS documents_private_expect_false,
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'property-media') AS media_limit_expect_10485760,
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'documents') AS documents_limit_expect_20971520,
  (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'property-media')
    AS media_mimes_expect_jpeg_png_webp,
  (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'documents')
    AS document_mimes_expect_pdf_jpeg_png,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'UPDATE'
      AND policyname IN (
        'property_media_update', 'documents_update', 'stored_objects_update'
      )) AS update_policies_expect_0,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'INSERT'
      AND (qual::text LIKE '%10485760%' OR with_check::text LIKE '%10485760%'))
    AS media_size_in_policy_expect_1,
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'INSERT'
      AND (qual::text LIKE '%20971520%' OR with_check::text LIKE '%20971520%'))
    AS document_size_in_policy_expect_1,
  (SELECT count(*) FROM cron.job WHERE jobname = 'sweep-unregistered-storage')
    AS sweep_job_expect_1;

-- Check 2: the five contract refusals. Changes nothing.
BEGIN;

INSERT INTO clients (id, company_name, subdomain)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Verify Agency A', 'verify-a'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Verify Agency B', 'verify-b');

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
VALUES
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'verify-bootstrap@storage.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"tenant","first_name":"Boot","last_name":"User"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'verify-tenant-a@storage.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"tenant","first_name":"Tenant","last_name":"A"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'verify-tenant-b@storage.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"tenant","first_name":"Tenant","last_name":"B"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'verify-applicant-a@storage.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"tenant","first_name":"Applicant","last_name":"A"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'verify-applicant-b@storage.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"tenant","first_name":"Applicant","last_name":"B"}'::jsonb,
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666',
   'authenticated', 'authenticated', 'verify-staff-b@storage.test', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"agency_admin","first_name":"Staff","last_name":"B"}'::jsonb,
   now(), now(), '', '', '', '');

UPDATE users SET client_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role = 'END_USER'
WHERE auth_user_id IN (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555'
);
UPDATE users SET client_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', role = 'AGENCY_ADMIN'
WHERE auth_user_id = '66666666-6666-6666-6666-666666666666';

INSERT INTO buildings (id, client_id, name, address, city, province)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', '1', 'Cape Town', 'WC'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', '2', 'Cape Town', 'WC');
INSERT INTO units (id, building_id, client_id, unit_number)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb11', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '1');

-- Reuse secrets that already exist so this script can be re-run. The
-- surrounding transaction rolls the change back either way.
DO $$
DECLARE
  sid uuid;
BEGIN
  SELECT id INTO sid FROM vault.decrypted_secrets
  WHERE name = 'storage_jwt_secret' ORDER BY created_at DESC LIMIT 1;
  IF sid IS NULL THEN
    PERFORM vault.create_secret(
      'super-secret-jwt-token-with-at-least-32-characters-long',
      'storage_jwt_secret',
      '013 verify'
    );
  ELSE
    PERFORM vault.update_secret(
      sid,
      'super-secret-jwt-token-with-at-least-32-characters-long',
      'storage_jwt_secret',
      '013 verify'
    );
  END IF;

  SELECT id INTO sid FROM vault.decrypted_secrets
  WHERE name = 'supabase_url' ORDER BY created_at DESC LIMIT 1;
  IF sid IS NULL THEN
    PERFORM vault.create_secret('http://127.0.0.1:54321', 'supabase_url', '013 verify');
  ELSE
    PERFORM vault.update_secret(sid, 'http://127.0.0.1:54321', 'supabase_url', '013 verify');
  END IF;
END $$;
GRANT authenticated TO CURRENT_USER;

INSERT INTO maintenance_tickets (id, client_id, unit_id, reported_by, title, description)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa21', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa11', u.id, 'Leak A', 'Tap'
FROM users u WHERE u.auth_user_id = '22222222-2222-2222-2222-222222222222';
INSERT INTO maintenance_tickets (id, client_id, unit_id, reported_by, title, description)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa22', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa12', u.id, 'Leak B', 'Tap'
FROM users u WHERE u.auth_user_id = '33333333-3333-3333-3333-333333333333';

-- Register applicant A's ID document directly (the read check does not upload).
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES (
  'documents',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/user/' ||
    (SELECT id::text FROM users WHERE auth_user_id = '44444444-4444-4444-4444-444444444444') ||
    '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31.pdf',
  '44444444-4444-4444-4444-444444444444',
  '{"mimetype":"application/pdf","contentLength":12,"size":12}'::jsonb
);
INSERT INTO stored_files (id, bucket, path, agency_id, entity_type, entity_id, kind, mime_type, byte_size, uploaded_by)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31', 'documents',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/user/' || u.id::text || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31.pdf',
       u.client_id, 'user', u.id, 'id_document', 'application/pdf', 12, u.id
FROM users u WHERE u.auth_user_id = '44444444-4444-4444-4444-444444444444';

INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES (
  'documents',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/user/' ||
    (SELECT id::text FROM users WHERE auth_user_id = '55555555-5555-5555-5555-555555555555') ||
    '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa32.pdf',
  '55555555-5555-5555-5555-555555555555',
  '{"mimetype":"application/pdf","contentLength":12,"size":12}'::jsonb
);
INSERT INTO stored_files (id, bucket, path, agency_id, entity_type, entity_id, kind, mime_type, byte_size, uploaded_by)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa32', 'documents',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/user/' || u.id::text || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa32.pdf',
       u.client_id, 'user', u.id, 'id_document', 'application/pdf', 12, u.id
FROM users u WHERE u.auth_user_id = '55555555-5555-5555-5555-555555555555';

-- Tenant A uploaded this object onto tenant B's ticket. Registration must still refuse.
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
SELECT
  'documents',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/ticket/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa22/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa41.pdf',
  '22222222-2222-2222-2222-222222222222',
  '{"mimetype":"application/pdf","contentLength":12,"size":12}'::jsonb;

CREATE TEMP TABLE storage_verify_results (check_name TEXT, refused BOOLEAN);
GRANT ALL ON TABLE storage_verify_results TO authenticated;

DO $$
DECLARE
  tenant_a UUID := '22222222-2222-2222-2222-222222222222';
  applicant_a UUID := '44444444-4444-4444-4444-444444444444';
  applicant_b_user UUID;
  staff_b UUID := '66666666-6666-6666-6666-666666666666';
  files JSONB;
  saw_other BOOLEAN;
BEGIN
  SELECT id INTO applicant_b_user FROM users WHERE auth_user_id = '55555555-5555-5555-5555-555555555555';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', tenant_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', tenant_a::text, true);
  BEGIN
    PERFORM public.register_file(
      'documents',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/ticket/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa22/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa41.pdf',
      'ticket',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa22',
      'photo'
    );
    INSERT INTO storage_verify_results VALUES ('tenant_other_ticket', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO storage_verify_results VALUES ('tenant_other_ticket', SQLERRM = 'Forbidden');
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', applicant_a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', applicant_a::text, true);
  files := public.entity_files('user', (SELECT id FROM users WHERE auth_user_id = applicant_a));
  saw_other := files::text LIKE '%aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa32%';
  BEGIN
    PERFORM public.entity_files('user', applicant_b_user);
    INSERT INTO storage_verify_results VALUES ('applicant_own_id_only', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO storage_verify_results VALUES (
      'applicant_own_id_only',
      SQLERRM = 'Forbidden'
      AND NOT saw_other
      AND files::text LIKE '%aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa31%'
    );
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_b, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', staff_b::text, true);
  BEGIN
    PERFORM public.entity_files('ticket', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa21');
    INSERT INTO storage_verify_results VALUES ('cross_agency', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO storage_verify_results VALUES ('cross_agency', SQLERRM = 'Forbidden');
  END;

  EXECUTE 'SET ROLE authenticated';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
      'property-media',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/unit/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb11/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa51.jpg',
      staff_b,
      '{"mimetype":"image/jpeg","contentLength":10485761,"size":10485761}'::jsonb
    );
    EXECUTE 'RESET ROLE';
    INSERT INTO storage_verify_results VALUES ('oversize', false);
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    INSERT INTO storage_verify_results VALUES ('oversize', SQLERRM LIKE '%row-level security%' OR SQLERRM LIKE '%policy%');
  END;

  EXECUTE 'SET ROLE authenticated';
  INSERT INTO storage.objects (bucket_id, name, owner, metadata)
  VALUES (
    'property-media',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/building/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa61.jpg',
    staff_b,
    '{"mimetype":"image/jpeg","contentLength":100,"size":100}'::jsonb
  );
  UPDATE storage.objects
  SET metadata = metadata || '{"replaced":true}'::jsonb
  WHERE name = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/building/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa61.jpg';
  EXECUTE 'RESET ROLE';
  INSERT INTO storage_verify_results VALUES (
    'overwrite',
    NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE name LIKE '%aaaaaaaaaa61.jpg' AND metadata ? 'replaced'
    )
  );
END $$;

SELECT check_name, refused FROM storage_verify_results ORDER BY check_name;

ROLLBACK;
