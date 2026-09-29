-- Read-only catalog snapshot of every object migration 011 replaces.
-- Save the output before apply, and diff it against the same query after rollback.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -A -t -f database/postgres/ops/011/pre_apply_snapshot.sql > pre_011_snapshot.txt
--
-- Schema dump (public only), separate from this catalog diff:
--   database/postgres/ops/011/schema_dump.sh /secure/path/pre_011_public_schema.sql
-- A full data dump is in RUNBOOK.md. Do not store either dump in git.

SELECT line
FROM (
  SELECT format(
    'rls|%s|rowsecurity=%s|forcerowsecurity=%s',
    c.relname,
    c.relrowsecurity,
    c.relforcerowsecurity
  ) AS line
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname = ANY (ARRAY[
      'users',
      'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
      'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
      'maintenance_tickets', 'message_threads', 'messages', 'notifications',
      'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
      'event_log'
    ])

  UNION ALL

  SELECT format(
    'policy|%s|%s|%s|%s|%s|%s|%s',
    tablename,
    policyname,
    permissive,
    cmd,
    roles::text,
    COALESCE(replace(replace(qual, E'\\', E'\\\\'), E'\n', E'\\n'), ''),
    COALESCE(replace(replace(with_check, E'\\', E'\\\\'), E'\n', E'\\n'), '')
  )
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = ANY (ARRAY[
      'users',
      'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
      'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
      'maintenance_tickets', 'message_threads', 'messages', 'notifications',
      'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
      'event_log'
    ])

  UNION ALL

  SELECT format(
    'trigger|%s|%s|%s|%s',
    c.relname,
    t.tgname,
    t.tgenabled,
    replace(replace(pg_get_triggerdef(t.oid, true), E'\\', E'\\\\'), E'\n', E'\\n')
  )
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND NOT t.tgisinternal
    AND c.relname = ANY (ARRAY[
      'users',
      'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
      'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
      'maintenance_tickets', 'message_threads', 'messages', 'notifications',
      'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
      'event_log'
    ])

  UNION ALL

  SELECT format(
    'function|%s|%s|secdef=%s|volatile=%s|config=%s|acl=%s|def=%s',
    p.proname,
    pg_get_function_identity_arguments(p.oid),
    p.prosecdef,
    p.provolatile,
    COALESCE(p.proconfig::text, ''),
    COALESCE(p.proacl::text, ''),
    replace(replace(pg_get_functiondef(p.oid), E'\\', E'\\\\'), E'\n', E'\\n')
  )
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = ANY (ARRAY[
      'protect_user_privileged_columns',
      'marketplace_user_json',
      'marketplace_client_json',
      'building_has_public_listing',
      'viewing_slot_on_public_listing',
      'get_public_marketplace_bootstrap',
      'get_public_marketplace_bootstrap_lite'
    ])

  UNION ALL

  SELECT format(
    'function_grant|%s|%s|%s|%s|grantable=%s',
    p.proname,
    pg_get_function_identity_arguments(p.oid),
    COALESCE(r.rolname, 'PUBLIC'),
    a.privilege_type,
    a.is_grantable
  )
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public'
    AND p.proname = ANY (ARRAY[
      'protect_user_privileged_columns',
      'marketplace_user_json',
      'marketplace_client_json',
      'building_has_public_listing',
      'viewing_slot_on_public_listing',
      'get_public_marketplace_bootstrap',
      'get_public_marketplace_bootstrap_lite'
    ])

  UNION ALL

  SELECT format(
    'table_grant|%s|%s|%s|grantable=%s',
    c.relname,
    COALESCE(r.rolname, 'PUBLIC'),
    a.privilege_type,
    a.is_grantable
  )
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname = ANY (ARRAY[
      'users',
      'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
      'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
      'maintenance_tickets', 'message_threads', 'messages', 'notifications',
      'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
      'event_log'
    ])

  UNION ALL

  SELECT format(
    'column_grant|%s|%s|%s|%s|grantable=%s',
    c.relname,
    att.attname,
    COALESCE(r.rolname, 'PUBLIC'),
    a.privilege_type,
    a.is_grantable
  )
  FROM pg_attribute att
  JOIN pg_class c ON c.oid = att.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(att.attacl) a
  LEFT JOIN pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public'
    AND att.attisdropped = false
    AND att.attacl IS NOT NULL
    AND c.relname = ANY (ARRAY[
      'users',
      'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
      'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
      'maintenance_tickets', 'message_threads', 'messages', 'notifications',
      'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices',
      'event_log'
    ])
) snapshot
ORDER BY line;
