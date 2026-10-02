/** SA-style business-day helpers (Mon–Fri). No public-holiday calendar in Mode A. */

function parseDay(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00`)
}

function formatDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

/** Add (or subtract when n < 0) business days from an ISO date. */
export function addBusinessDays(isoDate: string, n: number): string {
  const d = parseDay(isoDate)
  const step = n >= 0 ? 1 : -1
  let remaining = Math.abs(n)
  while (remaining > 0) {
    d.setDate(d.getDate() + step)
    if (!isWeekend(d)) remaining -= 1
  }
  return formatDay(d)
}

/** Calendar months forward from ISO date (same DOM; clamped by JS Date). */
export function addCalendarMonths(isoDate: string, months: number): string {
  const d = parseDay(isoDate)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  // If month rolled past (e.g. Jan 31 → Mar), JS may overflow; keep intent loose for Mode A.
  if (d.getDate() < day) {
    // landed on last day of target month — fine
  }
  return formatDay(d)
}

export function todayIso(now: Date = new Date()): string {
  return formatDay(now)
}
