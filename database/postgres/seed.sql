-- =============================================================================
-- PropertyFlow — PostgreSQL seed (South Africa demo story)
-- Requires: database/postgres/schema.sql already applied
-- Password: bcrypt-looking placeholder (NOT a real hash). See README.
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
--   Tickets     aa000001-...
--   Permissions ab000001-...
--   Automation  ac000001-...
--   Events      ad000001-...
-- =============================================================================

BEGIN;

-- Wipe in dependency order (safe re-seed)
TRUNCATE TABLE
  automation_runs,
  automation_rules,
  event_log,
  invoices,
  client_subscriptions,
  billing_plans,
  maintenance_ticket_updates,
  maintenance_tickets,
  vendor_category_routes,
  bookings,
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
  'Johannesburg',
  'Gauteng',
  '{"autoAdvanceApplications": true, "focus": ["Midrand", "Sandton", "Rosebank"]}'::jsonb
),
(
  'a1000001-0001-4000-8000-000000000002',
  'Cape Coastal Estates',
  'cape-coastal',
  'active',
  'Cape Coastal Holdings',
  'hello@capecoastal.co.za',
  '+27 21 555 0200',
  'Cape Town',
  'Western Cape',
  '{"autoAdvanceApplications": true, "focus": ["Waterfront", "Constantia"]}'::jsonb
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

-- Cape Coastal (same catalogue, own rows)
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
 'super@propertyflow.app', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Samuel', 'Admin', '+27 82 000 0001', 'SUPER_ADMIN', true),

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
 'jobs@aquafix.co.za', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'AquaFix', 'Plumbing', '+27 11 555 0400', 'CONTRACTOR', true);

-- =============================================================================
-- CLIENT 1 — Horizon buildings / units / rooms / assets
-- =============================================================================

-- Building 1: Carlswald Estate Home (standalone house, Grade A, solar + borehole)
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000006',
  'Carlswald Estate Home',
  '14 Acacia Lane',
  'Midrand',
  'Gauteng',
  'Carlswald',
  'A',
  5.50,
  true,
  -25.9992000,
  28.1282000,
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
  'SALE', 2450000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000004',
  'Modern 3-bed family home — Carlswald Estate',
  'Spacious standalone house with solar (5.5 kW), borehole, open-plan living and north-facing garden. Ideal for Midrand professionals.',
  '["fibre","solar","borehole","alarm","garden","pool"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200"]'::jsonb,
  true, -25.9992000, 28.1282000
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

-- Internal assets (Carlswald)
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

-- Building 2: Skyline Towers Sandton (Grade P, solar)
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Skyline Towers Sandton',
  '120 Rivonia Road',
  'Johannesburg',
  'Gauteng',
  'Sandton',
  'P',
  48.00,
  false,
  -26.1076000,
  28.0567000,
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
  'RENT', NULL, 18500.00, 'OCCUPIED',
  'a2000001-0001-4000-8000-000000000004',
  'Skyline Towers B12 — 2-bed rental',
  'Bright Sandton apartment with balcony views, covered parking and fibre. Currently leased.',
  '["fibre","balcony","aircon","secure_parking","gym"]'::jsonb,
  '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200"]'::jsonb,
  true, -26.1076000, 28.0567000
),
(
  'a4000001-0001-4000-8000-000000000003',
  'a3000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'B14', 102.00, 2, 2.0, 1,
  'RENT', NULL, 19200.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000005',
  'Skyline Towers B14 — 2-bed rental',
  'Corner unit with city views. Available for immediate occupation.',
  '["fibre","balcony","aircon","secure_parking","concierge"]'::jsonb,
  '["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200"]'::jsonb,
  false, -26.1076500, 28.0567500
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

-- Building 3: Oxford Mews Rosebank — Unit 7
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000007',
  'Oxford Mews Rosebank',
  '45 Oxford Road',
  'Johannesburg',
  'Gauteng',
  'Rosebank',
  'B',
  12.00,
  false,
  -26.1465000,
  28.0436000,
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
  'BOTH', 1890000.00, 16500.00, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000005',
  'Oxford Mews Unit 7 — townhouse',
  'Low-maintenance 2-bed townhouse with courtyard, near Gautrain and Rosebank Mall.',
  '["fibre","courtyard","pet_friendly","garage"]'::jsonb,
  '["https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200"]'::jsonb,
  false, -26.1465000, 28.0436000
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
-- CLIENT 2 — Cape Coastal
-- =============================================================================

-- Waterfront office suite building
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000004',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000013',
  'V&A Waterfront Office Suites',
  '1 Dock Road',
  'Cape Town',
  'Western Cape',
  'V&A Waterfront',
  'P',
  80.00,
  false,
  -33.9036000,
  18.4203000,
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
  'Waterfront Suite 402 — furnished office',
  'Harbour-facing commercial suite with boardroom nook, fibre and two basement bays.',
  '["fibre","aircon","secure_parking","harbour_view"]'::jsonb,
  '["https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200"]'::jsonb,
  true, -33.9036000, 18.4203000
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

-- Constantia house
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  'a3000001-0001-4000-8000-000000000005',
  'a1000001-0001-4000-8000-000000000002',
  'a2000001-0001-4000-8000-000000000014',
  'Constantia Vineyard House',
  '22 Klein Constantia Road',
  'Cape Town',
  'Western Cape',
  'Constantia',
  'A',
  8.00,
  true,
  -34.0254000,
  18.4232000,
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
  'SALE', 8950000.00, NULL, 'AVAILABLE',
  'a2000001-0001-4000-8000-000000000012',
  'Constantia family estate home',
  'Four-bed home under the mountain with solar, borehole and established garden.',
  '["solar","borehole","garden","pool","alarm"]'::jsonb,
  '["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200"]'::jsonb,
  true, -34.0254000, 18.4232000
);

INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, baths, area_sqm, layout_x, layout_y, layout_w, layout_h, sort_order) VALUES
('a5000001-0001-4000-8000-000000000051', 'a4000001-0001-4000-8000-000000000006', 'a1000001-0001-4000-8000-000000000002',
 'Master', 'bedroom', 1, 1.0, 32.00, 5, 5, 40, 35, 1),
('a5000001-0001-4000-8000-000000000052', 'a4000001-0001-4000-8000-000000000006', 'a1000001-0001-4000-8000-000000000002',
 'Kitchen', 'kitchen', 0, 0, 22.00, 5, 50, 35, 30, 2),
('a5000001-0001-4000-8000-000000000053', 'a4000001-0001-4000-8000-000000000006', 'a1000001-0001-4000-8000-000000000002',
 'Lounge', 'living', 0, 0, 48.00, 45, 40, 50, 45, 3);

-- =============================================================================
-- Applications, bookings, leases, tickets
-- =============================================================================

INSERT INTO applications (
  id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type,
  status, monthly_income, employment_summary, message, move_in_date, submitted_at
) VALUES
-- Nomsa applying to buy Carlswald house
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
);

INSERT INTO leases (
  id, client_id, unit_id, application_id, tenant_id, landlord_id, agent_id,
  lease_reference, status, start_date, end_date, rent_amount, deposit_amount, rent_due_day, metadata
) VALUES (
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
  18500.00,
  37000.00,
  1,
  '{"keyCollection":"Horizon Sandton office","notes":"Semi-furnished"}'::jsonb
);

INSERT INTO bookings (
  id, client_id, unit_id, agent_id, applicant_id,
  visitor_name, visitor_email, visitor_phone, starts_at, ends_at, status, interest_level, feedback
) VALUES
(
  'a9000001-0001-4000-8000-000000000001',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000003',
  'a2000001-0001-4000-8000-000000000005',
  'a2000001-0001-4000-8000-000000000010',
  'Fatima Jacobs', 'fatima.j@email.com', '+27 84 112 7788',
  '2026-07-25 10:00:00+02', '2026-07-25 10:30:00+02',
  'SCHEDULED', 'UNKNOWN', NULL
),
(
  'a9000001-0001-4000-8000-000000000002',
  'a1000001-0001-4000-8000-000000000001',
  'a4000001-0001-4000-8000-000000000001',
  'a2000001-0001-4000-8000-000000000004',
  'a2000001-0001-4000-8000-000000000009',
  'Nomsa Dlamini', 'nomsa.d@email.com', '+27 71 883 1102',
  '2026-07-21 15:30:00+02', '2026-07-21 16:15:00+02',
  'COMPLETED', 'HIGH', 'Loved the solar + borehole setup. Will proceed with offer.'
),
(
  'a9000001-0001-4000-8000-000000000003',
  'a1000001-0001-4000-8000-000000000002',
  'a4000001-0001-4000-8000-000000000005',
  'a2000001-0001-4000-8000-000000000012',
  NULL,
  'Thabo Molefe', 'thabo.m@email.com', '+27 82 441 2290',
  '2026-07-27 09:30:00+02', '2026-07-27 10:00:00+02',
  'SCHEDULED', 'UNKNOWN', NULL
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

-- Carlswald: minor ticket on Hisense microwave (sale listing prep)
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
  (SELECT COUNT(*) FROM bookings) AS bookings,
  (SELECT COUNT(*) FROM maintenance_tickets) AS tickets,
  (SELECT COUNT(*) FROM billing_plans) AS billing_plans,
  (SELECT COUNT(*) FROM client_subscriptions) AS subscriptions,
  (SELECT COUNT(*) FROM invoices) AS invoices,
  (SELECT COUNT(*) FROM vendor_category_routes) AS vendor_routes;
