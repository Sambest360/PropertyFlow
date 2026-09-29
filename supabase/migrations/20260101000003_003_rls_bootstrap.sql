-- RLS policies for bootstrap + persist tables (agency-scoped + super_admin).

-- entity_id_map: read for all authenticated (needed for FE id resolution)
ALTER TABLE entity_id_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entity_id_map_select ON entity_id_map;
CREATE POLICY entity_id_map_select ON entity_id_map
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS entity_id_map_mutate ON entity_id_map;
CREATE POLICY entity_id_map_mutate ON entity_id_map
  FOR ALL TO authenticated
  USING (is_super_admin() OR is_agency_staff())
  WITH CHECK (is_super_admin() OR is_agency_staff());

-- Macro: client_id scoped tables
-- buildings, units, rooms, internal_assets, leads, applications, leases, bookings,
-- viewing_slots, payments, documents, maintenance_tickets, message_threads, messages,
-- notifications, suite_alerts, event_log, invoices, client_lookup_configs

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'buildings', 'units', 'rooms', 'internal_assets', 'leads', 'applications',
    'leases', 'bookings', 'viewing_slots', 'payments', 'documents',
    'maintenance_tickets', 'message_threads', 'messages', 'notifications',
    'suite_alerts', 'client_lookup_configs', 'client_subscriptions', 'invoices'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_select ON %I FOR SELECT TO authenticated
       USING (is_super_admin() OR client_id = current_app_client_id()
              OR current_app_user_role() IN (''LANDLORD'', ''END_USER'', ''CONTRACTOR''))',
      tbl, tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_mutate ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I_mutate ON %I FOR ALL TO authenticated
       USING (is_super_admin() OR client_id = current_app_client_id())
       WITH CHECK (is_super_admin() OR client_id = current_app_client_id())',
      tbl, tbl
    );
  END LOOP;
END $$;

-- event_log uses client_id
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_log_select ON event_log;
CREATE POLICY event_log_select ON event_log
  FOR SELECT TO authenticated
  USING (is_super_admin() OR client_id = current_app_client_id()
         OR current_app_user_role() IN ('LANDLORD', 'END_USER', 'CONTRACTOR'));
DROP POLICY IF EXISTS event_log_mutate ON event_log;
CREATE POLICY event_log_mutate ON event_log
  FOR ALL TO authenticated
  USING (is_super_admin() OR client_id = current_app_client_id())
  WITH CHECK (is_super_admin() OR client_id = current_app_client_id());

-- Landlord/tenant/contractor property-linked read policies (units via buildings)
DROP POLICY IF EXISTS units_landlord_read ON units;
CREATE POLICY units_landlord_read ON units
  FOR SELECT TO authenticated
  USING (
    current_app_user_role() = 'LANDLORD'
    AND EXISTS (
      SELECT 1 FROM buildings b
      WHERE b.id = units.building_id
        AND b.landlord_id = current_app_user_id()
    )
  );

DROP POLICY IF EXISTS buildings_landlord_read ON buildings;
CREATE POLICY buildings_landlord_read ON buildings
  FOR SELECT TO authenticated
  USING (
    current_app_user_role() = 'LANDLORD'
    AND landlord_id = current_app_user_id()
  );

DROP POLICY IF EXISTS applications_tenant_read ON applications;
CREATE POLICY applications_tenant_read ON applications
  FOR SELECT TO authenticated
  USING (
    current_app_user_role() = 'END_USER'
    AND applicant_id = current_app_user_id()
  );

DROP POLICY IF EXISTS leases_tenant_read ON leases;
CREATE POLICY leases_tenant_read ON leases
  FOR SELECT TO authenticated
  USING (
    current_app_user_role() = 'END_USER'
    AND tenant_id = current_app_user_id()
  );

DROP POLICY IF EXISTS tickets_contractor_read ON maintenance_tickets;
CREATE POLICY tickets_contractor_read ON maintenance_tickets
  FOR SELECT TO authenticated
  USING (
    current_app_user_role() = 'CONTRACTOR'
    AND contractor_id = current_app_user_id()
  );

