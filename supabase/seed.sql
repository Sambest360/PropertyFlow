-- Local development fixture. Generated from database/fixtures/localDevSeed.ts.
-- Fake agencies only. Re-running replaces rows owned by this fixture.
BEGIN;
DELETE FROM clients WHERE id IN ('c1000001-0001-4000-8000-000000000001', 'c1000001-0001-4000-8000-000000000002');
DELETE FROM auth.users WHERE email LIKE '%@example.test';
DELETE FROM entity_id_map WHERE frontend_id LIKE 'ag-%' OR frontend_id LIKE 'u-%' OR frontend_id LIKE 'bldg-%' OR frontend_id LIKE 'unit-%' OR frontend_id LIKE 'room-%' OR frontend_id LIKE 'lead-%' OR frontend_id LIKE 'app-%' OR frontend_id LIKE 'lease-%' OR frontend_id LIKE 'ticket-%' OR frontend_id LIKE 'doc-%' OR frontend_id LIKE 'pay-%';

INSERT INTO clients (
  id, company_name, subdomain, status, trading_as, email, phone, city, province,
  country_code, timezone, currency_code, settings, updated_at
) VALUES (
  'c1000001-0001-4000-8000-000000000001'::uuid,
  'Fictional Northwind Lettings',
  'northwind',
  'active',
  'Fictional Northwind Lettings',
  'office.northwind@example.test',
  '+27 00 000 0000',
  'Fictional Bay',
  'Example Province',
  'ZA',
  'Africa/Johannesburg',
  'ZAR',
  '{"frontend_id":"ag-northwind","fictional":true}'::jsonb,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);

