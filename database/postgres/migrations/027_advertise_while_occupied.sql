-- 027: occupied rentals can stay on the public marketplace with available_from.
-- Depends on 024_listing_lead_viewing_limits.sql (unit_listing_limit_snapshot).
-- EXCLUDE cannot be NOT VALID in PostgreSQL (only CHECK and FK can); the
-- constraint is validated on add. Seed leases do not overlap.

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS advertise_while_occupied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS available_from DATE,
  ADD COLUMN IF NOT EXISTS occupied_viewing_notice_hours INT NOT NULL DEFAULT 24;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'units_occupied_viewing_notice_hours_check' AND conrelid = 'public.units'::regclass
  ) THEN
    ALTER TABLE units
      ADD CONSTRAINT units_occupied_viewing_notice_hours_check
      CHECK (occupied_viewing_notice_hours >= 24);
  END IF;
END
$$;

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS notice_given_at DATE,
  ADD COLUMN IF NOT EXISTS notice_given_by VARCHAR(20),
  ADD COLUMN IF NOT EXISTS notice_end_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leases_notice_given_by_check' AND conrelid = 'public.leases'::regclass
  ) THEN
    ALTER TABLE leases
      ADD CONSTRAINT leases_notice_given_by_check
      CHECK (notice_given_by IS NULL OR notice_given_by IN ('TENANT', 'LANDLORD'));
  END IF;
END
$$;

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
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS tenant_consent_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS tenant_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tenant_proposed_starts_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bookings_tenant_consent_status_check' AND conrelid = 'public.bookings'::regclass
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_tenant_consent_status_check
      CHECK (tenant_consent_status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'NOT_REQUIRED'));
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leases_no_date_overlap' AND conrelid = 'public.leases'::regclass
  ) THEN
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
  END IF;
END
$$;

-- Widen main's idx_leases_unit_active (PENDING, ACTIVE) to include NOTICE.
-- No-op when the index already covers NOTICE (live kivrl has #106's version).
DO $$
BEGIN
  IF coalesce((
    SELECT pg_get_indexdef(i.indexrelid) LIKE '%NOTICE%'
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'idx_leases_unit_active'
      AND i.indrelid = 'public.leases'::regclass
  ), false) = false THEN
    DROP INDEX IF EXISTS idx_leases_unit_active;
    CREATE INDEX idx_leases_unit_active ON leases (unit_id, status)
      WHERE status IN ('PENDING', 'ACTIVE', 'NOTICE');
  END IF;
END
$$;

-- BEGIN 027-public-bodies
-- Everything between BEGIN/END is the single source for the public surface of
-- this migration (tvw policies, public RPC bodies, enquiry RPC, grants). It is
-- extracted verbatim to pr2-notes/027-public-bodies.sql for the kivrl fix-c
-- package; edit it here and re-extract, never fork the text.

-- Viewing windows reveal when a sitting tenant is home. Readable by agency
-- staff of the same client, the tenant on that lease (row, lease, unit and
-- agency must agree), and the unit's own landlord inside that agency only
-- (no role-wide clause, no cross-agency read for any role: step-3 bar, r4).
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
          AND l.unit_id = tenant_viewing_windows.unit_id
          AND l.client_id = tenant_viewing_windows.client_id
      )
    )
    OR (
      -- Own landlord only, inside the unit's own agency (Oscar r4): no
      -- cross-agency read even if another agency's building names this user.
      current_app_user_role() = 'LANDLORD'
      AND tenant_viewing_windows.client_id = current_app_client_id()
      AND EXISTS (
        SELECT 1
        FROM units u
        JOIN buildings b ON b.id = u.building_id
        WHERE u.id = tenant_viewing_windows.unit_id
          AND u.client_id = current_app_client_id()
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
          AND l.unit_id = tenant_viewing_windows.unit_id
          AND l.client_id = tenant_viewing_windows.client_id
      )
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
      -- The row's lease must be on that unit and belong to the staff member's
      -- own agency (no writing windows onto another agency's lease).
      AND EXISTS (
        SELECT 1 FROM leases l
        WHERE l.id = tenant_viewing_windows.lease_id
          AND l.unit_id = tenant_viewing_windows.unit_id
          AND l.client_id = current_app_client_id()
      )
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

-- viewing_waitlist holds guest name / email / phone: own-agency staff only
-- (kivrl fix.sql a2). Replaces 024's role-wide LANDLORD / END_USER / CONTRACTOR
-- read clause; landlords in Supabase mode get an empty waitlist panel.
DROP POLICY IF EXISTS viewing_waitlist_select ON viewing_waitlist;
CREATE POLICY viewing_waitlist_select ON viewing_waitlist
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  );
DROP POLICY IF EXISTS viewing_waitlist_mutate ON viewing_waitlist;
CREATE POLICY viewing_waitlist_mutate ON viewing_waitlist
  FOR ALL TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT')
      AND client_id = current_app_client_id()
    )
  );

