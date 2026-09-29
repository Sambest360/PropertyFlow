-- Guest marketplace read path (anon cannot SELECT tables directly — see 002_supabase_auth.sql).
-- Returns published units + buildings + agency + landlord rows for browse / home without login.

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
  )
  SELECT jsonb_build_object(
    'clients', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.company_name) FROM unit_clients c), '[]'::jsonb),
    'buildings', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.name) FROM unit_buildings b), '[]'::jsonb),
    'units', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.created_at DESC) FROM public_units u), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.email) FROM unit_landlords u), '[]'::jsonb),
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

REVOKE ALL ON FUNCTION get_public_marketplace_bootstrap(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_marketplace_bootstrap(boolean) TO anon, authenticated;
