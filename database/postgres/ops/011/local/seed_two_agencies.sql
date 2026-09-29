-- Two agencies for the 011 rehearsal. Fixed UUIDs are also passed into verify.sql
-- by rehearse.sh. Not for production.

ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
VALUES
  ('11111111-1111-4111-8111-000000000001', 'authenticated', 'authenticated', 'admin.a@agency-a.test', 'enc', '{}', now(), now()),
  ('11111111-1111-4111-8111-000000000002', 'authenticated', 'authenticated', 'agent.a@agency-a.test', 'enc', '{}', now(), now()),
  ('11111111-1111-4111-8111-000000000003', 'authenticated', 'authenticated', 'ground.a@agency-a.test', 'enc', '{}', now(), now()),
  ('11111111-1111-4111-8111-000000000004', 'authenticated', 'authenticated', 'landlord.a@agency-a.test', 'enc', '{}', now(), now()),
  ('11111111-1111-4111-8111-000000000005', 'authenticated', 'authenticated', 'tenant.a@agency-a.test', 'enc', '{}', now(), now()),
  ('11111111-1111-4111-8111-000000000006', 'authenticated', 'authenticated', 'contractor.a@agency-a.test', 'enc', '{}', now(), now()),
  ('11111111-1111-4111-8111-000000000007', 'authenticated', 'authenticated', 'unlinked.a@agency-a.test', 'enc', '{}', now(), now()),
  ('11111111-1111-4111-8111-000000000008', 'authenticated', 'authenticated', 'noverif.a@agency-a.test', 'enc', '{}', now(), now()),
  ('22222222-2222-4222-8222-000000000001', 'authenticated', 'authenticated', 'admin.b@agency-b.test', 'enc', '{}', now(), now()),
  ('22222222-2222-4222-8222-000000000002', 'authenticated', 'authenticated', 'agent.b@agency-b.test', 'enc', '{}', now(), now()),
  ('22222222-2222-4222-8222-000000000003', 'authenticated', 'authenticated', 'ground.b@agency-b.test', 'enc', '{}', now(), now()),
  ('22222222-2222-4222-8222-000000000004', 'authenticated', 'authenticated', 'landlord.b@agency-b.test', 'enc', '{}', now(), now()),
  ('22222222-2222-4222-8222-000000000005', 'authenticated', 'authenticated', 'tenant.b@agency-b.test', 'enc', '{}', now(), now()),
  ('22222222-2222-4222-8222-000000000006', 'authenticated', 'authenticated', 'contractor.b@agency-b.test', 'enc', '{}', now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'spare-auth@rehearsal.test', 'enc', '{}', now(), now());

INSERT INTO clients (id, company_name, subdomain, status, city, email, settings)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Agency A', 'agency-a', 'active', 'Gqeberha', 'office-a@agency-a.test', '{"frontend_id":"ag-a","isGlobalConfigClient":false}'),
  ('22222222-2222-4222-8222-222222222222', 'Agency B', 'agency-b', 'active', 'Cape Town', 'office-b@agency-b.test', '{"frontend_id":"ag-b"}');

