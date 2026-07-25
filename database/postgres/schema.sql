-- =============================================================================
-- PropertyFlow — Asset OS Schema (PostgreSQL 13+)
-- Hierarchy: Client → Buildings → Units → Rooms → Internal Assets
-- Ops: applications, leases, bookings (viewings), maintenance_tickets
-- Flexible: client_lookup_configs, event_log, automation_rules, permissions
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop views first, then tables in dependency order
DROP VIEW IF EXISTS v_ticket_kanban CASCADE;
DROP VIEW IF EXISTS v_unit_search_cards CASCADE;
DROP VIEW IF EXISTS v_unit_summary CASCADE;
DROP VIEW IF EXISTS v_application_pipeline CASCADE;
DROP VIEW IF EXISTS v_billing_usage CASCADE;

DROP TABLE IF EXISTS automation_runs CASCADE;
DROP TABLE IF EXISTS automation_rules CASCADE;
DROP TABLE IF EXISTS event_log CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS client_subscriptions CASCADE;
DROP TABLE IF EXISTS billing_plans CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS maintenance_ticket_updates CASCADE;
DROP TABLE IF EXISTS maintenance_tickets CASCADE;
DROP TABLE IF EXISTS vendor_category_routes CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS leases CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS internal_assets CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS units CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS client_lookup_configs CASCADE;
DROP TABLE IF EXISTS clients CASCADE;

-- -----------------------------------------------------------------------------
-- Multi-tenancy
-- -----------------------------------------------------------------------------

CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name    VARCHAR(160) NOT NULL,
  subdomain       VARCHAR(80) NOT NULL UNIQUE,
  status          VARCHAR(40) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  trading_as      VARCHAR(160),
  email           VARCHAR(190),
  phone           VARCHAR(40),
  city            VARCHAR(120),
  province        VARCHAR(80),
  country_code    CHAR(2) NOT NULL DEFAULT 'ZA',
  timezone        VARCHAR(64) NOT NULL DEFAULT 'Africa/Johannesburg',
  currency_code   CHAR(3) NOT NULL DEFAULT 'ZAR',
  settings        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_status ON clients (status);
CREATE INDEX idx_clients_subdomain ON clients (subdomain);

CREATE TABLE client_lookup_configs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  config_type     VARCHAR(60) NOT NULL,
  key_value       VARCHAR(80) NOT NULL,
  display_label   VARCHAR(160) NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INT NOT NULL DEFAULT 0,
  meta            JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, config_type, key_value)
);

CREATE INDEX idx_lookup_client ON client_lookup_configs (client_id);
CREATE INDEX idx_lookup_type ON client_lookup_configs (client_id, config_type);
CREATE INDEX idx_client_lookup_configs_composite ON client_lookup_configs (client_id, config_type, key_value);

-- -----------------------------------------------------------------------------
-- Identity
-- -----------------------------------------------------------------------------

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  -- NULL client_id = platform super admin or unscoped end user
  email           VARCHAR(190) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  first_name      VARCHAR(80) NOT NULL,
  last_name       VARCHAR(80) NOT NULL,
  phone           VARCHAR(40),
  role            VARCHAR(40) NOT NULL
                    CHECK (role IN (
                      'SUPER_ADMIN',
                      'AGENCY_ADMIN',
                      'AGENT_ADMIN',
                      'GROUND_AGENT',
                      'LANDLORD',
                      'END_USER',
                      'CONTRACTOR'
                    )),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  avatar_url      VARCHAR(500),
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_client ON users (client_id);
CREATE INDEX idx_users_role ON users (role);
CREATE INDEX idx_users_client_role ON users (client_id, role);

-- Optional RBAC (lookups can also drive UI labels; these gate API actions)
CREATE TABLE permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(80) NOT NULL UNIQUE,
  description     VARCHAR(255)
);

CREATE TABLE role_permissions (
  role            VARCHAR(40) NOT NULL,
  permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_id)
);

-- -----------------------------------------------------------------------------
-- Asset OS hierarchy: buildings → units → rooms → internal_assets
-- -----------------------------------------------------------------------------

CREATE TABLE buildings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  landlord_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  name              VARCHAR(200) NOT NULL,
  address           VARCHAR(255) NOT NULL,
  city              VARCHAR(120) NOT NULL,
  province          VARCHAR(80) NOT NULL,
  suburb            VARCHAR(120),
  grading           CHAR(1) CHECK (grading IN ('P', 'A', 'B', 'C')),
  solar_capacity_kw NUMERIC(8,2) DEFAULT 0,
  has_borehole      BOOLEAN NOT NULL DEFAULT FALSE,
  lat               NUMERIC(10,7),
  lng               NUMERIC(10,7),
  images            JSONB DEFAULT '[]'::jsonb,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buildings_client ON buildings (client_id);
