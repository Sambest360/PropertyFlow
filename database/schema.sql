-- =============================================================================
-- Letkaya — Infrastructure & Asset Management Schema (MySQL 8+)
-- Designed for TablePlus / ServBay local development
-- =============================================================================
-- Hierarchy: Client (SaaS tenant) → Agency → Properties ↔ Landlords / Agents
-- Lifecycle: Listing → Lead → Viewing → Application → Payments → Tenancy
-- Automation: event_log + automation_rules + stage history (state machine)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS propertyflow
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE propertyflow;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Drop in dependency order
DROP TABLE IF EXISTS report_snapshots;
DROP TABLE IF EXISTS automation_runs;
DROP TABLE IF EXISTS automation_rules;
DROP TABLE IF EXISTS event_log;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS message_threads;
DROP TABLE IF EXISTS maintenance_updates;
DROP TABLE IF EXISTS maintenance_tickets;
DROP TABLE IF EXISTS contractors;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS payment_schedules;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS tenancy_occupants;
DROP TABLE IF EXISTS tenancies;
DROP TABLE IF EXISTS credit_checks;
DROP TABLE IF EXISTS application_documents;
DROP TABLE IF EXISTS application_stage_history;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS viewings;
DROP TABLE IF EXISTS viewing_slots;
DROP TABLE IF EXISTS leads;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS listing_packages;
DROP TABLE IF EXISTS property_material_defects;
DROP TABLE IF EXISTS property_condition_reports;
DROP TABLE IF EXISTS property_feature_map;
DROP TABLE IF EXISTS property_features;
DROP TABLE IF EXISTS property_media;
DROP TABLE IF EXISTS property_rooms;
DROP TABLE IF EXISTS properties;
DROP TABLE IF EXISTS agent_profiles;
DROP TABLE IF EXISTS landlord_profiles;
DROP TABLE IF EXISTS applicant_profiles;
DROP TABLE IF EXISTS user_permissions;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS agencies;
DROP TABLE IF EXISTS clients;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- Platform / multi-tenant
-- -----------------------------------------------------------------------------

CREATE TABLE clients (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE,
  name            VARCHAR(160) NOT NULL,
  trading_as      VARCHAR(160) NULL,
  slug            VARCHAR(80) NOT NULL UNIQUE,
  registration_no VARCHAR(64) NULL COMMENT 'CIPC / company number',
  vat_number      VARCHAR(32) NULL,
  email           VARCHAR(190) NOT NULL,
  phone           VARCHAR(40) NULL,
  website         VARCHAR(255) NULL,
  logo_url        VARCHAR(500) NULL,
  billing_email   VARCHAR(190) NULL,
  address_line1   VARCHAR(255) NULL,
  address_line2   VARCHAR(255) NULL,
  suburb          VARCHAR(120) NULL,
  city            VARCHAR(120) NULL,
  province        VARCHAR(80) NULL,
  postal_code     VARCHAR(20) NULL,
  country_code    CHAR(2) NOT NULL DEFAULT 'ZA',
  timezone        VARCHAR(64) NOT NULL DEFAULT 'Africa/Johannesburg',
  currency_code   CHAR(3) NOT NULL DEFAULT 'ZAR',
  status          ENUM('trial','active','suspended','cancelled') NOT NULL DEFAULT 'active',
  plan_code       VARCHAR(40) NULL DEFAULT 'growth',
  settings_json   JSON NULL COMMENT 'Feature flags, branding, workflow config',
  onboarded_at    DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL,
  INDEX idx_clients_status (status)
) ENGINE=InnoDB;

