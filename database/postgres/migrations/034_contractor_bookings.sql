-- 034: contractor bookings — an agency books a contractor for a date, the
-- contractor accepts or declines, and the booking is linked to a fault /
-- maintenance ticket. Safe to re-run.
CREATE TABLE IF NOT EXISTS contractor_bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contractor_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booked_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  unit_id             UUID REFERENCES units(id) ON DELETE SET NULL,
  ticket_id           UUID REFERENCES maintenance_tickets(id) ON DELETE SET NULL,
  trade               VARCHAR(40),
  scheduled_date      DATE NOT NULL,
  time_window         VARCHAR(20) NOT NULL DEFAULT 'morning'
                        CHECK (time_window IN ('morning', 'afternoon', 'full_day', 'evening')),
  description         TEXT NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested', 'accepted', 'declined', 'completed', 'cancelled')),
  contractor_note     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookings_contractor ON contractor_bookings (contractor_user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_bookings_client ON contractor_bookings (client_id, scheduled_date);
