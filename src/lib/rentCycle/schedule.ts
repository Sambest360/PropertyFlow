import type { PaymentRecord, Tenancy } from '../../types/domain'
import type {
  OverdueEscalation,
  PlannedRentPayment,
  RentCycleAsOf,
  RentPeriodKey,
} from './types'
import { DUNNING_NON_PRODUCTION_NOTE } from './types'

/** Calendar date helpers use noon local to avoid DST edge flips. */
function parseDay(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T12:00:00`)
}

function formatDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Clamp to Postgres leases.rent_due_day CHECK (1–28); default 1. */
export function clampRentDueDay(day: unknown): number {
  const n = typeof day === 'number' ? day : Number(day)
  if (!Number.isFinite(n)) return 1
  return Math.min(28, Math.max(1, Math.trunc(n)))
}

/** Effective due day from Tenancy (schema default 1). */
export function tenancyRentDueDay(tenancy: Pick<Tenancy, 'rentDueDay'>): number {
  return clampRentDueDay(tenancy.rentDueDay ?? 1)
}

/** Rent period key from a due date (YYYY-MM). */
export function rentPeriodKey(dueDate: string): RentPeriodKey {
  return dueDate.slice(0, 7)
}

/** Build YYYY-MM-{rentDueDay} for a calendar month (month is 0-based). */
export function dueDateForMonth(year: number, monthIndex: number, rentDueDay: number): string {
  const day = clampRentDueDay(rentDueDay)
  return formatDay(new Date(year, monthIndex, day, 12, 0, 0))
}

/**
 * Target due date for the asOf month using leases.rent_due_day (not start-date DOM).
 * If that due date is still before lease start, roll forward month-by-month until >= startDate.
 */
export function targetRentDueDate(
  tenancy: Pick<Tenancy, 'startDate' | 'rentDueDay'>,
  asOf: RentCycleAsOf,
): string {
  const day = tenancyRentDueDay(tenancy)
  const asOfDate = parseDay(asOf)
  let due = dueDateForMonth(asOfDate.getFullYear(), asOfDate.getMonth(), day)
  const start = tenancy.startDate.slice(0, 10)
  // Roll forward if the computed due is before the lease starts (do not invent start DOM).
  let guard = 0
  while (due < start && guard < 24) {
    const d = parseDay(due)
    due = dueDateForMonth(d.getFullYear(), d.getMonth() + 1, day)
    guard += 1
  }
  return due
}

/** Next month's due date preserving rent_due_day. */
export function nextMonthDueDate(dueDate: string, rentDueDay: number = 1): string {
  const d = parseDay(dueDate)
  return dueDateForMonth(d.getFullYear(), d.getMonth() + 1, rentDueDay)
}

/**
 * Idempotency key: (lease_id / tenancyId, due_date, RENT).
 * Cancelled rows do not block re-schedule; Paid/Due/Overdue do.
 * Aligns with PropertyPaymentsPanel manual "Add payment" (default Rent) — same ledger.
 */
export function hasRentRow(
  payments: readonly PaymentRecord[],
  tenancyId: string,
  dueDate: string,
): boolean {
  const due = dueDate.slice(0, 10)
  return payments.some(
    (p) =>
      p.tenancyId === tenancyId &&
      p.type === 'Rent' &&
      p.dueDate.slice(0, 10) === due &&
      p.status !== 'Cancelled',
  )
}

/** @deprecated alias — prefer hasRentRow (exact due_date + RENT). */
export function hasRentForPeriod(
  payments: readonly PaymentRecord[],
  tenancyId: string,
  dueDate: string,
): boolean {
  return hasRentRow(payments, tenancyId, dueDate)
}

/**
 * Days past due for an open payment (0 if not past due / not open).
 */
export function daysPastDueOn(dueDate: string, status: PaymentRecord['status'], asOf: RentCycleAsOf): number {
  if (status !== 'Due' && status !== 'Overdue') return 0
  const due = parseDay(dueDate)
  const today = parseDay(asOf)
  const ms = today.getTime() - due.getTime()
  if (ms <= 0) return 0
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

/**
 * Escalate Due → Overdue when the calendar due date is before `asOf`.
 */
export function planOverdueEscalations(
  payments: readonly PaymentRecord[],
  asOf: RentCycleAsOf,
): OverdueEscalation[] {
  const out: OverdueEscalation[] = []
  for (const p of payments) {
    if (p.status !== 'Due') continue
    const days = daysPastDueOn(p.dueDate, p.status, asOf)
    if (days <= 0) continue
    out.push({
      paymentId: p.id,
      fromStatus: 'Due',
      toStatus: 'Overdue',
      dueDate: p.dueDate,
      daysPastDue: days,
    })
  }
  return out
}

/**
 * Ensure each Active tenancy with rent > 0 has a Rent row for target (+ next) due dates.
 * Idempotent per (tenancyId, dueDate, RENT) — extends PaymentRecord ledger, does not invent another.
 */
export function planNextRentPayments(params: {
  tenancies: readonly Tenancy[]
  payments: readonly PaymentRecord[]
  asOf: RentCycleAsOf
  /** When true, also ensure the following month if the target month is already covered. */
  ensureForwardMonth?: boolean
}): PlannedRentPayment[] {
  const { tenancies, payments, asOf, ensureForwardMonth = true } = params
  const planned: PlannedRentPayment[] = []
  const seen = new Set<string>() // tenancyId|dueDate

  for (const t of tenancies) {
    if (t.status !== 'Active') continue
    if (!(t.rent > 0)) continue

    const day = tenancyRentDueDay(t)
    const candidates: string[] = [targetRentDueDate(t, asOf)]
    if (ensureForwardMonth) {
      candidates.push(nextMonthDueDate(candidates[0]!, day))
    }

    for (const dueDate of candidates) {
      if (dueDate < t.startDate.slice(0, 10)) continue
      if (t.endDate && dueDate > t.endDate.slice(0, 10)) continue

      const key = `${t.id}|${dueDate}`
      if (seen.has(key)) continue
      if (hasRentRow(payments, t.id, dueDate)) continue
      if (planned.some((p) => p.tenancyId === t.id && p.dueDate === dueDate)) continue

      seen.add(key)
      planned.push({
        agencyId: t.agencyId,
        propertyId: t.propertyId,
        applicationId: t.applicationId,
        tenancyId: t.id,
        partyName: t.tenantName,
        partyUserId: t.tenantUserId,
        type: 'Rent',
        amount: t.rent,
        status: 'Due',
        dueDate,
        landlordVisible: true,
        notes: `Scheduled rent · due day ${day} · ${dueDate} · ${DUNNING_NON_PRODUCTION_NOTE}`,
      })
    }
  }

  return planned
}

/** Combined Mode A cycle plan (escalate + schedule). */
export function planRentCycle(params: {
  tenancies: readonly Tenancy[]
  payments: readonly PaymentRecord[]
  asOf: RentCycleAsOf
}): {
  escalations: OverdueEscalation[]
  newRents: PlannedRentPayment[]
} {
  return {
    escalations: planOverdueEscalations(params.payments, params.asOf),
    newRents: planNextRentPayments(params),
  }
}
