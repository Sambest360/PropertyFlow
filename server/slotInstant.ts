/**
 * Viewing slots hold a South African wall-clock date (YYYY-MM-DD) and time
 * ('HH:MM' or 'HH:MM:SS').
 *
 * STORAGE (Michael ruling 2): bookings.starts_at keeps the app convention of
 * SAST wall time labelled Z (a 10:00 slot is stored as 10:00+00), exactly like
 * writes.ts upsertViewing, migration 024 and the live RPC; the read paths
 * (server/bootstrap.ts) take the time back with
 * toISOString(). Use slotStoredStart() for anything written to starts_at.
 *
 * NOTICE ONLY: slotStartSast() builds the real Africa/Johannesburg instant
 * (UTC+2, no DST) so the 24h occupied-viewing notice compares true times
 * whatever the server's TZ. The 027 RPC compares the same thing as
 * (stored AT TIME ZONE 'UTC') vs (now() AT TIME ZONE 'Africa/Johannesburg').
 */
export const SLOT_TIME_ZONE = 'Africa/Johannesburg'
const SAST_OFFSET = '+02:00'

/** The value to store in bookings.starts_at: the slot's wall time labelled Z. */
export function slotStoredStart(slotDate: string, slotTime: string): Date {
  const date = String(slotDate).slice(0, 10)
  const hm = String(slotTime).slice(0, 5)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(hm)) return new Date(Number.NaN)
  return new Date(`${date}T${hm}:00Z`)
}

/** Real instant of the slot in Africa/Johannesburg: for the notice check only. */
export function slotStartSast(slotDate: string, slotTime: string): Date {
  const date = String(slotDate).slice(0, 10)
  const hm = String(slotTime).slice(0, 5)
  return new Date(`${date}T${hm}:00${SAST_OFFSET}`)
}
