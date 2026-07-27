-- =============================================================================
-- PropertyFlow — PostgreSQL seed (Port Elizabeth / Eastern Cape demo story)
-- Requires: database/postgres/schema.sql already applied
-- Password: most demo users still use the shared bcrypt placeholder (see README).
-- Super admin sambampo200@gmail.com uses a real bcrypt hash of plaintext `secret`.
-- =============================================================================
--
-- Fixed UUID prefixes (for readability / app wiring):
--   Clients     a1000001-...
--   Lookups     a1100001-...
--   Users       a2000001-...
--   Buildings   a3000001-...
--   Units       a4000001-...
--   Rooms       a5000001-...
--   Assets      a6000001-...
--   Applications a7000001-...
--   Leases      a8000001-...
--   Bookings    a9000001-...
--   Viewing slots c1000001-...
--   Tickets     aa000001-...
--   Permissions ab000001-...
--   Automation  ac000001-...
--   Events      ad000001-...
--   Suite alerts c2000001-...
-- =============================================================================

BEGIN;

-- Wipe in dependency order (safe re-seed)
TRUNCATE TABLE
  automation_runs,
  automation_rules,
  suite_alerts,
  event_log,
  invoices,
  client_subscriptions,
  billing_plans,
  messages,
  message_threads,
  notifications,
  media_assets,
  documents,
  payments,
  leads,
  maintenance_ticket_updates,
  maintenance_tickets,
  vendor_category_routes,
  bookings,
  viewing_slots,
  leases,
  applications,
  internal_assets,
  rooms,
  units,
  buildings,
  role_permissions,
  permissions,
  users,
  client_lookup_configs,
  clients
RESTART IDENTITY CASCADE;

-- Demo password placeholder (bcrypt-shaped; NOT a verified real hash).
-- Intended plaintext for docs: demo-password
-- Replace with a real bcrypt/argon2 hash before any production auth.

-- =============================================================================
-- Clients
-- =============================================================================
INSERT INTO clients (id, company_name, subdomain, status, trading_as, email, phone, city, province, settings) VALUES
(
  'a1000001-0001-4000-8000-000000000001',
  'Horizon Realty',
  'horizon',
  'active',
  'Horizon Realty Group',
  'accounts@horizonrealty.co.za',
  '+27 11 555 0100',
  'Port Elizabeth',
  'Eastern Cape',
  '{"autoAdvanceApplications": true, "focus": ["Walmer", "Humewood", "Mill Park", "Summerstrand"]}'::jsonb
),
(
  'a1000001-0001-4000-8000-000000000002',
  'Algoa Bay Estates',
  'algoa-bay',
  'active',
  'Algoa Bay Holdings',
  'hello@capecoastal.co.za',
  '+27 21 555 0200',
  'Port Elizabeth',
  'Eastern Cape',
  '{"autoAdvanceApplications": true, "focus": ["Newton Park", "Mount Pleasant", "Richmond Hill"]}'::jsonb
),
(
  'a1000001-0001-4000-8000-000000000003',
  'Bayview Property Group',
  'bayview',
  'active',
  'Bayview Property Group',
  'hello@gardenroutehomes.co.za',
  '+27 44 555 0300',
  'Port Elizabeth',
  'Eastern Cape',
  '{"autoAdvanceApplications": true, "focus": ["Framesby", "Charlo", "Lorraine"]}'::jsonb
);

-- =============================================================================
-- Lookup configs (per client)
-- =============================================================================
-- Horizon
INSERT INTO client_lookup_configs (id, client_id, config_type, key_value, display_label, is_active, sort_order) VALUES
-- PROPERTY_STATUS (building-level marketing)
('a1100001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001', 'PROPERTY_STATUS', 'ACTIVE', 'Active', true, 1),
('a1100001-0001-4000-8000-000000000002', 'a1000001-0001-4000-8000-000000000001', 'PROPERTY_STATUS', 'UNDER_MANAGEMENT', 'Under management', true, 2),
('a1100001-0001-4000-8000-000000000003', 'a1000001-0001-4000-8000-000000000001', 'PROPERTY_STATUS', 'ARCHIVED', 'Archived', true, 3),
-- UNIT_STATUS
('a1100001-0001-4000-8000-000000000011', 'a1000001-0001-4000-8000-000000000001', 'UNIT_STATUS', 'AVAILABLE', 'Available', true, 1),
('a1100001-0001-4000-8000-000000000012', 'a1000001-0001-4000-8000-000000000001', 'UNIT_STATUS', 'RESERVED', 'Reserved', true, 2),
('a1100001-0001-4000-8000-000000000013', 'a1000001-0001-4000-8000-000000000001', 'UNIT_STATUS', 'OCCUPIED', 'Occupied', true, 3),
('a1100001-0001-4000-8000-000000000014', 'a1000001-0001-4000-8000-000000000001', 'UNIT_STATUS', 'MAINTENANCE', 'Maintenance', true, 4),
('a1100001-0001-4000-8000-000000000015', 'a1000001-0001-4000-8000-000000000001', 'UNIT_STATUS', 'OFF_MARKET', 'Off market', true, 5),
-- ASSET_TYPE
('a1100001-0001-4000-8000-000000000021', 'a1000001-0001-4000-8000-000000000001', 'ASSET_TYPE', 'APPLIANCE', 'Appliance', true, 1),
('a1100001-0001-4000-8000-000000000022', 'a1000001-0001-4000-8000-000000000001', 'ASSET_TYPE', 'FURNITURE', 'Furniture', true, 2),
('a1100001-0001-4000-8000-000000000023', 'a1000001-0001-4000-8000-000000000001', 'ASSET_TYPE', 'ELECTRONICS', 'Electronics', true, 3),
('a1100001-0001-4000-8000-000000000024', 'a1000001-0001-4000-8000-000000000001', 'ASSET_TYPE', 'FIXTURE', 'Fixture', true, 4),
-- TICKET_CATEGORY
('a1100001-0001-4000-8000-000000000031', 'a1000001-0001-4000-8000-000000000001', 'TICKET_CATEGORY', 'PLUMBING', 'Plumbing', true, 1),
('a1100001-0001-4000-8000-000000000032', 'a1000001-0001-4000-8000-000000000001', 'TICKET_CATEGORY', 'ELECTRICAL', 'Electrical', true, 2),
('a1100001-0001-4000-8000-000000000033', 'a1000001-0001-4000-8000-000000000001', 'TICKET_CATEGORY', 'APPLIANCE', 'Appliance', true, 3),
('a1100001-0001-4000-8000-000000000035', 'a1000001-0001-4000-8000-000000000001', 'TICKET_CATEGORY', 'APPLIANCE_FAILURE', 'Appliance failure', true, 4),
('a1100001-0001-4000-8000-000000000034', 'a1000001-0001-4000-8000-000000000001', 'TICKET_CATEGORY', 'GENERAL', 'General', true, 5),
-- ROOM_KIND
('a1100001-0001-4000-8000-000000000041', 'a1000001-0001-4000-8000-000000000001', 'ROOM_KIND', 'bedroom', 'Bedroom', true, 1),
('a1100001-0001-4000-8000-000000000042', 'a1000001-0001-4000-8000-000000000001', 'ROOM_KIND', 'bathroom', 'Bathroom', true, 2),
('a1100001-0001-4000-8000-000000000043', 'a1000001-0001-4000-8000-000000000001', 'ROOM_KIND', 'kitchen', 'Kitchen', true, 3),
('a1100001-0001-4000-8000-000000000044', 'a1000001-0001-4000-8000-000000000001', 'ROOM_KIND', 'living', 'Living / Lounge', true, 4),
('a1100001-0001-4000-8000-000000000045', 'a1000001-0001-4000-8000-000000000001', 'ROOM_KIND', 'dining', 'Dining', true, 5),
('a1100001-0001-4000-8000-000000000046', 'a1000001-0001-4000-8000-000000000001', 'ROOM_KIND', 'study', 'Study', true, 6),
('a1100001-0001-4000-8000-000000000047', 'a1000001-0001-4000-8000-000000000001', 'ROOM_KIND', 'garage', 'Garage', true, 7),
('a1100001-0001-4000-8000-000000000048', 'a1000001-0001-4000-8000-000000000001', 'ROOM_KIND', 'other', 'Other', true, 8);

