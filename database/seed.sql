-- =============================================================================
-- Letkaya — Seed data for local TablePlus testing
-- Requires: schema.sql already applied
-- =============================================================================
USE propertyflow;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Clear (keep structure)
TRUNCATE TABLE automation_runs;
TRUNCATE TABLE automation_rules;
TRUNCATE TABLE event_log;
TRUNCATE TABLE report_snapshots;
TRUNCATE TABLE notifications;
TRUNCATE TABLE messages;
TRUNCATE TABLE message_threads;
TRUNCATE TABLE maintenance_updates;
TRUNCATE TABLE maintenance_tickets;
TRUNCATE TABLE contractors;
TRUNCATE TABLE payments;
TRUNCATE TABLE payment_schedules;
TRUNCATE TABLE invoices;
TRUNCATE TABLE tenancy_occupants;
TRUNCATE TABLE tenancies;
TRUNCATE TABLE credit_checks;
TRUNCATE TABLE application_documents;
TRUNCATE TABLE application_stage_history;
TRUNCATE TABLE applications;
TRUNCATE TABLE viewings;
TRUNCATE TABLE viewing_slots;
TRUNCATE TABLE leads;
TRUNCATE TABLE listings;
TRUNCATE TABLE listing_packages;
TRUNCATE TABLE property_material_defects;
TRUNCATE TABLE property_condition_reports;
TRUNCATE TABLE property_feature_map;
TRUNCATE TABLE property_features;
TRUNCATE TABLE property_media;
TRUNCATE TABLE property_rooms;
TRUNCATE TABLE properties;
TRUNCATE TABLE agent_profiles;
TRUNCATE TABLE landlord_profiles;
TRUNCATE TABLE applicant_profiles;
TRUNCATE TABLE user_permissions;
TRUNCATE TABLE role_permissions;
TRUNCATE TABLE permissions;
TRUNCATE TABLE users;
TRUNCATE TABLE agencies;
TRUNCATE TABLE clients;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- Permissions catalogue
-- -----------------------------------------------------------------------------
INSERT INTO permissions (id, code, description) VALUES
(1,  'platform.manage', 'Manage all clients on the platform'),
(2,  'client.manage', 'Manage client organisation settings'),
(3,  'users.manage', 'Invite and manage users'),
(4,  'assets.view', 'View property assets'),
(5,  'assets.manage', 'Create/edit property assets'),
(6,  'listings.publish', 'Publish marketplace listings'),
(7,  'leads.manage', 'Manage CRM leads'),
(8,  'applications.review', 'Review and decide applications'),
(9,  'viewings.manage', 'Manage viewing slots'),
(10, 'payments.manage', 'Create and reconcile payments'),
(11, 'occupants.view', 'View active occupants'),
(12, 'messages.manage', 'Agency/agent messaging'),
(13, 'maintenance.manage', 'Manage maintenance tickets'),
(14, 'reports.view', 'View analytics reports'),
(15, 'portal.owner', 'Landlord portal'),
(16, 'portal.tenant', 'Applicant/tenant portal');

INSERT INTO role_permissions (role, permission_id)
SELECT 'super_admin', id FROM permissions
UNION ALL SELECT 'client_admin', id FROM permissions WHERE code NOT IN ('platform.manage')
UNION ALL SELECT 'agency_admin', id FROM permissions WHERE code NOT IN ('platform.manage','client.manage')
UNION ALL SELECT 'agent', id FROM permissions WHERE code IN (
  'assets.view','assets.manage','listings.publish','leads.manage','applications.review',
  'viewings.manage','payments.manage','occupants.view','messages.manage','maintenance.manage','reports.view'
)
UNION ALL SELECT 'landlord', id FROM permissions WHERE code IN ('assets.view','payments.manage','reports.view','portal.owner')
UNION ALL SELECT 'applicant', id FROM permissions WHERE code IN ('portal.tenant','messages.manage')
UNION ALL SELECT 'tenant', id FROM permissions WHERE code IN ('portal.tenant','messages.manage','maintenance.manage','payments.manage');

-- -----------------------------------------------------------------------------
-- Listing packages (Property24-style fee bands R499–R2299)
-- -----------------------------------------------------------------------------
INSERT INTO listing_packages (id, code, name, channel, price_zar, duration_days, max_photos, featured, description) VALUES
(1, 'rent_basic', 'Self-Service Rental Basic', 'rent', 499.00, 30, 8, 0, 'Entry rental listing'),
(2, 'rent_plus', 'Self-Service Rental Plus', 'rent', 999.00, 45, 16, 0, 'Full photo set rental listing'),
(3, 'sale_standard', 'Self-Service Sales Standard', 'sale', 1499.00, 60, 16, 0, 'Standard sales package'),
(4, 'sale_featured', 'Self-Service Sales Featured', 'sale', 2299.00, 90, 16, 1, 'Featured placement + max media');

-- -----------------------------------------------------------------------------
-- Feature catalogue
-- -----------------------------------------------------------------------------
INSERT INTO property_features (id, code, label, category) VALUES
(1, 'fibre', 'Fibre ready', 'amenities'),
(2, 'pool', 'Swimming pool', 'exterior'),
(3, 'garden', 'Garden', 'exterior'),
(4, 'alarm', 'Alarm system', 'security'),
(5, 'electric_fence', 'Electric fencing', 'security'),
(6, 'borehole', 'Borehole', 'exterior'),
(7, 'solar', 'Solar / inverter', 'amenities'),
(8, 'staff_quarters', 'Staff quarters', 'building'),
(9, 'balcony', 'Balcony', 'exterior'),
(10, 'built_in_cupboards', 'Built-in cupboards', 'interior'),
(11, 'open_plan', 'Open-plan living', 'interior'),
(12, 'aircon', 'Air conditioning', 'interior'),
(13, 'parking_secure', 'Secure parking', 'parking'),
(14, 'pet_friendly', 'Pet friendly', 'amenities'),
(15, 'gym', 'Gym access', 'amenities'),
(16, 'concierge', 'Concierge / reception', 'building');