-- Landlord verification gate for public listings. Internal helper only: it
-- reads users.metadata so the public RPC bodies never touch landlord columns.
-- SECURITY INVOKER and no EXECUTE for PUBLIC / anon / authenticated; only the
-- SECURITY DEFINER RPCs below (run as their owner) call it.
CREATE OR REPLACE FUNCTION public_listing_landlord_ok(p_landlord_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT ll.metadata->'verification'->>'status'
    FROM users ll
    WHERE ll.id = p_landlord_id
  ), 'approved') NOT IN ('pending', 'rejected');
$$;

REVOKE ALL ON FUNCTION public_listing_landlord_ok(UUID) FROM PUBLIC, anon, authenticated;

-- "Listed by <agent display name>" for the public listing (Michael b). Same
-- display-name rule as the app (first_name + ' ' + last_name, trimmed; see
-- server/bootstrap.ts and src/lib/supabase/data.ts). Name only: no email,
-- phone or id. Internal helper: SECURITY INVOKER, no EXECUTE for PUBLIC /
-- anon / authenticated; only the DEFINER RPCs (via public_listing_unit_json) call it.
-- Angela r4: the name is checked at read time (an agent can rename themself
-- at any moment), and anything that is not plainly a name is NULL to anon:
--   * the name is NFKC-normalised first (fullwidth / superscript / circled
--     forms fold to ASCII, '＠' to '@'); then any decimal digit of any script
--     is refused, and the allowlist is letters (POSIX [[:alpha:]]: Unicode
--     letters, accented included, under kivrl's ICU en_US ctype) in words
--     joined by at most two of space, apostrophe, hyphen or period (so
--     "J. R. Smith", "O'Brien", "Mbatha-Dlamini"), an optional final period,
--     at most 60 characters. '@', brackets, '_', '+', '/' and every other
--     symbol fail it (Michael r4 ruling).
--   * denylist of spelled-out contact words, as whole words: at, dot, the
--     digits zero..nine / oh / nil, and mail / phone / domain words.
-- Angela r5 (Michael: work the full list):
--   * the RAW input (before NFKC) is refused if it has any fullwidth/halfwidth
--     form (U+FF00-U+FFEF: 'Ｊｏｈｎ' no longer folds to 'John') or a period
--     glued to a letter ('x.io', 'wa.me', 'smith.dev', 'anya.properties');
--     the period rule runs again after NFKC (U+2024 and friends fold to '.').
--   * mixed script: a Latin letter next to any letter outside Latin
--     (A-Z, U+00C0-U+024F, U+1E00-U+1EFF) is refused, so Cyrillic / Greek /
--     IPA homoglyphs inside a Latin word (' аt ' with a Cyrillic а) are NULL.
--     A name written wholly in one other script ('Анна', 'Ελένη') stays.
--   * the denylists run on a homoglyph fold (Cyrillic / Greek look-alikes to
--     Latin), so an all-Cyrillic 'ат' is caught as 'at'.
--   * glued contact words anywhere inside a word: mail providers and
--     dot+TLD ('johnatgmaildotcom').
CREATE OR REPLACE FUNCTION public_listing_display_name(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    -- Raw input, before NFKC: fullwidth/halfwidth forms, or a period glued to a letter (a domain).
    WHEN p_name ~ '[\uFF00-\uFFEF]' OR p_name ~ '\.[[:alpha:]]' THEN NULL
    WHEN s.n IS NULL OR char_length(s.n) > 60 THEN NULL
    -- Any decimal digit of any script (glibc classifies non-ASCII digits as
    -- [[:alpha:]], so they are refused explicitly; NFKC already folded the
    -- fullwidth, superscript and circled forms to ASCII).
    WHEN s.n ~ '[0-9٠-٩۰-۹߀-߉०-९০-৯੦-੯૦-૯୦-୯௦-௯౦-౯೦-೯൦-൯෦-෯๐-๙໐-໙༠-༩၀-၉႐-႙០-៩᠐-᠙᥆-᥏᧐-᧙᭐-᭙᮰-᮹᱀-᱉᱐-᱙꘠-꘩꣐-꣙꤀-꤉꩐-꩙０-９]' THEN NULL
    WHEN s.n ~ '\.[[:alpha:]]' THEN NULL
    WHEN s.n !~ '^[[:alpha:]]+([ ''.-]{1,2}[[:alpha:]]+)*[.]?$' THEN NULL
    -- Mixed script: Latin letters together with any non-Latin letter (homoglyphs).
    WHEN s.n ~ '[A-Za-z]' AND s.n ~ '[^A-Za-z\u00C0-\u024F\u1E00-\u1EFF ''.-]' THEN NULL
    WHEN s.f ~* '\m(at|dot|zero|oh|nil|one|two|three|four|five|six|seven|eight|nine|com|co|za|net|org|io|me|dev|wa|www|http|https|web|site|link|visit|gmail|yahoo|hotmail|outlook|icloud|mweb|live|whatsapp|email|mail|phone|cell|call|sms|tel)\M' THEN NULL
    WHEN s.f ~* '(gmail|googlemail|yahoo|hotmail|outlook|icloud|mweb|telkomsa|vodamail|webmail|protonmail|whatsapp|dotcom|dotco|dotnet|dotorg|dotza|dotio)' THEN NULL
    ELSE s.n
  END
  FROM (
    SELECT s0.n, translate(s0.n, 'аеорсухіјѕԁԛԝһӏтмкнАВЕКМНОРСТХІЈЅοαντικρΑΒΕΖΗΙΚΜΝΟΡΤΥΧ', 'aeopcyxijsdqwhltmkhABEKMHOPCTXIJSoavtikpABEZHIKMNOPTYX') AS f
    FROM (SELECT nullif(regexp_replace(trim(normalize(p_name, NFKC)), ' {2,}', ' ', 'g'), '') AS n) s0
  ) s;
$$;

REVOKE ALL ON FUNCTION public_listing_display_name(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public_listing_agent_name(p_agent_id UUID)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public_listing_display_name(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, ''))
  FROM users a
  WHERE a.id = p_agent_id;
$$;

REVOKE ALL ON FUNCTION public_listing_agent_name(UUID) FROM PUBLIC, anon, authenticated;

-- Public unit shape for the anon marketplace RPCs. Explicit keys so a column
-- added later (tenant, lease, agent or internal fields) never leaks to guests.
-- POPIA: no tenant or lease data here; only the date the home comes free.
-- No agent_id (the API guest slice drops agent ids too); listed_by is the
-- agent's display name only.
-- SECURITY INVOKER and no EXECUTE for PUBLIC / anon / authenticated: anon
-- cannot call it on an arbitrary unit uuid; only the RPCs below use it.
CREATE OR REPLACE FUNCTION public_listing_unit_json(p_unit_id UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', u.id,
    'building_id', u.building_id,
    'client_id', u.client_id,
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
    'listed_by', public_listing_agent_name(u.agent_id),
    'created_at', u.created_at,
    'updated_at', u.updated_at
  )
  FROM units u
  WHERE u.id = p_unit_id;
$$;

REVOKE ALL ON FUNCTION public_listing_unit_json(UUID) FROM PUBLIC, anon, authenticated;

-- Rebuilt from 024_listing_lead_viewing_limits.sql: keeps
-- unit_listing_limit_snapshot (fully_booked / remaining) and adds occupied adverts.
-- Every row is an explicit key list. No landlord row or landlord id leaves
-- the database (users is always []), no agency settings or contact columns,
-- no building notes or landlord_id, no agent ids.
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
    SELECT u.id, u.building_id, u.client_id, u.featured, u.created_at, u.images
    FROM units u
    JOIN buildings b ON b.id = u.building_id
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
      AND public_listing_landlord_ok(b.landlord_id)
    ORDER BY u.featured DESC NULLS LAST, u.created_at DESC, u.id DESC
    LIMIT (SELECT n FROM lim)
  ),
  unit_buildings AS (
    SELECT DISTINCT b.id, b.client_id, b.name, b.address, b.suburb, b.city, b.province,
           b.grading, b.solar_capacity_kw, b.has_borehole, b.lat, b.lng, b.place_id,
           b.formatted_address, b.geocoded_at, b.images, b.created_at
    FROM buildings b
    JOIN public_units pu ON pu.building_id = b.id
  ),
  unit_clients AS (
    SELECT DISTINCT c.id, c.company_name, c.trading_as, c.subdomain, c.city, c.status,
           c.created_at, c.settings->>'frontend_id' AS frontend_id
    FROM clients c
    JOIN public_units pu ON pu.client_id = c.id
    WHERE coalesce(c.settings->>'isGlobalConfigClient', 'false') <> 'true'
  ),
  unit_rooms AS (
    SELECT r.id, r.unit_id, r.name, r.room_kind, r.beds, r.baths, r.area_sqm, r.sort_order
    FROM rooms r
    JOIN public_units pu ON pu.id = r.unit_id
  ),
  public_slots AS (
    SELECT vs.id, vs.client_id, vs.unit_id, vs.slot_date, vs.slot_time, vs.capacity,
           vs.booked_count, vs.status, vs.title, vs.duration_minutes
    FROM viewing_slots vs
    WHERE vs.unit_id IN (SELECT id FROM public_units)
      AND vs.status = 'OPEN'
      AND vs.booked_count < vs.capacity
      AND vs.slot_date >= (now() AT TIME ZONE 'Africa/Johannesburg')::date
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'company_name', c.company_name,
        'trading_as', c.trading_as,
        'subdomain', c.subdomain,
        'city', c.city,
        'status', c.status,
        'created_at', c.created_at,
        'frontend_id', c.frontend_id
      ) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', b.id,
        'client_id', b.client_id,
        'name', b.name,
        'address', b.address,
        'suburb', b.suburb,
        'city', b.city,
        'province', b.province,
        'grading', b.grading,
        'solar_capacity_kw', b.solar_capacity_kw,
        'has_borehole', b.has_borehole,
        'lat', b.lat,
        'lng', b.lng,
        'place_id', b.place_id,
        'formatted_address', b.formatted_address,
        'geocoded_at', b.geocoded_at,
        'images', b.images,
        'created_at', b.created_at
      ) ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg((public_listing_unit_json(u.id) || unit_listing_limit_snapshot(u.id)) ORDER BY u.created_at DESC) FROM public_units u), '[]'::jsonb),
    'rooms', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'unit_id', r.unit_id,
        'name', r.name,
        'room_kind', r.room_kind,
        'beds', r.beds,
        'baths', r.baths,
        'area_sqm', r.area_sqm,
        'sort_order', r.sort_order
      ) ORDER BY r.name) FROM unit_rooms r), '[]'::jsonb),
    'viewing_slots', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', vs.id,
        'client_id', vs.client_id,
        'unit_id', vs.unit_id,
        'slot_date', vs.slot_date,
        'slot_time', vs.slot_time,
        'capacity', vs.capacity,
        'booked_count', vs.booked_count,
        'status', vs.status,
        'title', vs.title,
        'duration_minutes', vs.duration_minutes
      ) ORDER BY vs.slot_date, vs.slot_time) FROM public_slots vs), '[]'::jsonb),
    'users', '[]'::jsonb,
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
          'entity_type', m.entity_type,
          'backend_id', m.backend_id,
          'frontend_id', m.frontend_id
        ) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'viewing_slot' AND m.backend_id IN (SELECT id FROM public_slots))),
      '[]'::jsonb
    )
  );