-- Cape Coastal comments → Algoa Bay (client id retained)
-- Garden Route Homes comments → Bayview
INSERT INTO client_lookup_configs (id, client_id, config_type, key_value, display_label, is_active, sort_order) VALUES
('a1100001-0001-4000-8000-000000000101', 'a1000001-0001-4000-8000-000000000002', 'PROPERTY_STATUS', 'ACTIVE', 'Active', true, 1),
('a1100001-0001-4000-8000-000000000102', 'a1000001-0001-4000-8000-000000000002', 'PROPERTY_STATUS', 'UNDER_MANAGEMENT', 'Under management', true, 2),
('a1100001-0001-4000-8000-000000000103', 'a1000001-0001-4000-8000-000000000002', 'PROPERTY_STATUS', 'ARCHIVED', 'Archived', true, 3),
('a1100001-0001-4000-8000-000000000111', 'a1000001-0001-4000-8000-000000000002', 'UNIT_STATUS', 'AVAILABLE', 'Available', true, 1),
('a1100001-0001-4000-8000-000000000112', 'a1000001-0001-4000-8000-000000000002', 'UNIT_STATUS', 'RESERVED', 'Reserved', true, 2),
('a1100001-0001-4000-8000-000000000113', 'a1000001-0001-4000-8000-000000000002', 'UNIT_STATUS', 'OCCUPIED', 'Occupied', true, 3),
('a1100001-0001-4000-8000-000000000114', 'a1000001-0001-4000-8000-000000000002', 'UNIT_STATUS', 'MAINTENANCE', 'Maintenance', true, 4),
('a1100001-0001-4000-8000-000000000115', 'a1000001-0001-4000-8000-000000000002', 'UNIT_STATUS', 'OFF_MARKET', 'Off market', true, 5),
('a1100001-0001-4000-8000-000000000121', 'a1000001-0001-4000-8000-000000000002', 'ASSET_TYPE', 'APPLIANCE', 'Appliance', true, 1),
('a1100001-0001-4000-8000-000000000122', 'a1000001-0001-4000-8000-000000000002', 'ASSET_TYPE', 'FURNITURE', 'Furniture', true, 2),
('a1100001-0001-4000-8000-000000000123', 'a1000001-0001-4000-8000-000000000002', 'ASSET_TYPE', 'ELECTRONICS', 'Electronics', true, 3),
('a1100001-0001-4000-8000-000000000124', 'a1000001-0001-4000-8000-000000000002', 'ASSET_TYPE', 'FIXTURE', 'Fixture', true, 4),
('a1100001-0001-4000-8000-000000000131', 'a1000001-0001-4000-8000-000000000002', 'TICKET_CATEGORY', 'PLUMBING', 'Plumbing', true, 1),
('a1100001-0001-4000-8000-000000000132', 'a1000001-0001-4000-8000-000000000002', 'TICKET_CATEGORY', 'ELECTRICAL', 'Electrical', true, 2),
('a1100001-0001-4000-8000-000000000133', 'a1000001-0001-4000-8000-000000000002', 'TICKET_CATEGORY', 'APPLIANCE', 'Appliance', true, 3),
('a1100001-0001-4000-8000-000000000134', 'a1000001-0001-4000-8000-000000000002', 'TICKET_CATEGORY', 'GENERAL', 'General', true, 4),
('a1100001-0001-4000-8000-000000000141', 'a1000001-0001-4000-8000-000000000002', 'ROOM_KIND', 'bedroom', 'Bedroom', true, 1),
('a1100001-0001-4000-8000-000000000142', 'a1000001-0001-4000-8000-000000000002', 'ROOM_KIND', 'bathroom', 'Bathroom', true, 2),
('a1100001-0001-4000-8000-000000000143', 'a1000001-0001-4000-8000-000000000002', 'ROOM_KIND', 'kitchen', 'Kitchen', true, 3),
('a1100001-0001-4000-8000-000000000144', 'a1000001-0001-4000-8000-000000000002', 'ROOM_KIND', 'living', 'Living / Lounge', true, 4),
('a1100001-0001-4000-8000-000000000145', 'a1000001-0001-4000-8000-000000000002', 'ROOM_KIND', 'dining', 'Dining', true, 5),
('a1100001-0001-4000-8000-000000000146', 'a1000001-0001-4000-8000-000000000002', 'ROOM_KIND', 'study', 'Study', true, 6),
('a1100001-0001-4000-8000-000000000147', 'a1000001-0001-4000-8000-000000000002', 'ROOM_KIND', 'garage', 'Garage', true, 7),
('a1100001-0001-4000-8000-000000000148', 'a1000001-0001-4000-8000-000000000002', 'ROOM_KIND', 'other', 'Other', true, 8);

-- Garden Route Homes (same catalogue)
INSERT INTO client_lookup_configs (id, client_id, config_type, key_value, display_label, is_active, sort_order) VALUES
('a1100001-0001-4000-8000-000000000201', 'a1000001-0001-4000-8000-000000000003', 'PROPERTY_STATUS', 'ACTIVE', 'Active', true, 1),
('a1100001-0001-4000-8000-000000000202', 'a1000001-0001-4000-8000-000000000003', 'PROPERTY_STATUS', 'UNDER_MANAGEMENT', 'Under management', true, 2),
('a1100001-0001-4000-8000-000000000203', 'a1000001-0001-4000-8000-000000000003', 'PROPERTY_STATUS', 'ARCHIVED', 'Archived', true, 3),
('a1100001-0001-4000-8000-000000000211', 'a1000001-0001-4000-8000-000000000003', 'UNIT_STATUS', 'AVAILABLE', 'Available', true, 1),
('a1100001-0001-4000-8000-000000000212', 'a1000001-0001-4000-8000-000000000003', 'UNIT_STATUS', 'RESERVED', 'Reserved', true, 2),
('a1100001-0001-4000-8000-000000000213', 'a1000001-0001-4000-8000-000000000003', 'UNIT_STATUS', 'OCCUPIED', 'Occupied', true, 3),
('a1100001-0001-4000-8000-000000000214', 'a1000001-0001-4000-8000-000000000003', 'UNIT_STATUS', 'MAINTENANCE', 'Maintenance', true, 4),
('a1100001-0001-4000-8000-000000000215', 'a1000001-0001-4000-8000-000000000003', 'UNIT_STATUS', 'OFF_MARKET', 'Off market', true, 5),
('a1100001-0001-4000-8000-000000000221', 'a1000001-0001-4000-8000-000000000003', 'ASSET_TYPE', 'APPLIANCE', 'Appliance', true, 1),
('a1100001-0001-4000-8000-000000000222', 'a1000001-0001-4000-8000-000000000003', 'ASSET_TYPE', 'FURNITURE', 'Furniture', true, 2),
('a1100001-0001-4000-8000-000000000223', 'a1000001-0001-4000-8000-000000000003', 'ASSET_TYPE', 'ELECTRONICS', 'Electronics', true, 3),
('a1100001-0001-4000-8000-000000000224', 'a1000001-0001-4000-8000-000000000003', 'ASSET_TYPE', 'FIXTURE', 'Fixture', true, 4),
('a1100001-0001-4000-8000-000000000231', 'a1000001-0001-4000-8000-000000000003', 'TICKET_CATEGORY', 'PLUMBING', 'Plumbing', true, 1),
('a1100001-0001-4000-8000-000000000232', 'a1000001-0001-4000-8000-000000000003', 'TICKET_CATEGORY', 'ELECTRICAL', 'Electrical', true, 2),
('a1100001-0001-4000-8000-000000000233', 'a1000001-0001-4000-8000-000000000003', 'TICKET_CATEGORY', 'APPLIANCE', 'Appliance', true, 3),
('a1100001-0001-4000-8000-000000000234', 'a1000001-0001-4000-8000-000000000003', 'TICKET_CATEGORY', 'GENERAL', 'General', true, 4),
('a1100001-0001-4000-8000-000000000241', 'a1000001-0001-4000-8000-000000000003', 'ROOM_KIND', 'bedroom', 'Bedroom', true, 1),
('a1100001-0001-4000-8000-000000000242', 'a1000001-0001-4000-8000-000000000003', 'ROOM_KIND', 'bathroom', 'Bathroom', true, 2),
('a1100001-0001-4000-8000-000000000243', 'a1000001-0001-4000-8000-000000000003', 'ROOM_KIND', 'kitchen', 'Kitchen', true, 3),
('a1100001-0001-4000-8000-000000000244', 'a1000001-0001-4000-8000-000000000003', 'ROOM_KIND', 'living', 'Living / Lounge', true, 4),
('a1100001-0001-4000-8000-000000000245', 'a1000001-0001-4000-8000-000000000003', 'ROOM_KIND', 'other', 'Other', true, 5);

-- =============================================================================
-- Permissions (optional RBAC)
-- =============================================================================
INSERT INTO permissions (id, code, description) VALUES
('ab000001-0001-4000-8000-000000000001', 'platform.manage', 'Manage all clients'),
('ab000001-0001-4000-8000-000000000002', 'client.manage', 'Manage client settings'),
('ab000001-0001-4000-8000-000000000003', 'users.manage', 'Invite and manage users'),
('ab000001-0001-4000-8000-000000000004', 'buildings.manage', 'Create/edit buildings'),
('ab000001-0001-4000-8000-000000000005', 'units.manage', 'Create/edit units'),
('ab000001-0001-4000-8000-000000000006', 'assets.manage', 'Manage internal assets'),
('ab000001-0001-4000-8000-000000000007', 'applications.review', 'Review applications'),
('ab000001-0001-4000-8000-000000000008', 'bookings.manage', 'Manage viewings'),
('ab000001-0001-4000-8000-000000000009', 'leases.manage', 'Manage leases'),
('ab000001-0001-4000-8000-000000000010', 'tickets.manage', 'Manage maintenance'),
('ab000001-0001-4000-8000-000000000011', 'portal.landlord', 'Landlord portal'),
('ab000001-0001-4000-8000-000000000012', 'portal.tenant', 'Tenant / applicant portal');

INSERT INTO role_permissions (role, permission_id)
SELECT 'SUPER_ADMIN', id FROM permissions
UNION ALL
SELECT 'AGENCY_ADMIN', id FROM permissions WHERE code <> 'platform.manage'
UNION ALL
SELECT 'AGENT_ADMIN', id FROM permissions WHERE code IN (
  'buildings.manage','units.manage','assets.manage','applications.review',
  'bookings.manage','leases.manage','tickets.manage','users.manage'
)
UNION ALL
SELECT 'GROUND_AGENT', id FROM permissions WHERE code IN (
  'units.manage','assets.manage','applications.review','bookings.manage','tickets.manage'
)
UNION ALL
SELECT 'LANDLORD', id FROM permissions WHERE code IN ('portal.landlord','tickets.manage')
UNION ALL
SELECT 'END_USER', id FROM permissions WHERE code IN ('portal.tenant','bookings.manage')
UNION ALL
SELECT 'CONTRACTOR', id FROM permissions WHERE code IN ('tickets.manage');

-- =============================================================================
-- Users
-- =============================================================================
INSERT INTO users (id, client_id, email, password_hash, first_name, last_name, phone, role, active) VALUES
-- Platform
('a2000001-0001-4000-8000-000000000001', NULL,
 'sambampo200@gmail.com', '$2b$10$JX.s61pusUiz2t3Qd74Bge4x0lcrELBAHU4SczXEKjsMaFX2sC3o6', 'Samuel', 'Admin', '+27 82 000 0001', 'SUPER_ADMIN', true),

-- Horizon Realty staff
('a2000001-0001-4000-8000-000000000002', 'a1000001-0001-4000-8000-000000000001',
 'amelia@horizonrealty.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Amelia', 'Roux', '+27 82 111 0100', 'AGENCY_ADMIN', true),