-- -----------------------------------------------------------------------------
-- CLIENT 1 — Horizon Realty Group
-- CLIENT 2 — Cape Coastal Estates
-- -----------------------------------------------------------------------------
INSERT INTO clients (
  id, uuid, name, trading_as, slug, registration_no, vat_number, email, phone, website,
  billing_email, address_line1, suburb, city, province, postal_code, status, plan_code, settings_json, onboarded_at
) VALUES
(1, '11111111-1111-1111-1111-111111111101', 'Horizon Realty Group', 'Horizon Realty', 'horizon',
 '2020/123456/07', '4123456789', 'accounts@horizonrealty.co.za', '+27 11 555 0100', 'https://horizonrealty.example',
 'billing@horizonrealty.co.za', '12 Rivonia Road', 'Sandhurst', 'Johannesburg', 'Gauteng', '2196',
 'active', 'enterprise', JSON_OBJECT('autoAdvanceApplications', true, 'autoCreateRentSchedule', true, 'channel', 'property24'),
 '2025-01-10 09:00:00'),
(2, '11111111-1111-1111-1111-111111111102', 'Cape Coastal Holdings', 'Cape Coastal Estates', 'cape-coastal',
 '2019/654321/07', '4987654321', 'hello@capecoastal.co.za', '+27 21 555 0200', 'https://capecoastal.example',
 'billing@capecoastal.co.za', '88 Bree Street', 'City Centre', 'Cape Town', 'Western Cape', '8001',
 'active', 'growth', JSON_OBJECT('autoAdvanceApplications', true, 'autoCreateRentSchedule', true),
 '2025-03-22 10:00:00');

INSERT INTO agencies (id, uuid, client_id, name, slug, branch_code, email, phone, whatsapp, ppra_number, city, suburb, province, status) VALUES
(1, '22222222-2222-2222-2222-222222222201', 1, 'Horizon Sandton', 'sandton', 'JHB-SAN', 'sandton@horizonrealty.co.za', '+27 11 555 0101', '+27 82 555 0101', 'PPRA-HZN-001', 'Johannesburg', 'Sandton', 'Gauteng', 'active'),
(2, '22222222-2222-2222-2222-222222222202', 1, 'Horizon Midrand', 'midrand', 'JHB-MID', 'midrand@horizonrealty.co.za', '+27 11 555 0102', '+27 82 555 0102', 'PPRA-HZN-002', 'Midrand', 'Carlswald', 'Gauteng', 'active'),
(3, '22222222-2222-2222-2222-222222222203', 2, 'Cape Coastal City Bowl', 'city-bowl', 'CPT-CB', 'city@capecoastal.co.za', '+27 21 555 0201', '+27 82 555 0201', 'PPRA-CCE-001', 'Cape Town', 'City Centre', 'Western Cape', 'active'),
(4, '22222222-2222-2222-2222-222222222204', 2, 'Cape Coastal Southern Suburbs', 'southern', 'CPT-SS', 'south@capecoastal.co.za', '+27 21 555 0202', '+27 82 555 0202', 'PPRA-CCE-002', 'Cape Town', 'Claremont', 'Western Cape', 'active');

-- Password placeholder: demo-password (replace with real hash in production)
SET @pwd := '$2y$10$demodemodemodemodemodeO8placeholderhash000000000000';

INSERT INTO users (
  id, uuid, client_id, agency_id, email, password_hash, first_name, last_name, phone, mobile,
  id_number, id_type, role, status, email_verified_at, popia_consent_at
) VALUES
-- Platform
(1, '33333333-3333-3333-3333-333333333301', NULL, NULL, 'super@propertyflow.app', @pwd, 'Samuel', 'Admin', '+27 82 000 0001', '+27 82 000 0001', NULL, NULL, 'super_admin', 'active', NOW(), NOW()),
-- Horizon
(2, '33333333-3333-3333-3333-333333333302', 1, 1, 'amelia@horizonrealty.co.za', @pwd, 'Amelia', 'Roux', '+27 11 555 0100', '+27 82 111 0100', '8501015800081', 'sa_id', 'client_admin', 'active', NOW(), NOW()),
(3, '33333333-3333-3333-3333-333333333303', 1, 1, 'lerato@horizonrealty.co.za', @pwd, 'Lerato', 'Nkosi', '+27 11 555 0101', '+27 82 111 0101', '9002025800082', 'sa_id', 'agent', 'active', NOW(), NOW()),
(4, '33333333-3333-3333-3333-333333333304', 1, 2, 'james@horizonrealty.co.za', @pwd, 'James', 'Okonkwo', '+27 11 555 0102', '+27 82 111 0102', '8803035800083', 'sa_id', 'agent', 'active', NOW(), NOW()),
(5, '33333333-3333-3333-3333-333333333305', 1, 1, 'priya@horizonrealty.co.za', @pwd, 'Priya', 'Naidoo', '+27 11 555 0103', '+27 82 111 0103', '9204045800084', 'sa_id', 'agent', 'active', NOW(), NOW()),
(6, '33333333-3333-3333-3333-333333333306', 1, NULL, 'trust@owners.co.za', @pwd, 'Horizon', 'Trust', '+27 11 555 0199', NULL, NULL, NULL, 'landlord', 'active', NOW(), NOW()),
(7, '33333333-3333-3333-3333-333333333307', 1, NULL, 'jvdberg@email.com', @pwd, 'Johan', 'van der Berg', '+27 82 222 3344', '+27 82 222 3344', '7505055800085', 'sa_id', 'landlord', 'active', NOW(), NOW()),
(8, '33333333-3333-3333-3333-333333333308', 1, 1, 'lucas@email.com', @pwd, 'Lucas', 'Pretorius', '+27 82 100 2000', '+27 82 100 2000', '9506065800086', 'sa_id', 'tenant', 'active', NOW(), NOW()),
(9, '33333333-3333-3333-3333-333333333309', 1, 1, 'nomsa.d@email.com', @pwd, 'Nomsa', 'Dlamini', '+27 71 883 1102', '+27 71 883 1102', '9107075800087', 'sa_id', 'applicant', 'active', NOW(), NOW()),
(10,'33333333-3333-3333-3333-333333333310', 1, 1, 'fatima.j@email.com', @pwd, 'Fatima', 'Jacobs', '+27 84 112 7788', '+27 84 112 7788', '9308085800088', 'sa_id', 'applicant', 'active', NOW(), NOW()),
(11,'33333333-3333-3333-3333-333333333311', 1, 1, 'jobs@aquafix.co.za', @pwd, 'AquaFix', 'Plumbing', '+27 11 555 0888', NULL, NULL, NULL, 'contractor', 'active', NOW(), NOW()),
-- Cape Coastal
(12,'33333333-3333-3333-3333-333333333312', 2, 3, 'sipho@capecoastal.co.za', @pwd, 'Sipho', 'Molefe', '+27 21 555 0200', '+27 82 333 0200', '8709095800089', 'sa_id', 'client_admin', 'active', NOW(), NOW()),
(13,'33333333-3333-3333-3333-333333333313', 2, 3, 'anya@capecoastal.co.za', @pwd, 'Anya', 'Botha', '+27 21 555 0201', '+27 82 333 0201', '9401015800090', 'sa_id', 'agent', 'active', NOW(), NOW()),
(14,'33333333-3333-3333-3333-333333333314', 2, 4, 'dev@capecoastal.co.za', @pwd, 'Devon', 'Jacobs', '+27 21 555 0202', '+27 82 333 0202', '8902025800091', 'sa_id', 'agent', 'active', NOW(), NOW()),
(15,'33333333-3333-3333-3333-333333333315', 2, NULL, 'sea@owners.co.za', @pwd, 'Seaview', 'Investments', '+27 21 555 0299', NULL, NULL, NULL, 'landlord', 'active', NOW(), NOW()),
(16,'33333333-3333-3333-3333-333333333316', 2, NULL, 'm.khan@email.com', @pwd, 'Maryam', 'Khan', '+27 72 444 5566', '+27 72 444 5566', '8603035800092', 'sa_id', 'landlord', 'active', NOW(), NOW()),
(17,'33333333-3333-3333-3333-333333333317', 2, 3, 'thandi@email.com', @pwd, 'Thandi', 'Mokoena', '+27 83 777 8899', '+27 83 777 8899', '9604045800093', 'sa_id', 'applicant', 'active', NOW(), NOW());

