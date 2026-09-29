-- Performance indexes (safe to re-run). Apply: npm run db:migrate

CREATE INDEX IF NOT EXISTS idx_entity_id_map_frontend ON entity_id_map (entity_type, frontend_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_applications_unit_status ON applications (unit_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_unit_status ON maintenance_tickets (unit_id, status);
CREATE INDEX IF NOT EXISTS idx_leases_unit_tenant_status ON leases (unit_id, tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at DESC);