CREATE INDEX idx_buildings_landlord ON buildings (landlord_id);
CREATE INDEX idx_buildings_city ON buildings (city, suburb);
CREATE INDEX idx_buildings_client_landlord ON buildings (client_id, landlord_id);

CREATE TABLE units (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id       UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_number       VARCHAR(40) NOT NULL,
  square_meters     NUMERIC(10,2),
  bedrooms          SMALLINT NOT NULL DEFAULT 0,
  bathrooms         NUMERIC(3,1) NOT NULL DEFAULT 0,
  parking           SMALLINT NOT NULL DEFAULT 0,
  listing_type      VARCHAR(20) NOT NULL DEFAULT 'NOT_LISTED'
                      CHECK (listing_type IN ('RENT', 'SALE', 'BOTH', 'NOT_LISTED')),
  price             NUMERIC(14,2),          -- sale asking price ZAR
  rent              NUMERIC(14,2),          -- monthly rent ZAR
  status_config_key VARCHAR(80) NOT NULL DEFAULT 'AVAILABLE',
  agent_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  title             VARCHAR(200),
  description       TEXT,
  amenities         JSONB DEFAULT '[]'::jsonb,
  images            JSONB DEFAULT '[]'::jsonb,
  featured          BOOLEAN NOT NULL DEFAULT FALSE,
  -- Deposit override (NULL → API defaults to 2× rent for rentals / 10% for sales)
  deposit_amount    NUMERIC(14,2),
  lat               NUMERIC(10,7),
  lng               NUMERIC(10,7),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (building_id, unit_number)
);

CREATE INDEX idx_units_client ON units (client_id);
CREATE INDEX idx_units_building ON units (building_id);
CREATE INDEX idx_units_agent ON units (agent_id);
CREATE INDEX idx_units_status ON units (client_id, status_config_key);
CREATE INDEX idx_units_listing ON units (listing_type);
CREATE INDEX idx_units_building_status ON units (building_id, status_config_key, listing_type);
-- Cursor feed + marketplace filters (zero-lag search)
CREATE INDEX idx_units_feed_cursor ON units (client_id, created_at DESC, id DESC);
CREATE INDEX idx_units_rent_range ON units (client_id, listing_type, rent)
  WHERE rent IS NOT NULL AND listing_type IN ('RENT', 'BOTH');
CREATE INDEX idx_units_price_range ON units (client_id, listing_type, price)
  WHERE price IS NOT NULL AND listing_type IN ('SALE', 'BOTH');
