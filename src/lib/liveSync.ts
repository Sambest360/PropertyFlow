/** Tables that should trigger a live bootstrap refresh when changed. */
export const LIVE_SYNC_TABLES = [
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
  'units',
  'media_assets',
] as const

/** Debounce rapid postgres_changes bursts into one refresh. */
export const LIVE_SYNC_DEBOUNCE_MS = 450

/** Fallback poll when Realtime is unavailable (API mode or offline channel). */
export const LIVE_SYNC_POLL_MS = 20_000