DROP POLICY IF EXISTS tickets_contractor_update ON maintenance_tickets;
CREATE POLICY tickets_contractor_update ON maintenance_tickets
  FOR UPDATE TO authenticated
  USING (
    current_app_user_role() = 'CONTRACTOR'
    AND contractor_id = current_app_user_id()
  )
  WITH CHECK (
    current_app_user_role() = 'CONTRACTOR'
    AND contractor_id = current_app_user_id()
  );

-- RPC: admin user verification update (mirrors server/auth.ts updateUserVerification)
CREATE OR REPLACE FUNCTION public.admin_update_user_verification(
  p_frontend_user_id TEXT,
  p_status TEXT,
  p_reject_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target users%ROWTYPE;
  meta JSONB;
  verification JSONB;
  reviewer_fe TEXT;
BEGIN
  IF NOT is_super_admin() AND NOT is_agency_staff() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO target FROM users
  WHERE metadata->>'frontend_id' = p_frontend_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF NOT is_super_admin() AND target.client_id IS DISTINCT FROM current_app_client_id() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT metadata->>'frontend_id' INTO reviewer_fe
  FROM users WHERE auth_user_id = auth.uid() LIMIT 1;

  meta := COALESCE(target.metadata, '{}'::jsonb);
  verification := COALESCE(meta->'verification', '{}'::jsonb);
  verification := verification || jsonb_build_object(
    'status', p_status,
    'reviewedAt', to_jsonb(NOW()),
    'reviewerId', reviewer_fe,
    'rejectNote', CASE WHEN p_status = 'rejected' THEN to_jsonb(p_reject_note) ELSE verification->'rejectNote' END
  );
  meta := meta || jsonb_build_object('verification', verification);

  UPDATE users SET metadata = meta, updated_at = NOW()
  WHERE id = target.id;

  RETURN meta;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_verification(TEXT, TEXT, TEXT) TO authenticated;

-- RPC: approve application + create lease (simplified transaction)
CREATE OR REPLACE FUNCTION public.approve_application(
  p_application_ref TEXT,
  p_tenancy JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app applications%ROWTYPE;
  lease_id UUID;
  fe_lease TEXT;
BEGIN
  IF NOT is_super_admin() AND NOT is_agency_staff() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO app FROM applications
  WHERE reference_code = p_application_ref
     OR metadata->>'frontend_id' = p_application_ref
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF NOT is_super_admin() AND app.client_id IS DISTINCT FROM current_app_client_id() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE applications
  SET status = 'APPROVED', updated_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('stage', 'Approved')
  WHERE id = app.id;

  lease_id := gen_random_uuid();
  fe_lease := 'tn-' || substr(replace(lease_id::text, '-', ''), 1, 8);

  INSERT INTO leases (
    id, client_id, unit_id, tenant_id, landlord_id, agent_id,
    start_date, end_date, rent_amount, deposit_amount, status, metadata
  ) VALUES (
    lease_id,
    app.client_id,
    app.unit_id,
    app.applicant_id,
    (SELECT b.landlord_id FROM units u JOIN buildings b ON b.id = u.building_id WHERE u.id = app.unit_id),
    app.agent_id,
    COALESCE((p_tenancy->>'startDate')::date, CURRENT_DATE),
    NULLIF(p_tenancy->>'endDate', '')::date,
    COALESCE((p_tenancy->>'rent')::numeric, 0),
    COALESCE((p_tenancy->>'deposit')::numeric, 0),
    'ACTIVE',
    COALESCE(p_tenancy->'keyCollection', '{}'::jsonb)
  );

  INSERT INTO entity_id_map (entity_type, backend_id, frontend_id)
  VALUES ('tenancy', lease_id, fe_lease)
  ON CONFLICT (entity_type, backend_id) DO UPDATE SET frontend_id = EXCLUDED.frontend_id;

  UPDATE applications
  SET status = 'LEASED', updated_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('stage', 'Active Tenancy')
  WHERE id = app.id;

  RETURN jsonb_build_object('ok', true, 'tenancyId', fe_lease);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_application(TEXT, JSONB) TO authenticated;
