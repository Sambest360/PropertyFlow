/**
 * CR9 — arrears built from tenancies and payments already in the store.
 *
 * Arrears for a tenancy, as at a date =
 *   rent due from the tenancy rent schedule up to that date
 *   minus rent payments recorded as Paid against that tenancy.
 *
 * Each month is charged at the rent that applied then (scheduled escalation
 * walked back from the current rent). The start month is a full month: First
 * Month Rent has no proration, so a mid-month start is still charged.
 *
 * Never reads seed arrears snapshots. A tenancy with no rent schedule gets no
 * arrears row (no guess). Figures come from the in-app book only.
 */

import type { PaymentRecord, Tenancy } from '../../types/domain'

/** Payment types that count as rent paid against a tenancy. */
const RENT_PAYMENT_TYPES: ReadonlySet<PaymentRecord['type']> = new Set(['Rent', 'First Month Rent'])

/** Monthly rent schedule resolved for one tenancy. */
export type TenancyRentSchedule = {
  amountCents: number
  /** Day of month rent falls due (1–28). */
  dayOfMonth: number
  /** YYYY-MM-DD */
  startOn: string
  /** YYYY-MM-DD or null when open-ended. */
  endOn: string | null
  /** Scheduled yearly increase in percent (8 = 8%), or null when none is set. */
  escalationPct?: number | null
  /** YYYY-MM-DD of the next scheduled increase, or null. */
  nextEscalationOn?: string | null
}

/** One computed arrears row. Bucket field names match the old snapshot shape. */
export type TenancyArrearsRow = {
  id: string
  agencyId: string
  occupancyId: string
  propertyId: string
  tenantName: string
  /** YYYY-MM-DD the figures are as at. */
  asOf: string
  dueCents: number
  paidCents: number
  /** max(0, due − paid). */
  arrearsCents: number
  /** Unpaid amount 0–30 days past due. */
  d30: number
  /** 31–60 days past due. */
  d60: number
  /** 61–90 days past due. */
  d90: number
  /** More than 90 days past due. */
  d90plus: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function ymd(value: string): string {
  return value.slice(0, 10)
}

function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
}

function parseDay(isoDate: string): Date {
  return new Date(`${ymd(isoDate)}T12:00:00`)
}

function formatDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function clampDay(day: unknown): number {
  const n = typeof day === 'number' ? day : Number(day)
  if (!Number.isFinite(n)) return 1
  return Math.min(28, Math.max(1, Math.trunc(n)))
}

/** Today's date (local) as YYYY-MM-DD. */
export function todayYmd(now: Date = new Date()): string {
  return formatDay(now)
}

/**
 * Resolve the rent schedule for a tenancy.
 * Uses the saved billing schedule when there is one; otherwise the lease's own
 * rent, start date and rent due day (leases.rent_due_day, schema default 1).
 * Returns null when there is no usable schedule (no rent amount or no start date).
 */
export function resolveRentSchedule(t: Tenancy): TenancyRentSchedule | null {
  const bs = t.billingSchedule
  if (bs && Number.isFinite(bs.amountCents) && bs.amountCents > 0 && isYmd(bs.startOn)) {
    return {
      amountCents: Math.round(bs.amountCents),
      dayOfMonth: clampDay(bs.dayOfMonth),
      startOn: ymd(bs.startOn),
      endOn: isYmd(bs.endOn) ? ymd(bs.endOn) : isYmd(t.endDate) ? ymd(t.endDate) : null,
      escalationPct: Number.isFinite(bs.escalationPct) ? Number(bs.escalationPct) : null,
      nextEscalationOn: isYmd(bs.nextEscalationOn) ? ymd(bs.nextEscalationOn) : null,
    }
  }
  if (!(Number.isFinite(t.rent) && t.rent > 0) || !isYmd(t.startDate)) return null
  return {
    amountCents: Math.round(t.rent * 100),
    dayOfMonth: clampDay(t.rentDueDay ?? 1),
    startOn: ymd(t.startDate),
    endOn: isYmd(t.endDate) ? ymd(t.endDate) : null,
  }
}

/**
 * Due dates from the schedule that fall on or before asOf (and within the lease).
 * The start month is always charged: when the rent day falls before the start
 * date (e.g. start 15 Mar, due day 1), March falls due on the start date itself.
 */
export function scheduledDueDates(schedule: TenancyRentSchedule, asOf: string): string[] {
  const limit = schedule.endOn && schedule.endOn < ymd(asOf) ? schedule.endOn : ymd(asOf)
  const start = parseDay(schedule.startOn)
  const year = start.getFullYear()
  let month = start.getMonth()
  // Date normalises month overflow into later years.
  const dueFor = (m: number) => formatDay(new Date(year, m, schedule.dayOfMonth, 12))
  const out: string[] = []
  if (dueFor(month) < schedule.startOn) {
    // First Month Rent is a full month with no proration: charge it on the start date.
    if (schedule.startOn <= limit) out.push(schedule.startOn)
    month += 1
  }
  while (dueFor(month) <= limit && out.length < 1200) {
    out.push(dueFor(month))
    month += 1
  }
  return out
}