('a2000001-0001-4000-8000-000000000003', 'a1000001-0001-4000-8000-000000000001',
 'lerato@horizonrealty.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Lerato', 'Nkosi', '+27 82 111 0101', 'AGENT_ADMIN', true),
('a2000001-0001-4000-8000-000000000004', 'a1000001-0001-4000-8000-000000000001',
 'james@horizonrealty.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'James', 'Okonkwo', '+27 82 111 0102', 'GROUND_AGENT', true),
('a2000001-0001-4000-8000-000000000005', 'a1000001-0001-4000-8000-000000000001',
 'priya@horizonrealty.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Priya', 'Naidoo', '+27 82 111 0103', 'GROUND_AGENT', true),

-- Horizon landlords
('a2000001-0001-4000-8000-000000000006', 'a1000001-0001-4000-8000-000000000001',
 'jvdberg@email.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Johan', 'van der Berg', '+27 82 222 3344', 'LANDLORD', true),
('a2000001-0001-4000-8000-000000000007', 'a1000001-0001-4000-8000-000000000001',
 'trust@owners.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Horizon', 'Trust', '+27 11 555 0199', 'LANDLORD', true),

-- Horizon tenant + applicants
('a2000001-0001-4000-8000-000000000008', 'a1000001-0001-4000-8000-000000000001',
 'lucas@email.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Lucas', 'Pretorius', '+27 82 100 2000', 'END_USER', true),
('a2000001-0001-4000-8000-000000000009', 'a1000001-0001-4000-8000-000000000001',
 'nomsa.d@email.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Nomsa', 'Dlamini', '+27 71 883 1102', 'END_USER', true),
('a2000001-0001-4000-8000-000000000010', 'a1000001-0001-4000-8000-000000000001',
 'fatima.j@email.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Fatima', 'Jacobs', '+27 84 112 7788', 'END_USER', true),

-- Cape Coastal
('a2000001-0001-4000-8000-000000000011', 'a1000001-0001-4000-8000-000000000002',
 'sipho@capecoastal.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Sipho', 'Molefe', '+27 82 333 0200', 'AGENCY_ADMIN', true),
('a2000001-0001-4000-8000-000000000012', 'a1000001-0001-4000-8000-000000000002',
 'anya@capecoastal.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Anya', 'Botha', '+27 82 333 0201', 'GROUND_AGENT', true),
('a2000001-0001-4000-8000-000000000013', 'a1000001-0001-4000-8000-000000000002',
 'sea@owners.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Seaview', 'Investments', '+27 21 555 0299', 'LANDLORD', true),
('a2000001-0001-4000-8000-000000000014', 'a1000001-0001-4000-8000-000000000002',
 'm.khan@email.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Maryam', 'Khan', '+27 72 444 5566', 'LANDLORD', true),
-- Horizon preferred vendor
('a2000001-0001-4000-8000-000000000015', 'a1000001-0001-4000-8000-000000000001',
 'jobs@aquafix.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'AquaFix', 'Plumbing', '+27 11 555 0400', 'CONTRACTOR', true),

-- Cape Coastal — month-sim staff + tenant + contractor
('a2000001-0001-4000-8000-000000000016', 'a1000001-0001-4000-8000-000000000002',
 'zane@capecoastal.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Zane', 'Petersen', '+27 82 333 0202', 'AGENT_ADMIN', true),
('a2000001-0001-4000-8000-000000000017', 'a1000001-0001-4000-8000-000000000002',
 'theo@capecoastal.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Theo', 'Jacobs', '+27 82 333 0203', 'GROUND_AGENT', true),
('a2000001-0001-4000-8000-000000000018', 'a1000001-0001-4000-8000-000000000002',
 'nandi@capecoastal.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Nandi', 'Bekker', '+27 82 333 0204', 'AGENT_ADMIN', true),
('a2000001-0001-4000-8000-000000000019', 'a1000001-0001-4000-8000-000000000002',
 'aya@email.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Aya', 'Daniels', '+27 72 880 1100', 'END_USER', true),
('a2000001-0001-4000-8000-000000000020', 'a1000001-0001-4000-8000-000000000002',
 'jobs@bayfix.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Bay', 'Fix', '+27 21 555 0440', 'CONTRACTOR', true),

-- Garden Route Homes
('a2000001-0001-4000-8000-000000000021', 'a1000001-0001-4000-8000-000000000003',
 'gita@gardenroutehomes.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Gita', 'Naidoo', '+27 44 555 0301', 'AGENCY_ADMIN', true),
('a2000001-0001-4000-8000-000000000022', 'a1000001-0001-4000-8000-000000000003',
 'leigh@gardenroutehomes.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Leigh', 'Botha', '+27 44 555 0302', 'GROUND_AGENT', true),
('a2000001-0001-4000-8000-000000000023', 'a1000001-0001-4000-8000-000000000003',
 'owners@gardenroutehomes.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Garden', 'Trust', '+27 44 555 0399', 'LANDLORD', true),
('a2000001-0001-4000-8000-000000000024', 'a1000001-0001-4000-8000-000000000003',
 'mia@email.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Mia', 'Fortuin', '+27 82 700 3344', 'END_USER', true),
('a2000001-0001-4000-8000-000000000025', 'a1000001-0001-4000-8000-000000000003',
 'jobs@coastalfix.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Coastal', 'Fix', '+27 44 555 0410', 'CONTRACTOR', true);

-- =============================================================================
-- CLIENT 1 — Horizon buildings / units / rooms / assets
-- =============================================================================

-- Building 1: Walmer Estate Home (standalone house, Grade A, solar + borehole)
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Walmer Estate Home',
  '14 Heugh Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Walmer',
  'A',
  5.50,
  true,
  -33.9752000,
  25.5804000,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200"]'::jsonb
);

-- Whole house as one unit
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000001',
  'a3000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'HOUSE',
  210.00, 3, 2.0, 2,
  'SALE', 2350000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Modern 3-bed family home — Walmer',
  'Spacious standalone house with solar (5.5 kW), borehole, open-plan living and garden. Ideal for Walmer / Greenacres professionals.',
  '["fibre","solar","borehole","alarm","garden","pool"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200"]'::jsonb,
  true, -33.9752000, 25.5804000
);