INSERT INTO clients (
  id, company_name, subdomain, status, trading_as, email, phone, city, province,
  country_code, timezone, currency_code, settings, updated_at
) VALUES (
  'c1000001-0001-4000-8000-000000000002'::uuid,
  'Fictional Southridge Estates',
  'southridge',
  'active',
  'Fictional Southridge Estates',
  'office.southridge@example.test',
  '+27 00 000 0000',
  'Fictional Ridge',
  'Example Province',
  'ZA',
  'Africa/Johannesburg',
  'ZAR',
  '{"frontend_id":"ag-southridge","fictional":true}'::jsonb,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'sam.platform@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Sam","last_name":"Platform","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-000000000001'::uuid,
  'email',
  'c2000001-0001-4000-8000-000000000001',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-000000000001',
    'email', 'sam.platform@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-000000000001'::uuid,
  client_id = NULL,
  first_name = 'Sam',
  last_name = 'Platform',
  role = 'SUPER_ADMIN',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-super-admin","frontend_role":"super_admin","mustChangePassword":false}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-000000000001'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-00000000000b'::uuid,
  'authenticated',
  'authenticated',
  'ada.ledger@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Ada","last_name":"Ledger","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-00000000000b'::uuid,
  'email',
  'c2000001-0001-4000-8000-00000000000b',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-00000000000b',
    'email', 'ada.ledger@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-00000000000b'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000001'::uuid,
  first_name = 'Ada',
  last_name = 'Ledger',
  role = 'AGENCY_ADMIN',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-northwind-client-admin","frontend_role":"client_admin","mustChangePassword":false}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-00000000000b'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-00000000000c'::uuid,
  'authenticated',
  'authenticated',
  'ben.ledger@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Ben","last_name":"Ledger","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-00000000000c'::uuid,
  'email',
  'c2000001-0001-4000-8000-00000000000c',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-00000000000c',
    'email', 'ben.ledger@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-00000000000c'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000001'::uuid,
  first_name = 'Ben',
  last_name = 'Ledger',
  role = 'AGENT_ADMIN',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-northwind-agent-admin","frontend_role":"agent_admin","mustChangePassword":false}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-00000000000c'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-00000000000d'::uuid,
  'authenticated',
  'authenticated',
  'cara.ledger@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Cara","last_name":"Ledger","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-00000000000d'::uuid,
  'email',
  'c2000001-0001-4000-8000-00000000000d',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-00000000000d',
    'email', 'cara.ledger@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-00000000000d'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000001'::uuid,
  first_name = 'Cara',
  last_name = 'Ledger',
  role = 'GROUND_AGENT',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-northwind-ground-agent","frontend_role":"ground_agent","mustChangePassword":false,"licenseStatus":"full"}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-00000000000d'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-00000000000e'::uuid,
  'authenticated',
  'authenticated',
  'dan.ledger@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Dan","last_name":"Ledger","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-00000000000e'::uuid,
  'email',
  'c2000001-0001-4000-8000-00000000000e',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-00000000000e',
    'email', 'dan.ledger@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-00000000000e'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000001'::uuid,
  first_name = 'Dan',
  last_name = 'Ledger',
  role = 'GROUND_AGENT',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-northwind-agent","frontend_role":"agent","mustChangePassword":false,"licenseStatus":"candidate"}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-00000000000e'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-00000000000f'::uuid,
  'authenticated',
  'authenticated',
  'eva.ledger@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Eva","last_name":"Ledger","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-00000000000f'::uuid,
  'email',
  'c2000001-0001-4000-8000-00000000000f',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-00000000000f',
    'email', 'eva.ledger@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-00000000000f'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000001'::uuid,
  first_name = 'Eva',
  last_name = 'Ledger',
  role = 'LANDLORD',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-northwind-landlord","frontend_role":"landlord","mustChangePassword":false,"verification":{"status":"approved"}}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-00000000000f'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-000000000010'::uuid,
  'authenticated',
  'authenticated',
  'finn.ledger@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Finn","last_name":"Ledger","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-000000000010'::uuid,
  'email',
  'c2000001-0001-4000-8000-000000000010',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-000000000010',
    'email', 'finn.ledger@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-000000000010'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000001'::uuid,
  first_name = 'Finn',
  last_name = 'Ledger',
  role = 'END_USER',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-northwind-tenant","frontend_role":"tenant","mustChangePassword":false,"verification":{"status":"not_required"}}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-000000000010'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-000000000011'::uuid,
  'authenticated',
  'authenticated',
  'gus.ledger@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Gus","last_name":"Ledger","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-000000000011'::uuid,
  'email',
  'c2000001-0001-4000-8000-000000000011',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-000000000011',
    'email', 'gus.ledger@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-000000000011'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000001'::uuid,
  first_name = 'Gus',
  last_name = 'Ledger',
  role = 'CONTRACTOR',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-northwind-contractor","frontend_role":"contractor","mustChangePassword":false,"verification":{"status":"approved"}}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-000000000011'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-000000000012'::uuid,
  'authenticated',
  'authenticated',
  'hal.ledger@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Hal","last_name":"Ledger","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-000000000012'::uuid,
  'email',
  'c2000001-0001-4000-8000-000000000012',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-000000000012',
    'email', 'hal.ledger@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-000000000012'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000001'::uuid,
  first_name = 'Hal',
  last_name = 'Ledger',
  role = 'END_USER',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-northwind-applicant","frontend_role":"tenant","mustChangePassword":false,"persona":"applicant","verification":{"status":"not_required"}}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-000000000012'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-000000000015'::uuid,
  'authenticated',
  'authenticated',
  'iris.pebble@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Iris","last_name":"Pebble","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-000000000015'::uuid,
  'email',
  'c2000001-0001-4000-8000-000000000015',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-000000000015',
    'email', 'iris.pebble@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-000000000015'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000002'::uuid,
  first_name = 'Iris',
  last_name = 'Pebble',
  role = 'AGENCY_ADMIN',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-southridge-client-admin","frontend_role":"client_admin","mustChangePassword":false}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-000000000015'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-000000000016'::uuid,
  'authenticated',
  'authenticated',
  'jules.pebble@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Jules","last_name":"Pebble","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-000000000016'::uuid,
  'email',
  'c2000001-0001-4000-8000-000000000016',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-000000000016',
    'email', 'jules.pebble@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-000000000016'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000002'::uuid,
  first_name = 'Jules',
  last_name = 'Pebble',
  role = 'AGENT_ADMIN',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-southridge-agent-admin","frontend_role":"agent_admin","mustChangePassword":false}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-000000000016'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-000000000017'::uuid,
  'authenticated',
  'authenticated',
  'kit.pebble@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Kit","last_name":"Pebble","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-000000000017'::uuid,
  'email',
  'c2000001-0001-4000-8000-000000000017',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-000000000017',
    'email', 'kit.pebble@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-000000000017'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000002'::uuid,
  first_name = 'Kit',
  last_name = 'Pebble',
  role = 'GROUND_AGENT',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-southridge-ground-agent","frontend_role":"ground_agent","mustChangePassword":false,"licenseStatus":"full"}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-000000000017'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-000000000018'::uuid,
  'authenticated',
  'authenticated',
  'lee.pebble@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Lee","last_name":"Pebble","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-000000000018'::uuid,
  'email',
  'c2000001-0001-4000-8000-000000000018',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-000000000018',
    'email', 'lee.pebble@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-000000000018'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000002'::uuid,
  first_name = 'Lee',
  last_name = 'Pebble',
  role = 'GROUND_AGENT',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-southridge-agent","frontend_role":"agent","mustChangePassword":false,"licenseStatus":"candidate"}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-000000000018'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-000000000019'::uuid,
  'authenticated',
  'authenticated',
  'mo.pebble@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Mo","last_name":"Pebble","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-000000000019'::uuid,
  'email',
  'c2000001-0001-4000-8000-000000000019',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-000000000019',
    'email', 'mo.pebble@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-000000000019'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000002'::uuid,
  first_name = 'Mo',
  last_name = 'Pebble',
  role = 'LANDLORD',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-southridge-landlord","frontend_role":"landlord","mustChangePassword":false,"verification":{"status":"approved"}}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-000000000019'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-00000000001a'::uuid,
  'authenticated',
  'authenticated',
  'nia.pebble@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Nia","last_name":"Pebble","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-00000000001a'::uuid,
  'email',
  'c2000001-0001-4000-8000-00000000001a',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-00000000001a',
    'email', 'nia.pebble@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-00000000001a'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000002'::uuid,
  first_name = 'Nia',
  last_name = 'Pebble',
  role = 'END_USER',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-southridge-tenant","frontend_role":"tenant","mustChangePassword":false,"verification":{"status":"not_required"}}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-00000000001a'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-00000000001b'::uuid,
  'authenticated',
  'authenticated',
  'omar.pebble@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Omar","last_name":"Pebble","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-00000000001b'::uuid,
  'email',
  'c2000001-0001-4000-8000-00000000001b',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-00000000001b',
    'email', 'omar.pebble@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-00000000001b'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000002'::uuid,
  first_name = 'Omar',
  last_name = 'Pebble',
  role = 'CONTRACTOR',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-southridge-contractor","frontend_role":"contractor","mustChangePassword":false,"verification":{"status":"approved"}}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-00000000001b'::uuid;


INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c2000001-0001-4000-8000-00000000001c'::uuid,
  'authenticated',
  'authenticated',
  'pat.pebble@example.test',
  crypt('LocalDev-Password-1', gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"first_name":"Pat","last_name":"Pebble","role":"tenant"}'::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  'c2000001-0001-4000-8000-00000000001c'::uuid,
  'email',
  'c2000001-0001-4000-8000-00000000001c',
  jsonb_build_object(
    'sub', 'c2000001-0001-4000-8000-00000000001c',
    'email', 'pat.pebble@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = 'c2100001-0001-4000-8000-00000000001c'::uuid,
  client_id = 'c1000001-0001-4000-8000-000000000002'::uuid,
  first_name = 'Pat',
  last_name = 'Pebble',
  role = 'END_USER',
  active = TRUE,
  password_hash = NULL,
  metadata = '{"frontend_id":"u-southridge-applicant","frontend_role":"tenant","mustChangePassword":false,"persona":"applicant","verification":{"status":"not_required"}}'::jsonb,
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = 'c2000001-0001-4000-8000-00000000001c'::uuid;


DELETE FROM entity_id_map m
WHERE m.entity_type = 'user'
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.backend_id);
DELETE FROM entity_id_map m
WHERE m.entity_type = 'agency'
  AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = m.backend_id);

INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', 'ag-northwind', 'c1000001-0001-4000-8000-000000000001'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('agency', 'ag-southridge', 'c1000001-0001-4000-8000-000000000002'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-super-admin', 'c2100001-0001-4000-8000-000000000001'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-northwind-client-admin', 'c2100001-0001-4000-8000-00000000000b'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-northwind-agent-admin', 'c2100001-0001-4000-8000-00000000000c'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-northwind-ground-agent', 'c2100001-0001-4000-8000-00000000000d'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-northwind-agent', 'c2100001-0001-4000-8000-00000000000e'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-northwind-landlord', 'c2100001-0001-4000-8000-00000000000f'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-northwind-tenant', 'c2100001-0001-4000-8000-000000000010'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-northwind-contractor', 'c2100001-0001-4000-8000-000000000011'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-northwind-applicant', 'c2100001-0001-4000-8000-000000000012'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-southridge-client-admin', 'c2100001-0001-4000-8000-000000000015'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-southridge-agent-admin', 'c2100001-0001-4000-8000-000000000016'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-southridge-ground-agent', 'c2100001-0001-4000-8000-000000000017'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-southridge-agent', 'c2100001-0001-4000-8000-000000000018'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-southridge-landlord', 'c2100001-0001-4000-8000-000000000019'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-southridge-tenant', 'c2100001-0001-4000-8000-00000000001a'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-southridge-contractor', 'c2100001-0001-4000-8000-00000000001b'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('user', 'u-southridge-applicant', 'c2100001-0001-4000-8000-00000000001c'::uuid);

INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb, grading,
  lat, lng, formatted_address, updated_at
) VALUES (
  'c3000001-0001-4000-8000-000000000001'::uuid,
  'c1000001-0001-4000-8000-000000000001'::uuid,
  'c2100001-0001-4000-8000-00000000000f'::uuid,
  'Fictional Lantern House',
  '1 Example Lane',
  'Fictional Bay',
  'Example Province',
  'Fictional Suburb',
  'B',
  -33.9000000,
  18.4000000,
  '1 Example Lane, Fictional Bay',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms,
  listing_type, rent, status_config_key, agent_id, title, description, featured, updated_at
) VALUES
(
  'c4000001-0001-4000-8000-000000000001'::uuid,
  'c3000001-0001-4000-8000-000000000001'::uuid,
  'c1000001-0001-4000-8000-000000000001'::uuid,
  '1',
  54,
  2,
  1,
  'RENT',
  8500,
  'PUBLISHED',
  'c2100001-0001-4000-8000-00000000000d'::uuid,
  'Fictional Lantern flat',
  'Fictional published listing for local development. Not a real property.',
  TRUE,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
),
(
  'c4000001-0001-4000-8000-000000000002'::uuid,
  'c3000001-0001-4000-8000-000000000001'::uuid,
  'c1000001-0001-4000-8000-000000000001'::uuid,
  '2',
  42,
  1,
  1,
  'RENT',
  7200,
  'OCCUPIED',
  'c2100001-0001-4000-8000-00000000000d'::uuid,
  'Fictional Lantern annex',
  'Fictional occupied unit for the local lease. Not a real property.',
  FALSE,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, sort_order)