/** Same month and day, `years` earlier (string form, so 29 Feb compares safely). */
function yearsBefore(isoDate: string, years: number): string {
  const y = Number(isoDate.slice(0, 4)) - years
  return `${String(y).padStart(4, '0')}${isoDate.slice(4, 10)}`
}

/**
 * Rent (cents) that applied on a due date.
 * The schedule amount is today's rent. With a scheduled increase, the last
 * increase was nextEscalationOn minus 12 months; due dates on or after it use
 * today's rent, and each 12-month step further back divides by (1 + pct/100).
 * Without escalation data every month uses today's rent.
 */
export function rentCentsForDue(schedule: TenancyRentSchedule, due: string): number {
  const pct = schedule.escalationPct
  const next = schedule.nextEscalationOn
  if (pct == null || !Number.isFinite(pct) || pct <= 0 || !next || !isYmd(next)) return schedule.amountCents
  const d = ymd(due)
  let threshold = yearsBefore(ymd(next), 1)
  let steps = 0
  while (d < threshold && steps < 200) {
    steps += 1
    threshold = yearsBefore(threshold, 1)
  }
  if (steps === 0) return schedule.amountCents
  return Math.round(schedule.amountCents / Math.pow(1 + pct / 100, steps))
}

function paymentCents(p: PaymentRecord): number {
  const zar = p.paidAmount != null && Number.isFinite(p.paidAmount) ? p.paidAmount : p.amount
  return Math.max(0, Math.round((Number(zar) || 0) * 100))
}

/** Rent paid against a tenancy on or before asOf. */
export function rentPaidCents(tenancyId: string, payments: readonly PaymentRecord[], asOf: string): number {
  const d = ymd(asOf)
  return payments
    .filter(
      (p) =>
        p.tenancyId === tenancyId &&
        p.status === 'Paid' &&
        RENT_PAYMENT_TYPES.has(p.type) &&
        (!p.paidAt || ymd(p.paidAt) <= d),
    )
    .reduce((sum, p) => sum + paymentCents(p), 0)
}

/**
 * Arrears for one tenancy. Returns null when the tenancy has no rent schedule.
 * Payments are applied to the oldest due date first; what is left unpaid is aged
 * by days past its due date.
 */
export function computeTenancyArrears(
  t: Tenancy,
  payments: readonly PaymentRecord[],
  asOf: string,
): TenancyArrearsRow | null {
  const schedule = resolveRentSchedule(t)
  if (!schedule) return null
  const day = ymd(asOf)
  const dues = scheduledDueDates(schedule, day).map((due) => ({ due, cents: rentCentsForDue(schedule, due) }))
  const dueCents = dues.reduce((sum, d) => sum + d.cents, 0)
  const paidCents = rentPaidCents(t.id, payments, day)

  const buckets = { d30: 0, d60: 0, d90: 0, d90plus: 0 }
  let credit = paidCents
  const today = parseDay(day).getTime()
  for (const { due, cents } of dues) {
    const applied = Math.min(credit, cents)
    credit -= applied
    const unpaid = cents - applied
    if (unpaid <= 0) continue
    const days = Math.max(0, Math.round((today - parseDay(due).getTime()) / DAY_MS))
    if (days <= 30) buckets.d30 += unpaid
    else if (days <= 60) buckets.d60 += unpaid
    else if (days <= 90) buckets.d90 += unpaid
    else buckets.d90plus += unpaid
  }

  return {
    id: `arrears-${t.id}`,
    agencyId: t.agencyId,
    occupancyId: t.id,
    propertyId: t.propertyId,
    tenantName: t.tenantName,
    asOf: day,
    dueCents,
    paidCents,
    arrearsCents: Math.max(0, dueCents - paidCents),
    ...buckets,
  }
}

/** Arrears rows for every tenancy that has a rent schedule (optionally one agency). */
export function buildTenancyArrears(params: {
  tenancies: readonly Tenancy[]
  payments: readonly PaymentRecord[]
  asOf: string
  agencyId?: string | null
}): TenancyArrearsRow[] {
  const rows: TenancyArrearsRow[] = []
  for (const t of params.tenancies) {
    if (params.agencyId && t.agencyId !== params.agencyId) continue
    const row = computeTenancyArrears(t, params.payments, params.asOf)
    if (row) rows.push(row)
  }
  return rows
}