INSERT INTO landlord_profiles (id, user_id, client_id, entity_type, legal_name, trading_name, bank_name, bank_account_name, bank_account_number, bank_branch_code, fica_verified_at) VALUES
(1, 6, 1, 'trust', 'Horizon Property Trust', 'Horizon Trust', 'FNB', 'Horizon Property Trust', '62800012345', '250655', '2025-02-01 10:00:00'),
(2, 7, 1, 'individual', 'Johan van der Berg', NULL, 'Standard Bank', 'J van der Berg', '001234567', '051001', '2025-02-15 10:00:00'),
(3, 15, 2, 'company', 'Seaview Investments (Pty) Ltd', 'Seaview Investments', 'Nedbank', 'Seaview Investments', '1122334455', '198765', '2025-04-01 10:00:00'),
(4, 16, 2, 'individual', 'Maryam Khan', NULL, 'Absa', 'M Khan', '4055667788', '632005', '2025-04-10 10:00:00');

INSERT INTO agent_profiles (id, user_id, agency_id, employee_code, job_title, license_number, specializations, bio, commission_rate_bps, years_experience, languages) VALUES
(1, 3, 1, 'HZ-A01', 'Senior Sales Agent', 'PPRA-A-1001', JSON_ARRAY('sales','rentals'), 'Specialises in Sandton apartments and estates.', 500, 8, JSON_ARRAY('en','zu')),
(2, 4, 2, 'HZ-A02', 'Leasing Consultant', 'PPRA-A-1002', JSON_ARRAY('rentals'), 'Midrand residential leasing specialist.', 450, 5, JSON_ARRAY('en')),
(3, 5, 1, 'HZ-A03', 'Property Practitioner', 'PPRA-A-1003', JSON_ARRAY('sales','commercial'), 'Commercial and residential hybrid book.', 550, 6, JSON_ARRAY('en','af')),
(4, 13, 3, 'CC-A01', 'Senior Agent', 'PPRA-A-2001', JSON_ARRAY('sales','rentals'), 'City Bowl and Atlantic Seaboard.', 500, 7, JSON_ARRAY('en','af')),
(5, 14, 4, 'CC-A02', 'Leasing Agent', 'PPRA-A-2002', JSON_ARRAY('rentals'), 'Southern Suburbs family homes.', 450, 4, JSON_ARRAY('en'));

INSERT INTO applicant_profiles (
  id, user_id, client_id, employment_status, employer_name, job_title, monthly_net_income,
  marital_status, dependants_count, current_city, pets, credit_consent_at, preferred_move_in_date
) VALUES
(1, 8, 1, 'employed', 'Pick n Pay', 'Retail manager', 42000, 'single', 0, 'Johannesburg', 0, '2026-05-01 09:00:00', '2026-06-01'),
(2, 9, 1, 'employed', 'Absa', 'Senior Analyst', 85000, 'single', 0, 'Johannesburg', 0, '2026-07-20 09:00:00', '2026-08-15'),
(3, 10, 1, 'employed', 'Deloitte', 'Consultant', 48000, 'life_partner', 0, 'Sandton', 0, '2026-07-18 09:00:00', '2026-08-01'),
(4, 17, 2, 'employed', 'Discovery', 'Claims advisor', 38000, 'single', 1, 'Cape Town', 1, '2026-07-10 09:00:00', '2026-08-01');

INSERT INTO contractors (id, client_id, user_id, company_name, trade, phone, email, rating) VALUES
(1, 1, 11, 'AquaFix Plumbing', 'Plumbing', '+27 11 555 0888', 'jobs@aquafix.co.za', 4.70);

