-- Tenant / staff access notes on maintenance tickets (gate codes, pets, best
-- time to attend). Add-only; the app tolerates the column being absent until
-- this is applied (server/ticketAccessNotes.ts).

ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS access_notes text;