CREATE TABLE agencies (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE,
  client_id       BIGINT UNSIGNED NOT NULL,
  name            VARCHAR(160) NOT NULL,
  slug            VARCHAR(80) NOT NULL,
  branch_code     VARCHAR(40) NULL,
  email           VARCHAR(190) NULL,
  phone           VARCHAR(40) NULL,
  whatsapp        VARCHAR(40) NULL,
  ppra_number     VARCHAR(64) NULL COMMENT 'Property Practitioners Regulatory Authority',
  fica_accountable TINYINT(1) NOT NULL DEFAULT 1,
  address_line1   VARCHAR(255) NULL,
  suburb          VARCHAR(120) NULL,
  city            VARCHAR(120) NULL,
  province        VARCHAR(80) NULL,
  postal_code     VARCHAR(20) NULL,
  lat             DECIMAL(10,7) NULL,
  lng             DECIMAL(10,7) NULL,
  status          ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  metadata_json   JSON NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL,
  UNIQUE KEY uq_agency_client_slug (client_id, slug),
  CONSTRAINT fk_agencies_client FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Identity & access
-- -----------------------------------------------------------------------------

CREATE TABLE permissions (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE users (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE,
  client_id       BIGINT UNSIGNED NULL COMMENT 'NULL = platform super admin',
  agency_id       BIGINT UNSIGNED NULL,
  email           VARCHAR(190) NOT NULL,
  password_hash   VARCHAR(255) NULL COMMENT 'bcrypt/argon; demo seeds use placeholder',
  first_name      VARCHAR(80) NOT NULL,
  last_name       VARCHAR(80) NOT NULL,
  display_name    VARCHAR(160) GENERATED ALWAYS AS (CONCAT(first_name, ' ', last_name)) STORED,
  phone           VARCHAR(40) NULL,
  mobile          VARCHAR(40) NULL,
  id_number       VARCHAR(32) NULL COMMENT 'SA ID / passport',
  id_type         ENUM('sa_id','passport','asylum','other') NULL,
  nationality     VARCHAR(80) NULL,
  date_of_birth   DATE NULL,
  gender          ENUM('female','male','other','unspecified') NULL DEFAULT 'unspecified',
  avatar_url      VARCHAR(500) NULL,
  preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
  role            ENUM(
                    'super_admin',
                    'client_admin',
                    'agency_admin',
                    'agent',
                    'landlord',
                    'applicant',
                    'tenant',
                    'contractor',
                    'finance',
                    'viewer'
                  ) NOT NULL,
  status          ENUM('invited','active','disabled','archived') NOT NULL DEFAULT 'active',
  email_verified_at DATETIME NULL,
  last_login_at   DATETIME NULL,
  last_login_ip   VARCHAR(45) NULL,
  mfa_enabled     TINYINT(1) NOT NULL DEFAULT 0,
  marketing_opt_in TINYINT(1) NOT NULL DEFAULT 0,
  popia_consent_at DATETIME NULL,
  notes           TEXT NULL,
  metadata_json   JSON NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME NULL,
  UNIQUE KEY uq_users_email_client (client_id, email),
  INDEX idx_users_role (role),
  INDEX idx_users_agency (agency_id),
  CONSTRAINT fk_users_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_users_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  role            VARCHAR(40) NOT NULL,
  permission_id   BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role, permission_id),
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions(id)
) ENGINE=InnoDB;

CREATE TABLE user_permissions (
  user_id         BIGINT UNSIGNED NOT NULL,
  permission_id   BIGINT UNSIGNED NOT NULL,
  granted         TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, permission_id),
  CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_up_perm FOREIGN KEY (permission_id) REFERENCES permissions(id)
) ENGINE=InnoDB;

CREATE TABLE landlord_profiles (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED NOT NULL UNIQUE,
  client_id           BIGINT UNSIGNED NOT NULL,
  entity_type         ENUM('individual','trust','company','other') NOT NULL DEFAULT 'individual',
  legal_name          VARCHAR(190) NOT NULL,
  trading_name        VARCHAR(190) NULL,
  tax_number          VARCHAR(64) NULL,
  bank_name           VARCHAR(80) NULL,
  bank_account_name   VARCHAR(160) NULL,
  bank_account_number VARCHAR(40) NULL,
  bank_branch_code    VARCHAR(20) NULL,
  payout_method       ENUM('eft','debit_order','other') NOT NULL DEFAULT 'eft',
  preferred_payout_day TINYINT UNSIGNED NULL,
  emergency_contact_name  VARCHAR(120) NULL,
  emergency_contact_phone VARCHAR(40) NULL,
  fica_verified_at    DATETIME NULL,
  notes               TEXT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_landlord_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_landlord_client FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB;

CREATE TABLE agent_profiles (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id             BIGINT UNSIGNED NOT NULL UNIQUE,
  agency_id           BIGINT UNSIGNED NOT NULL,
  employee_code       VARCHAR(40) NULL,
  job_title           VARCHAR(80) NULL DEFAULT 'Property Practitioner',
  license_number      VARCHAR(64) NULL,
  specializations     JSON NULL COMMENT '["sales","rentals","commercial"]',
  bio                 TEXT NULL,
  commission_rate_bps INT UNSIGNED NULL COMMENT 'basis points e.g. 500 = 5%',
  target_monthly_deals INT UNSIGNED NULL,
  years_experience    TINYINT UNSIGNED NULL,
  languages           JSON NULL,
  is_primary_contact  TINYINT(1) NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_agent_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)
) ENGINE=InnoDB;