-- -----------------------------------------------------------------------------
-- Properties (Property24-complete fields) — multiple per client
-- -----------------------------------------------------------------------------
INSERT INTO properties (
  id, uuid, client_id, agency_id, landlord_id, assigned_agent_id, reference_code, title, marketing_headline, description,
  property_type, listing_intent, status,
  unit_number, complex_name, street_number, street_name, suburb, city, province, postal_code, lat, lng,
  asking_price, monthly_rent, rates_monthly, levies_monthly, deposit_amount, available_from,
  erf_size_sqm, floor_size_sqm, bedrooms, bathrooms, reception_rooms, studies, garages, open_parking, covered_parking,
  furnished, pet_friendly, kitchen_type, garden_description, security_notes, staff_quarters, pool,
  material_defects_disclosed, condition_report_required, condition_report_completed_at,
  first_photo_url, photo_count, published_at, created_by
) VALUES
(1, '44444444-4444-4444-4444-444444444401', 1, 2, 2, 3, 'HZ-PR-1001',
 'Modern 3-Bed House in Midrand', 'Family home in secure Carlswald estate',
 'Spacious 3-bedroom family home with open-plan living, fibre, and a north-facing garden. Ideal for buyers seeking space near Midrand business parks.',
 'house', 'sale', 'published',
 NULL, 'Carlswald Estate', '14', 'Acacia Lane', 'Carlswald', 'Midrand', 'Gauteng', '1684', -25.9992000, 28.1282000,
 2450000.00, NULL, 1850.00, 2200.00, NULL, '2026-07-01',
 850.00, 210.00, 3, 2.0, 2, 1, 2, 0, 0,
 'no', 1, 'Modern open-plan', 'North-facing lawn with irrigation', 'Estate access control + alarm', 0, 1,
 1, 1, '2026-06-15 10:00:00',
 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80', 6, '2026-06-20 08:00:00', 3),

(2, '44444444-4444-4444-4444-444444444402', 1, 1, 1, 4, 'HZ-PR-1002',
 'Sandton Skyline Apartment', 'Bright 2-bed with skyline views',
 'Secure Sandton apartment with balcony views, covered parking, and fibre. Perfect for professionals seeking a lock-up-and-go rental.',
 'apartment', 'rent', 'published',
 'B12', 'Skyline Towers', '120', 'Rivonia Road', 'Sandton', 'Johannesburg', 'Gauteng', '2196', -26.1076000, 28.0567000,
 NULL, 18500.00, 0.00, 2450.00, 37000.00, '2026-06-01',
 NULL, 98.00, 2, 2.0, 1, 0, 0, 0, 1,
 'semi', 0, 'European', NULL, 'Biometric lobby + 24h security', 0, 0,
 1, 1, '2026-05-20 10:00:00',
 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80', 8, '2026-05-22 08:00:00', 4),

(3, '44444444-4444-4444-4444-444444444403', 1, 1, 1, 5, 'HZ-PR-1003',
 'Rosebank Townhouse with Courtyard', 'Low-maintenance living near Gautrain',
 'Neat 2-bedroom townhouse with private courtyard, single garage, and walking distance to Rosebank Mall.',
 'townhouse', 'both', 'published',
 '7', 'Courtyard Mews', '45', 'Oxford Road', 'Rosebank', 'Johannesburg', 'Gauteng', '2196', -26.1465000, 28.0436000,
 1890000.00, 16500.00, 1200.00, 1800.00, 33000.00, '2026-07-15',
 210.00, 115.00, 2, 1.5, 1, 0, 1, 0, 0,
 'no', 1, 'Fitted', 'Private courtyard', 'Complex electric fence', 0, 0,
 1, 1, '2026-06-01 10:00:00',
 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80', 5, '2026-06-05 08:00:00', 5),

(4, '44444444-4444-4444-4444-444444444404', 1, 2, 2, 3, 'HZ-PR-1004',
 'Faerie Glen Vacant Land', 'Corner stand ready for development',
 '1200m² corner stand in Faerie Glen with municipal services nearby. Ideal for a custom family home.',
 'vacant_land', 'sale', 'published',
 NULL, NULL, NULL, 'Erf 221', 'Faerie Glen', 'Pretoria', 'Gauteng', '0081', -25.7831000, 28.2984000,
 950000.00, NULL, 650.00, NULL, NULL, '2026-07-01',
 1200.00, NULL, 0, 0.0, 0, 0, 0, 0, 0,
 'no', 0, NULL, NULL, NULL, 0, 0,
 1, 0, NULL,
 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80', 3, '2026-06-10 08:00:00', 3),

(5, '44444444-4444-4444-4444-444444444405', 2, 3, 3, 13, 'CC-PR-2001',
 'Sea Point Apartment with Ocean Glimpse', 'Renovated 1-bed near promenade',
 'Freshly renovated apartment steps from the Sea Point promenade. Secure block, covered parking, and modern kitchen.',
 'apartment', 'rent', 'published',
 '5A', 'Atlantic View', '22', 'Beach Road', 'Sea Point', 'Cape Town', 'Western Cape', '8005', -33.9161000, 18.3872000,
 NULL, 22000.00, 0.00, 3100.00, 44000.00, '2026-08-01',
 NULL, 62.00, 1, 1.0, 1, 0, 0, 0, 1,
 'yes', 0, 'Modern', NULL, 'Access control + CCTV', 0, 0,
 1, 1, '2026-07-01 10:00:00',
 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80', 7, '2026-07-02 08:00:00', 13),

(6, '44444444-4444-4444-4444-444444444406', 2, 4, 4, 14, 'CC-PR-2002',
 'Claremont Family Home', '4-bed under the mountain',
 'Generous family home with garden cottage potential, double garage, and established garden in Claremont.',
 'house', 'sale', 'published',
 NULL, NULL, '18', 'Protea Avenue', 'Claremont', 'Cape Town', 'Western Cape', '7708', -33.9849000, 18.4655000,
 4750000.00, NULL, 3200.00, NULL, NULL, '2026-07-20',
 980.00, 285.00, 4, 3.0, 2, 1, 2, 1, 0,
 'no', 1, 'Country-style', 'Established garden with patio', 'Armed response', 1, 1,
 1, 1, '2026-06-28 10:00:00',
 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80', 10, '2026-07-01 08:00:00', 14),

(7, '44444444-4444-4444-4444-444444444407', 2, 3, 3, 13, 'CC-PR-2003',
 'City Bowl Studio', 'Compact CBD pied-à-terre',
 'Efficient studio apartment for sale or rent in the City Bowl — ideal investor stock with strong short-term demand.',
 'apartment', 'both', 'featured',
 '1204', 'Harbour Lights', '1', 'Buitengracht Street', 'City Centre', 'Cape Town', 'Western Cape', '8001', -33.9210000, 18.4170000,
 1290000.00, 12500.00, 0.00, 1650.00, 25000.00, '2026-07-10',
 NULL, 38.00, 0, 1.0, 1, 0, 0, 0, 1,
 'yes', 0, 'Kitchenette', NULL, 'Biometric access', 0, 0,
 1, 1, '2026-06-20 10:00:00',
 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80', 4, '2026-06-22 08:00:00', 13);

-- Rooms sample
INSERT INTO property_rooms (property_id, name, room_type, beds, baths, area_sqm, sort_order) VALUES
(1, 'Master Bedroom', 'bedroom', 1, 1.0, 28, 1),
(1, 'Bedroom 2', 'bedroom', 1, 0, 16, 2),
(1, 'Bedroom 3', 'bedroom', 1, 0, 14, 3),
(1, 'Open Lounge', 'lounge', 0, 0, 42, 4),
(2, 'Bedroom 1', 'bedroom', 1, 1.0, 14, 1),
(2, 'Bedroom 2', 'bedroom', 1, 0, 12, 2),
(2, 'Lounge', 'lounge', 0, 0, 22, 3),
(5, 'Studio open plan', 'lounge', 1, 1.0, 40, 1),
(6, 'Master', 'bedroom', 1, 1.0, 32, 1),
(6, 'Bedroom 2', 'bedroom', 1, 0, 16, 2),
(6, 'Bedroom 3', 'bedroom', 1, 0, 15, 3),
(6, 'Bedroom 4', 'bedroom', 1, 0, 14, 4);

-- Media (main + extras; Property24 max 16)
INSERT INTO property_media (property_id, media_type, url, caption, is_primary, sort_order) VALUES
(1, 'photo', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80', 'Exterior front elevation', 1, 0),
(1, 'photo', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80', 'Garden', 0, 1),
(1, 'photo', 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80', 'Lounge', 0, 2),
(1, 'floor_plan', 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200&q=80', 'Floor plan', 0, 3),
(2, 'photo', 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80', 'Living area', 1, 0),
(2, 'photo', 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80', 'Bedroom', 0, 1),
(5, 'photo', 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=80', 'Exterior street view', 1, 0),
(6, 'photo', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80', 'Street elevation', 1, 0);

INSERT INTO property_feature_map (property_id, feature_id) VALUES
(1,1),(1,2),(1,3),(1,4),(1,5),(1,10),(1,13),
(2,1),(2,9),(2,12),(2,13),(2,15),(2,16),
(3,1),(3,3),(3,5),(3,14),
(5,1),(5,9),(5,12),(5,13),
(6,1),(6,2),(6,3),(6,4),(6,8),(6,10),(6,13),
(7,1),(7,12),(7,13),(7,16);

INSERT INTO property_condition_reports (property_id, prepared_by, report_date, overall_condition, summary, signed_by_landlord_at) VALUES
(1, 3, '2026-06-14', 'good', 'Minor paint touch-ups required in bedroom 3. Roof and plumbing inspected.', '2026-06-15 09:00:00'),
(2, 4, '2026-05-18', 'excellent', 'Recently refurbished unit. No material issues noted.', '2026-05-19 09:00:00'),
(5, 13, '2026-06-30', 'good', 'Kitchen appliances under warranty. Bathroom sealant refreshed.', '2026-07-01 09:00:00'),
(6, 14, '2026-06-25', 'fair', 'Older roof tiles — disclosed. Pool pump due for service.', '2026-06-26 09:00:00');

INSERT INTO property_material_defects (property_id, title, description, severity) VALUES
(6, 'Ageing roof tiles', 'Several roof tiles show weathering; no active leak at inspection date.', 'medium'),
(1, 'Hairline plaster crack', 'Non-structural plaster crack above lounge door.', 'low');

INSERT INTO listings (uuid, property_id, agency_id, package_id, channel, status, listing_fee_zar, fee_payment_method, fee_paid_at, billing_email, goes_live_at, expires_at) VALUES
('55555555-5555-5555-5555-555555555501', 1, 2, 4, 'property24', 'active', 2299.00, 'eft', '2026-06-19 12:00:00', 'midrand@horizonrealty.co.za', '2026-06-20 08:00:00', '2026-09-18 08:00:00'),
('55555555-5555-5555-5555-555555555502', 2, 1, 2, 'property24', 'active', 999.00, 'card', '2026-05-21 12:00:00', 'sandton@horizonrealty.co.za', '2026-05-22 08:00:00', '2026-07-06 08:00:00'),
('55555555-5555-5555-5555-555555555503', 5, 3, 2, 'property24', 'active', 999.00, 'eft', '2026-07-01 12:00:00', 'city@capecoastal.co.za', '2026-07-02 08:00:00', '2026-08-16 08:00:00'),
('55555555-5555-5555-5555-555555555504', 6, 4, 3, 'property24', 'active', 1499.00, 'eft', '2026-06-30 12:00:00', 'south@capecoastal.co.za', '2026-07-01 08:00:00', '2026-08-30 08:00:00');

-- -----------------------------------------------------------------------------
-- Pipeline: leads, slots, viewings, applications, payments, tenancy
-- -----------------------------------------------------------------------------
INSERT INTO leads (id, uuid, client_id, agency_id, property_id, agent_id, applicant_user_id, full_name, email, phone, source, channel, intent, stage, budget_max, message) VALUES
(1, '66666666-6666-6666-6666-666666666601', 1, 1, 2, 4, NULL, 'Thabo Molefe', 'thabo.m@email.com', '+27 82 441 2290', 'whatsapp', 'whatsapp', 'buy', 'viewing_scheduled', 3500000, 'Prefers north-facing.'),
(2, '66666666-6666-6666-6666-666666666602', 1, 2, 1, 3, 9, 'Nomsa Dlamini', 'nomsa.d@email.com', '+27 71 883 1102', 'web', 'web', 'buy', 'application_submitted', 2600000, NULL),
(3, '66666666-6666-6666-6666-666666666603', 2, 3, 5, 13, 17, 'Thandi Mokoena', 'thandi@email.com', '+27 83 777 8899', 'web', 'web', 'rent', 'new', 25000, 'Needs pet-friendly if possible.');

INSERT INTO viewing_slots (id, property_id, agency_id, agent_id, starts_at, ends_at, capacity, booked_count, status) VALUES
(1, 2, 1, 4, '2026-07-25 10:00:00', '2026-07-25 10:30:00', 4, 1, 'open'),
(2, 2, 1, 4, '2026-07-25 14:00:00', '2026-07-25 14:30:00', 3, 0, 'open'),
(3, 1, 2, 3, '2026-07-26 11:00:00', '2026-07-26 11:45:00', 2, 0, 'open'),
(4, 5, 3, 13, '2026-07-27 09:30:00', '2026-07-27 10:00:00', 3, 0, 'open');

INSERT INTO viewings (uuid, slot_id, property_id, agency_id, agent_id, lead_id, applicant_name, applicant_email, starts_at, status, attendance, interest_level) VALUES
('77777777-7777-7777-7777-777777777701', 1, 2, 1, 4, 1, 'Thabo Molefe', 'thabo.m@email.com', '2026-07-25 10:00:00', 'scheduled', 'unknown', 'unknown'),
('77777777-7777-7777-7777-777777777702', NULL, 1, 2, 3, 2, 'Sarah Williams', 'sarah.w@email.com', '2026-07-21 15:30:00', 'completed', 'attended', 'high');

INSERT INTO applications (
  id, uuid, reference_code, client_id, agency_id, property_id, agent_id, applicant_user_id, lead_id,
  application_type, stage, progress_pct, monthly_income, employment_summary, credit_consent, credit_status,
  move_in_date, key_collection_json, submitted_at
) VALUES
(1, '88888888-8888-8888-8888-888888888801', 'APP-901', 1, 2, 1, 3, 9, 2,
 'purchase', 'under_review', 55, 85000, 'Absa — Senior Analyst', 1, 'consent_received', NULL, NULL, '2026-07-21 11:00:00'),
(2, '88888888-8888-8888-8888-888888888802', 'APP-902', 1, 1, 2, 4, 10, NULL,
 'rental', 'credit_check', 65, 48000, 'Deloitte — Consultant', 1, 'in_progress', NULL, NULL, '2026-07-19 09:00:00'),
(3, '88888888-8888-8888-8888-888888888803', 'APP-903', 1, 1, 2, 4, 8, NULL,
 'rental', 'active_tenancy', 100, 42000, 'Retail manager', 1, 'passed', '2026-06-01',
 JSON_OBJECT('location','Horizon Realty — Sandton office','instructions','Bring ID and signed lease. Collect keys from reception after 09:00.','contactName','James Okonkwo','contactPhone','+27 11 555 0102','email_sent_at','2026-05-28T10:00:00Z'),
 '2026-05-10 10:00:00'),
(4, '88888888-8888-8888-8888-888888888804', 'APP-C201', 2, 3, 5, 13, 17, 3,
 'rental', 'documents_pending', 20, 38000, 'Discovery — Claims advisor', 0, 'not_started', NULL, NULL, '2026-07-12 14:00:00');

INSERT INTO application_stage_history (application_id, from_stage, to_stage, triggered_by, actor_user_id, note) VALUES
(3, 'started', 'documents_pending', 'system', NULL, 'Application created'),
(3, 'documents_pending', 'documents_submitted', 'automation', NULL, 'All required docs uploaded'),
(3, 'documents_submitted', 'credit_check', 'automation', NULL, 'Docs verified — auto start credit'),
(3, 'credit_check', 'approved', 'user', 2, 'Credit passed'),
(3, 'approved', 'awaiting_payment', 'automation', NULL, 'Created deposit + first rent dues'),
(3, 'awaiting_payment', 'deposit_paid', 'payment', NULL, 'All dues paid'),
(3, 'deposit_paid', 'lease_signed', 'user', 4, 'Lease e-signed'),
(3, 'lease_signed', 'move_in_scheduled', 'automation', NULL, 'Key email dispatched'),
(3, 'move_in_scheduled', 'keys_handed_over', 'user', 4, 'Keys collected'),
(3, 'keys_handed_over', 'active_tenancy', 'automation', NULL, 'Occupancy activated + rent schedule');

INSERT INTO application_documents (application_id, doc_key, label, status, verified_at) VALUES
(1, 'id', 'Certified SA ID / Passport', 'uploaded', NULL),
(1, 'address', 'Proof of residence (≤ 3 months)', 'uploaded', NULL),
(1, 'fica', 'FICA client due-diligence declaration', 'uploaded', NULL),
(1, 'funds', 'Proof of funds / bond pre-approval', 'required', NULL),
(1, 'bank', '3 months bank statements', 'uploaded', NULL),
(1, 'credit_consent', 'Credit check consent (POPIA / NCA)', 'uploaded', NULL),
(2, 'id', 'Certified SA ID / Passport (+ work permit if foreign)', 'uploaded', NULL),
(2, 'address', 'Proof of residence (≤ 3 months)', 'uploaded', NULL),
(2, 'payslips', '3× recent payslips', 'uploaded', NULL),
(2, 'bank', '3 months bank statements', 'uploaded', NULL),
(2, 'employment', 'Employment confirmation letter', 'uploaded', NULL),
(2, 'credit_consent', 'Credit check consent (POPIA / NCA)', 'uploaded', NULL),
(2, 'landlord_ref', 'Previous landlord / agent reference', 'uploaded', NULL),
(2, 'fica', 'FICA client due-diligence declaration', 'uploaded', NULL),
(3, 'id', 'Certified SA ID / Passport (+ work permit if foreign)', 'verified', '2026-05-12 10:00:00'),
(3, 'address', 'Proof of residence (≤ 3 months)', 'verified', '2026-05-12 10:00:00'),
(3, 'payslips', '3× recent payslips', 'verified', '2026-05-12 10:00:00'),
(3, 'bank', '3 months bank statements', 'verified', '2026-05-12 10:00:00'),
(3, 'employment', 'Employment confirmation letter', 'verified', '2026-05-12 10:00:00'),
(3, 'credit_consent', 'Credit check consent (POPIA / NCA)', 'verified', '2026-05-12 10:00:00'),
(3, 'landlord_ref', 'Previous landlord / agent reference', 'verified', '2026-05-12 10:00:00'),
(3, 'fica', 'FICA client due-diligence declaration', 'verified', '2026-05-12 10:00:00'),
(4, 'id', 'Certified SA ID / Passport (+ work permit if foreign)', 'required', NULL),
(4, 'address', 'Proof of residence (≤ 3 months)', 'required', NULL),
(4, 'payslips', '3× recent payslips', 'required', NULL),
(4, 'bank', '3 months bank statements', 'required', NULL),
(4, 'employment', 'Employment confirmation letter', 'required', NULL),
(4, 'credit_consent', 'Credit check consent (POPIA / NCA)', 'required', NULL),
(4, 'landlord_ref', 'Previous landlord / agent reference', 'required', NULL),
(4, 'fica', 'FICA client due-diligence declaration', 'required', NULL);

INSERT INTO credit_checks (application_id, bureau, consent_at, status, score, checked_at) VALUES
(2, 'TransUnion', '2026-07-18 09:00:00', 'pending', NULL, NULL),
(3, 'Experian', '2026-05-11 09:00:00', 'completed', 712, '2026-05-12 15:00:00');

INSERT INTO tenancies (
  id, uuid, client_id, agency_id, property_id, landlord_id, agent_id, application_id, primary_tenant_user_id,
  lease_reference, status, start_date, end_date, rent_amount, deposit_amount, rent_due_day, key_collection_json
) VALUES
(1, '99999999-9999-9999-9999-999999999901', 1, 1, 2, 1, 4, 3, 8,
 'HZ-LS-1002', 'active', '2026-06-01', '2026-12-31', 18500.00, 37000.00, 1,
 JSON_OBJECT('location','Horizon Realty — Sandton office','instructions','Bring ID and signed lease.','contactName','James Okonkwo','contactPhone','+27 11 555 0102'));

INSERT INTO tenancy_occupants (tenancy_id, user_id, full_name, relationship, is_primary, id_number) VALUES
(1, 8, 'Lucas Pretorius', 'primary', 1, '9506065800086');

INSERT INTO payment_schedules (id, tenancy_id, application_id, property_id, schedule_type, amount, due_date, status, auto_generated) VALUES
(1, 1, 3, 2, 'deposit', 37000.00, '2026-05-20', 'paid', 1),
(2, 1, 3, 2, 'first_rent', 18500.00, '2026-06-01', 'paid', 1),
(3, 1, 3, 2, 'recurring_rent', 18500.00, '2026-07-01', 'paid', 1),
(4, 1, 3, 2, 'recurring_rent', 18500.00, '2026-08-01', 'scheduled', 1);

INSERT INTO payments (
  uuid, client_id, agency_id, property_id, application_id, tenancy_id, schedule_id, party_user_id, party_name,
  payment_type, amount, status, due_date, paid_at, method, reference, landlord_visible, auto_allocated
) VALUES
('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 1, 1, 2, 3, 1, 1, 8, 'Lucas Pretorius', 'deposit', 37000.00, 'paid', '2026-05-20', '2026-05-20 10:00:00', 'eft', 'DEP-APP903', 1, 1),
('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 1, 1, 2, 3, 1, 2, 8, 'Lucas Pretorius', 'first_month_rent', 18500.00, 'paid', '2026-06-01', '2026-06-01 09:00:00', 'eft', 'RENT-JUN', 1, 1),
('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 1, 1, 2, 3, 1, 3, 8, 'Lucas Pretorius', 'rent', 18500.00, 'paid', '2026-07-01', '2026-07-01 09:00:00', 'eft', 'RENT-JUL', 1, 1),
('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 1, 1, 2, 3, 1, 4, 8, 'Lucas Pretorius', 'rent', 18500.00, 'due', '2026-08-01', NULL, NULL, NULL, 1, 1),
('aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 1, 2, 1, 1, NULL, NULL, 9, 'Nomsa Dlamini', 'sale_deposit', 245000.00, 'due', '2026-07-28', NULL, NULL, NULL, 1, 0);

INSERT INTO maintenance_tickets (
  uuid, client_id, agency_id, property_id, tenancy_id, reported_by_user_id, assigned_agent_id, contractor_id,
  asset_label, title, description, priority, status, sla_due_at, cost_estimate, photo_count, auto_assigned
) VALUES
('bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 1, 1, 2, 1, 8, 4, 1,
 'Geyser — Unit B12', 'Leaking geyser — Unit B12',
 'Water leaking from cupboard under geyser. Auto-routed to assigned agent (not landlord).', 'high', 'in_progress',
 '2026-07-24 17:00:00', 4800.00, 3, 1);

INSERT INTO maintenance_updates (ticket_id, author_user_id, body, status_after) VALUES
(1, 4, 'Ticket triaged and assigned to AquaFix.', 'triaged'),
(1, 11, 'Parts ordered. On-site visit booked.', 'in_progress');

INSERT INTO message_threads (uuid, client_id, agency_id, property_id, application_id, tenancy_id, subject, routes_to, created_by) VALUES
('ccccccc1-cccc-cccc-cccc-ccccccccccc1', 1, 1, 2, 3, 1, 'Unit B12 — maintenance & lease queries', 'agent', 8);

INSERT INTO messages (thread_id, from_user_id, body) VALUES
(1, 8, 'Hi James — the geyser is leaking again. Can someone take a look this week?'),
(1, 4, 'Thanks Lucas — I logged a maintenance ticket and assigned AquaFix. They will arrange access.');

INSERT INTO notifications (user_id, client_id, channel, title, body, link_path, sent_at) VALUES
(8, 1, 'in_app', 'Rent reminder', 'August rent of R18,500 is due on 1 Aug.', '/workspace/portals/tenant', '2026-07-25 08:00:00'),
(8, 1, 'email', 'Maintenance update', 'Your geyser repair is In Progress with AquaFix Plumbing.', '/workspace/portals/tenant', '2026-07-22 10:00:00'),
(8, 1, 'email', 'Move-in & key collection', 'Collect keys at Horizon Realty — Sandton office on 2026-06-01.', '/workspace/portals/tenant', '2026-05-28 10:00:00'),
(6, 1, 'in_app', 'Rent received', 'Rent receipt of R18,500 posted for Sandton Skyline Apartment.', '/workspace/portals/owner', '2026-07-01 10:00:00');

-- -----------------------------------------------------------------------------
-- Automation rules (event → actions). Worker/app executes these.
-- -----------------------------------------------------------------------------
INSERT INTO automation_rules (id, client_id, code, name, description, trigger_event, conditions_json, actions_json, is_active, priority) VALUES
(1, NULL, 'docs_complete_advance', 'Advance when all docs uploaded',
 'When every application document is uploaded, move to documents_submitted.',
 'application.document_uploaded',
 JSON_OBJECT('allDocsUploaded', true),
 JSON_ARRAY(JSON_OBJECT('type','advance_stage','to','documents_submitted'), JSON_OBJECT('type','notify_agent','template','docs_ready')),
 1, 10),
(2, NULL, 'docs_verified_credit', 'Start credit after verification',
 'When agency verifies all docs, start credit check automatically.',
 'application.documents_verified',
 JSON_OBJECT('allDocsVerified', true),
 JSON_ARRAY(JSON_OBJECT('type','advance_stage','to','credit_check'), JSON_OBJECT('type','create_credit_check')),
 1, 20),
(3, NULL, 'approved_create_payments', 'Create dues on approval',
 'On approval, create deposit (+ first rent for rentals) payment schedules and notify applicant.',
 'application.approved',
 JSON_OBJECT(),
 JSON_ARRAY(
   JSON_OBJECT('type','create_payment_schedules','include', JSON_ARRAY('deposit','first_rent')),
   JSON_OBJECT('type','advance_stage','to','awaiting_payment'),
   JSON_OBJECT('type','notify_user','role','applicant','template','payment_required')
 ),
 1, 30),
(4, NULL, 'payments_complete_deposit_paid', 'Mark deposit paid when dues cleared',
 'When all application dues are paid, advance to deposit_paid.',
 'payment.paid',
 JSON_OBJECT('applicationDuesCleared', true),
 JSON_ARRAY(JSON_OBJECT('type','advance_stage','to','deposit_paid'), JSON_OBJECT('type','notify_agent','template','ready_for_lease')),
 1, 40),
(5, NULL, 'lease_signed_move_in', 'Schedule move-in after lease',
 'When lease is marked signed, schedule move-in and email key instructions.',
 'application.lease_signed',
 JSON_OBJECT(),
 JSON_ARRAY(
   JSON_OBJECT('type','advance_stage','to','move_in_scheduled'),
   JSON_OBJECT('type','send_key_collection_email'),
   JSON_OBJECT('type','notify_user','role','applicant','template','key_collection')
 ),
 1, 50),
(6, NULL, 'keys_activate_tenancy', 'Activate occupancy on key handover',
 'On key handover, create tenancy, set property rented, generate recurring rent schedule.',
 'application.keys_handed_over',
 JSON_OBJECT(),
 JSON_ARRAY(
   JSON_OBJECT('type','create_tenancy'),
   JSON_OBJECT('type','update_property_status','status','rented'),
   JSON_OBJECT('type','create_recurring_rent_schedule'),
   JSON_OBJECT('type','advance_stage','to','active_tenancy'),
   JSON_OBJECT('type','generate_report_snapshot','report','occupancy')
 ),
 1, 60),
(7, NULL, 'maintenance_auto_assign', 'Auto-assign maintenance to property agent',
 'New tenant maintenance tickets assign to the property agent and set SLA.',
 'maintenance.created',
 JSON_OBJECT('source','tenant'),
 JSON_ARRAY(JSON_OBJECT('type','assign_property_agent'), JSON_OBJECT('type','set_sla_hours','hours',48), JSON_OBJECT('type','notify_agent','template','new_ticket')),
 1, 70),
(8, NULL, 'rent_due_reminder', 'Rent due reminders',
 'Daily scheduler emits rent.due_soon; notify tenant 3 days before and on due date.',
 'scheduler.daily',
 JSON_OBJECT('daysBeforeDue', 3),
 JSON_ARRAY(JSON_OBJECT('type','notify_due_rents'), JSON_OBJECT('type','flag_overdue_payments')),
 1, 80);

INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload_json) VALUES
(1, 'application.approved', 'application', 3, 2, JSON_OBJECT('auto', true)),
(1, 'payment.paid', 'payment', 1, 8, JSON_OBJECT('amount', 37000)),
(1, 'maintenance.created', 'maintenance_ticket', 1, 8, JSON_OBJECT('auto_assigned', true)),
(1, 'scheduler.daily', 'system', 0, NULL, JSON_OBJECT('date', '2026-07-25'));

INSERT INTO automation_runs (rule_id, event_id, status, result_json) VALUES
(3, 1, 'success', JSON_OBJECT('paymentsCreated', 2)),
(7, 3, 'success', JSON_OBJECT('agentId', 4, 'slaHours', 48));

INSERT INTO report_snapshots (client_id, agency_id, report_code, period_start, period_end, metrics_json, generated_by) VALUES
(1, NULL, 'occupancy', '2026-07-01', '2026-07-31',
 JSON_OBJECT('properties', 4, 'rented', 1, 'occupancyPct', 25, 'rentRoll', 18500, 'outstanding', 18500, 'openTickets', 1, 'applicationsInPipeline', 2),
 'scheduler'),
(1, 1, 'agency_performance', '2026-07-01', '2026-07-31',
 JSON_OBJECT('leads', 2, 'viewings', 2, 'applications', 2, 'activeTenancies', 1),
 'scheduler'),
(2, NULL, 'occupancy', '2026-07-01', '2026-07-31',
 JSON_OBJECT('properties', 3, 'rented', 0, 'occupancyPct', 0, 'applicationsInPipeline', 1),
 'scheduler');

-- Done
SELECT
  (SELECT COUNT(*) FROM clients) AS clients,
  (SELECT COUNT(*) FROM agencies) AS agencies,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM properties) AS properties,
  (SELECT COUNT(*) FROM applications) AS applications,
  (SELECT COUNT(*) FROM automation_rules) AS automation_rules;
