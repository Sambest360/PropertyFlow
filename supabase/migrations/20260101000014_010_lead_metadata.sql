-- 010: Lead pipeline metadata
-- Leads store per-stage requirement progress (which configured pipeline
-- requirements have been satisfied, by whom, and when) in a JSONB column.
-- Stage requirement *definitions* live in client_lookup_configs.meta.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