$$;

-- Lite: same keys; one cover image per unit and building, no rooms.
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
    SELECT u.id, u.building_id, u.client_id, u.featured, u.created_at, u.images
    FROM units u
    JOIN buildings b ON b.id = u.building_id
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
      AND public_listing_landlord_ok(b.landlord_id)
    ORDER BY u.featured DESC NULLS LAST, u.created_at DESC, u.id DESC
    LIMIT (SELECT n FROM lim)
  ),
  unit_buildings AS (
    SELECT DISTINCT b.id, b.client_id, b.name, b.address, b.suburb, b.city, b.province,
           b.grading, b.solar_capacity_kw, b.has_borehole, b.lat, b.lng, b.place_id,
           b.formatted_address, b.geocoded_at, b.images, b.created_at
    FROM buildings b
    JOIN public_units pu ON pu.building_id = b.id
  ),
  unit_clients AS (
    SELECT DISTINCT c.id, c.company_name, c.trading_as, c.subdomain, c.city, c.status,
           c.created_at, c.settings->>'frontend_id' AS frontend_id
    FROM clients c
    JOIN public_units pu ON pu.client_id = c.id
    WHERE coalesce(c.settings->>'isGlobalConfigClient', 'false') <> 'true'
  ),
  unit_cover AS (
    SELECT pu.id,
           coalesce(pu.images->0, b.images->0) AS cover
    FROM public_units pu
    JOIN unit_buildings b ON b.id = pu.building_id
  ),
  public_slots AS (
    SELECT vs.id, vs.client_id, vs.unit_id, vs.slot_date, vs.slot_time, vs.capacity,
           vs.booked_count, vs.status, vs.title, vs.duration_minutes
    FROM viewing_slots vs
    WHERE vs.unit_id IN (SELECT id FROM public_units)
      AND vs.status = 'OPEN'
      AND vs.booked_count < vs.capacity
      AND vs.slot_date >= (now() AT TIME ZONE 'Africa/Johannesburg')::date
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'company_name', c.company_name,
        'trading_as', c.trading_as,
        'subdomain', c.subdomain,
        'city', c.city,
        'status', c.status,
        'created_at', c.created_at,
        'frontend_id', c.frontend_id
      ) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', b.id,
        'client_id', b.client_id,
        'name', b.name,
        'address', b.address,
        'suburb', b.suburb,
        'city', b.city,
        'province', b.province,
        'grading', b.grading,
        'solar_capacity_kw', b.solar_capacity_kw,
        'has_borehole', b.has_borehole,
        'lat', b.lat,
        'lng', b.lng,
        'place_id', b.place_id,
        'formatted_address', b.formatted_address,
        'geocoded_at', b.geocoded_at,
        'images', CASE WHEN b.images->0 IS NOT NULL THEN jsonb_build_array(b.images->0) ELSE '[]'::jsonb END,
        'created_at', b.created_at
      ) ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(
        ((public_listing_unit_json(u.id) || unit_listing_limit_snapshot(u.id)) - 'images')
        || jsonb_build_object('images', CASE WHEN uc.cover IS NOT NULL THEN jsonb_build_array(uc.cover) ELSE '[]'::jsonb END)
        ORDER BY u.created_at DESC)
      FROM public_units u JOIN unit_cover uc ON uc.id = u.id), '[]'::jsonb),
    'viewing_slots', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', vs.id,
        'client_id', vs.client_id,
        'unit_id', vs.unit_id,
        'slot_date', vs.slot_date,
        'slot_time', vs.slot_time,
        'capacity', vs.capacity,
        'booked_count', vs.booked_count,
        'status', vs.status,
        'title', vs.title,
        'duration_minutes', vs.duration_minutes
      ) ORDER BY vs.slot_date, vs.slot_time) FROM public_slots vs), '[]'::jsonb),
    'users', '[]'::jsonb,
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(jsonb_build_object(
          'entity_type', m.entity_type,
          'backend_id', m.backend_id,
          'frontend_id', m.frontend_id
        ) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'viewing_slot' AND m.backend_id IN (SELECT id FROM public_slots))),
      '[]'::jsonb
    )
  );