VALUES (
  'c5000001-0001-4000-8000-000000000001'::uuid,
  'c4000001-0001-4000-8000-000000000001'::uuid,
  'c1000001-0001-4000-8000-000000000001'::uuid,
  'Fictional lounge',
  'living',
  0,
  1
);
INSERT INTO leads (
  id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
  interest_type, notes, updated_at
) VALUES (
  'c6000001-0001-4000-8000-000000000001'::uuid,
  'c1000001-0001-4000-8000-000000000001'::uuid,
  'c4000001-0001-4000-8000-000000000001'::uuid,
  'c2100001-0001-4000-8000-00000000000d'::uuid,
  'Fictional Enquirer Ledger',
  'enquirer.northwind@example.test',
  '+27 00 000 0001',
  'website',
  'New',
  'RENT',
  'Fictional lead. Not a real enquiry.',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO applications (
  id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type,
  status, monthly_income, employment_summary, message, submitted_at, updated_at
) VALUES (
  'c7000001-0001-4000-8000-000000000001'::uuid,
  'c1000001-0001-4000-8000-000000000001'::uuid,
  'c4000001-0001-4000-8000-000000000001'::uuid,
  'c2100001-0001-4000-8000-000000000012'::uuid,
  'c2100001-0001-4000-8000-00000000000d'::uuid,
  'APP-NORTHWIND-1',
  'RENTAL',
  'SUBMITTED',
  42000,
  'Fictional employment. Not a real applicant.',
  'Fictional application for local development.',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO leases (
  id, client_id, unit_id, tenant_id, landlord_id, agent_id, lease_reference,
  status, start_date, end_date, rent_amount, deposit_amount, updated_at
) VALUES (
  'c8000001-0001-4000-8000-000000000001'::uuid,
  'c1000001-0001-4000-8000-000000000001'::uuid,
  'c4000001-0001-4000-8000-000000000002'::uuid,
  'c2100001-0001-4000-8000-000000000010'::uuid,
  'c2100001-0001-4000-8000-00000000000f'::uuid,
  'c2100001-0001-4000-8000-00000000000d'::uuid,
  'LEASE-NORTHWIND-1',
  'ACTIVE',
  DATE '2026-01-01',
  DATE '2026-12-31',
  7200,
  15000,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO maintenance_tickets (
  id, client_id, unit_id, lease_id, reported_by, contractor_id, category_key,
  title, description, priority, status, updated_at
) VALUES (
  'c9000001-0001-4000-8000-000000000001'::uuid,
  'c1000001-0001-4000-8000-000000000001'::uuid,
  'c4000001-0001-4000-8000-000000000002'::uuid,
  'c8000001-0001-4000-8000-000000000001'::uuid,
  'c2100001-0001-4000-8000-000000000010'::uuid,
  'c2100001-0001-4000-8000-000000000011'::uuid,
  'plumbing',
  'Fictional dripping tap',
  'Fictional maintenance ticket. Not a real repair.',
  'MEDIUM',
  'OPEN',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO documents (
  id, client_id, unit_id, building_id, lease_id, uploaded_by, name, category,
  status, storage_url, mime_type, note, uploaded_at
) VALUES (
  'ca000001-0001-4000-8000-000000000001'::uuid,
  'c1000001-0001-4000-8000-000000000001'::uuid,
  'c4000001-0001-4000-8000-000000000002'::uuid,
  'c3000001-0001-4000-8000-000000000001'::uuid,
  'c8000001-0001-4000-8000-000000000001'::uuid,
  'c2100001-0001-4000-8000-00000000000d'::uuid,
  'Fictional northwind lease pack.txt',
  'LEASE',
  'UPLOADED',
  'local-dev/northwind-lease.txt',
  'text/plain',
  'Fictional document. The bytes live in the local Storage bucket.',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO payments (
  id, client_id, unit_id, lease_id, party_user_id, party_name, payment_type,
  amount, paid_amount, status, due_date, paid_at, method, reference, notes, updated_at
) VALUES (
  'cb000001-0001-4000-8000-000000000001'::uuid,
  'c1000001-0001-4000-8000-000000000001'::uuid,
  'c4000001-0001-4000-8000-000000000002'::uuid,
  'c8000001-0001-4000-8000-000000000001'::uuid,
  'c2100001-0001-4000-8000-000000000010'::uuid,
  'Finn Ledger',
  'RENT',
  7200,
  7200,
  'PAID',
  DATE '2026-02-01',
  TIMESTAMPTZ '2026-02-01 08:00:00+00',
  'EFT',
  'FAKE-NORTHWIND-RENT',
  'Fictional rent receipt. Not a real payment.',
  TIMESTAMPTZ '2026-02-01 08:00:00+00'
);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('building', 'bldg-northwind', 'c3000001-0001-4000-8000-000000000001'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('unit', 'unit-northwind-published', 'c4000001-0001-4000-8000-000000000001'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('unit', 'unit-northwind-leased', 'c4000001-0001-4000-8000-000000000002'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('lead', 'lead-northwind', 'c6000001-0001-4000-8000-000000000001'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('application', 'app-northwind', 'c7000001-0001-4000-8000-000000000001'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('lease', 'lease-northwind', 'c8000001-0001-4000-8000-000000000001'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('ticket', 'ticket-northwind', 'c9000001-0001-4000-8000-000000000001'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('document', 'doc-northwind', 'ca000001-0001-4000-8000-000000000001'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('payment', 'pay-northwind', 'cb000001-0001-4000-8000-000000000001'::uuid);

INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb, grading,
  lat, lng, formatted_address, updated_at
) VALUES (
  'c3000001-0001-4000-8000-000000000002'::uuid,
  'c1000001-0001-4000-8000-000000000002'::uuid,
  'c2100001-0001-4000-8000-000000000019'::uuid,
  'Fictional Pebble Court',
  '2 Sample Street',
  'Fictional Ridge',
  'Example Province',
  'Fictional Suburb',
  'B',
  -33.9000000,
  18.4000000,
  '2 Sample Street, Fictional Ridge',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms,
  listing_type, rent, status_config_key, agent_id, title, description, featured, updated_at
) VALUES
(
  'c4000001-0001-4000-8000-000000000003'::uuid,
  'c3000001-0001-4000-8000-000000000002'::uuid,
  'c1000001-0001-4000-8000-000000000002'::uuid,
  '1',
  54,
  2,
  1,
  'RENT',
  8500,
  'PUBLISHED',
  'c2100001-0001-4000-8000-000000000017'::uuid,
  'Fictional Pebble flat',
  'Fictional published listing for local development. Not a real property.',
  TRUE,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
),
(
  'c4000001-0001-4000-8000-000000000004'::uuid,
  'c3000001-0001-4000-8000-000000000002'::uuid,
  'c1000001-0001-4000-8000-000000000002'::uuid,
  '2',
  42,
  1,
  1,
  'RENT',
  7200,
  'OCCUPIED',
  'c2100001-0001-4000-8000-000000000017'::uuid,
  'Fictional Pebble annex',
  'Fictional occupied unit for the local lease. Not a real property.',
  FALSE,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, sort_order)
VALUES (
  'c5000001-0001-4000-8000-000000000002'::uuid,
  'c4000001-0001-4000-8000-000000000003'::uuid,
  'c1000001-0001-4000-8000-000000000002'::uuid,
  'Fictional lounge',
  'living',
  0,
  1
);
INSERT INTO leads (
  id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
  interest_type, notes, updated_at
) VALUES (
  'c6000001-0001-4000-8000-000000000002'::uuid,
  'c1000001-0001-4000-8000-000000000002'::uuid,
  'c4000001-0001-4000-8000-000000000003'::uuid,
  'c2100001-0001-4000-8000-000000000017'::uuid,
  'Fictional Enquirer Pebble',
  'enquirer.southridge@example.test',
  '+27 00 000 0001',
  'website',
  'New',
  'RENT',
  'Fictional lead. Not a real enquiry.',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO applications (
  id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type,
  status, monthly_income, employment_summary, message, submitted_at, updated_at
) VALUES (
  'c7000001-0001-4000-8000-000000000002'::uuid,
  'c1000001-0001-4000-8000-000000000002'::uuid,
  'c4000001-0001-4000-8000-000000000003'::uuid,
  'c2100001-0001-4000-8000-00000000001c'::uuid,
  'c2100001-0001-4000-8000-000000000017'::uuid,
  'APP-SOUTHRIDGE-1',
  'RENTAL',
  'SUBMITTED',
  42000,
  'Fictional employment. Not a real applicant.',
  'Fictional application for local development.',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO leases (
  id, client_id, unit_id, tenant_id, landlord_id, agent_id, lease_reference,
  status, start_date, end_date, rent_amount, deposit_amount, updated_at
) VALUES (
  'c8000001-0001-4000-8000-000000000002'::uuid,
  'c1000001-0001-4000-8000-000000000002'::uuid,
  'c4000001-0001-4000-8000-000000000004'::uuid,
  'c2100001-0001-4000-8000-00000000001a'::uuid,
  'c2100001-0001-4000-8000-000000000019'::uuid,
  'c2100001-0001-4000-8000-000000000017'::uuid,
  'LEASE-SOUTHRIDGE-1',
  'ACTIVE',
  DATE '2026-01-01',
  DATE '2026-12-31',
  7200,
  15000,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO maintenance_tickets (
  id, client_id, unit_id, lease_id, reported_by, contractor_id, category_key,
  title, description, priority, status, updated_at
) VALUES (
  'c9000001-0001-4000-8000-000000000002'::uuid,
  'c1000001-0001-4000-8000-000000000002'::uuid,
  'c4000001-0001-4000-8000-000000000004'::uuid,
  'c8000001-0001-4000-8000-000000000002'::uuid,
  'c2100001-0001-4000-8000-00000000001a'::uuid,
  'c2100001-0001-4000-8000-00000000001b'::uuid,
  'plumbing',
  'Fictional dripping tap',
  'Fictional maintenance ticket. Not a real repair.',
  'MEDIUM',
  'OPEN',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO documents (
  id, client_id, unit_id, building_id, lease_id, uploaded_by, name, category,
  status, storage_url, mime_type, note, uploaded_at
) VALUES (
  'ca000001-0001-4000-8000-000000000002'::uuid,
  'c1000001-0001-4000-8000-000000000002'::uuid,
  'c4000001-0001-4000-8000-000000000004'::uuid,
  'c3000001-0001-4000-8000-000000000002'::uuid,
  'c8000001-0001-4000-8000-000000000002'::uuid,
  'c2100001-0001-4000-8000-000000000017'::uuid,
  'Fictional southridge lease pack.txt',
  'LEASE',
  'UPLOADED',
  'local-dev/southridge-lease.txt',
  'text/plain',
  'Fictional document. The bytes live in the local Storage bucket.',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO payments (
  id, client_id, unit_id, lease_id, party_user_id, party_name, payment_type,
  amount, paid_amount, status, due_date, paid_at, method, reference, notes, updated_at
) VALUES (
  'cb000001-0001-4000-8000-000000000002'::uuid,
  'c1000001-0001-4000-8000-000000000002'::uuid,
  'c4000001-0001-4000-8000-000000000004'::uuid,
  'c8000001-0001-4000-8000-000000000002'::uuid,
  'c2100001-0001-4000-8000-00000000001a'::uuid,
  'Nia Pebble',
  'RENT',
  7200,
  7200,
  'PAID',
  DATE '2026-02-01',
  TIMESTAMPTZ '2026-02-01 08:00:00+00',
  'EFT',
  'FAKE-SOUTHRIDGE-RENT',
  'Fictional rent receipt. Not a real payment.',
  TIMESTAMPTZ '2026-02-01 08:00:00+00'
);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('building', 'bldg-southridge', 'c3000001-0001-4000-8000-000000000002'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('unit', 'unit-southridge-published', 'c4000001-0001-4000-8000-000000000003'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('unit', 'unit-southridge-leased', 'c4000001-0001-4000-8000-000000000004'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('lead', 'lead-southridge', 'c6000001-0001-4000-8000-000000000002'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('application', 'app-southridge', 'c7000001-0001-4000-8000-000000000002'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('lease', 'lease-southridge', 'c8000001-0001-4000-8000-000000000002'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('ticket', 'ticket-southridge', 'c9000001-0001-4000-8000-000000000002'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('document', 'doc-southridge', 'ca000001-0001-4000-8000-000000000002'::uuid);
INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES ('payment', 'pay-southridge', 'cb000001-0001-4000-8000-000000000002'::uuid);
COMMIT;
