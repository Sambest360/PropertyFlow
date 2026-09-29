-- =============================================================================
-- PropertyFlow — Asset OS Schema (PostgreSQL 13+)
-- Hierarchy: Client → Buildings → Units → Rooms → Internal Assets
-- Ops: applications, leases, viewing_slots, bookings (viewings), maintenance_tickets,
--      leads, payments, documents, media, notifications, messages
-- Flexible: client_lookup_configs, event_log, suite_alerts, automation_rules, permissions
-- Billing: billing_plans, client_subscriptions, invoices
--
-- Frontend domain mapping (no ORM — Vite AppStore + seed.ts):
--   clients              ↔ Agency
--   users                ↔ AppUser  (role strings differ; see CHECK vs Role)
--   buildings + units    ↔ PropertyAsset (flat listing often mirrors a unit;
--                          lat/lng/place_id/formatted_address/geocoded_at)
--   rooms                ↔ Room / InfraRoom
--   internal_assets      ↔ InternalAssetItem
--   applications         ↔ Application
--   leases               ↔ Tenancy
--   viewing_slots        ↔ ViewingSlot
--   bookings             ↔ Viewing
--   leads                ↔ Lead
--   payments             ↔ PaymentRecord
--   documents            ↔ PropertyDocument / ApplicationDocument metadata
--   media_assets         ↔ PropertyAsset.images[] + payment attachments
--   notifications        ↔ AppNotification
--   message_threads/msgs ↔ MessageThread / Message
--   client_lookup_configs ↔ platformLookups / LookupConfig
--   maintenance_tickets  ↔ MaintenanceTicket
--   event_log            ↔ Activity + PropertyEvent (by event_type)
--   suite_alerts         ↔ SuiteAlertRule
--   invoices             ↔ PlatformInvoice
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
DROP TABLE IF EXISTS suite_alerts CASCADE;
DROP TABLE IF EXISTS event_log CASCADE;
DROP TABLE IF EXISTS entity_id_map CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS client_subscriptions CASCADE;
DROP TABLE IF EXISTS billing_plans CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS message_threads CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS media_assets CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS maintenance_ticket_updates CASCADE;
DROP TABLE IF EXISTS maintenance_tickets CASCADE;
DROP TABLE IF EXISTS vendor_category_routes CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS viewing_slots CASCADE;
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
  -- config_type examples: PROPERTY_TYPE, PROPERTY_STATUS, UNIT_STATUS, LISTING_MODE,
  -- LEAD_STAGE, APPLICATION_STAGE, DOC_TYPE, DOC_STATUS, TICKET_CATEGORY, TICKET_STATUS,
  -- TICKET_PRIORITY, ASSET_TYPE, ASSET_CONDITION, ROOM_KIND, PAYMENT_STATUS, PAYMENT_TYPE,
  -- PAY_METHOD, VIEWING_STATUS, TENANCY_STATUS, AMENITY, BUILDING_GRADING
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
  -- Map / geocoding (Google Places / Geocoding API)
  lat               NUMERIC(10,7),
  lng               NUMERIC(10,7),
  place_id          VARCHAR(255),
  formatted_address VARCHAR(500),
  geocoded_at       TIMESTAMPTZ,
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
  -- Unit-level override; fall back to building lat/lng when NULL
  lat               NUMERIC(10,7),
  lng               NUMERIC(10,7),
  place_id          VARCHAR(255),
  formatted_address VARCHAR(500),
  geocoded_at       TIMESTAMPTZ,
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
  /** Set when the one application-received email has been claimed. */
  received_email_at   TIMESTAMPTZ,
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

CREATE TABLE viewing_slots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id             UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  agent_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  slot_date           DATE NOT NULL,
  slot_time           VARCHAR(8) NOT NULL,
  capacity            SMALLINT NOT NULL DEFAULT 3 CHECK (capacity > 0),
  booked_count        SMALLINT NOT NULL DEFAULT 0 CHECK (booked_count >= 0),
  status              VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                        CHECK (status IN ('OPEN', 'FULL', 'CANCELLED')),
  title               VARCHAR(160),
  notes               VARCHAR(500),
  duration_minutes    SMALLINT DEFAULT 30,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_viewing_slots_client ON viewing_slots (client_id);
CREATE INDEX idx_viewing_slots_unit ON viewing_slots (unit_id, slot_date);
CREATE INDEX idx_viewing_slots_agent ON viewing_slots (agent_id, slot_date);

CREATE TABLE bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id             UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  slot_id             UUID REFERENCES viewing_slots(id) ON DELETE SET NULL,
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
-- CRM / finance / content (aligns with frontend AppStore seed)
-- -----------------------------------------------------------------------------

CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id         UUID REFERENCES units(id) ON DELETE SET NULL,
  agent_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  name            VARCHAR(160) NOT NULL,
  email           VARCHAR(190),
  phone           VARCHAR(40),
  channel         VARCHAR(60),
  stage           VARCHAR(80) NOT NULL DEFAULT 'New',
  interest_type   VARCHAR(20) NOT NULL DEFAULT 'RENT'
                    CHECK (interest_type IN ('BUY', 'RENT')),
  value_amount    NUMERIC(14,2),
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_client ON leads (client_id);
CREATE INDEX idx_leads_stage ON leads (client_id, stage);
CREATE INDEX idx_leads_agent ON leads (agent_id);

CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id             UUID REFERENCES units(id) ON DELETE SET NULL,
  lease_id            UUID REFERENCES leases(id) ON DELETE SET NULL,
  application_id      UUID REFERENCES applications(id) ON DELETE SET NULL,
  party_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  party_name          VARCHAR(160) NOT NULL,
  payment_type        VARCHAR(40) NOT NULL
                        CHECK (payment_type IN (
                          'DEPOSIT', 'FIRST_MONTH_RENT', 'RENT', 'SALE_DEPOSIT',
                          'COMMISSION', 'REFUND', 'OTHER'
                        )),
  amount              NUMERIC(14,2) NOT NULL,
  paid_amount         NUMERIC(14,2),
  status              VARCHAR(20) NOT NULL DEFAULT 'DUE'
                        CHECK (status IN ('DUE', 'PAID', 'OVERDUE', 'CANCELLED')),
  due_date            DATE NOT NULL,
  paid_at             TIMESTAMPTZ,
  method              VARCHAR(40),
  reference           VARCHAR(120),
  notes               TEXT,
  landlord_visible    BOOLEAN NOT NULL DEFAULT TRUE,
  recorded_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  attachments         JSONB DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_client ON payments (client_id);
CREATE INDEX idx_payments_status ON payments (client_id, status);
CREATE INDEX idx_payments_due ON payments (due_date, status);
CREATE INDEX idx_payments_lease ON payments (lease_id);

CREATE TABLE documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id           UUID REFERENCES units(id) ON DELETE SET NULL,
  building_id       UUID REFERENCES buildings(id) ON DELETE SET NULL,
  application_id    UUID REFERENCES applications(id) ON DELETE SET NULL,
  lease_id          UUID REFERENCES leases(id) ON DELETE SET NULL,
  uploaded_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  name              VARCHAR(255) NOT NULL,
  category          VARCHAR(40) NOT NULL DEFAULT 'OTHER'
                      CHECK (category IN (
                        'TITLE', 'COMPLIANCE', 'LEASE', 'INSPECTION',
                        'MARKETING', 'ID', 'INVOICE', 'OTHER'
                      )),
  status            VARCHAR(20) NOT NULL DEFAULT 'UPLOADED'
                      CHECK (status IN ('REQUIRED', 'UPLOADED', 'VERIFIED', 'REJECTED')),
  storage_url       VARCHAR(1000),
  mime_type         VARCHAR(120),
  file_size_bytes   INT,
  note              TEXT,
  applicant_name    VARCHAR(160),
  uploaded_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_client ON documents (client_id);
CREATE INDEX idx_documents_unit ON documents (unit_id);
CREATE INDEX idx_documents_category ON documents (client_id, category);

CREATE TABLE media_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  building_id       UUID REFERENCES buildings(id) ON DELETE CASCADE,
  unit_id           UUID REFERENCES units(id) ON DELETE CASCADE,
  kind              VARCHAR(20) NOT NULL DEFAULT 'IMAGE'
                      CHECK (kind IN ('IMAGE', 'FLOOR_PLAN', 'VIDEO', 'OTHER')),
  storage_url       VARCHAR(1000) NOT NULL,
  caption           VARCHAR(255),
  sort_order        INT NOT NULL DEFAULT 0,
  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_client ON media_assets (client_id);
CREATE INDEX idx_media_unit ON media_assets (unit_id);
CREATE INDEX idx_media_building ON media_assets (building_id);

CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             VARCHAR(200) NOT NULL,
  body              TEXT NOT NULL,
  link_path         VARCHAR(500),
  resource_type     VARCHAR(40),
  action_type       VARCHAR(20),
  broadcast_id      UUID,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE message_threads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id           UUID REFERENCES units(id) ON DELETE SET NULL,
  application_id    UUID REFERENCES applications(id) ON DELETE SET NULL,
  subject           VARCHAR(255) NOT NULL,
  routes_to         VARCHAR(20) NOT NULL DEFAULT 'AGENT'
                      CHECK (routes_to IN ('AGENCY', 'AGENT')),
  participant_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_threads_client ON message_threads (client_id);

CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  from_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_thread ON messages (thread_id, created_at);

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

-- Suite popup / notify rules (platform-wide when client_id IS NULL)
CREATE TABLE suite_alerts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID REFERENCES clients(id) ON DELETE CASCADE,
  resource            VARCHAR(40) NOT NULL,
  actions             JSONB NOT NULL DEFAULT '["created","updated","deleted"]'::jsonb,
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  popup_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  popup_duration_ms   INT NOT NULL DEFAULT 6000,
  notify_roles        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suite_alerts_client ON suite_alerts (client_id);
CREATE INDEX idx_suite_alerts_resource ON suite_alerts (resource);

-- Frontend demo IDs ↔ Postgres UUIDs (seed aliases + runtime creates from AppStore)
CREATE TABLE entity_id_map (
  entity_type   VARCHAR(40) NOT NULL,
  frontend_id   VARCHAR(120) NOT NULL,
  backend_id    UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, frontend_id)
);
CREATE UNIQUE INDEX idx_entity_id_map_backend ON entity_id_map (entity_type, backend_id);

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
  COALESCE(u.place_id, b.place_id) AS place_id,
  COALESCE(u.formatted_address, b.formatted_address, CONCAT_WS(', ', b.address, b.suburb, b.city, b.province)) AS formatted_address,
  COALESCE(u.geocoded_at, b.geocoded_at) AS geocoded_at,
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