CREATE INDEX idx_units_geo ON units (lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX idx_buildings_geo ON buildings (lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;
CREATE INDEX idx_buildings_utility_tier ON buildings (client_id, grading, solar_capacity_kw, has_borehole);

CREATE TABLE rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name            VARCHAR(80) NOT NULL,
  room_kind       VARCHAR(40) NOT NULL
                    CHECK (room_kind IN (
                      'bedroom', 'bathroom', 'kitchen', 'living',
                      'dining', 'study', 'garage', 'other'
                    )),
  beds            SMALLINT NOT NULL DEFAULT 0,
  baths           NUMERIC(3,1) NOT NULL DEFAULT 0,
  area_sqm        NUMERIC(8,2),
  -- Visual floor-plan coords (0–100 relative to unit canvas)
  layout_x        NUMERIC(5,2) CHECK (layout_x IS NULL OR (layout_x >= 0 AND layout_x <= 100)),
  layout_y        NUMERIC(5,2) CHECK (layout_y IS NULL OR (layout_y >= 0 AND layout_y <= 100)),
  layout_w        NUMERIC(5,2) CHECK (layout_w IS NULL OR (layout_w >= 0 AND layout_w <= 100)),
  layout_h        NUMERIC(5,2) CHECK (layout_h IS NULL OR (layout_h >= 0 AND layout_h <= 100)),
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_client ON rooms (client_id);
CREATE INDEX idx_rooms_unit ON rooms (unit_id);

CREATE TABLE internal_assets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id             UUID REFERENCES rooms(id) ON DELETE SET NULL,
  unit_id             UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  item_name           VARCHAR(160) NOT NULL,
  serial_number       VARCHAR(80),
  asset_type_key      VARCHAR(80) NOT NULL,
  condition_status    VARCHAR(40) NOT NULL DEFAULT 'GOOD'
                        CHECK (condition_status IN (
                          'EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'NEEDS_REPLACEMENT'
                        )),
  brand               VARCHAR(80),
  purchase_value      NUMERIC(14,2),
  warranty_expires_at TIMESTAMPTZ,
  last_inspected_at   TIMESTAMPTZ,
  notes               TEXT,
  metadata            JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_client ON internal_assets (client_id);
CREATE INDEX idx_assets_unit ON internal_assets (unit_id);
CREATE INDEX idx_assets_room ON internal_assets (room_id);
CREATE INDEX idx_assets_type ON internal_assets (client_id, asset_type_key);
CREATE INDEX idx_internal_assets_unit_type ON internal_assets (unit_id, asset_type_key);

-- -----------------------------------------------------------------------------
-- Operations
-- -----------------------------------------------------------------------------

CREATE TABLE applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id             UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  applicant_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  reference_code      VARCHAR(40) NOT NULL,
  application_type    VARCHAR(20) NOT NULL DEFAULT 'RENTAL'
                        CHECK (application_type IN ('RENTAL', 'PURCHASE')),
  status              VARCHAR(40) NOT NULL DEFAULT 'SUBMITTED'
                        CHECK (status IN (
                          'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CREDIT_CHECK',
                          'APPROVED', 'REJECTED', 'WITHDRAWN', 'LEASED'
                        )),
  monthly_income      NUMERIC(14,2),
  id_number_or_passport VARCHAR(50),
  uploaded_docs_json  JSONB DEFAULT '{}'::jsonb,
  employment_summary  VARCHAR(255),
  message             TEXT,
  move_in_date        DATE,
  decided_at          TIMESTAMPTZ,
  decided_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata            JSONB DEFAULT '{}'::jsonb,
  submitted_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, reference_code)
);

CREATE INDEX idx_applications_client ON applications (client_id);
CREATE INDEX idx_applications_unit ON applications (unit_id);
CREATE INDEX idx_applications_status ON applications (client_id, status);
CREATE INDEX idx_applications_client_applicant ON applications (client_id, applicant_id, status);

CREATE TABLE leases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id             UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  application_id      UUID REFERENCES applications(id) ON DELETE SET NULL,
  tenant_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  landlord_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  lease_reference     VARCHAR(60) NOT NULL,
  status              VARCHAR(40) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN (
                          'PENDING', 'ACTIVE', 'NOTICE', 'ENDED', 'CANCELLED'
                        )),
  start_date          DATE NOT NULL,
  end_date            DATE,
  rent_amount         NUMERIC(14,2) NOT NULL,
  deposit_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  rent_due_day        SMALLINT NOT NULL DEFAULT 1 CHECK (rent_due_day BETWEEN 1 AND 28),
  document_url        VARCHAR(500),
  metadata            JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, lease_reference)
);

CREATE INDEX idx_leases_client ON leases (client_id);
CREATE INDEX idx_leases_unit ON leases (unit_id);
CREATE INDEX idx_leases_tenant ON leases (tenant_id);
CREATE INDEX idx_leases_status ON leases (client_id, status);
CREATE INDEX idx_leases_unit_tenant ON leases (unit_id, tenant_id, status);
CREATE INDEX idx_leases_unit_active ON leases (unit_id, status)
  WHERE status IN ('PENDING', 'ACTIVE');

CREATE TABLE bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id             UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  agent_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  applicant_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  visitor_name        VARCHAR(160) NOT NULL,
  visitor_email       VARCHAR(190),
  visitor_phone       VARCHAR(40),
  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ,
  status              VARCHAR(40) NOT NULL DEFAULT 'SCHEDULED'
                        CHECK (status IN (
                          'SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED'
                        )),
  interest_level      VARCHAR(20) DEFAULT 'UNKNOWN'
                        CHECK (interest_level IN ('LOW', 'MEDIUM', 'HIGH', 'UNKNOWN')),
  feedback            TEXT,
  notes               VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_client ON bookings (client_id);
CREATE INDEX idx_bookings_unit ON bookings (unit_id);
CREATE INDEX idx_bookings_starts ON bookings (unit_id, starts_at);
CREATE INDEX idx_bookings_schedule_composite ON bookings (client_id, agent_id, starts_at, ends_at);
CREATE INDEX idx_bookings_unit_scheduled ON bookings (unit_id, starts_at)
  WHERE status = 'SCHEDULED';

