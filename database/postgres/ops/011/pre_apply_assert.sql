-- Read-only gate. Run before apply.sh (apply.sh runs it automatically).
-- Fails closed when 011 is already applied or the wide 003 SELECT policy is gone,
-- which means production has drifted and rollback.sql would not restore it.

DO $$
DECLARE
  qual text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'protect_user_privileged_columns'
  ) THEN
    RAISE EXCEPTION '011 appears already applied (protect_user_privileged_columns exists). Refusing to apply again.';
  END IF;

  SELECT pg_get_expr(pol.polqual, pol.polrelid)
    INTO qual
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'leads'
    AND pol.polname = 'leads_select';

  IF qual IS NULL OR qual NOT LIKE '%END_USER%' THEN
    RAISE EXCEPTION
      'leads_select is not the pre-011 policy from 003_rls_bootstrap.sql (qual=%). Stop. Compare pre_apply_snapshot.sql with the repo before applying. rollback.sql restores the repo definitions, not a hand-edited production policy.',
      qual;
  END IF;
END $$;