-- Rooms with floor-plan layout coords (0–100)
INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, baths, area_sqm, layout_x, layout_y, layout_w, layout_h, sort_order) VALUES
('a5000001-0001-4000-8000-000000000001', 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Master', 'bedroom', 1, 1.0, 28.00, 5, 5, 35, 30, 1),
('a5000001-0001-4000-8000-000000000002', 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Bed2', 'bedroom', 1, 0, 16.00, 45, 5, 25, 25, 2),
('a5000001-0001-4000-8000-000000000003', 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Bed3', 'bedroom', 1, 0, 14.00, 75, 5, 20, 25, 3),
('a5000001-0001-4000-8000-000000000004', 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Kitchen', 'kitchen', 0, 0, 18.00, 5, 45, 30, 25, 4),
('a5000001-0001-4000-8000-000000000005', 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Lounge', 'living', 0, 0, 42.00, 40, 40, 55, 35, 5),
('a5000001-0001-4000-8000-000000000006', 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Bathroom', 'bathroom', 0, 1.0, 8.00, 5, 75, 20, 20, 6);

-- Internal assets (Walmer)
INSERT INTO internal_assets (
  id, room_id, unit_id, client_id, item_name, serial_number, asset_type_key,
  condition_status, brand, purchase_value, last_inspected_at
) VALUES
('a6000001-0001-4000-8000-000000000001', 'a5000001-0001-4000-8000-000000000004',
 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Fridge freezer', 'SM-RF28-HZN01', 'APPLIANCE', 'EXCELLENT', 'Samsung', 18999.00, '2026-06-15 10:00:00+02'),
('a6000001-0001-4000-8000-000000000002', 'a5000001-0001-4000-8000-000000000004',
 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Washing machine', 'DF-WM-8821', 'APPLIANCE', 'GOOD', 'Defy', 7499.00, '2026-06-15 10:00:00+02'),
('a6000001-0001-4000-8000-000000000003', 'a5000001-0001-4000-8000-000000000004',
 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Microwave', 'HS-MW20-001', 'APPLIANCE', 'FAIR', 'Hisense', 1899.00, '2026-06-15 10:00:00+02'),
('a6000001-0001-4000-8000-000000000004', 'a5000001-0001-4000-8000-000000000005',
 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Smart TV 55"', 'HS-TV55-778', 'ELECTRONICS', 'GOOD', 'Hisense', 8999.00, '2026-06-15 10:00:00+02'),
('a6000001-0001-4000-8000-000000000005', 'a5000001-0001-4000-8000-000000000001',
 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Double bed (master)', NULL, 'FURNITURE', 'GOOD', 'Coricraft', 6500.00, '2026-06-15 10:00:00+02'),
('a6000001-0001-4000-8000-000000000006', 'a5000001-0001-4000-8000-000000000002',
 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Double bed (bed 2)', NULL, 'FURNITURE', 'GOOD', 'Coricraft', 5500.00, '2026-06-15 10:00:00+02'),
('a6000001-0001-4000-8000-000000000007', 'a5000001-0001-4000-8000-000000000005',
 'a4000001-0001-4000-8000-000000000001', 'a1000001-0001-4000-8000-000000000001',
 'Lounge couch set', NULL, 'FURNITURE', 'EXCELLENT', 'Coricraft', 18900.00, '2026-06-15 10:00:00+02');

-- Building 2: Beachview Towers Humewood (Grade P, solar)
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Beachview Towers Humewood',
  'Beach Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Humewood',
  'P',
  48.00,
  false,
  -33.9781000,
  25.6452000,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200"]'::jsonb
);

INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES
(
  'a4000001-0001-4000-8000-000000000002',
  'a3000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'B12', 98.00, 2, 2.0, 1,
  'RENT', NULL, 12500.00, 'OCCUPIED',
  'a2000001-0001-4000-8000-000000000004',
  'Beachview Towers B12 — 2-bed rental',
  'Bright Humewood apartment with balcony sea glimpses, covered parking and fibre. Currently leased.',
  '["fibre","balcony","aircon","secure_parking","gym"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200"]'::jsonb,
  true, -33.9781000, 25.6452000
),
(
  'a4000001-0001-4000-8000-000000000003',
  'a3000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'B14', 102.00, 2, 2.0, 1,
  'RENT', NULL, 11800.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000005',
  'Beachview Towers B14 — 2-bed rental',
  'Corner unit with coastal views. Available for immediate occupation.',
  '["fibre","balcony","aircon","secure_parking","concierge"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200"]'::jsonb,
  false, -33.9781500, 25.6452500
);

-- B12 rooms + assets
INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, baths, area_sqm, layout_x, layout_y, layout_w, layout_h, sort_order) VALUES
('a5000001-0001-4000-8000-000000000011', 'a4000001-0001-4000-8000-000000000002', 'a1000001-0001-4000-8000-000000000001',
 'Bedroom 1', 'bedroom', 1, 1.0, 14.00, 5, 5, 40, 40, 1),
('a5000001-0001-4000-8000-000000000012', 'a4000001-0001-4000-8000-000000000002', 'a1000001-0001-4000-8000-000000000001',
 'Bedroom 2', 'bedroom', 1, 0, 12.00, 50, 5, 45, 35, 2),
('a5000001-0001-4000-8000-000000000013', 'a4000001-0001-4000-8000-000000000002', 'a1000001-0001-4000-8000-000000000001',
 'Kitchen', 'kitchen', 0, 0, 10.00, 5, 50, 35, 30, 3),
('a5000001-0001-4000-8000-000000000014', 'a4000001-0001-4000-8000-000000000002', 'a1000001-0001-4000-8000-000000000001',
 'Lounge', 'living', 0, 0, 22.00, 45, 50, 50, 40, 4);

INSERT INTO internal_assets (id, room_id, unit_id, client_id, item_name, serial_number, asset_type_key, condition_status, brand, purchase_value, warranty_expires_at, last_inspected_at) VALUES
('a6000001-0001-4000-8000-000000000011', 'a5000001-0001-4000-8000-000000000013',
 'a4000001-0001-4000-8000-000000000002', 'a1000001-0001-4000-8000-000000000001',
 'Fridge', 'LG-RF-B12', 'APPLIANCE', 'GOOD', 'LG', 12999.00, NULL, '2026-05-20 09:00:00+02'),
('a6000001-0001-4000-8000-000000000012', 'a5000001-0001-4000-8000-000000000013',
 'a4000001-0001-4000-8000-000000000002', 'a1000001-0001-4000-8000-000000000001',
 'Microwave', 'SM-MW-B12', 'APPLIANCE', 'DAMAGED', 'Samsung', 2199.00, '2027-12-31 23:59:59+02', '2026-07-10 09:00:00+02'),
('a6000001-0001-4000-8000-000000000013', 'a5000001-0001-4000-8000-000000000014',
 'a4000001-0001-4000-8000-000000000002', 'a1000001-0001-4000-8000-000000000001',
 'TV 43"', 'SNY-43-B12', 'ELECTRONICS', 'GOOD', 'Sony', 7999.00, NULL, '2026-05-20 09:00:00+02');

-- B14 rooms + assets
INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, baths, area_sqm, layout_x, layout_y, layout_w, layout_h, sort_order) VALUES
('a5000001-0001-4000-8000-000000000021', 'a4000001-0001-4000-8000-000000000003', 'a1000001-0001-4000-8000-000000000001',
 'Bedroom 1', 'bedroom', 1, 1.0, 15.00, 5, 5, 40, 40, 1),
('a5000001-0001-4000-8000-000000000022', 'a4000001-0001-4000-8000-000000000003', 'a1000001-0001-4000-8000-000000000001',
 'Bedroom 2', 'bedroom', 1, 0, 13.00, 50, 5, 45, 35, 2),
('a5000001-0001-4000-8000-000000000023', 'a4000001-0001-4000-8000-000000000003', 'a1000001-0001-4000-8000-000000000001',
 'Kitchen', 'kitchen', 0, 0, 11.00, 5, 50, 35, 30, 3);

INSERT INTO internal_assets (id, room_id, unit_id, client_id, item_name, serial_number, asset_type_key, condition_status, brand, purchase_value, last_inspected_at) VALUES
('a6000001-0001-4000-8000-000000000021', 'a5000001-0001-4000-8000-000000000023',
 'a4000001-0001-4000-8000-000000000003', 'a1000001-0001-4000-8000-000000000001',
 'Fridge', 'BSH-RF-B14', 'APPLIANCE', 'EXCELLENT', 'Bosch', 15999.00, '2026-07-01 09:00:00+02'),
('a6000001-0001-4000-8000-000000000022', 'a5000001-0001-4000-8000-000000000023',
 'a4000001-0001-4000-8000-000000000003', 'a1000001-0001-4000-8000-000000000001',
 'Dishwasher', 'BSH-DW-B14', 'APPLIANCE', 'GOOD', 'Bosch', 8999.00, '2026-07-01 09:00:00+02');

-- Building 3: Park Lane Mews Mill Park — Unit 7
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Park Lane Mews Mill Park',
  '7 Park Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Mill Park',
  'B',
  12.00,
  false,
  -33.9601000,
  25.6002000,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200"]'::jsonb
);

INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000004',
  'a3000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000001',
  '7', 115.00, 2, 1.5, 1,
  'BOTH', 1750000.00, 13500.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000005',
  'Park Lane Mews Unit 7 — townhouse',
  'Low-maintenance 2-bed townhouse with courtyard, near Mill Park schools and the PE CBD.',
  '["fibre","courtyard","pet_friendly","garage"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200"]'::jsonb,
  false, -33.9601000, 25.6002000
);

INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, baths, area_sqm, layout_x, layout_y, layout_w, layout_h, sort_order) VALUES
('a5000001-0001-4000-8000-000000000031', 'a4000001-0001-4000-8000-000000000004', 'a1000001-0001-4000-8000-000000000001',
 'Master', 'bedroom', 1, 1.0, 16.00, 5, 5, 45, 40, 1),
('a5000001-0001-4000-8000-000000000032', 'a4000001-0001-4000-8000-000000000004', 'a1000001-0001-4000-8000-000000000001',
 'Bedroom 2', 'bedroom', 1, 0, 12.00, 55, 5, 40, 35, 2),
('a5000001-0001-4000-8000-000000000033', 'a4000001-0001-4000-8000-000000000004', 'a1000001-0001-4000-8000-000000000001',
 'Kitchen', 'kitchen', 0, 0, 9.00, 5, 50, 30, 25, 3),
('a5000001-0001-4000-8000-000000000034', 'a4000001-0001-4000-8000-000000000004', 'a1000001-0001-4000-8000-000000000001',
 'Lounge', 'living', 0, 0, 20.00, 40, 50, 55, 40, 4);

-- =============================================================================
-- CLIENT 2 — Algoa Bay Estates
-- =============================================================================

-- Newton Park office suite building
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'Cape Road Business Park',
  'Cape Road',
  'Port Elizabeth',
  'Eastern Cape',
  'Newton Park',
  'P',
  80.00,
  false,
  -33.9451000,
  25.5702000,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200"]'::jsonb
);

INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000005',
  'a3000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000002',
  'Suite 402', 86.00, 0, 1.0, 2,
  'RENT', NULL, 28500.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000012',
  'Newton Park Suite 402 — furnished office',
  'Cape Road commercial suite with boardroom nook, fibre and two basement bays.',
  '["fibre","aircon","secure_parking","generator"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200"]'::jsonb,
  true, -33.9451000, 25.5702000
);

INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, baths, area_sqm, layout_x, layout_y, layout_w, layout_h, sort_order) VALUES
('a5000001-0001-4000-8000-000000000041', 'a4000001-0001-4000-8000-000000000005', 'a1000001-0001-4000-8000-000000000002',
 'Open plan office', 'other', 0, 0, 60.00, 5, 5, 70, 55, 1),
('a5000001-0001-4000-8000-000000000042', 'a4000001-0001-4000-8000-000000000005', 'a1000001-0001-4000-8000-000000000002',
 'Kitchenette', 'kitchen', 0, 0, 8.00, 5, 70, 25, 25, 2),
('a5000001-0001-4000-8000-000000000043', 'a4000001-0001-4000-8000-000000000005', 'a1000001-0001-4000-8000-000000000002',
 'Bathroom', 'bathroom', 0, 1.0, 6.00, 40, 70, 20, 25, 3);

INSERT INTO internal_assets (id, room_id, unit_id, client_id, item_name, serial_number, asset_type_key, condition_status, brand, purchase_value, last_inspected_at) VALUES
('a6000001-0001-4000-8000-000000000031', 'a5000001-0001-4000-8000-000000000042',
 'a4000001-0001-4000-8000-000000000005', 'a1000001-0001-4000-8000-000000000002',
 'Coffee machine', 'NES-CT-402', 'APPLIANCE', 'GOOD', 'Nespresso', 4500.00, '2026-07-05 10:00:00+02'),
('a6000001-0001-4000-8000-000000000032', 'a5000001-0001-4000-8000-000000000041',
 'a4000001-0001-4000-8000-000000000005', 'a1000001-0001-4000-8000-000000000002',
 'Conference display', 'SNY-75-402', 'ELECTRONICS', 'EXCELLENT', 'Sony', 22000.00, '2026-07-05 10:00:00+02');

-- Mount Pleasant house
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000014',
  'Circular Drive Mount Pleasant',
  '9 Circular Drive',
  'Port Elizabeth',
  'Eastern Cape',
  'Mount Pleasant',
  'A',
  8.00,
  true,
  -33.9680000,
  25.5500000,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200"]'::jsonb
);

INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  'a4000001-0001-4000-8000-000000000006',
  'a3000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000002',
  'MAIN', 285.00, 4, 3.0, 2,
  'SALE', 2850000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000012',
  'Mount Pleasant family home',
  'Four-bed home with solar, borehole and established garden.',
  '["solar","borehole","garden","pool","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200"]'::jsonb,
  true, -33.9680000, 25.5500000
);

INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, baths, area_sqm, layout_x, layout_y, layout_w, layout_h, sort_order) VALUES
('a5000001-0001-4000-8000-000000000051', 'a4000001-0001-4000-8000-000000000006', 'a1000001-0001-4000-8000-000000000002',
 'Master', 'bedroom', 1, 1.0, 32.00, 5, 5, 40, 35, 1),
