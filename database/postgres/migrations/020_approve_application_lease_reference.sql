-- P1.5: approve_application must populate leases.lease_reference (NOT NULL).
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
  lease_ref TEXT;
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
  lease_ref := 'LS-' || upper(substr(replace(lease_id::text, '-', ''), 1, 8));

  INSERT INTO leases (
    id, client_id, unit_id, tenant_id, landlord_id, agent_id,
    lease_reference, start_date, end_date, rent_amount, deposit_amount, status, metadata
  ) VALUES (
    lease_id,
    app.client_id,
    app.unit_id,
    app.applicant_id,
    (SELECT b.landlord_id FROM units u JOIN buildings b ON b.id = u.building_id WHERE u.id = app.unit_id),
    app.agent_id,
    lease_ref,
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

  RETURN jsonb_build_object('ok', true, 'tenancyId', fe_lease, 'leaseReference', lease_ref);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_application(TEXT, JSONB) TO authenticated;
