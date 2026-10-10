/**
 * South African public holidays (Public Holidays Act 36 of 1994), static list
 * for 2026-2028, used to count SA business days for lease-end reminders.
 *
 * Rule: a holiday falling on a Sunday is observed on the following Monday (s2(1)).
 * Saturday holidays are not moved. Easter-based holidays (Good Friday, Family Day)
 * are listed per year.
 *
 * MUST BE EXTENDED BY 2028: dates after 2028-12-31 are not covered, and business-day
 * counts beyond that will only skip weekends. Add 2029+ (incl. Easter dates) before then.
 */

/** Fixed-date holidays as MM-DD. */
const FIXED_MMDD = [
  '01-01', // New Year's Day
  '03-21', // Human Rights Day
  '04-27', // Freedom Day
  '05-01', // Workers' Day
  '06-16', // Youth Day
  '08-09', // National Women's Day
  '09-24', // Heritage Day
  '12-16', // Day of Reconciliation
  '12-25', // Christmas Day
  '12-26', // Day of Goodwill
] as const

/** Good Friday + Family Day (Easter Monday) per year. */
const EASTER_HOLIDAYS: Record<number, [string, string]> = {
  2026: ['2026-04-03', '2026-04-06'],
  2027: ['2027-03-26', '2027-03-29'],
  2028: ['2028-04-14', '2028-04-17'],
}

/**
 * One-off days declared under s2A of the Public Holidays Act (e.g. election days).
 * s2A days are not known in advance: add each one here when it is proclaimed.
 */
const EXTRA_DATES: readonly string[] = [
  // Local government elections. Proclamation Notice 346 of 2026, GG 55352 (8 Sep 2026),
  // s2A Public Holidays Act; confirmed by gov.za Presidency statement 15 Sep 2026.
  '2026-11-04',
]

export const SA_HOLIDAY_YEARS = [2026, 2027, 2028] as const

function isoAddDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function buildHolidaySet(): Set<string> {
  const out = new Set<string>()
  for (const year of SA_HOLIDAY_YEARS) {
    for (const mmdd of FIXED_MMDD) {
      const iso = `${year}-${mmdd}`
      out.add(iso)
      if (new Date(`${iso}T00:00:00Z`).getUTCDay() === 0) out.add(isoAddDays(iso, 1))
    }
    for (const iso of EASTER_HOLIDAYS[year] ?? []) out.add(iso)
  }
  for (const iso of EXTRA_DATES) out.add(iso)
  return out
}

export const SA_PUBLIC_HOLIDAYS: ReadonlySet<string> = buildHolidaySet()

/** Last calendar date covered by the static list. */
export const SA_HOLIDAY_LIST_END = `${SA_HOLIDAY_YEARS[SA_HOLIDAY_YEARS.length - 1]}-12-31`

export function isSaPublicHoliday(iso: string): boolean {
  return SA_PUBLIC_HOLIDAYS.has(iso)
}

/** Mon-Fri and not an SA public holiday. `iso` is a calendar date (YYYY-MM-DD). */
export function isSaBusinessDay(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !isSaPublicHoliday(iso)
}

/** Business days in (from, to]; 0 when to <= from. */
export function saBusinessDaysBetween(fromIso: string, toIso: string): number {
  if (toIso <= fromIso) return 0
  let n = 0
  let cur = fromIso
  while (cur < toIso) {
    cur = isoAddDays(cur, 1)
    if (isSaBusinessDay(cur)) n++
  }
  return n
}

/** The date `n` SA business days before `iso` (skipping weekends + holidays). */
export function subtractSaBusinessDays(iso: string, n: number): string {
  let cur = iso
  let left = n
  while (left > 0) {
    cur = isoAddDays(cur, -1)
    if (isSaBusinessDay(cur)) left--
  }
  return cur
}

export { isoAddDays }