$$;

-- Explicit grants AFTER the new bodies (live may have anon EXECUTE revoked
-- as a stopgap; this restores it only together with the sanitised bodies).
REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap(boolean) TO anon, authenticated;

REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) TO anon, authenticated;

-- Public enquiry: 024's body plus advertised occupied rentals (Supabase-only
-- mode; the API path is server/publicEnquiry.ts). Same signature, owner and
-- grants as 024, so CREATE OR REPLACE keeps the function's oid and ACL.
CREATE OR REPLACE FUNCTION submit_public_listing_enquiry(
  p_property_fe_id   TEXT,
  p_action           TEXT,
  p_first_name       TEXT,
  p_last_name        TEXT,
  p_email            TEXT,
  p_phone            TEXT DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL,
  p_slot_fe_id       TEXT DEFAULT NULL,
  p_monthly_income   NUMERIC DEFAULT NULL,
  p_id_number        TEXT DEFAULT NULL,
  p_interest_type    TEXT DEFAULT 'RENT'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id       UUID;
  v_client_id     UUID;
  v_agent_id      UUID;
  v_slot_id       UUID;
  v_lead_id       UUID;
  v_booking_id    UUID;
  v_full_name     TEXT;
  v_stage         TEXT;
  v_interest      TEXT;
  v_value         NUMERIC;
  v_status_key    TEXT;
  v_listing_type  TEXT;
  v_slot_date     DATE;
  v_slot_time     TEXT;
  v_slot_cap      INT;
  v_slot_booked   INT;
  v_slot_status   TEXT;
  v_extra_notes   TEXT;
  v_gate          JSONB;
  v_occupied      BOOLEAN;
  v_notice_hours  INT;
  v_starts_at     TIMESTAMPTZ;
  v_tenant_id     UUID;
  v_available     DATE;
BEGIN
  IF p_property_fe_id IS NULL OR trim(p_property_fe_id) = '' THEN
    RAISE EXCEPTION 'property_required';
  END IF;

  IF p_action NOT IN ('lead', 'viewing') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  IF p_first_name IS NULL OR trim(p_first_name) = ''
     OR p_last_name IS NULL OR trim(p_last_name) = ''
     OR p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'contact_required';
  END IF;

  SELECT m.backend_id::uuid INTO v_unit_id
  FROM entity_id_map m
  WHERE m.entity_type IN ('unit', 'property')
    AND m.frontend_id = trim(p_property_fe_id)
  LIMIT 1;

  IF v_unit_id IS NULL THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;

  SELECT u.client_id, u.agent_id, u.status_config_key, u.listing_type,
         COALESCE(u.price, u.rent, 0),
         -- 027: same predicate as get_public_marketplace_bootstrap's occupied branch.
         (u.advertise_while_occupied = true
          AND u.available_from IS NOT NULL
          AND upper(u.status_config_key) = 'OCCUPIED'
          AND lower(coalesce(u.listing_type, 'rent')) IN ('rent', 'both')),
         GREATEST(24, COALESCE(u.occupied_viewing_notice_hours, 24)),
         u.available_from
  INTO v_client_id, v_agent_id, v_status_key, v_listing_type, v_value,
       v_occupied, v_notice_hours, v_available
  FROM units u
  WHERE u.id = v_unit_id
  FOR UPDATE;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'property_not_found';
  END IF;

  -- 027: an unlisted unit is never public, whatever its status or flag.
  IF lower(coalesce(v_listing_type, 'rent')) = 'not_listed' THEN
    RAISE EXCEPTION 'property_not_public';
  END IF;

  -- 027: an advertised occupied rental is public too.
  IF NOT COALESCE(v_occupied, false)
     AND v_status_key NOT IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE') THEN
    RAISE EXCEPTION 'property_not_public';
  END IF;

  v_full_name := trim(p_first_name) || ' ' || trim(p_last_name);
  v_interest := CASE WHEN upper(coalesce(p_interest_type, 'RENT')) = 'BUY' THEN 'BUY' ELSE 'RENT' END;

  v_extra_notes := NULLIF(trim(coalesce(p_notes, '')), '');
  IF p_monthly_income IS NOT NULL THEN
    v_extra_notes := coalesce(v_extra_notes || E'\n', '') || 'Monthly income: ' || p_monthly_income::text;
  END IF;
  IF p_id_number IS NOT NULL AND trim(p_id_number) <> '' THEN
    v_extra_notes := coalesce(v_extra_notes || E'\n', '') || 'ID/Passport: ' || trim(p_id_number);
  END IF;
  -- 027: tag for staff, first line of the lead notes (same text as
  -- server/publicEnquiry.ts occupiedInterestNote).
  IF COALESCE(v_occupied, false) THEN
    v_extra_notes := 'Interested, available from ' || to_char(v_available, 'FMDD Mon YYYY')
      || coalesce(E'\n' || v_extra_notes, '');
  END IF;

  IF p_action = 'lead' THEN
    v_stage := 'New Lead';
  ELSIF p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> '' THEN
    v_stage := 'Viewing Scheduled';
  ELSE
    v_stage := 'Viewing Requested';
  END IF;

  v_gate := listing_capacity_gate(
    v_unit_id,
    p_action,
    p_action = 'viewing' AND p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> '',
    v_full_name,
    lower(trim(p_email)),
    p_phone
  );
  IF v_gate IS NOT NULL THEN
    RETURN v_gate;
  END IF;

  v_lead_id := gen_random_uuid();
  INSERT INTO leads (
    id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
    interest_type, value_amount, notes, metadata, updated_at
  ) VALUES (
    v_lead_id, v_client_id, v_unit_id, v_agent_id, v_full_name,
    lower(trim(p_email)), NULLIF(trim(coalesce(p_phone, '')), ''),
    'Web Form', v_stage, v_interest, v_value, v_extra_notes,
    CASE
      WHEN p_action = 'viewing' AND p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> ''
      THEN '{"limit_bucket":"viewing"}'::jsonb
      ELSE '{}'::jsonb
    END,
    NOW()
  );

  IF p_action = 'viewing' AND p_slot_fe_id IS NOT NULL AND trim(p_slot_fe_id) <> '' THEN
    SELECT m.backend_id::uuid INTO v_slot_id
    FROM entity_id_map m
    WHERE m.entity_type = 'viewing_slot'
      AND m.frontend_id = trim(p_slot_fe_id)
    LIMIT 1;

    IF v_slot_id IS NULL THEN
      RAISE EXCEPTION 'slot_not_found';
    END IF;

    SELECT slot_date, slot_time, capacity, booked_count, status
    INTO v_slot_date, v_slot_time, v_slot_cap, v_slot_booked, v_slot_status
    FROM viewing_slots
    WHERE id = v_slot_id AND unit_id = v_unit_id AND client_id = v_client_id
    FOR UPDATE;

    IF v_slot_date IS NULL THEN
      RAISE EXCEPTION 'slot_not_found';
    END IF;

    IF v_slot_status <> 'OPEN' OR v_slot_booked >= v_slot_cap THEN
      RAISE EXCEPTION 'slot_unavailable';
    END IF;

    -- Time storage (Michael ruling 2): bookings.starts_at (TIMESTAMPTZ) holds
    -- SAST wall-clock time labelled Z, like every other write in the app
    -- (server/writes.ts upsertViewing, server/bootstrap.ts and
    -- src/lib/supabase/data.ts read it back with toISOString()). So a 10:00
    -- slot is stored as 10:00+00, never converted to 08:00Z. slot_time is
    -- VARCHAR(8): 'HH:MM' or 'HH:MM:SS'.
    v_starts_at := (v_slot_date::text || ' ' || left(v_slot_time, 5) || ':00')::timestamp
      AT TIME ZONE 'UTC';

    -- 027: a viewing of an occupied home needs the notice period and must fall
    -- inside the sitting tenant's windows (server/occupiedListing.ts
    -- refuseOccupiedBooking). The tenant then accepts or declines it.
    IF COALESCE(v_occupied, false) THEN
      -- Like with like: the stored wall time against SAST wall-clock now.
      -- Africa/Johannesburg is used ONLY for this notice comparison.
      IF (v_starts_at AT TIME ZONE 'UTC')
         < (NOW() AT TIME ZONE 'Africa/Johannesburg') + make_interval(hours => v_notice_hours) THEN
        RAISE EXCEPTION 'notice_too_short';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM tenant_viewing_windows w
        JOIN leases l ON l.id = w.lease_id AND l.status IN ('ACTIVE', 'NOTICE')
        WHERE w.unit_id = v_unit_id
          AND left(v_slot_time, 5) >= left(w.start_time, 5)
          AND left(v_slot_time, 5) < left(w.end_time, 5)
          AND CASE
                WHEN w.window_date IS NOT NULL THEN w.window_date = v_slot_date
                ELSE w.weekday = EXTRACT(DOW FROM v_slot_date)::int
              END
      ) THEN
        RAISE EXCEPTION 'outside_viewing_window';
      END IF;
    END IF;

    v_booking_id := gen_random_uuid();
    INSERT INTO bookings (
      id, client_id, unit_id, slot_id, agent_id, visitor_name, visitor_email, visitor_phone,
      starts_at, status, notes, updated_at,
      tenant_consent_status, tenant_notified_at
    ) VALUES (
      v_booking_id, v_client_id, v_unit_id, v_slot_id, v_agent_id, v_full_name,
      lower(trim(p_email)), NULLIF(trim(coalesce(p_phone, '')), ''),
      v_starts_at,
      'SCHEDULED', v_extra_notes, NOW(),
      CASE WHEN COALESCE(v_occupied, false) THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
      CASE WHEN COALESCE(v_occupied, false) THEN NOW() ELSE NULL END
    );

    -- 027: tell the sitting tenant (server markBookingTenantPending).
    IF COALESCE(v_occupied, false) THEN
      INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload)
      VALUES (v_client_id, 'viewing_tenant_notified', 'booking', v_booking_id, NULL,
              jsonb_build_object('unitId', v_unit_id));
      SELECT l.tenant_id INTO v_tenant_id
      FROM leases l
      WHERE l.unit_id = v_unit_id AND l.status IN ('ACTIVE', 'NOTICE')
      ORDER BY l.start_date DESC
      LIMIT 1;
      IF v_tenant_id IS NOT NULL THEN
        INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
        VALUES (v_client_id, v_tenant_id, 'Viewing requested',
                'Someone wants to view your home. Accept or decline the time.',
                '/workspace/portals/tenant', 'viewing', 'updated');
      END IF;
    END IF;

    UPDATE viewing_slots
    SET booked_count = booked_count + 1,
        status = CASE WHEN booked_count + 1 >= capacity THEN 'FULL' ELSE status END,
        updated_at = NOW()
    WHERE id = v_slot_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', v_lead_id,
    'booking_id', v_booking_id,
    'stage', v_stage,
    'available_from', CASE WHEN COALESCE(v_occupied, false) THEN v_available END
  );
