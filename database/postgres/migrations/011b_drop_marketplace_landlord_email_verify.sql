-- Checks for 011b. Read-only: the transaction rolls back.
-- Required psql variables: agency_a_id, landlord_a_user_id, noverif_landlord_id
-- (the same fixtures as database/postgres/ops/011/verify.sql).

BEGIN;

SELECT set_config('verify.agency_a_id', :'agency_a_id', true);
SELECT set_config('verify.landlord_a_user_id', :'landlord_a_user_id', true);
SELECT set_config('verify.noverif_landlord_id', :'noverif_landlord_id', true);

CREATE TEMP TABLE verify_results (
  check_id text PRIMARY KEY,
  result text NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

DO $check$
DECLARE
  fname text;
  payload jsonb;
  agency text := current_setting('verify.agency_a_id');
  landlord text := current_setting('verify.landlord_a_user_id');
  noverif text := current_setting('verify.noverif_landlord_id');
  bad_email text := '';
  bad_keys text := '';
  bad_notes text := '';
  bad_flag text := '';
  bad_ver text := '';
  n_email int;
  n_missing int;
  n_notes int;
  flag jsonb;
  stored jsonb;
  missing jsonb;
BEGIN
  FOREACH fname IN ARRAY ARRAY[
    'get_public_marketplace_bootstrap',
    'get_public_marketplace_bootstrap_lite'
  ]
  LOOP
    SET LOCAL ROLE anon;
    IF fname = 'get_public_marketplace_bootstrap' THEN
      payload := public.get_public_marketplace_bootstrap(true);
    ELSE
      payload := public.get_public_marketplace_bootstrap_lite(true);
    END IF;
    RESET ROLE;

    SELECT count(*) INTO n_email
    FROM jsonb_array_elements(COALESCE(payload->'users', '[]'::jsonb)) AS u(value)
    WHERE u.value ? 'email';
    IF n_email > 0 OR payload::text LIKE '%@%' THEN
      bad_email := bad_email || fname || ' ';
    END IF;

    SELECT count(*) INTO n_missing
    FROM jsonb_array_elements(COALESCE(payload->'users', '[]'::jsonb)) AS u(value)
    WHERE NOT (u.value ? 'landlord_id' AND u.value ? 'landlord_name');
    IF n_missing > 0 OR payload::text NOT LIKE '%' || landlord || '%' THEN
      bad_keys := bad_keys || fname || ' ';
    END IF;

    SELECT count(*) INTO n_notes
    FROM jsonb_array_elements(COALESCE(payload->'buildings', '[]'::jsonb)) AS b(value)
    WHERE b.value ? 'notes';
    IF n_notes > 0 OR payload::text LIKE '%INTERNAL-NOTE-LEAK%' THEN
      bad_notes := bad_notes || fname || ' ';
    END IF;

    SELECT c.value->'settings'->'isGlobalConfigClient' INTO flag
    FROM jsonb_array_elements(COALESCE(payload->'clients', '[]'::jsonb)) AS c(value)
    WHERE c.value->>'id' = agency;
    IF flag IS NULL OR jsonb_typeof(flag) <> 'boolean' OR flag <> 'false'::jsonb THEN
      bad_flag := bad_flag || fname || '=' || COALESCE(jsonb_typeof(flag), 'missing') || ' ';
    END IF;

    SELECT u.value INTO stored
    FROM jsonb_array_elements(COALESCE(payload->'users', '[]'::jsonb)) AS u(value)
    WHERE u.value->>'id' = landlord OR u.value->>'landlord_id' = landlord;
    SELECT u.value INTO missing
    FROM jsonb_array_elements(COALESCE(payload->'users', '[]'::jsonb)) AS u(value)
    WHERE u.value->>'id' = noverif OR u.value->>'landlord_id' = noverif;
    IF stored IS NULL
       OR stored->'metadata'->'verification'->>'status' IS DISTINCT FROM 'approved' THEN
      bad_ver := bad_ver || fname || ' stored ';
    END IF;
    IF missing IS NULL
       OR COALESCE(missing->'metadata'->'verification'->>'status', '') <> '' THEN
      bad_ver := bad_ver || fname || ' defaulted=' || COALESCE(missing->'metadata'->'verification'->>'status', 'no-row') || ' ';
    END IF;
  END LOOP;

  INSERT INTO verify_results VALUES (
    'b_email_absent',
    CASE WHEN bad_email = '' THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN bad_email = '' THEN 'landlord email is not in either public RPC' ELSE bad_email END
  );
  INSERT INTO verify_results VALUES (
    'b_landlord_id_and_name',
    CASE WHEN bad_keys = '' THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN bad_keys = '' THEN 'landlord_id and landlord_name are present' ELSE bad_keys END
  );
  INSERT INTO verify_results VALUES (
    'a_buildings_notes_absent',
    CASE WHEN bad_notes = '' THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN bad_notes = '' THEN 'neither public RPC emits buildings.notes' ELSE bad_notes END
  );
  INSERT INTO verify_results VALUES (
    'a_client_flag_is_boolean',
    CASE WHEN bad_flag = '' THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN bad_flag = '' THEN 'isGlobalConfigClient is JSON false' ELSE bad_flag END
  );
  INSERT INTO verify_results VALUES (
    'a_verification_only_when_stored',
    CASE WHEN bad_ver = '' THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN bad_ver = '' THEN 'status copied when stored and omitted when absent' ELSE bad_ver END
  );
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  INSERT INTO verify_results VALUES ('b_email_absent', 'FAIL', SQLERRM);
END
$check$;

SELECT check_id, result, detail FROM verify_results ORDER BY check_id;

ROLLBACK;