INSERT INTO users (id, auth_user_id, client_id, email, password_hash, first_name, last_name, phone, role, active, metadata)
VALUES
  ('11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-111111111111', 'admin.a@agency-a.test', '$2a$10$agencyAadminhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Ada', 'Admin', '0410000001', 'AGENCY_ADMIN', true, '{"frontend_id":"u-a-admin","frontend_role":"agency_admin","enabledPermissions":["assets.view"]}'),
  ('11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-000000000002', '11111111-1111-4111-8111-111111111111', 'agent.a@agency-a.test', '$2a$10$agencyAagenthashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Ari', 'Agent', '0410000002', 'AGENT_ADMIN', true, '{"frontend_id":"u-a-agent","frontend_role":"agent_admin"}'),
  ('11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-000000000003', '11111111-1111-4111-8111-111111111111', 'ground.a@agency-a.test', '$2a$10$agencyAgroundhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Gus', 'Ground', '0410000003', 'GROUND_AGENT', true, '{"frontend_id":"u-a-ground","frontend_role":"ground_agent"}'),
  ('11111111-1111-4111-8111-000000000004', '11111111-1111-4111-8111-000000000004', '11111111-1111-4111-8111-111111111111', 'landlord.a@agency-a.test', '$2a$10$agencyAlandlordLEAK_____________________________', 'Leah', 'Landlord', '0410000004', 'LANDLORD', true, '{"frontend_id":"u-a-landlord","frontend_role":"landlord","idNumberOrPassport":"8001015009087","verification":{"status":"approved","documents":[{"type":"id","url":"data:application/pdf;base64,SECRETDOC"}]}}'),
  ('11111111-1111-4111-8111-000000000005', '11111111-1111-4111-8111-000000000005', '11111111-1111-4111-8111-111111111111', 'tenant.a@agency-a.test', '$2a$10$agencyAtenanthashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Tina', 'Tenant', '0410000005', 'END_USER', true, '{"frontend_id":"u-a-tenant","frontend_role":"tenant","enabledPermissions":["portal.tenant"],"verification":{"status":"not_required"}}'),
  ('11111111-1111-4111-8111-000000000006', '11111111-1111-4111-8111-000000000006', '11111111-1111-4111-8111-111111111111', 'contractor.a@agency-a.test', '$2a$10$agencyAcontractorhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Chris', 'Contractor', '0410000006', 'CONTRACTOR', true, '{"frontend_id":"u-a-contractor","frontend_role":"contractor","verification":{"status":"approved"}}'),
  ('11111111-1111-4111-8111-000000000007', '11111111-1111-4111-8111-000000000007', '11111111-1111-4111-8111-111111111111', 'unlinked.a@agency-a.test', '$2a$10$agencyAunlinkedhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Una', 'Unlinked', '0410000007', 'END_USER', true, '{"frontend_id":"u-a-unlinked","frontend_role":"tenant","verification":{"status":"not_required"},"idNumberOrPassport":"9001015009088"}'),
  ('11111111-1111-4111-8111-000000000008', '11111111-1111-4111-8111-000000000008', '11111111-1111-4111-8111-111111111111', 'noverif.a@agency-a.test', '$2a$10$agencyAnoverifhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Ned', 'Noverify', '0410000008', 'LANDLORD', true, '{"frontend_id":"u-a-noverif","frontend_role":"landlord"}'),
  ('22222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-000000000001', '22222222-2222-4222-8222-222222222222', 'admin.b@agency-b.test', '$2a$10$agencyBadminhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Ben', 'Admin', '0210000001', 'AGENCY_ADMIN', true, '{"frontend_id":"u-b-admin","frontend_role":"agency_admin"}'),
  ('22222222-2222-4222-8222-000000000002', '22222222-2222-4222-8222-000000000002', '22222222-2222-4222-8222-222222222222', 'agent.b@agency-b.test', '$2a$10$agencyBagenthashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Bea', 'Agent', '0210000002', 'AGENT_ADMIN', true, '{"frontend_id":"u-b-agent","frontend_role":"agent_admin"}'),
  ('22222222-2222-4222-8222-000000000003', '22222222-2222-4222-8222-000000000003', '22222222-2222-4222-8222-222222222222', 'ground.b@agency-b.test', '$2a$10$agencyBgroundhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Bo', 'Ground', '0210000003', 'GROUND_AGENT', true, '{"frontend_id":"u-b-ground","frontend_role":"ground_agent"}'),
  ('22222222-2222-4222-8222-000000000004', '22222222-2222-4222-8222-000000000004', '22222222-2222-4222-8222-222222222222', 'landlord.b@agency-b.test', '$2a$10$agencyBlandlordhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Liam', 'Landlord', '0210000004', 'LANDLORD', true, '{"frontend_id":"u-b-landlord","frontend_role":"landlord","verification":{"status":"approved"}}'),
  ('22222222-2222-4222-8222-000000000005', '22222222-2222-4222-8222-000000000005', '22222222-2222-4222-8222-222222222222', 'tenant.b@agency-b.test', '$2a$10$agencyBtenanthashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Tess', 'Tenant', '0210000005', 'END_USER', true, '{"frontend_id":"u-b-tenant","frontend_role":"tenant","verification":{"status":"not_required"}}'),
  ('22222222-2222-4222-8222-000000000006', '22222222-2222-4222-8222-000000000006', '22222222-2222-4222-8222-222222222222', 'contractor.b@agency-b.test', '$2a$10$agencyBcontractorhashxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Cara', 'Contractor', '0210000006', 'CONTRACTOR', true, '{"frontend_id":"u-b-contractor","frontend_role":"contractor","verification":{"status":"approved"}}');