END;
$$;

REVOKE ALL ON FUNCTION submit_public_listing_enquiry(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION submit_public_listing_enquiry(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT
) TO anon, authenticated;

-- unit_listing_limit_snapshot guard (Michael ruling 1, Jim P1/P2, Oscar).
-- 024 made it a DEFINER readable by any signed-in user on any unit id, so an
-- END_USER in one agency could read another agency's DRAFT unit counts. It now
-- returns the 024 counts only when the caller may see them, otherwise '{}'
-- (never NULL: the public RPCs do public_listing_unit_json(u.id) || snapshot,
-- and jsonb || NULL would wipe the unit). END_USER, CONTRACTOR, other-agency
-- and no-profile sign-ups get '{}' on a non-public unit, and a missing unit is
-- '{}' too, so the answer is no unit-exists oracle. Callers and their roles:
--   * get_public_marketplace_bootstrap(_lite) (anon/authenticated, as owner):
--     only public units are in the payload, and those pass the public check.
--   * ListingLimitsPanel.tsx (authenticated: own-agency staff, or the unit's
--     landlord, who has assets.manage): staff and own-landlord branches.
--   * promote_viewing_waitlist (024, DEFINER, authenticated): runs as owner
--     but the caller's identity still applies; own-agency staff and SA pass.
--   * server/bootstrap.ts (API server pool: no anon/authenticated role set,
--     the server authorises the request itself): passes the no-API-role branch.
-- The JSON is counts and limits only (no applicant names or contacts), so the
-- landlord branch needs no stripping. The 024 query below is verbatim.
CREATE OR REPLACE FUNCTION unit_listing_limit_snapshot(p_unit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    -- Server pool / owner / service_role: not a PostgREST API role.
    coalesce(nullif(current_setting('role', true), ''), 'none') NOT IN ('anon', 'authenticated')
    OR is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM units u
      JOIN buildings b ON b.id = u.building_id
      WHERE u.id = p_unit_id
        AND (
          -- Own-agency staff.
          (is_agency_staff() AND u.client_id = current_app_client_id())
          -- The unit's own landlord, in that agency (read-only: counts only).
          OR (b.landlord_id IS NOT NULL AND b.landlord_id = current_app_user_id()
              AND u.client_id = current_app_client_id())
          -- A public listing (same rule as the public RPCs' public_units).
          OR (
            (
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
            AND public_listing_landlord_ok(b.landlord_id)
          )
        )
    )
  ) THEN
    RETURN '{}'::jsonb;
  END IF;

  -- A missing unit is '{}' as well (never NULL): no unit-exists oracle.
  RETURN coalesce((
    WITH u AS (
      SELECT
        units.id,
        units.listing_type,
        units.limit_action,
        units.show_remaining,
        units.limits_round_started_at,
        CASE
          WHEN upper(coalesce(units.listing_type, '')) IN ('RENT', 'BOTH') THEN
            COALESCE(units.max_enquiries, NULLIF(c.settings #>> '{listingLimits,maxEnquiries}', '')::int)
          ELSE NULL
        END AS eff_enquiries,
        CASE
          WHEN upper(coalesce(units.listing_type, '')) IN ('RENT', 'BOTH') THEN
            COALESCE(units.max_viewings, NULLIF(c.settings #>> '{listingLimits,maxViewings}', '')::int)
          ELSE NULL
        END AS eff_viewings
      FROM units
      JOIN clients c ON c.id = units.client_id
      WHERE units.id = p_unit_id
    ),
    counts AS (
      SELECT
        (SELECT COUNT(*)::int FROM leads l
          WHERE l.unit_id = u.id
            AND COALESCE(l.is_waitlisted, false) = false
            AND COALESCE(l.metadata->>'limit_bucket', '') <> 'viewing'
            AND COALESCE(l.metadata->>'spam', '') <> 'true'
            AND (u.limits_round_started_at IS NULL OR l.created_at >= u.limits_round_started_at)
        ) AS enquiries,
        (SELECT COUNT(*)::int FROM bookings b
          WHERE b.unit_id = u.id
            AND b.status IN ('SCHEDULED', 'COMPLETED', 'NO_SHOW')
            AND (u.limits_round_started_at IS NULL OR b.created_at >= u.limits_round_started_at)
        ) AS viewings
      FROM u
    )
    SELECT jsonb_build_object(
      'fully_booked',
        (u.eff_enquiries IS NOT NULL AND counts.enquiries >= u.eff_enquiries)
        OR (u.eff_viewings IS NOT NULL AND counts.viewings >= u.eff_viewings),
      'enquiries_full', u.eff_enquiries IS NOT NULL AND counts.enquiries >= u.eff_enquiries,
      'viewings_full', u.eff_viewings IS NOT NULL AND counts.viewings >= u.eff_viewings,
      'limit_action', u.limit_action,
      'show_remaining', u.show_remaining,
      'enquiry_count', counts.enquiries,
      'viewing_count', counts.viewings,
      'max_enquiries', u.eff_enquiries,
      'max_viewings', u.eff_viewings,
      'remaining', CASE
        WHEN COALESCE(u.show_remaining, false) THEN jsonb_build_object(
          'enquiries', CASE WHEN u.eff_enquiries IS NULL THEN NULL ELSE GREATEST(u.eff_enquiries - counts.enquiries, 0) END,
          'viewings', CASE WHEN u.eff_viewings IS NULL THEN NULL ELSE GREATEST(u.eff_viewings - counts.viewings, 0) END
        )
        ELSE NULL
      END
    )
    FROM u, counts
  ), '{}'::jsonb);
END;
$$;

-- 024's DEFINER helpers (Michael c). listing_capacity_gate takes a name, email
-- and phone and can write waitlist rows: no browser caller (only the DEFINER
-- enquiry RPC above, running as owner), so nobody public can EXECUTE it.
-- unit_listing_limit_snapshot: the public RPCs call it as owner; the only
-- browser caller is ListingLimitsPanel.tsx (staff, or the unit's landlord), so
-- authenticated keeps EXECUTE (the guard above decides what it sees) and anon
-- loses it.
REVOKE ALL ON FUNCTION listing_capacity_gate(UUID, TEXT, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION unit_listing_limit_snapshot(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION unit_listing_limit_snapshot(UUID) TO authenticated;
-- END 027-public-bodies
