-- Rehearsal only. Hosted Supabase already grants the API tables to service_role.
-- Migration 002 grants tables to authenticated, not service_role, and BYPASSRLS
-- does not replace GRANT. Do not copy this into 011.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
-- Trust tables are created in 007, after 002's GRANT to authenticated.
-- Supabase default privileges grant them; this stub does the same so the
-- wide trust_read policy is visible before 011 replaces it.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  trust_transactions, trust_allocations, payout_instructions,
  deposit_holdings, arrears_snapshots, csv_import_batches
TO authenticated;