('a5000001-0001-4000-8000-000000000052', 'a4000001-0001-4000-8000-000000000006', 'a1000001-0001-4000-8000-000000000002',
 'Kitchen', 'kitchen', 0, 0, 22.00, 5, 50, 35, 30, 2),
('a5000001-0001-4000-8000-000000000053', 'a4000001-0001-4000-8000-000000000006', 'a1000001-0001-4000-8000-000000000002',
 'Lounge', 'living', 0, 0, 48.00, 45, 40, 50, 45, 3);

-- Richmond Hill flat (Aya Daniels tenancy — month sim PR-1010)
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, place_id, formatted_address, geocoded_at, images
) VALUES (
  'a3000001-0001-4000-8000-000000000006',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000014',
  'Hillcrest Court Richmond Hill',
  '3C Hillcrest Court',
  'Port Elizabeth',
  'Eastern Cape',
  'Richmond Hill',
  'B',
  0,
  false,
  -33.9620000,
  25.6080000,
  'ChIJrichmondhill000000001',
  '3C Hillcrest Court, Richmond Hill, Port Elizabeth, South Africa',
  '2026-06-15 10:00:00+02',
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200"]'::jsonb
);

INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured,
  lat, lng, place_id, formatted_address, geocoded_at
) VALUES (
  'a4000001-0001-4000-8000-000000000007',
  'a3000001-0001-4000-8000-000000000006',
  'a1000001-0001-4000-8000-000000000002',
  '3C', 68.00, 1, 1.0, 1,
  'RENT', NULL, 9500.00, 'OCCUPIED',
  'a2000001-0001-4000-8000-000000000017',
  'Richmond Hill Hillcrest Court 3C',
  'Bright 1-bed flat near the CBD — currently leased to Aya Daniels.',
  '["fibre","balcony","secure_parking"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200"]'::jsonb,
  true, -33.9620000, 25.6080000,
  'ChIJrichmondhill000000001',
  '3C Hillcrest Court, Richmond Hill, Port Elizabeth, South Africa',
  '2026-06-15 10:00:00+02'
);

-- Framesby cottage (Bayview — month sim PR-1011)
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, place_id, formatted_address, geocoded_at, images
) VALUES (
  'a3000001-0001-4000-8000-000000000007',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000023',
  'Protea Lane Cottage',
  '22 Protea Lane',
  'Port Elizabeth',
  'Eastern Cape',
  'Framesby',
  'B',
  3.20,
  false,
  -33.9720000,
  25.5450000,
  'ChIJframesby0000000000001',
  '22 Protea Lane, Framesby, Port Elizabeth, South Africa',
  '2026-06-20 10:00:00+02',
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200"]'::jsonb
);

INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured,
  lat, lng, place_id, formatted_address, geocoded_at
) VALUES (
  'a4000001-0001-4000-8000-000000000008',
  'a3000001-0001-4000-8000-000000000007',
  'a1000001-0001-4000-8000-000000000003',
  'MAIN', 95.00, 2, 1.0, 1,
  'BOTH', 2150000.00, 14500.00, 'OCCUPIED',
  'a2000001-0001-4000-8000-000000000022',
  'Framesby cottage — Protea Lane',
  'Charming 2-bed cottage near Charlo. Leased to Mia; purchase interest from Sarie.',
  '["fibre","garden","pet_friendly","solar"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200"]'::jsonb,
  true, -33.9720000, 25.5450000,
  'ChIJframesby0000000000001',
  '22 Protea Lane, Framesby, Port Elizabeth, South Africa',
  '2026-06-20 10:00:00+02'
);

INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, baths, area_sqm, layout_x, layout_y, layout_w, layout_h, sort_order) VALUES
('a5000001-0001-4000-8000-000000000061', 'a4000001-0001-4000-8000-000000000008', 'a1000001-0001-4000-8000-000000000003',
 'Master', 'bedroom', 1, 1.0, 14.00, 5, 5, 45, 40, 1),
('a5000001-0001-4000-8000-000000000062', 'a4000001-0001-4000-8000-000000000008', 'a1000001-0001-4000-8000-000000000003',
 'Bedroom 2', 'bedroom', 1, 0, 11.00, 55, 5, 40, 35, 2),
('a5000001-0001-4000-8000-000000000063', 'a4000001-0001-4000-8000-000000000008', 'a1000001-0001-4000-8000-000000000003',
 'Kitchen', 'kitchen', 0, 0, 10.00, 5, 50, 40, 30, 3);

-- =============================================================================
-- Applications, bookings, leases, tickets
-- =============================================================================

INSERT INTO applications (
  id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type,
  status, monthly_income, employment_summary, message, move_in_date, submitted_at
) VALUES
-- Nomsa applying to buy Walmer house
(
  'a7000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000009',
  'a2000001-0001-4000-8000-000000000004',
  'APP-HZ-901', 'PURCHASE', 'UNDER_REVIEW',
  85000.00, 'Absa — Senior Analyst', 'Prefers north-facing garden.', NULL,
  '2026-07-21 11:00:00+02'
),
-- Fatima applying for B14
(
  'a7000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000010',
  'a2000001-0001-4000-8000-000000000005',
  'APP-HZ-902', 'RENTAL', 'CREDIT_CHECK',
  48000.00, 'Deloitte — Consultant', NULL, '2026-08-01',
  '2026-07-19 09:00:00+02'
),
-- Lucas (tenant) — original B12 application now leased
(
  'a7000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000008',
  'a2000001-0001-4000-8000-000000000004',
  'APP-HZ-903', 'RENTAL', 'LEASED',
  42000.00, 'Pick n Pay — Retail manager', NULL, '2026-06-01',
  '2026-05-10 10:00:00+02'
),
-- Month sim: Riaan Botha — Summerstrand student (APP-904)
(
  'a7000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000006',
  NULL,
  'a2000001-0001-4000-8000-000000000016',
  'APP-904', 'RENTAL', 'SUBMITTED',
  52000.00, 'NMU — Lecturer', 'Summerstrand student block enquiry.', NULL,
  '2026-07-08 10:00:00+02'
),
-- Month sim: Sarie du Plessis — Framesby purchase (APP-905)
(
  'a7000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  NULL,
  'a2000001-0001-4000-8000-000000000022',
  'APP-905', 'PURCHASE', 'CREDIT_CHECK',
  95000.00, 'Self-employed — tourism', 'Bond application with Absa.', NULL,
  '2026-07-12 15:00:00+02'
);

INSERT INTO leases (
  id, client_id, unit_id, application_id, tenant_id, landlord_id, agent_id,
  lease_reference, status, start_date, end_date, rent_amount, deposit_amount, rent_due_day, metadata
) VALUES
(
  'a8000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000002',
  'a7000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000008',
  'a2000001-0001-4000-8000-000000000007',
  'a2000001-0001-4000-8000-000000000004',
  'HZ-LS-B12',
  'ACTIVE',
  '2026-06-01',
  '2026-12-31',
  12500.00,
  25000.00,
  1,
  '{"keyCollection":"Horizon Walmer office","notes":"Semi-furnished","frontendId":"TN-1"}'::jsonb
),
(
  'a8000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000007',
  NULL,
  'a2000001-0001-4000-8000-000000000019',
  'a2000001-0001-4000-8000-000000000014',
  'a2000001-0001-4000-8000-000000000017',
  'CC-LS-3C',
  'ACTIVE',
  '2026-04-01',
  '2027-03-31',
  9500.00,
  19000.00,
  1,
  '{"frontendId":"TN-2"}'::jsonb
),
(
  'a8000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  NULL,
  'a2000001-0001-4000-8000-000000000024',
  'a2000001-0001-4000-8000-000000000023',
  'a2000001-0001-4000-8000-000000000022',
  'GR-LS-PROT',
  'ACTIVE',
  '2026-05-15',
  '2027-05-14',
  14500.00,
  29000.00,
  1,
  '{"frontendId":"TN-3"}'::jsonb
);

-- Viewing slots (capacity UI) — VS-1..3 match src/data/seed.ts; VS-4..6 match monthSimulation.ts
INSERT INTO viewing_slots (
  id, client_id, unit_id, agent_id,
  slot_date, slot_time, capacity, booked_count, status, title, notes, duration_minutes
) VALUES
(
  'c1000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000004',
  '2026-07-25', '10:00', 4, 1, 'OPEN',
  'Morning open house', 'Meet at lobby reception. Bring ID.', 45
),
(
  'c1000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000004',
  '2026-07-25', '14:00', 3, 0, 'OPEN',
  'Afternoon walkthrough', NULL, 30
),
(
  'c1000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000003',
  '2026-07-26', '11:00', 2, 0, 'OPEN',
  'Family viewing', NULL, 40
),
-- Month-sim slots (VS-4..6)
(
  'c1000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  'a2000001-0001-4000-8000-000000000022',
  '2026-07-12', '09:30', 2, 1, 'OPEN',
  'Framesby cottage private viewing', NULL, 40
),
(
  'c1000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000007',
  'a2000001-0001-4000-8000-000000000017',
  '2026-07-20', '16:00', 3, 1, 'OPEN',
  'Richmond Hill evening slot', NULL, 30
),
(
  'c1000001-0001-4000-8000-000000000006',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000004',
  'a2000001-0001-4000-8000-000000000005',
  '2026-07-28', '11:00', 2, 1, 'OPEN',
  'Oxford townhouse — supervised', 'Mentor James attending.', 45
);