-- Preferred contractor per maintenance category (agency setup)
CREATE TABLE vendor_category_routes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category_key        VARCHAR(80) NOT NULL,
  contractor_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, category_key)
);

CREATE INDEX idx_vendor_routes_client ON vendor_category_routes (client_id);

CREATE TABLE maintenance_tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id             UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  lease_id            UUID REFERENCES leases(id) ON DELETE SET NULL,
  -- API alias: internal_asset_id
  asset_id            UUID REFERENCES internal_assets(id) ON DELETE SET NULL,
  reported_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to         UUID REFERENCES users(id) ON DELETE SET NULL,
  contractor_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  category_key        VARCHAR(80),
  title               VARCHAR(200) NOT NULL,
  description         TEXT NOT NULL,
  priority            VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
                        CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT', 'EMERGENCY')),
  status              VARCHAR(40) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN (
                          'OPEN', 'TRIAGED', 'IN_PROGRESS', 'AWAITING_PARTS',
                          'RESOLVED', 'COMPLETED', 'CANCELLED'
                        )),
  warranty_covered    BOOLEAN NOT NULL DEFAULT FALSE,
  escalated_at        TIMESTAMPTZ,
  sla_due_at          TIMESTAMPTZ,
  cost_estimate       NUMERIC(12,2),
  -- API alias: actual_cost
  cost_actual         NUMERIC(12,2),
  photos              JSONB DEFAULT '[]'::jsonb,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_client ON maintenance_tickets (client_id);
CREATE INDEX idx_tickets_unit ON maintenance_tickets (unit_id);
CREATE INDEX idx_tickets_asset ON maintenance_tickets (asset_id);
CREATE INDEX idx_tickets_status ON maintenance_tickets (client_id, status);
CREATE INDEX idx_maintenance_tickets_lookup ON maintenance_tickets (client_id, status, priority);
CREATE INDEX idx_maintenance_tickets_unit_asset ON maintenance_tickets (unit_id, asset_id);
-- Kanban feed cursor (OPEN → IN_PROGRESS → RESOLVED)
CREATE INDEX idx_tickets_kanban_cursor ON maintenance_tickets (client_id, status, priority, created_at DESC, id DESC);
CREATE INDEX idx_assets_health ON internal_assets (client_id, condition_status, purchase_value);

CREATE TABLE maintenance_ticket_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  author_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  body            TEXT NOT NULL,
  status_after    VARCHAR(40),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_updates_ticket ON maintenance_ticket_updates (ticket_id);

-- -----------------------------------------------------------------------------
-- Light automation / audit (future-ready)
-- -----------------------------------------------------------------------------

CREATE TABLE event_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,
  event_type      VARCHAR(80) NOT NULL,
  subject_type    VARCHAR(60) NOT NULL,
  subject_id      UUID,
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  payload         JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_log_client ON event_log (client_id);
CREATE INDEX idx_event_log_type ON event_log (event_type, created_at);
CREATE INDEX idx_event_log_subject ON event_log (subject_type, subject_id);

CREATE TABLE automation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE,
  -- NULL client_id = platform-wide default rule
  code            VARCHAR(80) NOT NULL,
  name            VARCHAR(160) NOT NULL,
  description     TEXT,
  trigger_event   VARCHAR(80) NOT NULL,
  conditions      JSONB DEFAULT '{}'::jsonb,
  actions         JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  priority        INT NOT NULL DEFAULT 100,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, code)
);

CREATE INDEX idx_automation_rules_client ON automation_rules (client_id);

