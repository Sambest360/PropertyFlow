-- 008: RLS for maintenance_ticket_updates (resolution notes / audit trail)
-- Staff (same client) + super admin may insert notes on their tickets.
-- Ticket participants (reporter, assigned agent, contractor) and agency staff may read.

CREATE POLICY maintenance_ticket_updates_insert
  ON maintenance_ticket_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM maintenance_tickets mt
      WHERE mt.id = ticket_id
        AND (is_super_admin() OR mt.client_id = current_app_client_id())
    )
  );

CREATE POLICY maintenance_ticket_updates_select
  ON maintenance_ticket_updates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM maintenance_tickets mt
      WHERE mt.id = ticket_id
        AND (
          is_super_admin()
          OR mt.client_id = current_app_client_id()
          OR mt.reported_by = current_app_user_id()
          OR mt.assigned_to = current_app_user_id()
          OR mt.contractor_id = current_app_user_id()
        )
    )
  );