INSERT INTO buildings (id, client_id, landlord_id, name, address, city, province)
VALUES
  ('11111111-1111-4111-8111-000000000101', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000004', 'Agency A House', '1 A Street', 'Gqeberha', 'EC'),
  ('11111111-1111-4111-8111-000000000102', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000008', 'Agency A Second House', '3 A Street', 'Gqeberha', 'EC'),
  ('22222222-2222-4222-8222-000000000101', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000004', 'Agency B Private House', '2 B Street', 'Cape Town', 'WC');

-- A is published so the anon RPC has a landlord row to inspect.
-- B is NOT_LISTED / DRAFT so public-listing policies must not reveal it.
INSERT INTO units (id, building_id, client_id, unit_number, listing_type, status_config_key, title, agent_id)
VALUES
  ('11111111-1111-4111-8111-000000000201', '11111111-1111-4111-8111-000000000101', '11111111-1111-4111-8111-111111111111', 'A1', 'RENT', 'PUBLISHED', 'Agency A published flat', '11111111-1111-4111-8111-000000000002'),
  ('11111111-1111-4111-8111-000000000202', '11111111-1111-4111-8111-000000000102', '11111111-1111-4111-8111-111111111111', 'A2', 'RENT', 'PUBLISHED', 'Agency A second published flat', '11111111-1111-4111-8111-000000000002'),
  ('22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-000000000101', '22222222-2222-4222-8222-222222222222', 'B1', 'NOT_LISTED', 'DRAFT', 'Agency B private flat', '22222222-2222-4222-8222-000000000002');

INSERT INTO rooms (id, unit_id, client_id, name, room_kind)
VALUES
  ('11111111-1111-4111-8111-000000000301', '11111111-1111-4111-8111-000000000201', '11111111-1111-4111-8111-111111111111', 'Bedroom A', 'bedroom'),
  ('22222222-2222-4222-8222-000000000301', '22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-222222222222', 'Bedroom B', 'bedroom');

INSERT INTO internal_assets (id, unit_id, client_id, item_name, asset_type_key)
VALUES
  ('11111111-1111-4111-8111-000000000401', '11111111-1111-4111-8111-000000000201', '11111111-1111-4111-8111-111111111111', 'Fridge A', 'appliance'),
  ('22222222-2222-4222-8222-000000000401', '22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-222222222222', 'Fridge B', 'appliance');

INSERT INTO leads (id, client_id, unit_id, name, email, stage)
VALUES
  ('11111111-1111-4111-8111-000000000501', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000201', 'Lead A', 'lead.a@example.test', 'New'),
  ('22222222-2222-4222-8222-000000000501', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000201', 'Lead B', 'lead.b@example.test', 'New');

INSERT INTO applications (id, client_id, unit_id, applicant_id, reference_code, status)
VALUES
  ('11111111-1111-4111-8111-000000000601', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000201', '11111111-1111-4111-8111-000000000005', 'APP-A', 'SUBMITTED'),
  ('22222222-2222-4222-8222-000000000601', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-000000000005', 'APP-B', 'SUBMITTED');

INSERT INTO leases (id, client_id, unit_id, tenant_id, landlord_id, lease_reference, start_date, rent_amount)
VALUES
  ('11111111-1111-4111-8111-000000000701', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000201', '11111111-1111-4111-8111-000000000005', '11111111-1111-4111-8111-000000000004', 'LEASE-A', DATE '2026-01-01', 8000),
  ('22222222-2222-4222-8222-000000000701', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-000000000005', '22222222-2222-4222-8222-000000000004', 'LEASE-B', DATE '2026-01-01', 9000);

INSERT INTO viewing_slots (id, client_id, unit_id, slot_date, slot_time)
VALUES
  ('11111111-1111-4111-8111-000000000801', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000201', DATE '2026-10-01', '10:00'),
  ('22222222-2222-4222-8222-000000000801', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000201', DATE '2026-10-01', '11:00');

INSERT INTO bookings (id, client_id, unit_id, applicant_id, visitor_name, starts_at)
VALUES
  ('11111111-1111-4111-8111-000000000901', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000201', '11111111-1111-4111-8111-000000000005', 'Tina Tenant', TIMESTAMPTZ '2026-10-01 10:00+00'),
  ('22222222-2222-4222-8222-000000000901', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-000000000005', 'Tess Tenant', TIMESTAMPTZ '2026-10-01 11:00+00');

INSERT INTO payments (id, client_id, party_user_id, party_name, payment_type, amount, due_date)
VALUES
  ('11111111-1111-4111-8111-000000000a01', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000005', 'Tina Tenant', 'RENT', 8000, DATE '2026-10-01'),
  ('22222222-2222-4222-8222-000000000a01', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000005', 'Tess Tenant', 'RENT', 9000, DATE '2026-10-01');

INSERT INTO documents (id, client_id, uploaded_by, name)
VALUES
  ('11111111-1111-4111-8111-000000000b01', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000005', 'Doc A'),
  ('22222222-2222-4222-8222-000000000b01', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000005', 'Doc B');

INSERT INTO maintenance_tickets (id, client_id, unit_id, contractor_id, reported_by, title, description)
VALUES
  ('11111111-1111-4111-8111-000000000c01', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000201', '11111111-1111-4111-8111-000000000006', '11111111-1111-4111-8111-000000000005', 'Leak A', 'Tap drips'),
  ('22222222-2222-4222-8222-000000000c01', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000201', '22222222-2222-4222-8222-000000000006', '22222222-2222-4222-8222-000000000005', 'Leak B', 'Private tap');

INSERT INTO message_threads (id, client_id, subject, participant_ids)
VALUES
  ('11111111-1111-4111-8111-000000000d01', '11111111-1111-4111-8111-111111111111', 'Thread A', '["11111111-1111-4111-8111-000000000005"]'),
  ('22222222-2222-4222-8222-000000000d01', '22222222-2222-4222-8222-222222222222', 'Thread B', '["22222222-2222-4222-8222-000000000005"]');

INSERT INTO messages (id, thread_id, client_id, from_user_id, body)
VALUES
  ('11111111-1111-4111-8111-000000000e01', '11111111-1111-4111-8111-000000000d01', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000005', 'Hello A'),
  ('22222222-2222-4222-8222-000000000e01', '22222222-2222-4222-8222-000000000d01', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000005', 'Hello B private');

INSERT INTO notifications (id, client_id, user_id, title, body)
VALUES
  ('11111111-1111-4111-8111-000000000f01', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000000005', 'Note A', 'For tenant A'),
  ('22222222-2222-4222-8222-000000000f01', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000000005', 'Note B', 'For tenant B');

INSERT INTO suite_alerts (id, client_id, resource)
VALUES
  ('11111111-1111-4111-8111-000000001001', '11111111-1111-4111-8111-111111111111', 'leads'),
  ('22222222-2222-4222-8222-000000001001', '22222222-2222-4222-8222-222222222222', 'leads');

INSERT INTO client_lookup_configs (id, client_id, config_type, key_value, display_label)
VALUES
  ('11111111-1111-4111-8111-000000001101', '11111111-1111-4111-8111-111111111111', 'LEAD_STAGE', 'New', 'New'),
  ('22222222-2222-4222-8222-000000001101', '22222222-2222-4222-8222-222222222222', 'LEAD_STAGE', 'New', 'New');

INSERT INTO billing_plans (id, plan_name, base_monthly_fee, per_sqm_rate, per_unit_rate)
VALUES ('11111111-1111-4111-8111-000000001201', 'Rehearsal', 0, 0, 0);

INSERT INTO client_subscriptions (id, client_id, plan_id)
VALUES
  ('11111111-1111-4111-8111-000000001301', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000001201'),
  ('22222222-2222-4222-8222-000000001301', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-000000001201');

INSERT INTO invoices (id, client_id, subscription_id, billing_period_start, billing_period_end, base_amount, asset_usage_amount, vat_amount, total_amount_due)
VALUES
  ('11111111-1111-4111-8111-000000001401', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-000000001301', DATE '2026-09-01', DATE '2026-09-30', 0, 0, 0, 0),
  ('22222222-2222-4222-8222-000000001401', '22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-000000001301', DATE '2026-09-01', DATE '2026-09-30', 0, 0, 0, 0);

INSERT INTO event_log (id, client_id, event_type, subject_type)
VALUES
  ('11111111-1111-4111-8111-000000001501', '11111111-1111-4111-8111-111111111111', 'rehearse', 'client'),
  ('22222222-2222-4222-8222-000000001501', '22222222-2222-4222-8222-222222222222', 'rehearse', 'client');

INSERT INTO entity_id_map (entity_type, frontend_id, backend_id)
VALUES
  ('agency', 'ag-a', '11111111-1111-4111-8111-111111111111'),
  ('building', 'b-a', '11111111-1111-4111-8111-000000000101'),
  ('unit', 'u-a', '11111111-1111-4111-8111-000000000201'),
  ('property', 'p-a', '11111111-1111-4111-8111-000000000201'),
  ('user', 'u-a-landlord', '11111111-1111-4111-8111-000000000004');

ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
