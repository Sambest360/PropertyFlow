-- 015 verification. Run after 015_api_application_emails.sql.
-- Raises if the email-send table or the API role is missing or wrong.
-- Does not create or inspect the invites table (owned by migration 012).

DO $$
DECLARE
  pk_cols text;
  rls_on boolean;
  api_super boolean;
  api_bypass boolean;
BEGIN
  IF to_regclass('public.application_email_sends') IS NULL THEN
    RAISE EXCEPTION '015 verify: application_email_sends is missing';
  END IF;

  SELECT string_agg(a.attname, ',' ORDER BY k.ord)
    INTO pk_cols
  FROM pg_constraint c
  JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
  WHERE c.conrelid = 'public.application_email_sends'::regclass
    AND c.contype = 'p';

  IF pk_cols IS DISTINCT FROM 'application_id,kind' THEN
    RAISE EXCEPTION '015 verify: primary key is %, expected application_id,kind', pk_cols;
  END IF;

  SELECT c.relrowsecurity INTO rls_on
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'application_email_sends';

  IF rls_on IS NOT TRUE THEN
    RAISE EXCEPTION '015 verify: row level security is not enabled on application_email_sends';
  END IF;

  SELECT rolsuper, rolbypassrls
    INTO api_super, api_bypass
  FROM pg_roles
  WHERE rolname = 'propertyflow_api';

  IF NOT FOUND THEN
    RAISE EXCEPTION '015 verify: role propertyflow_api is missing';
  END IF;
  IF api_super THEN
    RAISE EXCEPTION '015 verify: propertyflow_api must not be a superuser';
  END IF;
  IF NOT api_bypass THEN
    RAISE EXCEPTION '015 verify: propertyflow_api must have BYPASSRLS';
  END IF;
END $$;
