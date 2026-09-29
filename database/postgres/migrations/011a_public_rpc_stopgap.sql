-- 011a: public marketplace RPC stopgap (subset of 011_tenant_isolation.sql).
--
-- Closes the anonymous leak only. The two public marketplace RPCs used
-- to_jsonb() on users and clients, so anyone could read password_hash and the
-- full metadata column (ID documents, ID numbers). This file changes only what
-- those two functions return. Filters, row limits, ordering and grants stay
-- exactly as in 007b_public_marketplace_rooms.sql and 008a_public_marketplace_lite.sql.
-- It does not touch tables, RLS policies, triggers or column grants. Those
-- changes stay in the full 011.
--
-- Safe to paste into the Supabase SQL editor and to run more than once
-- (CREATE OR REPLACE, same signatures, one transaction).
--
-- Fields still returned:
--   users    id, client_id, email, first_name, last_name, role, active,
--            metadata.{frontend_id, frontend_role, verification.status}
--   clients  id, company_name, subdomain, status, city, created_at,
--            settings.{frontend_id, isGlobalConfigClient}
--   buildings, units, rooms: as before, except buildings.notes (internal notes)
-- Fields removed: users.password_hash, phone, avatar_url, auth_user_id, all other
-- metadata; clients trading_as, email, phone, province and all other settings;
-- buildings.notes.
-- Landlord email is still public because the guest mapper keys users on it.
-- Removing it needs a frontend change (tracked separately).

BEGIN;

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
    WHERE u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE')
      AND lower(coalesce(u.listing_type, 'rent')) <> 'not_listed'
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
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'subdomain', c.subdomain,
          'status', c.status,
          'city', c.city,
          'created_at', c.created_at,
          'settings', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', c.settings->'frontend_id',
            'isGlobalConfigClient', c.settings->'isGlobalConfigClient'
          ))
        ) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(to_jsonb(b) - 'notes' ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.created_at DESC) FROM public_units u), '[]'::jsonb),
    'rooms', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM unit_rooms r), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'client_id', u.client_id,
          'email', u.email,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'role', u.role,
          'active', u.active,
          'metadata', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', u.metadata->'frontend_id',
            'frontend_role', u.metadata->'frontend_role',
            'verification', CASE WHEN jsonb_typeof(u.metadata->'verification') = 'object'
              THEN jsonb_build_object('status', u.metadata->'verification'->'status') END
          ))
        ) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))),
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
    WHERE u.status_config_key IN ('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER')
      AND lower(coalesce(u.listing_type, 'rent')) <> 'not_listed'
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
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'company_name', c.company_name,
          'subdomain', c.subdomain,
          'status', c.status,
          'city', c.city,
          'created_at', c.created_at,
          'settings', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', c.settings->'frontend_id',
            'isGlobalConfigClient', c.settings->'isGlobalConfigClient'
          ))
        ) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(
        (to_jsonb(b) - 'images' - 'notes')
        || jsonb_build_object('images', jsonb_build_array(b.images->0))
        ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(
        (to_jsonb(u) - 'images')
        || jsonb_build_object('images', CASE WHEN uc.cover IS NOT NULL THEN jsonb_build_array(uc.cover) ELSE '[]'::jsonb END)
        ORDER BY u.created_at DESC)
      FROM public_units u JOIN unit_cover uc ON uc.id = u.id), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'client_id', u.client_id,
          'email', u.email,
          'first_name', u.first_name,
          'last_name', u.last_name,
          'role', u.role,
          'active', u.active,
          'metadata', jsonb_strip_nulls(jsonb_build_object(
            'frontend_id', u.metadata->'frontend_id',
            'frontend_role', u.metadata->'frontend_role',
            'verification', CASE WHEN jsonb_typeof(u.metadata->'verification') = 'object'
              THEN jsonb_build_object('status', u.metadata->'verification'->'status') END
          ))
        ) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
    'entity_id_map', coalesce(
      (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.entity_type, m.frontend_id)
       FROM entity_id_map m
       WHERE (m.entity_type = 'unit' AND m.backend_id IN (SELECT id FROM public_units))
          OR (m.entity_type = 'property' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'building' AND m.backend_id IN (SELECT id FROM unit_buildings))
          OR (m.entity_type = 'agency' AND m.backend_id IN (SELECT id FROM unit_clients))
          OR (m.entity_type = 'user' AND m.backend_id IN (SELECT id FROM unit_landlords))),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap(boolean) TO anon, authenticated;
REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap_lite(boolean) TO anon, authenticated;

COMMIT;
