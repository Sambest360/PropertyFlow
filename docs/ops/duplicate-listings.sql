-- SELECT-only diagnostics for duplicate / orphan listings.
-- Do not run DELETE or UPDATE from automation; cleanup is manual.

-- 1) Entity map row count by type
SELECT entity_type, COUNT(*) AS row_count
FROM entity_id_map
GROUP BY entity_type
ORDER BY entity_type;

-- 2) Duplicate units (same client + normalized address/title within 5 minutes)
WITH normalized AS (
  SELECT
    u.id,
    u.client_id,
    u.created_at,
    LOWER(TRIM(COALESCE(u.title, u.unit_number, ''))) AS norm_title,
    LOWER(TRIM(COALESCE(b.address, ''))) AS norm_address
  FROM units u
  JOIN buildings b ON b.id = u.building_id
),
pairs AS (
  SELECT
    a.id AS unit_a,
    b.id AS unit_b,
    a.client_id,
    a.norm_title,
    a.norm_address,
    a.created_at AS created_a,
    b.created_at AS created_b
  FROM normalized a
  JOIN normalized b
    ON a.client_id = b.client_id
   AND a.norm_title = b.norm_title
   AND a.norm_address = b.norm_address
   AND a.id <> b.id
   AND ABS(EXTRACT(EPOCH FROM (a.created_at - b.created_at))) <= 300
)
SELECT
  client_id,
  norm_title,
  norm_address,
  COUNT(*) AS pair_count,
  ARRAY_AGG(DISTINCT unit_a) AS unit_ids
FROM pairs
GROUP BY client_id, norm_title, norm_address
HAVING COUNT(*) >= 1
ORDER BY pair_count DESC;

-- 3) Units without any entity_id_map row (property or unit type)
SELECT u.id AS unit_uuid, u.unit_number, u.title, u.created_at
FROM units u
WHERE NOT EXISTS (
  SELECT 1 FROM entity_id_map m
  WHERE m.backend_id = u.id AND m.entity_type IN ('property', 'unit')
)
ORDER BY u.created_at DESC
LIMIT 200;

-- 4) Duplicate lightweight building shells (same client + address within 5 minutes)
WITH shells AS (
  SELECT
    id,
    client_id,
    LOWER(TRIM(COALESCE(address, ''))) AS norm_address,
    LOWER(TRIM(COALESCE(name, ''))) AS norm_name,
    created_at
  FROM buildings
)
SELECT
  a.client_id,
  a.norm_address,
  a.norm_name,
  COUNT(*) AS shell_count,
  ARRAY_AGG(a.id) AS building_ids
FROM shells a
JOIN shells b
  ON a.client_id = b.client_id
 AND a.norm_address = b.norm_address
 AND a.norm_name = b.norm_name
 AND a.id <> b.id
 AND ABS(EXTRACT(EPOCH FROM (a.created_at - b.created_at))) <= 300
GROUP BY a.client_id, a.norm_address, a.norm_name
HAVING COUNT(*) >= 1
ORDER BY shell_count DESC;