INSERT INTO bookings (
  id, client_id, unit_id, slot_id, agent_id, applicant_id,
  visitor_name, visitor_email, visitor_phone, starts_at, ends_at, status, interest_level, feedback, notes
) VALUES
(
  'a9000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000003',
  NULL,
  'a2000001-0001-4000-8000-000000000005',
  'a2000001-0001-4000-8000-000000000010',
  'Fatima Jacobs', 'fatima.j@email.com', '+27 84 112 7788',
  '2026-07-25 10:00:00+02', '2026-07-25 10:30:00+02',
  'SCHEDULED', 'UNKNOWN', NULL, NULL
),
(
  'a9000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000001',
  NULL,
  'a2000001-0001-4000-8000-000000000004',
  'a2000001-0001-4000-8000-000000000009',
  'Nomsa Dlamini', 'nomsa.d@email.com', '+27 71 883 1102',
  '2026-07-21 15:30:00+02', '2026-07-21 16:15:00+02',
  'COMPLETED', 'HIGH', 'Loved the solar + borehole setup. Will proceed with offer.', NULL
),
(
  'a9000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000005',
  NULL,
  'a2000001-0001-4000-8000-000000000012',
  NULL,
  'Thabo Molefe', 'thabo.m@email.com', '+27 82 441 2290',
  '2026-07-27 09:30:00+02', '2026-07-27 10:00:00+02',
  'SCHEDULED', 'UNKNOWN', NULL, NULL
),
-- Month sim viewings
(
  'a9000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000002',
  'c1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000004',
  'a2000001-0001-4000-8000-000000000010',
  'Fatima Jacobs', 'fatima.j@email.com', NULL,
  '2026-06-30 10:00:00+02', '2026-06-30 10:45:00+02',
  'COMPLETED', 'HIGH', 'Applied after viewing.', NULL
),
(
  'a9000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  'c1000001-0001-4000-8000-000000000004',
  'a2000001-0001-4000-8000-000000000022',
  NULL,
  'Sarie du Plessis', 'sarie.dp@email.com', '+27 44 555 9911',
  '2026-07-12 09:30:00+02', '2026-07-12 10:10:00+02',
  'COMPLETED', 'HIGH', 'Wants to proceed with offer.', NULL
),
(
  'a9000001-0001-4000-8000-000000000006',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000007',
  'c1000001-0001-4000-8000-000000000005',
  'a2000001-0001-4000-8000-000000000017',
  NULL,
  'Johan Steyn', 'j.steyn@email.com', '+27 84 900 1122',
  '2026-07-20 16:00:00+02', '2026-07-20 16:30:00+02',
  'COMPLETED', 'MEDIUM', NULL, NULL
),
(
  'a9000001-0001-4000-8000-000000000007',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000004',
  'c1000001-0001-4000-8000-000000000006',
  'a2000001-0001-4000-8000-000000000005',
  NULL,
  'Kabelo Mokoena', 'kabelo.m@email.com', '+27 83 221 0091',
  '2026-07-28 11:00:00+02', '2026-07-28 11:45:00+02',
  'SCHEDULED', 'UNKNOWN', NULL, 'Mentor James attending.'
),
(
  'a9000001-0001-4000-8000-000000000008',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000005',
  NULL,
  'a2000001-0001-4000-8000-000000000016',
  NULL,
  'Elena Costa', 'elena.costa@email.com', '+27 72 555 8810',
  '2026-07-05 14:00:00+02', '2026-07-05 14:30:00+02',
  'NO_SHOW', 'UNKNOWN', NULL, 'Reschedule requested via WhatsApp.'
);

-- Vendor category routing (agency preferred contractors)
INSERT INTO vendor_category_routes (id, client_id, category_key, contractor_user_id, is_active) VALUES
(
  'ae000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'APPLIANCE_FAILURE',
  'a2000001-0001-4000-8000-000000000015',
  true
),
(
  'ae000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'PLUMBING',
  'a2000001-0001-4000-8000-000000000015',
  true
),
(
  'ae000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000001',
  'ELECTRICAL',
  'a2000001-0001-4000-8000-000000000015',
  true
),
(
  'ae000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000001',
  'APPLIANCE',
  'a2000001-0001-4000-8000-000000000015',
  true
);

-- Maintenance: microwave in B12 (Lucas tenant)
INSERT INTO maintenance_tickets (
  id, client_id, unit_id, lease_id, asset_id, reported_by, assigned_to, contractor_id,
  category_key, title, description, priority, status, warranty_covered, sla_due_at, cost_estimate, photos
) VALUES (
  'aa000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000002',
  'a8000001-0001-4000-8000-000000000001',
  'a6000001-0001-4000-8000-000000000012',
  'a2000001-0001-4000-8000-000000000008',
  'a2000001-0001-4000-8000-000000000004',
  'a2000001-0001-4000-8000-000000000015',
  'APPLIANCE_FAILURE',
  'Microwave not heating — Unit B12',
  'Samsung microwave sparks and trips the kitchen plug. Warranty claim flagged. Routed via vendor_category_routes.',
  'HIGH',
  'IN_PROGRESS',
  true,
  '2026-07-24 17:00:00+02',
  2200.00,
  '[]'::jsonb
);

INSERT INTO maintenance_ticket_updates (id, ticket_id, author_id, body, status_after) VALUES
(
  'aa000001-0001-4000-8000-000000000101',
  'aa000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000004',
  'Ticket triaged. Asset flagged DAMAGED. Ordering replacement microwave.',
  'TRIAGED'
),
(
  'aa000001-0001-4000-8000-000000000102',
  'aa000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000004',
  'Technician booked for Friday morning. Access arranged with Lucas.',
  'IN_PROGRESS'
);

-- Walmer: minor ticket on Hisense microwave (sale listing prep)
INSERT INTO maintenance_tickets (
  id, client_id, unit_id, lease_id, asset_id, reported_by, assigned_to,
  category_key, title, description, priority, status, sla_due_at, cost_estimate
) VALUES (
  'aa000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000001',
  NULL,
  'a6000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000004',
  'a2000001-0001-4000-8000-000000000004',
  'APPLIANCE',
  'Replace ageing Hisense microwave before show day',
  'Condition FAIR — door latch sticky. Replace before Nomsa''s second viewing.',
  'MEDIUM',
  'OPEN',
  '2026-07-26 12:00:00+02',
  1899.00
);

-- Month sim tickets
INSERT INTO maintenance_tickets (
  id, client_id, unit_id, lease_id, asset_id, reported_by, assigned_to, contractor_id,
  category_key, title, description, priority, status, warranty_covered,
  cost_estimate, cost_actual, photos, completed_at, created_at
) VALUES
(
  'aa000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000001',
  NULL,
  NULL,
  'a2000001-0001-4000-8000-000000000006',
  'a2000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000015',
  'PLUMBING',
  'Irrigation valve stuck open',
  'Front garden flooding overnight.',
  'LOW',
  'COMPLETED',
  false,
  920.00,
  920.00,
  '["photo1"]'::jsonb,
  '2026-06-29 15:00:00+02',
  '2026-06-27 09:00:00+02'
),
(
  'aa000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000005',
  NULL,
  NULL,
  'a2000001-0001-4000-8000-000000000011',
  'a2000001-0001-4000-8000-000000000016',
  'a2000001-0001-4000-8000-000000000020',
  'ELECTRICAL',
  'AC not cooling — Newton Park suite',
  'Compressor fault — part ETA 3 days.',
  'URGENT',
  'AWAITING_PARTS',
  true,
  0,
  NULL,
  '["photo1","photo2"]'::jsonb,
  NULL,
  '2026-07-14 07:30:00+02'
),
(
  'aa000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  'a8000001-0001-4000-8000-000000000003',
  NULL,
  'a2000001-0001-4000-8000-000000000024',
  'a2000001-0001-4000-8000-000000000022',
  'a2000001-0001-4000-8000-000000000025',
  'PLUMBING',
  'Slow drain — kitchen',
  'Cleared grease trap.',
  'MEDIUM',
  'COMPLETED',
  false,
  650.00,
  650.00,
  '[]'::jsonb,
  '2026-07-04 11:20:00+02',
  '2026-07-03 18:00:00+02'
);

-- =============================================================================
-- ~30-day month simulation (2026-06-26 → 2026-07-26)
-- Aligns with src/data/monthSimulation.ts
-- UUID prefixes: leads af, payments b4, documents b5, media b6,
--   notifications b7, threads b8, messages b9
-- =============================================================================

INSERT INTO leads (
  id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
  interest_type, value_amount, notes, created_at, updated_at
) VALUES
(
  'af000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000004',
  'a2000001-0001-4000-8000-000000000005',
  'Kabelo Mokoena', 'kabelo.m@email.com', '+27 83 221 0091', 'Property24', 'Qualified',
  'BUY', 4100000.00, 'Cash buyer — wants Oxford townhouse walkthrough. frontendId=LD-2203',
  '2026-06-28 09:00:00+02', '2026-07-05 10:00:00+02'
),
(
  'af000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000005',
  'a2000001-0001-4000-8000-000000000016',
  'Elena Costa', 'elena.costa@email.com', '+27 72 555 8810', 'Referral', 'New',
  'RENT', 28000.00, 'Corporate relocation — V&A office suite interest. frontendId=LD-2204',
  '2026-07-02 10:00:00+02', '2026-07-02 10:00:00+02'
),
(
  'af000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000007',
  'a2000001-0001-4000-8000-000000000017',
  'Johan Steyn', 'j.steyn@email.com', '+27 84 900 1122', 'WhatsApp', 'Viewing Scheduled',
  'RENT', 9500.00, 'Richmond Hill flat — similar to Aya''s unit. frontendId=LD-2205',
  '2026-07-10 09:00:00+02', '2026-07-18 12:00:00+02'
),
(
  'af000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  'a2000001-0001-4000-8000-000000000022',
  'Sarie du Plessis', 'sarie.dp@email.com', '+27 44 555 9911', 'Walk-in', 'Negotiation',
  'BUY', 2150000.00, 'Loves Framesby cottage — bonding pre-approval in progress. frontendId=LD-2206',
  '2026-07-01 11:00:00+02', '2026-07-20 16:00:00+02'
);