CREATE TABLE applicant_profiles (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                 BIGINT UNSIGNED NOT NULL UNIQUE,
  client_id               BIGINT UNSIGNED NULL,
  employment_status       ENUM('employed','self_employed','student','retired','unemployed','other') NULL,
  employer_name           VARCHAR(160) NULL,
  employer_phone          VARCHAR(40) NULL,
  job_title               VARCHAR(120) NULL,
  monthly_net_income      DECIMAL(14,2) NULL,
  other_income            DECIMAL(14,2) NULL,
  affordability_notes     TEXT NULL,
  marital_status          ENUM('single','married','divorced','widowed','life_partner','other') NULL,
  dependants_count        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  current_address         VARCHAR(255) NULL,
  current_suburb          VARCHAR(120) NULL,
  current_city            VARCHAR(120) NULL,
  years_at_current_address DECIMAL(4,1) NULL,
  previous_landlord_name  VARCHAR(160) NULL,
  previous_landlord_phone VARCHAR(40) NULL,
  emergency_contact_name  VARCHAR(120) NULL,
  emergency_contact_phone VARCHAR(40) NULL,
  emergency_contact_relation VARCHAR(60) NULL,
  preferred_move_in_date  DATE NULL,
  pets                    TINYINT(1) NOT NULL DEFAULT 0,
  pet_details             VARCHAR(255) NULL,
  smoker                  TINYINT(1) NOT NULL DEFAULT 0,
  vehicle_count           TINYINT UNSIGNED NOT NULL DEFAULT 0,
  credit_consent_at       DATETIME NULL,
  fica_completed_at       DATETIME NULL,
  risk_score              DECIMAL(5,2) NULL,
  notes                   TEXT NULL,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_applicant_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_applicant_client FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Assets / Property24-style listings
-- -----------------------------------------------------------------------------

CREATE TABLE properties (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                CHAR(36) NOT NULL UNIQUE,
  client_id           BIGINT UNSIGNED NOT NULL,
  agency_id           BIGINT UNSIGNED NOT NULL,
  landlord_id         BIGINT UNSIGNED NOT NULL COMMENT 'landlord_profiles.id',
  assigned_agent_id   BIGINT UNSIGNED NULL COMMENT 'users.id role=agent',
  reference_code      VARCHAR(40) NOT NULL,
  title               VARCHAR(200) NOT NULL,
  marketing_headline  VARCHAR(255) NULL,
  description         TEXT NOT NULL,
  property_type       ENUM('house','apartment','townhouse','vacant_land','commercial','industrial','farm','student','other') NOT NULL,
  listing_intent      ENUM('sale','rent','both') NOT NULL DEFAULT 'rent',
  status              ENUM(
                        'draft','pending_compliance','ready','published','featured',
                        'under_offer','sold','rented','withdrawn','archived','maintenance'
                      ) NOT NULL DEFAULT 'draft',
  -- Location (Property24 required)
  unit_number         VARCHAR(40) NULL,
  complex_name        VARCHAR(160) NULL,
  street_number       VARCHAR(20) NULL,
  street_name         VARCHAR(160) NOT NULL,
  suburb              VARCHAR(120) NOT NULL,
  city                VARCHAR(120) NOT NULL,
  province            VARCHAR(80) NOT NULL,
  postal_code         VARCHAR(20) NULL,
  country_code        CHAR(2) NOT NULL DEFAULT 'ZA',
  lat                 DECIMAL(10,7) NULL,
  lng                 DECIMAL(10,7) NULL,
  location_precision  ENUM('exact','approximate','suburb_only') NOT NULL DEFAULT 'exact',
  -- Pricing
  asking_price        DECIMAL(14,2) NULL COMMENT 'Sale price ZAR',
  monthly_rent        DECIMAL(14,2) NULL,
  rates_monthly       DECIMAL(12,2) NULL COMMENT 'Municipal rates',
  levies_monthly      DECIMAL(12,2) NULL,
  deposit_amount      DECIMAL(14,2) NULL,
  available_from      DATE NULL,
  -- Sizes (Property24)
  erf_size_sqm        DECIMAL(12,2) NULL COMMENT 'Land / erf',
  floor_size_sqm      DECIMAL(12,2) NULL,
  -- Counts
  bedrooms            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  bathrooms           DECIMAL(3,1) NOT NULL DEFAULT 0,
  reception_rooms     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  studies             TINYINT UNSIGNED NOT NULL DEFAULT 0,
  garages             TINYINT UNSIGNED NOT NULL DEFAULT 0,
  open_parking        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  covered_parking     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  storeys             TINYINT UNSIGNED NULL,
  year_built          SMALLINT UNSIGNED NULL,
  furnished           ENUM('no','semi','yes') NOT NULL DEFAULT 'no',
  pet_friendly        TINYINT(1) NOT NULL DEFAULT 0,
  -- Interior / exterior narrative extras
  kitchen_type        VARCHAR(80) NULL,
  garden_description  VARCHAR(255) NULL,
  security_notes      TEXT NULL,
  staff_quarters      TINYINT(1) NOT NULL DEFAULT 0,
  pool                TINYINT(1) NOT NULL DEFAULT 0,
  -- Compliance (Property Practitioners Act)
  material_defects_disclosed TINYINT(1) NOT NULL DEFAULT 0,
  condition_report_required  TINYINT(1) NOT NULL DEFAULT 1,
  condition_report_completed_at DATETIME NULL,
  -- Virtual / marketing
  virtual_tour_url   VARCHAR(500) NULL,
  floor_plan_url      VARCHAR(500) NULL,
  video_url           VARCHAR(500) NULL,
  first_photo_url     VARCHAR(500) NULL COMMENT 'Main display image (Property24)',
  photo_count         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  view_count          INT UNSIGNED NOT NULL DEFAULT 0,
  enquiry_count       INT UNSIGNED NOT NULL DEFAULT 0,
  published_at        DATETIME NULL,
  withdrawn_at        DATETIME NULL,
  tags_json           JSON NULL,
  attributes_json     JSON NULL COMMENT 'Flexible extra attributes',
  created_by          BIGINT UNSIGNED NULL,
  updated_by          BIGINT UNSIGNED NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME NULL,
  UNIQUE KEY uq_prop_client_ref (client_id, reference_code),
  INDEX idx_prop_status (status),
  INDEX idx_prop_geo (city, suburb),
  INDEX idx_prop_agency (agency_id),
  INDEX idx_prop_landlord (landlord_id),
  INDEX idx_prop_agent (assigned_agent_id),
  FULLTEXT KEY ft_prop_search (title, description, suburb, city, marketing_headline),
  CONSTRAINT fk_prop_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_prop_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_prop_landlord FOREIGN KEY (landlord_id) REFERENCES landlord_profiles(id),
  CONSTRAINT fk_prop_agent FOREIGN KEY (assigned_agent_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE property_rooms (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  property_id   BIGINT UNSIGNED NOT NULL,
  name          VARCHAR(80) NOT NULL,
  room_type     ENUM('bedroom','bathroom','kitchen','lounge','dining','study','garage','other') NOT NULL DEFAULT 'other',
  beds          TINYINT UNSIGNED NOT NULL DEFAULT 0,
  baths         DECIMAL(3,1) NOT NULL DEFAULT 0,
  area_sqm      DECIMAL(8,2) NULL,
  floor_level   VARCHAR(40) NULL,
  notes         VARCHAR(255) NULL,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_rooms_prop FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE property_media (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  property_id   BIGINT UNSIGNED NOT NULL,
  media_type    ENUM('photo','floor_plan','video','document','virtual_tour') NOT NULL DEFAULT 'photo',
  url           VARCHAR(500) NOT NULL,
  thumbnail_url VARCHAR(500) NULL,
  caption       VARCHAR(255) NULL,
  alt_text      VARCHAR(255) NULL,
  is_primary    TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'First/main Property24 photo',
  sort_order    TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0-15 for photos (max 16)',
  width_px      INT UNSIGNED NULL,
  height_px     INT UNSIGNED NULL,
  file_size_kb  INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_media_prop (property_id, sort_order),
  CONSTRAINT fk_media_prop FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE property_features (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(60) NOT NULL UNIQUE,
  label       VARCHAR(120) NOT NULL,
  category    ENUM('interior','exterior','security','parking','amenities','building','other') NOT NULL DEFAULT 'amenities',
  icon        VARCHAR(40) NULL
) ENGINE=InnoDB;

CREATE TABLE property_feature_map (
  property_id BIGINT UNSIGNED NOT NULL,
  feature_id  BIGINT UNSIGNED NOT NULL,
  value_text  VARCHAR(120) NULL,
  PRIMARY KEY (property_id, feature_id),
  CONSTRAINT fk_pfm_prop FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_pfm_feat FOREIGN KEY (feature_id) REFERENCES property_features(id)
) ENGINE=InnoDB;

CREATE TABLE property_condition_reports (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  property_id     BIGINT UNSIGNED NOT NULL,
  prepared_by     BIGINT UNSIGNED NULL,
  report_date     DATE NOT NULL,
  overall_condition ENUM('excellent','good','fair','poor','unknown') NOT NULL DEFAULT 'unknown',
  summary         TEXT NULL,
  rooms_json      JSON NULL COMMENT 'Per-room condition notes',
  signed_by_landlord_at DATETIME NULL,
  document_url    VARCHAR(500) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pcr_prop FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcr_user FOREIGN KEY (prepared_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE property_material_defects (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  property_id   BIGINT UNSIGNED NOT NULL,
  title         VARCHAR(160) NOT NULL,
  description   TEXT NOT NULL,
  severity      ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  disclosed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at   DATETIME NULL,
  CONSTRAINT fk_pmd_prop FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE listing_packages (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(40) NOT NULL UNIQUE,
  name            VARCHAR(80) NOT NULL,
  channel         ENUM('sale','rent','both') NOT NULL DEFAULT 'both',
  price_zar       DECIMAL(10,2) NOT NULL,
  duration_days   INT UNSIGNED NOT NULL DEFAULT 30,
  max_photos      TINYINT UNSIGNED NOT NULL DEFAULT 16,
  featured        TINYINT(1) NOT NULL DEFAULT 0,
  description     VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE listings (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                CHAR(36) NOT NULL UNIQUE,
  property_id         BIGINT UNSIGNED NOT NULL,
  agency_id           BIGINT UNSIGNED NOT NULL,
  package_id          BIGINT UNSIGNED NULL,
  channel             ENUM('internal','property24','private','other') NOT NULL DEFAULT 'internal',
  external_ref        VARCHAR(80) NULL,
  status              ENUM('draft','pending_payment','active','expired','paused','removed') NOT NULL DEFAULT 'draft',
  listing_fee_zar     DECIMAL(10,2) NULL,
  fee_payment_method  ENUM('card','eft','invoice','waived') NULL,
  fee_paid_at         DATETIME NULL,
  billing_email       VARCHAR(190) NULL,
  goes_live_at        DATETIME NULL,
  expires_at          DATETIME NULL,
  auto_renew          TINYINT(1) NOT NULL DEFAULT 0,
  impressions         INT UNSIGNED NOT NULL DEFAULT 0,
  clicks              INT UNSIGNED NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_list_prop FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_list_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_list_pkg FOREIGN KEY (package_id) REFERENCES listing_packages(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Sales / leasing pipeline
-- -----------------------------------------------------------------------------

CREATE TABLE leads (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE,
  client_id       BIGINT UNSIGNED NOT NULL,
  agency_id       BIGINT UNSIGNED NOT NULL,
  property_id     BIGINT UNSIGNED NULL,
  agent_id        BIGINT UNSIGNED NULL,
  applicant_user_id BIGINT UNSIGNED NULL,
  full_name       VARCHAR(160) NOT NULL,
  email           VARCHAR(190) NULL,
  phone           VARCHAR(40) NULL,
  source          VARCHAR(60) NOT NULL DEFAULT 'web',
  channel         ENUM('web','whatsapp','phone','walk_in','portal','referral','other') NOT NULL DEFAULT 'web',
  intent          ENUM('buy','rent','unknown') NOT NULL DEFAULT 'unknown',
  stage           VARCHAR(60) NOT NULL DEFAULT 'new',
  score           TINYINT UNSIGNED NULL,
  budget_min      DECIMAL(14,2) NULL,
  budget_max      DECIMAL(14,2) NULL,
  message         TEXT NULL,
  next_follow_up_at DATETIME NULL,
  converted_application_id BIGINT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leads_stage (stage),
  CONSTRAINT fk_leads_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_leads_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_leads_prop FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_leads_agent FOREIGN KEY (agent_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE viewing_slots (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  property_id     BIGINT UNSIGNED NOT NULL,
  agency_id       BIGINT UNSIGNED NOT NULL,
  agent_id        BIGINT UNSIGNED NOT NULL,
  starts_at       DATETIME NOT NULL,
  ends_at         DATETIME NOT NULL,
  capacity        TINYINT UNSIGNED NOT NULL DEFAULT 3,
  booked_count    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  status          ENUM('open','full','cancelled','completed') NOT NULL DEFAULT 'open',
  notes           VARCHAR(255) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_slots_prop_time (property_id, starts_at),
  CONSTRAINT fk_slots_prop FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_slots_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_slots_agent FOREIGN KEY (agent_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE viewings (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE,
  slot_id         BIGINT UNSIGNED NULL,
  property_id     BIGINT UNSIGNED NOT NULL,
  agency_id       BIGINT UNSIGNED NOT NULL,
  agent_id        BIGINT UNSIGNED NOT NULL,
  lead_id         BIGINT UNSIGNED NULL,
  application_id  BIGINT UNSIGNED NULL,
  applicant_user_id BIGINT UNSIGNED NULL,
  applicant_name  VARCHAR(160) NOT NULL,
  applicant_email VARCHAR(190) NULL,
  applicant_phone VARCHAR(40) NULL,
  starts_at       DATETIME NOT NULL,
  status          ENUM('scheduled','completed','no_show','cancelled','rescheduled') NOT NULL DEFAULT 'scheduled',
  attendance      ENUM('unknown','attended','no_show') NOT NULL DEFAULT 'unknown',
  feedback        TEXT NULL,
  interest_level  ENUM('low','medium','high','unknown') NOT NULL DEFAULT 'unknown',
  reminder_sent_at DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_view_slot FOREIGN KEY (slot_id) REFERENCES viewing_slots(id),
  CONSTRAINT fk_view_prop FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_view_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_view_agent FOREIGN KEY (agent_id) REFERENCES users(id),
  CONSTRAINT fk_view_lead FOREIGN KEY (lead_id) REFERENCES leads(id)
) ENGINE=InnoDB;

CREATE TABLE applications (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                CHAR(36) NOT NULL UNIQUE,
  reference_code      VARCHAR(40) NOT NULL,
  client_id           BIGINT UNSIGNED NOT NULL,
  agency_id           BIGINT UNSIGNED NOT NULL,
  property_id         BIGINT UNSIGNED NOT NULL,
  agent_id            BIGINT UNSIGNED NULL,
  applicant_user_id   BIGINT UNSIGNED NULL,
  lead_id             BIGINT UNSIGNED NULL,
  application_type    ENUM('rental','purchase') NOT NULL,
  stage               ENUM(
                        'started','documents_pending','documents_submitted','viewing_booked',
                        'under_review','credit_check','approved','awaiting_payment',
                        'deposit_paid','lease_signed','move_in_scheduled','keys_handed_over',
                        'active_tenancy','rejected','withdrawn'
                      ) NOT NULL DEFAULT 'started',
  progress_pct        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  monthly_income      DECIMAL(14,2) NULL,
  employment_summary  VARCHAR(255) NULL,
  credit_consent      TINYINT(1) NOT NULL DEFAULT 0,
  credit_status       ENUM('not_started','consent_received','in_progress','passed','failed') NOT NULL DEFAULT 'not_started',
  decision_notes      TEXT NULL,
  decided_by          BIGINT UNSIGNED NULL,
  decided_at          DATETIME NULL,
  move_in_date        DATE NULL,
  key_collection_json JSON NULL COMMENT '{location,instructions,contact,email_sent_at}',
  auto_advanced       TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Last advance was automation',
  submitted_at        DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_app_ref (client_id, reference_code),
  INDEX idx_app_stage (stage),
  CONSTRAINT fk_app_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_app_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_app_prop FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_app_agent FOREIGN KEY (agent_id) REFERENCES users(id),
  CONSTRAINT fk_app_user FOREIGN KEY (applicant_user_id) REFERENCES users(id),
  CONSTRAINT fk_app_lead FOREIGN KEY (lead_id) REFERENCES leads(id)
) ENGINE=InnoDB;

CREATE TABLE application_stage_history (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id  BIGINT UNSIGNED NOT NULL,
  from_stage      VARCHAR(60) NULL,
  to_stage        VARCHAR(60) NOT NULL,
  triggered_by    ENUM('user','automation','system','payment','document') NOT NULL DEFAULT 'user',
  actor_user_id   BIGINT UNSIGNED NULL,
  note            VARCHAR(255) NULL,
  payload_json    JSON NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ash_app (application_id, created_at),
  CONSTRAINT fk_ash_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE application_documents (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id  BIGINT UNSIGNED NOT NULL,
  doc_key         VARCHAR(60) NOT NULL,
  label           VARCHAR(160) NOT NULL,
  status          ENUM('required','uploaded','verified','rejected','expired') NOT NULL DEFAULT 'required',
  file_url        VARCHAR(500) NULL,
  file_name       VARCHAR(255) NULL,
  mime_type       VARCHAR(80) NULL,
  verified_by     BIGINT UNSIGNED NULL,
  verified_at     DATETIME NULL,
  rejection_reason VARCHAR(255) NULL,
  expires_at      DATE NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_app_doc (application_id, doc_key),
  CONSTRAINT fk_adoc_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE credit_checks (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_id  BIGINT UNSIGNED NOT NULL,
  bureau          VARCHAR(80) NULL,
  consent_at      DATETIME NULL,
  status          ENUM('pending','completed','failed') NOT NULL DEFAULT 'pending',
  score           INT NULL,
  report_url      VARCHAR(500) NULL,
  summary_json    JSON NULL,
  checked_at      DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cc_app FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Occupancy & money
-- -----------------------------------------------------------------------------

CREATE TABLE tenancies (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                CHAR(36) NOT NULL UNIQUE,
  client_id           BIGINT UNSIGNED NOT NULL,
  agency_id           BIGINT UNSIGNED NOT NULL,
  property_id         BIGINT UNSIGNED NOT NULL,
  landlord_id         BIGINT UNSIGNED NOT NULL,
  agent_id            BIGINT UNSIGNED NULL,
  application_id      BIGINT UNSIGNED NULL,
  primary_tenant_user_id BIGINT UNSIGNED NULL,
  lease_reference     VARCHAR(60) NOT NULL,
  status              ENUM('pending_move_in','active','notice','ended','cancelled') NOT NULL DEFAULT 'pending_move_in',
  start_date          DATE NOT NULL,
  end_date            DATE NULL,
  rent_amount         DECIMAL(14,2) NOT NULL,
  deposit_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  rent_due_day        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  payment_method      ENUM('eft','debit_order','card','other') NOT NULL DEFAULT 'eft',
  key_collection_json JSON NULL,
  lease_document_url  VARCHAR(500) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ten_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_ten_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_ten_prop FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_ten_landlord FOREIGN KEY (landlord_id) REFERENCES landlord_profiles(id),
  CONSTRAINT fk_ten_app FOREIGN KEY (application_id) REFERENCES applications(id)
) ENGINE=InnoDB;

CREATE TABLE tenancy_occupants (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenancy_id      BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NULL,
  full_name       VARCHAR(160) NOT NULL,
  relationship    VARCHAR(60) NULL,
  is_primary      TINYINT(1) NOT NULL DEFAULT 0,
  id_number       VARCHAR(32) NULL,
  CONSTRAINT fk_occ_ten FOREIGN KEY (tenancy_id) REFERENCES tenancies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payment_schedules (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenancy_id      BIGINT UNSIGNED NULL,
  application_id  BIGINT UNSIGNED NULL,
  property_id     BIGINT UNSIGNED NOT NULL,
  schedule_type   ENUM('deposit','first_rent','recurring_rent','sale_deposit','other') NOT NULL,
  amount          DECIMAL(14,2) NOT NULL,
  due_date        DATE NOT NULL,
  status          ENUM('scheduled','invoiced','paid','overdue','cancelled') NOT NULL DEFAULT 'scheduled',
  auto_generated  TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ps_ten FOREIGN KEY (tenancy_id) REFERENCES tenancies(id),
  CONSTRAINT fk_ps_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_ps_prop FOREIGN KEY (property_id) REFERENCES properties(id)
) ENGINE=InnoDB;

CREATE TABLE invoices (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE,
  client_id       BIGINT UNSIGNED NOT NULL,
  invoice_number  VARCHAR(40) NOT NULL,
  party_user_id   BIGINT UNSIGNED NULL,
  party_name      VARCHAR(160) NOT NULL,
  property_id     BIGINT UNSIGNED NULL,
  application_id  BIGINT UNSIGNED NULL,
  tenancy_id      BIGINT UNSIGNED NULL,
  amount          DECIMAL(14,2) NOT NULL,
  vat_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  status          ENUM('draft','issued','paid','void','overdue') NOT NULL DEFAULT 'issued',
  issued_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_date        DATE NOT NULL,
  paid_at         DATETIME NULL,
  UNIQUE KEY uq_inv_client_no (client_id, invoice_number),
  CONSTRAINT fk_inv_client FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE,
  client_id       BIGINT UNSIGNED NOT NULL,
  agency_id       BIGINT UNSIGNED NOT NULL,
  property_id     BIGINT UNSIGNED NOT NULL,
  application_id  BIGINT UNSIGNED NULL,
  tenancy_id      BIGINT UNSIGNED NULL,
  invoice_id      BIGINT UNSIGNED NULL,
  schedule_id     BIGINT UNSIGNED NULL,
  party_user_id   BIGINT UNSIGNED NULL,
  party_name      VARCHAR(160) NOT NULL,
  payment_type    ENUM('deposit','first_month_rent','rent','sale_deposit','commission','refund','listing_fee','other') NOT NULL,
  amount          DECIMAL(14,2) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'ZAR',
  status          ENUM('due','processing','paid','failed','overdue','cancelled','refunded') NOT NULL DEFAULT 'due',
  due_date        DATE NULL,
  paid_at         DATETIME NULL,
  method          ENUM('eft','card','debit_order','cash','other') NULL,
  reference       VARCHAR(80) NULL,
  landlord_visible TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Show amount to landlord without tenant PII',
  auto_allocated  TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pay_status (status, due_date),
  CONSTRAINT fk_pay_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_pay_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_pay_prop FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_pay_app FOREIGN KEY (application_id) REFERENCES applications(id),
  CONSTRAINT fk_pay_ten FOREIGN KEY (tenancy_id) REFERENCES tenancies(id),
  CONSTRAINT fk_pay_inv FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT fk_pay_sched FOREIGN KEY (schedule_id) REFERENCES payment_schedules(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Ops: maintenance & messaging (tenant ↔ agency/agent only)
-- -----------------------------------------------------------------------------

CREATE TABLE contractors (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id       BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NULL,
  company_name    VARCHAR(160) NOT NULL,
  trade           VARCHAR(80) NOT NULL,
  phone           VARCHAR(40) NULL,
  email           VARCHAR(190) NULL,
  rating          DECIMAL(3,2) NULL,
  active          TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_con_client FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB;

CREATE TABLE maintenance_tickets (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE,
  client_id       BIGINT UNSIGNED NOT NULL,
  agency_id       BIGINT UNSIGNED NOT NULL,
  property_id     BIGINT UNSIGNED NOT NULL,
  tenancy_id      BIGINT UNSIGNED NULL,
  reported_by_user_id BIGINT UNSIGNED NULL,
  assigned_agent_id BIGINT UNSIGNED NULL,
  contractor_id   BIGINT UNSIGNED NULL,
  asset_label     VARCHAR(120) NULL,
  title           VARCHAR(200) NOT NULL,
  description     TEXT NOT NULL,
  priority        ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  status          ENUM('requested','triaged','in_progress','awaiting_parts','completed','cancelled') NOT NULL DEFAULT 'requested',
  sla_due_at      DATETIME NULL,
  cost_estimate   DECIMAL(12,2) NULL,
  cost_actual     DECIMAL(12,2) NULL,
  photo_count     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  auto_assigned   TINYINT(1) NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at    DATETIME NULL,
  CONSTRAINT fk_mt_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_mt_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_mt_prop FOREIGN KEY (property_id) REFERENCES properties(id),
  CONSTRAINT fk_mt_contractor FOREIGN KEY (contractor_id) REFERENCES contractors(id)
) ENGINE=InnoDB;

CREATE TABLE maintenance_updates (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id       BIGINT UNSIGNED NOT NULL,
  author_user_id  BIGINT UNSIGNED NULL,
  body            TEXT NOT NULL,
  status_after    VARCHAR(40) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mu_ticket FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE message_threads (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36) NOT NULL UNIQUE,
  client_id       BIGINT UNSIGNED NOT NULL,
  agency_id       BIGINT UNSIGNED NOT NULL,
  property_id     BIGINT UNSIGNED NULL,
  application_id  BIGINT UNSIGNED NULL,
  tenancy_id      BIGINT UNSIGNED NULL,
  subject         VARCHAR(200) NOT NULL,
  routes_to       ENUM('agency','agent','landlord') NOT NULL DEFAULT 'agent' COMMENT 'Mode A: landlord = owner↔tenant in-app',
  created_by      BIGINT UNSIGNED NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_th_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_th_agency FOREIGN KEY (agency_id) REFERENCES agencies(id)
) ENGINE=InnoDB;

CREATE TABLE messages (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  thread_id       BIGINT UNSIGNED NOT NULL,
  from_user_id    BIGINT UNSIGNED NOT NULL,
  body            TEXT NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at         DATETIME NULL,
  CONSTRAINT fk_msg_thread FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_user FOREIGN KEY (from_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT UNSIGNED NOT NULL,
  client_id       BIGINT UNSIGNED NULL,
  channel         ENUM('in_app','email','sms','whatsapp') NOT NULL DEFAULT 'in_app',
  title           VARCHAR(160) NOT NULL,
  body            TEXT NOT NULL,
  link_path       VARCHAR(255) NULL,
  read_at         DATETIME NULL,
  sent_at         DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, read_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Automation & reporting (event-driven; reduce manual clicking)
-- -----------------------------------------------------------------------------

CREATE TABLE event_log (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id       BIGINT UNSIGNED NULL,
  event_type      VARCHAR(80) NOT NULL,
  subject_type    VARCHAR(60) NOT NULL,
  subject_id      BIGINT UNSIGNED NOT NULL,
  actor_user_id   BIGINT UNSIGNED NULL,
  payload_json    JSON NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_type_time (event_type, created_at),
  INDEX idx_events_subject (subject_type, subject_id)
) ENGINE=InnoDB;

CREATE TABLE automation_rules (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id       BIGINT UNSIGNED NULL COMMENT 'NULL = platform default',
  code            VARCHAR(80) NOT NULL,
  name            VARCHAR(160) NOT NULL,
  description     TEXT NULL,
  trigger_event   VARCHAR(80) NOT NULL,
  conditions_json JSON NULL,
  actions_json    JSON NOT NULL COMMENT 'e.g. advance_stage, create_payments, notify, assign_agent',
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  priority        INT NOT NULL DEFAULT 100,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rule_client_code (client_id, code)
) ENGINE=InnoDB;

CREATE TABLE automation_runs (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_id         BIGINT UNSIGNED NOT NULL,
  event_id        BIGINT UNSIGNED NULL,
  status          ENUM('success','skipped','failed') NOT NULL,
  result_json     JSON NULL,
  error_message   VARCHAR(500) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ar_rule FOREIGN KEY (rule_id) REFERENCES automation_rules(id),
  CONSTRAINT fk_ar_event FOREIGN KEY (event_id) REFERENCES event_log(id)
) ENGINE=InnoDB;

CREATE TABLE report_snapshots (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id       BIGINT UNSIGNED NOT NULL,
  agency_id       BIGINT UNSIGNED NULL,
  report_code     VARCHAR(60) NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  metrics_json    JSON NOT NULL,
  generated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by    ENUM('scheduler','user') NOT NULL DEFAULT 'scheduler',
  INDEX idx_rep_client (client_id, report_code, period_end),
  CONSTRAINT fk_rep_client FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB;

-- Helpful views for TablePlus / reporting
CREATE OR REPLACE VIEW v_property_listing_summary AS
SELECT
  p.id,
  p.reference_code,
  c.name AS client_name,
  a.name AS agency_name,
  p.title,
  p.property_type,
  p.listing_intent,
  p.status,
  p.suburb,
  p.city,
  p.asking_price,
  p.monthly_rent,
  p.rates_monthly,
  p.levies_monthly,
  p.erf_size_sqm,
  p.floor_size_sqm,
  p.bedrooms,
  p.bathrooms,
  p.photo_count,
  p.material_defects_disclosed,
  lp.legal_name AS landlord_name,
  u.display_name AS agent_name,
  p.published_at
FROM properties p
JOIN clients c ON c.id = p.client_id
JOIN agencies a ON a.id = p.agency_id
JOIN landlord_profiles lp ON lp.id = p.landlord_id
LEFT JOIN users u ON u.id = p.assigned_agent_id
WHERE p.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_application_pipeline AS
SELECT
  ap.id,
  ap.reference_code,
  c.name AS client_name,
  p.title AS property_title,
  ap.application_type,
  ap.stage,
  ap.progress_pct,
  COALESCE(u.display_name, CONCAT('Lead #', ap.lead_id)) AS applicant,
  ap.credit_status,
  ap.updated_at
FROM applications ap
JOIN clients c ON c.id = ap.client_id
JOIN properties p ON p.id = ap.property_id
LEFT JOIN users u ON u.id = ap.applicant_user_id;

SELECT 'Letkaya schema installed' AS message;
