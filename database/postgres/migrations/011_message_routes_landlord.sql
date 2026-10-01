-- Step 8 Mode A: allow owner↔tenant threads (routes_to LANDLORD).
-- In-app only — not WhatsApp/SMS delivery.

ALTER TABLE message_threads
  DROP CONSTRAINT IF EXISTS message_threads_routes_to_check;

ALTER TABLE message_threads
  ADD CONSTRAINT message_threads_routes_to_check
  CHECK (routes_to IN ('AGENCY', 'AGENT', 'LANDLORD'));
