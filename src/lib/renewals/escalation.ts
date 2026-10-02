/**
 * Scheduled rent escalation — Mode A.
 * Persist + apply staff-set escalationPct / nextEscalationOn (not live CPI).
 */

import type { Tenancy } from '../../types/domain'
import { addCalendarMonths } from './bizDays'
import { appendRenewalAuditNotes } from './noticeClock'
import { ensureRenewalOps } from './renewalActions'
import {
  CPI_REFUSE_COPY,
  RENEWALS_MODE_A_COPY,
  type EscalationApplyResult,
  type SoftBillingSchedule,
} from './types'

function zarToCents(zar: number): number {
  return Math.round(zar * 100)
}

function centsToZar(cents: number): number {
  return Math.round(cents) / 100
}

/** Build or refresh a soft BillingSchedule from tenancy rent + staff escalation fields. */
export function ensureSoftBillingSchedule(
  tenancy: Tenancy,
  patch?: Partial<Pick<SoftBillingSchedule, 'escalationPct' | 'nextEscalationOn' | 'dayOfMonth'>>,
  asOf?: string,
): SoftBillingSchedule {
  const now = (asOf ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
  const existing = tenancy.billingSchedule
  const dayOfMonth = patch?.dayOfMonth ?? existing?.dayOfMonth ?? tenancy.rentDueDay ?? 1
  return {
    id: existing?.id ?? `BS-${tenancy.id}`,
    agencyId: tenancy.agencyId,
    occupancyId: tenancy.id,
    chargeType: existing?.chargeType ?? 'RENT',
    amountCents: existing?.amountCents ?? zarToCents(tenancy.rent),
    dayOfMonth: Math.min(28, Math.max(1, dayOfMonth)),
    startOn: existing?.startOn ?? tenancy.startDate.slice(0, 10),
    endOn: existing?.endOn ?? tenancy.endDate,
    escalationPct:
      patch?.escalationPct !== undefined
        ? patch.escalationPct
        : (existing?.escalationPct ?? null),
    nextEscalationOn:
      patch?.nextEscalationOn !== undefined
        ? patch.nextEscalationOn
        : (existing?.nextEscalationOn ?? null),
    createdAt: existing?.createdAt ?? new Date(`${now}T12:00:00`).toISOString(),
    updatedAt: new Date(`${now}T12:00:00`).toISOString(),
  }
}

/**
 * Staff sets scheduled % + next date (not CPI HTTP).
 */
export function setEscalationOnBook(
  tenancy: Tenancy,
  params: { escalationPct: number | null; nextEscalationOn: string | null; asOf: string },
): Tenancy {
  const asOf = params.asOf.slice(0, 10)
  const schedule = ensureSoftBillingSchedule(
    tenancy,
    {
      escalationPct: params.escalationPct,
      nextEscalationOn: params.nextEscalationOn
        ? params.nextEscalationOn.slice(0, 10)
        : null,
    },
    asOf,
  )
  const ops = ensureRenewalOps(tenancy, asOf)
  const notesLine = `[Escalation ${asOf} · SET · in-app] pct=${schedule.escalationPct ?? 'null'} next=${schedule.nextEscalationOn ?? 'null'}. ${CPI_REFUSE_COPY}`
  return {
    ...tenancy,
    billingSchedule: schedule,
    renewalOps: {
      ...ops,
      auditNotes: appendRenewalAuditNotes(ops.auditNotes, notesLine),
    },
  }
}

/** Whether scheduled escalation is due on asOf. */
export function isEscalationDue(
  schedule: Pick<SoftBillingSchedule, 'escalationPct' | 'nextEscalationOn'> | null | undefined,
  asOf: string,
): boolean {
  if (!schedule) return false
  if (schedule.escalationPct == null || schedule.escalationPct <= 0) return false
  if (!schedule.nextEscalationOn) return false
  return schedule.nextEscalationOn.slice(0, 10) <= asOf.slice(0, 10)
}

/**
 * Apply staff-set escalationPct to book rent + schedule amount; bump nextEscalationOn +12 mo.
 * Not live CPI.
 */
export function applyEscalationOnBook(
  tenancy: Tenancy,
  asOf: string,
): { tenancy: Tenancy; result: EscalationApplyResult } | null {
  const day = asOf.slice(0, 10)
  const schedule = ensureSoftBillingSchedule(tenancy, undefined, day)
  if (!isEscalationDue(schedule, day)) return null

  const pct = schedule.escalationPct!
  const previousAmountCents = schedule.amountCents
  const previousRentZar = tenancy.rent
  const newAmountCents = Math.round(previousAmountCents * (1 + pct / 100))
  const newRentZar = centsToZar(newAmountCents)
  const nextEscalationOn = addCalendarMonths(schedule.nextEscalationOn!.slice(0, 10), 12)

  const nextSchedule: SoftBillingSchedule = {
    ...schedule,
    amountCents: newAmountCents,
    nextEscalationOn,
    updatedAt: new Date(`${day}T12:00:00`).toISOString(),
  }

  const ops = ensureRenewalOps(tenancy, day)
  const notesLine = `[Escalation ${day} · APPLY · in-app] +${pct}% rent ${previousRentZar} → ${newRentZar}; next ${nextEscalationOn}. ${RENEWALS_MODE_A_COPY}`

  const result: EscalationApplyResult = {
    schedule: nextSchedule,
    previousRentZar,
    newRentZar,
    previousAmountCents,
    newAmountCents,
    nextEscalationOn,
    appliedPct: pct,
  }

  return {
    tenancy: {
      ...tenancy,
      rent: newRentZar,
      billingSchedule: nextSchedule,
      renewalOps: {
        ...ops,
        auditNotes: appendRenewalAuditNotes(ops.auditNotes, notesLine),
      },
    },
    result,
  }
}

/** Plan due escalations across tenancies (reuse rent-cycle style). */
export function planDueEscalations(
  tenancies: readonly Tenancy[],
  asOf: string,
): Array<{ tenancyId: string; pct: number; nextEscalationOn: string }> {
  const day = asOf.slice(0, 10)
  const out: Array<{ tenancyId: string; pct: number; nextEscalationOn: string }> = []
  for (const t of tenancies) {
    if (t.status !== 'Active' && t.status !== 'Pending Move-In') continue
    const sch = t.billingSchedule
    if (!isEscalationDue(sch, day)) continue
    out.push({
      tenancyId: t.id,
      pct: sch!.escalationPct!,
      nextEscalationOn: sch!.nextEscalationOn!,
    })
  }
  return out
}
