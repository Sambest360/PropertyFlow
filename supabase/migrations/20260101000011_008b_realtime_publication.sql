-- Enable Supabase Realtime for operational tables (live sync in the workspace).
-- Safe to re-run: duplicate_object errors are ignored.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'applications',
    'notifications',
    'leads',
    'bookings',
    'maintenance_tickets',
    'payments',
    'messages',
    'message_threads',
    'viewing_slots',
    'leases',
    'units'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