CREATE TABLE automation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES event_log(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL
                    CHECK (status IN ('success', 'skipped', 'failed')),
  result          JSONB DEFAULT '{}'::jsonb,
  error_message   VARCHAR(500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Convenience views
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_unit_summary AS
SELECT
  u.id,
  u.unit_number,
  u.title,
  u.listing_type,
  u.status_config_key,
  u.rent,
  u.price,
  u.deposit_amount,
  COALESCE(
    u.deposit_amount,
    CASE
      WHEN u.listing_type IN ('RENT', 'BOTH') AND u.rent IS NOT NULL THEN u.rent * 2
      WHEN u.listing_type IN ('SALE', 'BOTH') AND u.price IS NOT NULL THEN ROUND(u.price * 0.10, 2)
      ELSE NULL
    END
  ) AS deposit_resolved,
  CASE
    WHEN u.listing_type IN ('RENT', 'BOTH') AND u.rent IS NOT NULL THEN
      u.rent + COALESCE(u.deposit_amount, u.rent * 2)
    WHEN u.listing_type IN ('SALE', 'BOTH') AND u.price IS NOT NULL THEN
      COALESCE(u.deposit_amount, ROUND(u.price * 0.10, 2))
    ELSE NULL
  END AS total_entry_fees,
  u.bedrooms,
  u.bathrooms,
  u.square_meters,
  u.featured,
  COALESCE(u.images ->> 0, b.images ->> 0) AS primary_image,
  b.name AS building_name,
  b.suburb,
  b.city,
  b.province,
  b.grading,
  b.solar_capacity_kw,
  b.has_borehole,
  (
    b.solar_capacity_kw >= 3
    OR (b.has_borehole AND b.solar_capacity_kw > 0)
    OR COALESCE(u.amenities::text, '') ~* 'generator|inverter|solar|ups'
  ) AS is_load_shedding_free,
  (
    b.grading = 'P'
    OR (b.solar_capacity_kw >= 20 AND b.has_borehole)
  ) AS is_premium_tier,
  c.company_name AS client_name,
  c.subdomain,
  CONCAT(agent.first_name, ' ', agent.last_name) AS agent_name,
  CONCAT(ll.first_name, ' ', ll.last_name) AS landlord_name
FROM units u
JOIN buildings b ON b.id = u.building_id
JOIN clients c ON c.id = u.client_id
LEFT JOIN users agent ON agent.id = u.agent_id
LEFT JOIN users ll ON ll.id = b.landlord_id;

-- Card-ready unit search projection for GET /api/v1/units
CREATE OR REPLACE VIEW v_unit_search_cards AS
SELECT
  u.id,
  u.client_id,
  u.building_id,
  u.unit_number,
  u.title,
  u.listing_type,
  u.status_config_key AS status_key,
  u.bedrooms,
  u.bathrooms,
  u.parking,
  u.square_meters,
  u.rent,
  u.price,
  s.deposit_resolved AS deposit,
  s.total_entry_fees,
  u.featured,
  s.primary_image,
  u.amenities,
  COALESCE(u.lat, b.lat) AS lat,
  COALESCE(u.lng, b.lng) AS lng,
  s.is_load_shedding_free,
  s.is_premium_tier,
  b.name AS building_name,
  b.suburb,
  b.city,
  b.province,
  b.grading,
  b.solar_capacity_kw,
  b.has_borehole,
  u.created_at,
  u.updated_at
FROM units u
JOIN buildings b ON b.id = u.building_id
JOIN v_unit_summary s ON s.id = u.id;

-- Kanban + asset health for GET /api/v1/tickets
CREATE OR REPLACE VIEW v_ticket_kanban AS
SELECT
  t.id,
  t.client_id,
  t.unit_id,
  t.asset_id,
  t.title,
  t.priority,
  t.status,
  CASE
    WHEN t.status IN ('OPEN', 'TRIAGED') THEN 'OPEN'
    WHEN t.status IN ('RESOLVED', 'COMPLETED', 'CANCELLED') THEN 'RESOLVED'
    ELSE 'IN_PROGRESS'
  END AS kanban_column,
  t.category_key,
  t.warranty_covered,
  t.cost_actual,
  t.escalated_at,
  t.created_at,
  a.item_name AS asset_name,
  a.brand AS asset_brand,
  a.condition_status AS asset_condition,
  a.purchase_value AS asset_purchase_value,
  a.warranty_expires_at,
  CASE
    WHEN a.condition_status = 'NEEDS_REPLACEMENT' THEN 'REPLACE'
    WHEN a.condition_status = 'DAMAGED' AND COALESCE(a.purchase_value, 0) >= 15000
         AND NOT t.warranty_covered THEN 'REPLACE'
    WHEN a.condition_status IN ('FAIR', 'DAMAGED', 'GOOD') THEN 'REPAIR'
    WHEN a.id IS NULL THEN 'UNKNOWN'
    ELSE 'MONITOR'
  END AS disposition,
  CASE a.condition_status
    WHEN 'EXCELLENT' THEN 95
    WHEN 'GOOD' THEN 80
    WHEN 'FAIR' THEN 55
    WHEN 'DAMAGED' THEN 30
    WHEN 'NEEDS_REPLACEMENT' THEN 10
    ELSE 50
  END AS health_score
FROM maintenance_tickets t
LEFT JOIN internal_assets a ON a.id = t.asset_id;

CREATE OR REPLACE VIEW v_application_pipeline AS
SELECT
  a.id,
  a.reference_code,
  a.application_type,
  a.status,
  a.submitted_at,
  c.company_name AS client_name,
  u.unit_number,
  u.title AS unit_title,
  b.name AS building_name,
  CONCAT(app.first_name, ' ', app.last_name) AS applicant_name,
  CONCAT(ag.first_name, ' ', ag.last_name) AS agent_name
FROM applications a
JOIN clients c ON c.id = a.client_id
JOIN units u ON u.id = a.unit_id
JOIN buildings b ON b.id = u.building_id
LEFT JOIN users app ON app.id = a.applicant_id
LEFT JOIN users ag ON ag.id = a.agent_id;

-- -----------------------------------------------------------------------------
-- Billing engine (SaaS charges by asset footprint)
-- -----------------------------------------------------------------------------

CREATE TABLE billing_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name             VARCHAR(100) NOT NULL,
  base_monthly_fee      NUMERIC(15,2) NOT NULL,
  per_sqm_rate          NUMERIC(10,4) NOT NULL,
  per_unit_rate         NUMERIC(10,2) NOT NULL, -- billed per rentable unit
  per_room_rate         NUMERIC(10,2) NOT NULL DEFAULT 0, -- optional room adder
  grade_p_premium_fee   NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  plan_id                 UUID NOT NULL REFERENCES billing_plans(id),
  billing_cycle_anchor_day INT NOT NULL DEFAULT 1 CHECK (billing_cycle_anchor_day BETWEEN 1 AND 28),
  status                  VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE', 'PAST_DUE', 'CANCELLED', 'TRIAL')),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id)
);

CREATE INDEX idx_client_subscriptions_plan ON client_subscriptions (plan_id);
CREATE INDEX idx_client_subscriptions_billing ON client_subscriptions (client_id, plan_id, status);

CREATE TABLE invoices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subscription_id       UUID REFERENCES client_subscriptions(id) ON DELETE SET NULL,
  billing_period_start  DATE NOT NULL,
  billing_period_end    DATE NOT NULL,
  base_amount           NUMERIC(15,2) NOT NULL,
  asset_usage_amount    NUMERIC(15,2) NOT NULL,
  vat_amount            NUMERIC(15,2) NOT NULL,
  total_amount_due      NUMERIC(15,2) NOT NULL,
  payment_status        VARCHAR(50) NOT NULL DEFAULT 'UNPAID'
                          CHECK (payment_status IN ('UNPAID', 'PAID', 'FAILED', 'VOID')),
  line_items            JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_client ON invoices (client_id);
CREATE INDEX idx_invoices_status ON invoices (client_id, payment_status);
CREATE INDEX idx_invoices_period ON invoices (billing_period_start, billing_period_end);
CREATE INDEX idx_invoices_client_period ON invoices (client_id, billing_period_start, billing_period_end);

-- Usage snapshot used by the midnight billing worker
CREATE OR REPLACE VIEW v_billing_usage AS
SELECT
  b.client_id,
  cs.plan_id,
  COUNT(DISTINCT u.id) AS unit_count,
  COUNT(r.id) AS room_count,
  COALESCE(SUM(u.square_meters), 0) AS total_gla_sqm,
  COUNT(DISTINCT b.id) FILTER (WHERE b.grading = 'P') AS grade_p_building_count,
  COALESCE(SUM(u.square_meters * bp.per_sqm_rate), 0) AS sqm_charge,
  COUNT(DISTINCT u.id) * bp.per_unit_rate AS unit_charge,
  COUNT(r.id) * bp.per_room_rate AS room_charge,
  COUNT(DISTINCT b.id) FILTER (WHERE b.grading = 'P') * bp.grade_p_premium_fee AS grading_premium
FROM buildings b
JOIN units u ON u.building_id = b.id
LEFT JOIN rooms r ON r.unit_id = u.id
JOIN client_subscriptions cs ON cs.client_id = b.client_id AND cs.status IN ('ACTIVE', 'TRIAL', 'PAST_DUE')
JOIN billing_plans bp ON bp.id = cs.plan_id
GROUP BY b.client_id, cs.plan_id, bp.per_unit_rate, bp.per_room_rate, bp.grade_p_premium_fee;

-- Midnight worker helper: usage for one client (matches the billing engine query)
-- SELECT * FROM v_billing_usage WHERE client_id = 'target-client-uuid';

SELECT 'PropertyFlow PostgreSQL Asset OS schema installed' AS message;
