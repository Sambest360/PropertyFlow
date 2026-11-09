-- 044: Guest houses (short-stay, per-night bookings, Airbnb-style).
-- Also created on first use by server/guesthouses.ts (ensureGuesthouseTables).
--
-- Model: a guest house has rooms; each room has a nightly rate, guest cap and
-- min/max nights. Guests book a room for [check_in, check_out) (check-out day
-- is free for the next guest). Hosts can block dates. Pending requests hold
-- the dates until they expire (default 24 h); instant-book stays confirm at once.
CREATE TABLE IF NOT EXISTS guesthouses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID REFERENCES clients(id) ON DELETE CASCADE,
  owner_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  name                VARCHAR(160) NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  address             VARCHAR(300) NOT NULL DEFAULT '',
  suburb              VARCHAR(120),
  city                VARCHAR(120) NOT NULL DEFAULT '',
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  photos              JSONB NOT NULL DEFAULT '[]'::jsonb,
  amenities           TEXT[] NOT NULL DEFAULT '{}',
  house_rules         TEXT NOT NULL DEFAULT '',
  check_in_time       VARCHAR(5) NOT NULL DEFAULT '14:00',
  check_out_time      VARCHAR(5) NOT NULL DEFAULT '10:00',
  cancellation_policy VARCHAR(12) NOT NULL DEFAULT 'moderate'
                        CHECK (cancellation_policy IN ('flexible', 'moderate', 'strict')),
  instant_book        BOOLEAN NOT NULL DEFAULT FALSE,
  tourism_levy_pct    NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  contact_phone       VARCHAR(40),
  contact_email       VARCHAR(200),
  status              VARCHAR(12) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'published', 'paused')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guesthouses_status_city ON guesthouses (status, city);
CREATE INDEX IF NOT EXISTS idx_guesthouses_client ON guesthouses (client_id);
CREATE INDEX IF NOT EXISTS idx_guesthouses_owner ON guesthouses (owner_user_id);

CREATE TABLE IF NOT EXISTS guesthouse_rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guesthouse_id   UUID NOT NULL REFERENCES guesthouses(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  bed_setup       VARCHAR(120) NOT NULL DEFAULT '1 double bed',
  max_guests      INTEGER NOT NULL DEFAULT 2 CHECK (max_guests BETWEEN 1 AND 30),
  nightly_rate    NUMERIC(12,2) NOT NULL CHECK (nightly_rate >= 0),
  weekend_rate    NUMERIC(12,2) CHECK (weekend_rate >= 0),
  cleaning_fee    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cleaning_fee >= 0),
  min_nights      INTEGER NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  max_nights      INTEGER NOT NULL DEFAULT 30 CHECK (max_nights >= 1),
  photos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gh_rooms_house ON guesthouse_rooms (guesthouse_id);

CREATE TABLE IF NOT EXISTS guesthouse_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES guesthouse_rooms(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL CHECK (end_date > start_date),
  reason      VARCHAR(200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gh_blocks_room ON guesthouse_blocks (room_id, start_date);

CREATE TABLE IF NOT EXISTS guesthouse_bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       VARCHAR(16) NOT NULL UNIQUE,
  guesthouse_id   UUID NOT NULL REFERENCES guesthouses(id) ON DELETE CASCADE,
  room_id         UUID NOT NULL REFERENCES guesthouse_rooms(id) ON DELETE CASCADE,
  guest_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  guest_name      VARCHAR(160) NOT NULL,
  guest_email     VARCHAR(200) NOT NULL,
  guest_phone     VARCHAR(40),
  guests          INTEGER NOT NULL CHECK (guests >= 1),
  check_in        DATE NOT NULL,
  check_out       DATE NOT NULL CHECK (check_out > check_in),
  nights          INTEGER NOT NULL,
  accommodation   NUMERIC(12,2) NOT NULL,
  cleaning_fee    NUMERIC(12,2) NOT NULL DEFAULT 0,
  tourism_levy    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  status          VARCHAR(12) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'checked_in', 'completed', 'no_show', 'expired')),
  payment_status  VARCHAR(10) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'deposit', 'paid', 'refunded')),
  guest_message   TEXT,
  host_note       TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gh_bookings_room_dates ON guesthouse_bookings (room_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_gh_bookings_house ON guesthouse_bookings (guesthouse_id, check_in);
CREATE INDEX IF NOT EXISTS idx_gh_bookings_email ON guesthouse_bookings (lower(guest_email));
