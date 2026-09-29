-- 011a verification. Run in the Supabase SQL editor after 011a_public_rpc_stopgap.sql.
-- Calls both RPCs as the anonymous role and rolls back, so it changes nothing.

-- Check 1: leak closed. Expect: false, false, 0, 0, 0, 0.
BEGIN;
SET LOCAL ROLE anon;
WITH p AS (
  SELECT get_public_marketplace_bootstrap(false) AS j
  UNION ALL
  SELECT get_public_marketplace_bootstrap_lite(true)
)
SELECT
  (SELECT bool_or(j::text LIKE '%password_hash%') FROM p)            AS has_password_hash_field,
  (SELECT bool_or(j::text ~ '\$2[aby]\$[0-9]{2}\$') FROM p)          AS has_bcrypt_hash,
  (SELECT count(*) FROM p, jsonb_array_elements(p.j->'users') u, jsonb_object_keys(u) k
     WHERE k NOT IN ('id','client_id','email','first_name','last_name','role','active','metadata'))
                                                                     AS unexpected_user_fields,
  (SELECT count(*) FROM p, jsonb_array_elements(p.j->'users') u, jsonb_object_keys(u->'metadata') k
     WHERE k NOT IN ('frontend_id','frontend_role','verification'))  AS unexpected_user_metadata,
  (SELECT count(*) FROM p, jsonb_array_elements(p.j->'clients') c, jsonb_object_keys(c) k
     WHERE k NOT IN ('id','company_name','subdomain','status','city','created_at','settings'))
                                                                     AS unexpected_client_fields,
  (SELECT count(*) FROM p, jsonb_array_elements(p.j->'buildings') b WHERE b ? 'notes')
                                                                     AS buildings_with_notes;
ROLLBACK;

-- Check 2: marketplace still populated. Run once BEFORE the stopgap and once AFTER.
-- The numbers must match.
BEGIN;
SET LOCAL ROLE anon;
SELECT
  jsonb_array_length(get_public_marketplace_bootstrap_lite(true)->'units')    AS lite_units,
  jsonb_array_length(get_public_marketplace_bootstrap_lite(true)->'clients')  AS lite_agencies,
  jsonb_array_length(get_public_marketplace_bootstrap(false)->'units')        AS full_units,
  jsonb_array_length(get_public_marketplace_bootstrap(false)->'users')        AS full_landlords;
ROLLBACK;
