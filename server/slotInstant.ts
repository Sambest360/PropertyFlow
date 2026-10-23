/**
 * Viewing slots store a South African wall-clock date (YYYY-MM-DD) and time
 * ('HH:MM' or 'HH:MM:SS'). Build the real instant in Africa/Johannesburg
 * (UTC+2, no DST) so the 24h occupied-viewing notice check compares true
 * timestamps whatever the server's TZ (Vercel runs UTC). The 027 RPC does the
 * same with `::timestamp AT TIME ZONE 'Africa/Johannesburg'`.
 */
export const SLOT_TIME_ZONE = 'Africa/Johannesburg'
const SAST_OFFSET = '+02:00'

export function slotStartSast(slotDate: string, slotTime: string): Date {
  const date = String(slotDate).slice(0, 10)
  const hm = String(slotTime).slice(0, 5)
  return new Date(`${date}T${hm}:00${SAST_OFFSET}`)
}