INSERT INTO payments (
  id, client_id, unit_id, lease_id, application_id, party_user_id, party_name,
  payment_type, amount, paid_amount, status, due_date, paid_at, method, reference,
  notes, landlord_visible, recorded_by, created_at
) VALUES
(
  'b4000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000002',
  'a8000001-0001-4000-8000-000000000001',
  'a7000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000008',
  'Lucas Pretorius', 'RENT', 12500.00, 12500.00, 'PAID', '2026-06-01',
  '2026-06-01 08:00:00+02', 'Debit order', 'DO-JUN-1002', NULL, true,
  'a2000001-0001-4000-8000-000000000004', '2026-06-01 08:00:00+02'
),
(
  'b4000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000007',
  'a8000001-0001-4000-8000-000000000002',
  NULL,
  'a2000001-0001-4000-8000-000000000019',
  'Aya Daniels', 'RENT', 9500.00, 9500.00, 'PAID', '2026-07-01',
  '2026-07-02 11:00:00+02', 'EFT', 'STD-AYA-0701', NULL, true,
  'a2000001-0001-4000-8000-000000000018', '2026-07-02 11:00:00+02'
),
(
  'b4000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000007',
  'a8000001-0001-4000-8000-000000000002',
  NULL,
  'a2000001-0001-4000-8000-000000000019',
  'Aya Daniels', 'RENT', 9500.00, NULL, 'OVERDUE', '2026-06-01',
  NULL, NULL, NULL, 'June late fee waived after plumbing disruption.', true,
  NULL, '2026-06-01 00:00:00+02'
),
(
  'b4000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  'a8000001-0001-4000-8000-000000000003',
  NULL,
  'a2000001-0001-4000-8000-000000000024',
  'Mia Fortuin', 'RENT', 14500.00, 14500.00, 'PAID', '2026-07-01',
  '2026-06-30 16:00:00+02', 'EFT', 'FNB-MIA-0701', NULL, true,
  'a2000001-0001-4000-8000-000000000022', '2026-06-30 16:00:00+02'
),
(
  'b4000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  'a8000001-0001-4000-8000-000000000003',
  NULL,
  'a2000001-0001-4000-8000-000000000024',
  'Mia Fortuin', 'RENT', 14500.00, NULL, 'DUE', '2026-08-01',
  NULL, NULL, NULL, NULL, true,
  NULL, '2026-07-20 00:00:00+02'
),
(
  'b4000001-0001-4000-8000-000000000006',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000002',
  'a8000001-0001-4000-8000-000000000001',
  'a7000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000008',
  'Lucas Pretorius', 'DEPOSIT', 37000.00, 37000.00, 'PAID', '2026-05-25',
  '2026-05-26 10:00:00+02', 'EFT', 'DEP-LUCAS', NULL, true,
  'a2000001-0001-4000-8000-000000000003', '2026-05-26 10:00:00+02'
);

INSERT INTO documents (
  id, client_id, unit_id, building_id, application_id, lease_id, uploaded_by,
  name, category, status, storage_url, mime_type, note, applicant_name, uploaded_at
) VALUES
(
  'b5000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000002',
  'a3000001-0001-4000-8000-000000000002',
  'a7000001-0001-4000-8000-000000000003',
  'a8000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000004',
  'ID copy — Lucas Pretorius.pdf', 'ID', 'VERIFIED',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf.pdf',
  'application/pdf', NULL, 'Lucas Pretorius', '2026-05-12 10:00:00+02'
),
(
  'b5000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000002',
  'a3000001-0001-4000-8000-000000000002',
  NULL, 'a8000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000004',
  'July rent invoice.pdf', 'INVOICE', 'UPLOADED',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf.pdf',
  'application/pdf', 'Issued to tenant portal', NULL, '2026-07-01 09:00:00+02'
),
(
  'b5000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000007',
  'a3000001-0001-4000-8000-000000000006',
  NULL, 'a8000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000017',
  'Signed lease — Aya Daniels.pdf', 'LEASE', 'VERIFIED',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf.pdf',
  'application/pdf', NULL, 'Aya Daniels', '2026-03-28 12:00:00+02'
),
(
  'b5000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000007',
  'a3000001-0001-4000-8000-000000000006',
  NULL, NULL,
  'a2000001-0001-4000-8000-000000000017',
  'ID copy — Aya Daniels.pdf', 'ID', 'VERIFIED',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf.pdf',
  'application/pdf', NULL, 'Aya Daniels', '2026-03-20 10:00:00+02'
),
(
  'b5000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  'a3000001-0001-4000-8000-000000000007',
  NULL, 'a8000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000022',
  'Signed lease — Mia Fortuin.pdf', 'LEASE', 'VERIFIED',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf.pdf',
  'application/pdf', NULL, 'Mia Fortuin', '2026-05-10 14:00:00+02'
),
(
  'b5000001-0001-4000-8000-000000000006',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  'a3000001-0001-4000-8000-000000000007',
  NULL, NULL,
  'a2000001-0001-4000-8000-000000000022',
  'Electrical COC — Framesby cottage.pdf', 'COMPLIANCE', 'UPLOADED',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf.pdf',
  'application/pdf', NULL, NULL, '2026-07-08 14:00:00+02'
),
(
  'b5000001-0001-4000-8000-000000000007',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000001',
  'a3000001-0001-4000-8000-000000000001',
  NULL, NULL,
  'a2000001-0001-4000-8000-000000000004',
  'Marketing brochure — Walmer.pdf', 'MARKETING', 'UPLOADED',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf.pdf',
  'application/pdf', NULL, NULL, '2026-07-10 11:00:00+02'
),
(
  'b5000001-0001-4000-8000-000000000008',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000001',
  'a3000001-0001-4000-8000-000000000001',
  NULL, NULL,
  'a2000001-0001-4000-8000-000000000003',
  'Title deed — Walmer.pdf', 'TITLE', 'VERIFIED',
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf.pdf',
  'application/pdf', 'Owner pack', NULL, '2026-06-01 09:00:00+02'
);

INSERT INTO media_assets (id, client_id, building_id, unit_id, kind, storage_url, caption, sort_order, is_primary) VALUES
(
  'b6000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a3000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000001',
  'IMAGE',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200',
  'Walmer exterior', 0, true
),
(
  'b6000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000002',
  'a3000001-0001-4000-8000-000000000006',
  'a4000001-0001-4000-8000-000000000007',
  'IMAGE',
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200',
  'Richmond Hill living', 0, true
);

INSERT INTO message_threads (
  id, client_id, unit_id, application_id, subject, routes_to, participant_ids, updated_at, created_at
) VALUES
(
  'b8000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000007',
  NULL,
  'Richmond Hill — leaking tap follow-up',
  'AGENT',
  '["a2000001-0001-4000-8000-000000000019","a2000001-0001-4000-8000-000000000017","a2000001-0001-4000-8000-000000000018"]'::jsonb,
  '2026-07-24 12:00:00+02', '2026-07-24 11:00:00+02'
),
(
  'b8000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000003',
  'a4000001-0001-4000-8000-000000000008',
  NULL,
  'Earth leakage & August rent',
  'AGENT',
  '["a2000001-0001-4000-8000-000000000024","a2000001-0001-4000-8000-000000000022"]'::jsonb,
  '2026-07-23 17:00:00+02', '2026-07-23 16:00:00+02'
);

INSERT INTO messages (id, thread_id, client_id, from_user_id, body, created_at) VALUES
(
  'b9000001-0001-4000-8000-000000000001',
  'b8000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000019',
  'Theo — the cold tap is still dripping after last week. Can BayFix come again?',
  '2026-07-24 11:30:00+02'
),
(
  'b9000001-0001-4000-8000-000000000002',
  'b8000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000017',
  'Logged MT-4403 and assigned BayFix. They will WhatsApp you for access.',
  '2026-07-24 12:00:00+02'
),
(
  'b9000001-0001-4000-8000-000000000003',
  'b8000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000024',
  'Hi Leigh — earth leakage tripped again this morning when the kettle ran.',
  '2026-07-23 16:45:00+02'
),
(
  'b9000001-0001-4000-8000-000000000004',
  'b8000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000022',
  'Coastal Fix is on it (MT-4404). August rent invoice is already on your portal.',
  '2026-07-23 17:00:00+02'
);

INSERT INTO notifications (
  id, client_id, user_id, title, body, link_path, resource_type, action_type, read_at, created_at
) VALUES
(
  'b7000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000011',
  'Lead stage changed',
  'Elena Costa moved to New on Newton Park office enquiry.',
  '/workspace/crm', 'lead', 'updated',
  '2026-07-02 11:00:00+02', '2026-07-02 10:00:00+02'
),
(
  'b7000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000019',
  'Overdue rent notice',
  'June rent is marked Overdue — contact Nandi if you already paid.',
  '/workspace/portals/tenant', 'payment', 'updated',
  NULL, '2026-07-06 08:00:00+02'
),
(
  'b7000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000022',
  'Application submitted',
  'Sarie du Plessis applied to purchase Framesby cottage.',
  '/workspace/properties/PR-1011?tab=applicants', 'applicant', 'created',
  NULL, '2026-07-12 15:00:00+02'
),
(
  'b7000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000016',
  'Parts awaiting — HVAC',
  'Newton Park AC ticket moved to Awaiting Parts.',
  '/workspace/properties/PR-1004?tab=maintenance', 'maintenance', 'updated',
  NULL, '2026-07-15 09:00:00+02'
),
(
  'b7000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000005',
  'Supervised viewing booked',
  'Oxford townhouse viewing with Kabelo on 28 Jul — James mentoring.',
  '/workspace/properties/PR-1003?tab=viewings', 'viewing', 'created',
  NULL, '2026-07-21 11:00:00+02'
),
(
  'b7000001-0001-4000-8000-000000000006',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000021',
  'Compliance uploaded',
  'Electrical COC added for Framesby cottage.',
  '/workspace/properties/PR-1011?tab=documents', 'document', 'created',
  '2026-07-08 15:00:00+02', '2026-07-08 14:00:00+02'
),
(
  'b7000001-0001-4000-8000-000000000007',
  'a1000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000024',
  'Ticket completed',
  'Kitchen slow drain was marked Completed.',
  '/workspace/portals/tenant', 'maintenance', 'updated',
  '2026-07-04 13:00:00+02', '2026-07-04 12:00:00+02'
);

