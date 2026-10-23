-- 027: occupied rentals can stay on the public marketplace with available_from.
-- Depends on 024_listing_lead_viewing_limits.sql (unit_listing_limit_snapshot).
-- EXCLUDE cannot be NOT VALID in PostgreSQL (only CHECK and FK can); the
-- constraint is validated on add. Seed leases do not overlap.

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS advertise_while_occupied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS available_from DATE,
  ADD COLUMN IF NOT EXISTS occupied_viewing_notice_hours INT NOT NULL DEFAULT 24;

ALTER TABLE units DROP CONSTRAINT IF EXISTS units_occupied_viewing_notice_hours_check;
ALTER TABLE units
  ADD CONSTRAINT units_occupied_viewing_notice_hours_check
  CHECK (occupied_viewing_notice_hours >= 24);

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS notice_given_at DATE,
  ADD COLUMN IF NOT EXISTS notice_given_by VARCHAR(20),
  ADD COLUMN IF NOT EXISTS notice_end_date DATE;

ALTER TABLE leases DROP CONSTRAINT IF EXISTS leases_notice_given_by_check;
ALTER TABLE leases
  ADD CONSTRAINT leases_notice_given_by_check
  CHECK (notice_given_by IS NULL OR notice_given_by IN ('TENANT', 'LANDLORD'));

CREATE TABLE IF NOT EXISTS tenant_viewing_windows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  unit_id         UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  lease_id        UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  weekday         SMALLINT CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  window_date     DATE,
  start_time      VARCHAR(8) NOT NULL,
  end_time        VARCHAR(8) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (weekday IS NOT NULL AND window_date IS NULL)
    OR (weekday IS NULL AND window_date IS NOT NULL)
  ),
  CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_viewing_windows_client ON tenant_viewing_windows (client_id);
CREATE INDEX IF NOT EXISTS idx_viewing_windows_lease ON tenant_viewing_windows (lease_id);
CREATE INDEX IF NOT EXISTS idx_viewing_windows_unit ON tenant_viewing_windows (unit_id);

ALTER TABLE tenant_viewing_windows ENABLE ROW LEVEL SECURITY;
-- Viewing windows reveal when a sitting tenant is home. Readable by agency
-- staff of the same client, the tenant on that lease, and the landlord of the
-- unit only (no role-wide clause).
DROP POLICY IF EXISTS tenant_viewing_windows_select ON tenant_viewing_windows;
CREATE POLICY tenant_viewing_windows_select ON tenant_viewing_windows
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() = 'END_USER'
      AND EXISTS (
        SELECT 1 FROM leases l
        WHERE l.id = tenant_viewing_windows.lease_id
          AND l.tenant_id = current_app_user_id()
      )
    )
    OR (
      current_app_user_role() = 'LANDLORD'
      AND EXISTS (
        SELECT 1
        FROM units u
        JOIN buildings b ON b.id = u.building_id
        WHERE u.id = tenant_viewing_windows.unit_id
          AND b.landlord_id = current_app_user_id()
      )
    )
  );

-- Written by agency staff of the same client or the tenant on that lease.
DROP POLICY IF EXISTS tenant_viewing_windows_mutate ON tenant_viewing_windows;
CREATE POLICY tenant_viewing_windows_mutate ON tenant_viewing_windows
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() = 'END_USER'
      AND EXISTS (
        SELECT 1 FROM leases l
        WHERE l.id = tenant_viewing_windows.lease_id
          AND l.tenant_id = current_app_user_id()
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() = 'END_USER'
      AND EXISTS (
        SELECT 1 FROM leases l
        WHERE l.id = tenant_viewing_windows.lease_id
          AND l.tenant_id = current_app_user_id()
          AND l.unit_id = tenant_viewing_windows.unit_id
          AND l.client_id = tenant_viewing_windows.client_id
      )
    )
  );

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS tenant_consent_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS tenant_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tenant_proposed_starts_at TIMESTAMPTZ;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_tenant_consent_status_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_tenant_consent_status_check
  CHECK (tenant_consent_status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'NOT_REQUIRED'));

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE leases DROP CONSTRAINT IF EXISTS leases_no_date_overlap;
ALTER TABLE leases ADD CONSTRAINT leases_no_date_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    daterange(
      start_date,
      CASE WHEN end_date IS NULL THEN 'infinity'::date ELSE (end_date + 1) END,
      '[)'
    ) WITH &&
  )
  WHERE (status IN ('PENDING', 'ACTIVE', 'NOTICE'));

