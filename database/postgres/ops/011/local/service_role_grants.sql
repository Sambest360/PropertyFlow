-- Rehearsal only. Hosted Supabase already grants the API tables to service_role.
-- Migration 002 grants tables to authenticated, not service_role, and BYPASSRLS
-- does not replace GRANT. Do not copy this into 011.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