-- Geocode metadata on key Horizon / Algoa Bay buildings
UPDATE buildings SET
  place_id = 'ChIJwalmer000000000000001',
  formatted_address = '14 Heugh Road, Walmer, Port Elizabeth, Eastern Cape, South Africa',
  geocoded_at = '2026-06-01 10:00:00+02'
WHERE id = 'a3000001-0001-4000-8000-000000000001';

UPDATE units SET
  place_id = 'ChIJwalmer000000000000001',
  formatted_address = '14 Heugh Road, Walmer, Port Elizabeth, Eastern Cape, South Africa',
  geocoded_at = '2026-06-01 10:00:00+02'
WHERE id = 'a4000001-0001-4000-8000-000000000001';

UPDATE buildings SET
  place_id = 'ChIJhumewood0000000000001',
  formatted_address = 'Beach Road, Humewood, Port Elizabeth, South Africa',
  geocoded_at = '2026-05-01 10:00:00+02'
WHERE id = 'a3000001-0001-4000-8000-000000000002';

UPDATE buildings SET
  place_id = 'ChIJmillpark0000000000001',
  formatted_address = '7 Park Lane, Mill Park, Port Elizabeth, South Africa',
  geocoded_at = '2026-06-10 10:00:00+02'
WHERE id = 'a3000001-0001-4000-8000-000000000003';

UPDATE buildings SET
  place_id = 'ChIJnewtonpark00000000001',
  formatted_address = 'Cape Road, Newton Park, Port Elizabeth, South Africa',
  geocoded_at = '2026-06-05 10:00:00+02'
WHERE id = 'a3000001-0001-4000-8000-000000000004';

-- =============================================================================
-- Automation (light)
-- =============================================================================
INSERT INTO automation_rules (id, client_id, code, name, description, trigger_event, conditions, actions, is_active, priority) VALUES
(
  'ac000001-0001-4000-8000-000000000001',
  NULL,
  'ticket_auto_assign',
  'Auto-assign maintenance to unit agent',
  'When a tenant opens a ticket, assign the unit agent and set a 48h SLA.',
  'maintenance.created',
  '{"source":"tenant"}'::jsonb,
  '[{"type":"assign_unit_agent"},{"type":"set_sla_hours","hours":48},{"type":"notify_agent"}]'::jsonb,
  true, 10
),
(
  'ac000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'app_approved_notify',
  'Notify applicant on approval',
  'Send portal notification when an application is approved.',
  'application.approved',
  '{}'::jsonb,
  '[{"type":"notify_user","role":"END_USER","template":"application_approved"}]'::jsonb,
  true, 20
);

INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload) VALUES
(
  'ad000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'maintenance.created',
  'maintenance_ticket',
  'aa000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000008',
  '{"auto_assigned":true,"asset":"Samsung microwave B12"}'::jsonb
),
(
  'ad000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'booking.completed',
  'booking',
  'a9000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000004',
  '{"interest":"HIGH"}'::jsonb
);

INSERT INTO automation_runs (id, rule_id, event_id, status, result) VALUES
(
  'ac000001-0001-4000-8000-000000000101',
  'ac000001-0001-4000-8000-000000000001',
  'ad000001-0001-4000-8000-000000000001',
  'success',
  '{"agentId":"a2000001-0001-4000-8000-000000000004","slaHours":48}'::jsonb
);

-- -----------------------------------------------------------------------------
-- Billing engine seed
-- -----------------------------------------------------------------------------

INSERT INTO billing_plans (id, plan_name, base_monthly_fee, per_sqm_rate, per_unit_rate, per_room_rate, grade_p_premium_fee) VALUES
(
  'b1000001-0001-4000-8000-000000000001',
  'Standard',
  1499.00,
  0.0500,
  2.00,
  0.50,
  2500.00
),
(
  'b1000001-0001-4000-8000-000000000002',
  'Premium Enterprise',
  4999.00,
  0.0400,
  1.50,
  0.35,
  1500.00
);

INSERT INTO client_subscriptions (id, client_id, plan_id, billing_cycle_anchor_day, status) VALUES
(
  'b2000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'b1000001-0001-4000-8000-000000000002',
  1,
  'ACTIVE'
),
(
  'b2000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000002',
  'b1000001-0001-4000-8000-000000000001',
  15,
  'ACTIVE'
),
(
  'b2000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000003',
  'b1000001-0001-4000-8000-000000000001',
  1,
  'ACTIVE'
);

-- Example invoice for prior cycle (Horizon on Premium)
INSERT INTO invoices (
  id, client_id, subscription_id,
  billing_period_start, billing_period_end,
  base_amount, asset_usage_amount, vat_amount, total_amount_due,
  payment_status, line_items
) VALUES (
  'b3000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'b2000001-0001-4000-8000-000000000001',
  '2026-06-01', '2026-06-30',
  4999.00, 3120.50, 1217.93, 9337.43,
  'PAID',
  '[
    {"label":"Base monthly fee","amount":4999.00},
    {"label":"GLA sqm charge","amount":1820.00},
    {"label":"Unit charge","amount":48.00},
    {"label":"Room charge","amount":252.50},
    {"label":"Grade P premium","amount":1000.00}
  ]'::jsonb
);

-- Activity feed samples (event_type = activity)
INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at) VALUES
(
  'ad000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000001',
  'activity', 'agency', NULL, NULL,
  '{"text":"New enquiry on Humewood Beach Apartment","user":"System"}'::jsonb,
  NOW()
),
(
  'ad000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000001',
  'activity', 'agency', NULL, 'a2000001-0001-4000-8000-000000000003',
  '{"text":"Viewing completed — Walmer House","user":"Lerato Nkosi"}'::jsonb,
  NOW() - INTERVAL '1 hour'
),
(
  'ad000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000001',
  'activity', 'agency', NULL, NULL,
  '{"text":"Key handover email sent to Lucas Pretorius","user":"System"}'::jsonb,
  '2026-05-28T10:00:00Z'
);

-- Default suite alerts (platform + Horizon + Cape) — match AppStore buildDefaultSuiteAlerts
INSERT INTO suite_alerts (
  id, client_id, resource, actions, enabled, popup_enabled, popup_duration_ms, notify_roles
) VALUES
-- Platform (client_id NULL)
('c2000001-0001-4000-8000-000000000001', NULL, 'property', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000002', NULL, 'room', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000003', NULL, 'inventory', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000004', NULL, 'applicant', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000005', NULL, 'viewing', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000006', NULL, 'viewing_slot', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000007', NULL, 'maintenance', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000008', NULL, 'payment', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000009', NULL, 'document', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-00000000000a', NULL, 'message', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
-- Horizon Realty
('c2000001-0001-4000-8000-000000000011', 'a1000001-0001-4000-8000-000000000001', 'property', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000012', 'a1000001-0001-4000-8000-000000000001', 'room', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000013', 'a1000001-0001-4000-8000-000000000001', 'inventory', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000014', 'a1000001-0001-4000-8000-000000000001', 'applicant', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000015', 'a1000001-0001-4000-8000-000000000001', 'viewing', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000016', 'a1000001-0001-4000-8000-000000000001', 'viewing_slot', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000017', 'a1000001-0001-4000-8000-000000000001', 'maintenance', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000018', 'a1000001-0001-4000-8000-000000000001', 'payment', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000019', 'a1000001-0001-4000-8000-000000000001', 'document', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-00000000001a', 'a1000001-0001-4000-8000-000000000001', 'message', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
-- Cape Coastal
('c2000001-0001-4000-8000-000000000021', 'a1000001-0001-4000-8000-000000000002', 'property', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000022', 'a1000001-0001-4000-8000-000000000002', 'room', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000023', 'a1000001-0001-4000-8000-000000000002', 'inventory', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000024', 'a1000001-0001-4000-8000-000000000002', 'applicant', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000025', 'a1000001-0001-4000-8000-000000000002', 'viewing', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000026', 'a1000001-0001-4000-8000-000000000002', 'viewing_slot', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000027', 'a1000001-0001-4000-8000-000000000002', 'maintenance', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000028', 'a1000001-0001-4000-8000-000000000002', 'payment', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-000000000029', 'a1000001-0001-4000-8000-000000000002', 'document', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb),
('c2000001-0001-4000-8000-00000000002a', 'a1000001-0001-4000-8000-000000000002', 'message', '["created","updated","deleted"]'::jsonb, true, true, 6000, '["client_admin","agent_admin","ground_agent","agent","super_admin"]'::jsonb);

COMMIT;

-- Summary counts
SELECT
  (SELECT COUNT(*) FROM clients) AS clients,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM buildings) AS buildings,
  (SELECT COUNT(*) FROM units) AS units,
  (SELECT COUNT(*) FROM rooms) AS rooms,
  (SELECT COUNT(*) FROM internal_assets) AS assets,
  (SELECT COUNT(*) FROM applications) AS applications,
  (SELECT COUNT(*) FROM leases) AS leases,
  (SELECT COUNT(*) FROM viewing_slots) AS viewing_slots,
  (SELECT COUNT(*) FROM bookings) AS bookings,
  (SELECT COUNT(*) FROM maintenance_tickets) AS tickets,
  (SELECT COUNT(*) FROM leads) AS leads,
  (SELECT COUNT(*) FROM payments) AS payments,
  (SELECT COUNT(*) FROM documents) AS documents,
  (SELECT COUNT(*) FROM notifications) AS notifications,
  (SELECT COUNT(*) FROM message_threads) AS threads,
  (SELECT COUNT(*) FROM messages) AS messages,
  (SELECT COUNT(*) FROM billing_plans) AS billing_plans,
  (SELECT COUNT(*) FROM client_subscriptions) AS subscriptions,
  (SELECT COUNT(*) FROM invoices) AS invoices,
  (SELECT COUNT(*) FROM event_log) AS event_log,
  (SELECT COUNT(*) FROM suite_alerts) AS suite_alerts,
  (SELECT COUNT(*) FROM vendor_category_routes) AS vendor_routes;