DROP INDEX IF EXISTS idx_leases_unit_active;
CREATE INDEX idx_leases_unit_active ON leases (unit_id, status)
  WHERE status IN ('PENDING', 'ACTIVE', 'NOTICE');

-- Public unit shape for the anon marketplace RPCs. Explicit keys so a column
-- added later (tenant, lease or internal fields) never leaks to guests.
-- POPIA: no tenant or lease data here; only the date the home comes free.
-- Only the SECURITY DEFINER RPCs below call it, so anon gets no direct EXECUTE.
CREATE OR REPLACE FUNCTION public_listing_unit_json(p_unit_id UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'building_id', u.building_id,
    'client_id', u.client_id,
    'agent_id', u.agent_id,
    'unit_number', u.unit_number,
    'property_type', u.property_type,
    'square_meters', u.square_meters,
    'bedrooms', u.bedrooms,
    'bathrooms', u.bathrooms,
    'parking', u.parking,
    'listing_type', u.listing_type,
    'price', u.price,
    'rent', u.rent,
    'deposit_amount', u.deposit_amount,
    'status_config_key', u.status_config_key,
    'title', u.title,
    'description', u.description,
    'amenities', u.amenities,
    'images', u.images,
    'featured', u.featured,
    'lat', u.lat,
    'lng', u.lng,
    'place_id', u.place_id,
    'formatted_address', u.formatted_address,
    'geocoded_at', u.geocoded_at,
    'advertise_while_occupied', u.advertise_while_occupied,
    'available_from', u.available_from,
    'created_at', u.created_at,
    'updated_at', u.updated_at
  )
  FROM units u
  WHERE u.id = p_unit_id;
$$;

REVOKE ALL ON FUNCTION public_listing_unit_json(UUID) FROM PUBLIC;

-- Rebuilt from 024_listing_lead_viewing_limits.sql: keeps
-- unit_listing_limit_snapshot (fully_booked / remaining) and adds occupied adverts.
-- Units and landlord users use explicit keys (to_jsonb on users exposed
-- password_hash and auth_user_id to anon).
CREATE OR REPLACE FUNCTION get_public_marketplace_bootstrap(p_lite boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH lim AS (
    SELECT CASE WHEN p_lite THEN 60 ELSE 250 END AS n
  ),
  public_units AS (
    SELECT u.*
    FROM units u
    JOIN buildings b ON b.id = u.building_id
    LEFT JOIN users ll ON ll.id = b.landlord_id
    WHERE (
        (
          u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
          AND lower(coalesce(u.listing_type, 'rent')) <> 'not_listed'
        )
        OR (
          u.advertise_while_occupied = true
          AND u.available_from IS NOT NULL
          AND upper(u.status_config_key) = 'OCCUPIED'
          AND lower(coalesce(u.listing_type, 'rent')) IN ('rent', 'both')
        )
      )
      AND coalesce(ll.metadata->'verification'->>'status', 'approved') NOT IN ('pending', 'rejected')
    ORDER BY u.featured DESC NULLS LAST, u.created_at DESC, u.id DESC
    LIMIT (SELECT n FROM lim)
  ),
  unit_buildings AS (
    SELECT DISTINCT b.*
    FROM buildings b
    JOIN public_units pu ON pu.building_id = b.id
  ),
  unit_clients AS (
    SELECT DISTINCT c.*
    FROM clients c
    JOIN public_units pu ON pu.client_id = c.id
    WHERE coalesce(c.settings->>'isGlobalConfigClient', 'false') <> 'true'
  ),
  unit_landlords AS (
    SELECT DISTINCT ll.*
    FROM users ll
    JOIN unit_buildings ub ON ub.landlord_id = ll.id
  ),
  unit_rooms AS (
    SELECT r.*
    FROM rooms r
    JOIN public_units pu ON pu.id = r.unit_id
  ),
  public_slots AS (
    SELECT vs.*
    FROM viewing_slots vs
    WHERE vs.unit_id IN (SELECT id FROM public_units)
      AND vs.status = 'OPEN'
      AND vs.booked_count < vs.capacity
      AND vs.slot_date >= CURRENT_DATE
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg((public_listing_unit_json(u.id) || unit_listing_limit_snapshot(u.id)) ORDER BY u.created_at DESC) FROM public_units u), '[]'::jsonb),
    'rooms', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM unit_rooms r), '[]'::jsonb),
    'viewing_slots', coalesce(
      (SELECT jsonb_agg(to_jsonb(vs) ORDER BY vs.slot_date, vs.slot_time) FROM public_slots vs),
      '[]'::jsonb
    ),
    'users', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', u.id,
        'client_id', u.client_id,
        'role', u.role,
        'email', u.email,
        'first_name', u.first_name,
        'last_name', u.last_name,
        'phone', u.phone,
        'active', u.active,
        'metadata', u.metadata,
        'created_at', u.created_at
      ) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))
          OR (m.entity_type = 'viewing_slot' AND m.backend_id IN (SELECT id FROM public_slots))),
      '[]'::jsonb
    )
  );
