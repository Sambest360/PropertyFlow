-- Property archive authority for direct Supabase client writes (policies only).
-- Node persist uses DATABASE_URL and bypasses RLS; these policies protect browser-side mutations.

DROP POLICY IF EXISTS units_mutate ON units;
DROP POLICY IF EXISTS buildings_mutate ON buildings;

-- units: INSERT / UPDATE / DELETE
CREATE POLICY units_insert ON units
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() IN ('GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
      AND agent_id = current_app_user_id()
    )
  );

CREATE POLICY units_update ON units
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() IN ('GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
      AND agent_id = current_app_user_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() IN ('GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
      AND agent_id = current_app_user_id()
    )
  );

CREATE POLICY units_delete ON units
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- buildings: INSERT / UPDATE / DELETE (field agents: agency client only, no agent_id on building)
CREATE POLICY buildings_insert ON buildings
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() IN ('GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
    )
  );

CREATE POLICY buildings_update ON buildings
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() IN ('GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR (
      current_app_user_role() IN ('AGENCY_ADMIN', 'AGENT_ADMIN')
      AND client_id = current_app_client_id()
    )
    OR (
      current_app_user_role() IN ('GROUND_AGENT', 'AGENT')
      AND client_id = current_app_client_id()
    )
  );

CREATE POLICY buildings_delete ON buildings
  FOR DELETE TO authenticated
  USING (is_super_admin());