$$;

CREATE OR REPLACE FUNCTION get_public_marketplace_bootstrap_lite(p_lite boolean DEFAULT true)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH lim AS (
    SELECT CASE WHEN p_lite THEN 60 ELSE 250 END AS n
  ),
  public_units AS (
    SELECT u.*
    FROM units u
    JOIN buildings b ON b.id = u.building_id
    LEFT JOIN users ll ON ll.id = b.landlord_id
    WHERE (
        (
          u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
          AND lower(coalesce(u.listing_type, 'rent')) <> 'not_listed'
        )
        OR (
          u.advertise_while_occupied = true
          AND u.available_from IS NOT NULL
          AND upper(u.status_config_key) = 'OCCUPIED'
          AND lower(coalesce(u.listing_type, 'rent')) IN ('rent', 'both')
        )
      )
      AND coalesce(ll.metadata->'verification'->>'status', 'approved') NOT IN ('pending', 'rejected')
    ORDER BY u.featured DESC NULLS LAST, u.created_at DESC, u.id DESC
    LIMIT (SELECT n FROM lim)
  ),
  unit_buildings AS (
    SELECT DISTINCT b.*
    FROM buildings b
    JOIN public_units pu ON pu.building_id = b.id
  ),
  unit_clients AS (
    SELECT DISTINCT c.*
    FROM clients c
    JOIN public_units pu ON pu.client_id = c.id
    WHERE coalesce(c.settings->>'isGlobalConfigClient', 'false') <> 'true'
  ),
  unit_landlords AS (
    SELECT DISTINCT ll.*
    FROM users ll
    JOIN unit_buildings ub ON ub.landlord_id = ll.id
  ),
  unit_cover AS (
    SELECT pu.id,
           coalesce(pu.images->0, b.images->0) AS cover
    FROM public_units pu
    JOIN unit_buildings b ON b.id = pu.building_id
  ),
  public_slots AS (
    SELECT vs.*
    FROM viewing_slots vs
    WHERE vs.unit_id IN (SELECT id FROM public_units)
      AND vs.status = 'OPEN'
      AND vs.booked_count < vs.capacity
      AND vs.slot_date >= CURRENT_DATE
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(
        (to_jsonb(b) - 'images')
        || jsonb_build_object('images', jsonb_build_array(b.images->0))
        ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(
        ((public_listing_unit_json(u.id) || unit_listing_limit_snapshot(u.id)) - 'images')
        || jsonb_build_object('images', CASE WHEN uc.cover IS NOT NULL THEN jsonb_build_array(uc.cover) ELSE '[]'::jsonb END)
        ORDER BY u.created_at DESC)
      FROM public_units u JOIN unit_cover uc ON uc.id = u.id), '[]'::jsonb),
    'viewing_slots', coalesce(
      (SELECT jsonb_agg(to_jsonb(vs) ORDER BY vs.slot_date, vs.slot_time) FROM public_slots vs),
      '[]'::jsonb
    ),
    'users', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', u.id,
        'client_id', u.client_id,
        'role', u.role,
        'email', u.email,
        'first_name', u.first_name,
        'last_name', u.last_name,
        'phone', u.phone,
        'active', u.active,
        'metadata', u.metadata,
        'created_at', u.created_at
      ) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))
          OR (m.entity_type = 'viewing_slot' AND m.backend_id IN (SELECT id FROM public_slots))),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap(boolean) TO anon, authenticated;

REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) TO anon, authenticated;
