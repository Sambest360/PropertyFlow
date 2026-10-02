/**
 * Offer / accept / decline renewal + month-to-month note — Mode A book mutations.
 * Accept extends term+rent on book; decline → notice_given; no election ≠ auto 12-mo.
 */

import type { Tenancy } from '../../types/domain'
import { addCalendarMonths } from './bizDays'
import {
  appendRenewalAuditNotes,
  emptyCpaNoticeState,
  syncCpaNoticeClock,
} from './noticeClock'
import {
  RENEWALS_MODE_A_COPY,
  type AcceptRenewalResult,
  type DeclineRenewalResult,
  type RenewalOfferInput,
  type TenancyRenewalOps,
} from './types'

export function emptyRenewalOps(): TenancyRenewalOps {
  return {
    election: 'none',
    offeredAt: null,
    offeredEndDate: null,
    offeredRent: null,
    offeredTermMonths: 12,
    acceptedAt: null,
    declinedAt: null,
    noticeGivenAt: null,
    monthToMonthNote: null,
    cpaNotice: emptyCpaNoticeState(),
    auditNotes: [],
  }
}

export function ensureRenewalOps(
  tenancy: Pick<Tenancy, 'renewalOps' | 'endDate'>,
  asOf: string,
): TenancyRenewalOps {
  const base = tenancy.renewalOps ? { ...tenancy.renewalOps } : emptyRenewalOps()
  return syncCpaNoticeClock(base, tenancy.endDate, asOf)
}

function defaultOfferedEnd(tenancy: Pick<Tenancy, 'endDate'>, asOf: string, termMonths: number): string {
  const anchor = (tenancy.endDate && tenancy.endDate.slice(0, 10) >= asOf.slice(0, 10)
    ? tenancy.endDate
    : asOf
  ).slice(0, 10)
  return addCalendarMonths(anchor, termMonths)
}

/**
 * Staff offers renewal terms (in-app). Stage OFFER_RENEWAL should mirror this.
 * Does not auto-sign a new fixed term.
 */
export function offerRenewalOnBook(
  tenancy: Tenancy,
  input: RenewalOfferInput,
): Tenancy {
  const termMonths = input.termMonths ?? 12
  const asOf = input.asOf.slice(0, 10)
  const ops = ensureRenewalOps(tenancy, asOf)
  const offeredEndDate = (input.offeredEndDate ?? defaultOfferedEnd(tenancy, asOf, termMonths)).slice(
    0,
    10,
  )
  const offeredRent = input.offeredRent ?? tenancy.rent
  const notesLine = `[Renewal ${asOf} · OFFER_RENEWAL · in-app] Offer end ${offeredEndDate} · rent ${offeredRent} · ${termMonths} mo. ${RENEWALS_MODE_A_COPY}`

  const nextOps: TenancyRenewalOps = {
    ...ops,
    election: 'offered',
    offeredAt: asOf,
    offeredEndDate,
    offeredRent,
    offeredTermMonths: termMonths,
    acceptedAt: null,
    declinedAt: null,
    noticeGivenAt: null,
    monthToMonthNote: null,
    auditNotes: appendRenewalAuditNotes(ops.auditNotes, notesLine),
  }

  return { ...tenancy, renewalOps: nextOps }
}

/**
 * Accept extends term + rent on the book. Does not invent e-sign / auto-sign ceremony.
 */
export function acceptRenewalOnBook(tenancy: Tenancy, asOf: string): AcceptRenewalResult {
  const day = asOf.slice(0, 10)
  const ops = ensureRenewalOps(tenancy, day)
  const termMonths = ops.offeredTermMonths || 12
  const newEndDate = (
    ops.offeredEndDate ?? defaultOfferedEnd(tenancy, day, termMonths)
  ).slice(0, 10)
  const newRent = ops.offeredRent ?? tenancy.rent
  const previousEndDate = tenancy.endDate
  const previousRent = tenancy.rent

  const notesLine = `[Renewal ${day} · ACCEPT_RENEWAL · in-app] Extended end ${previousEndDate ?? 'open'} → ${newEndDate}; rent ${previousRent} → ${newRent}. ${RENEWALS_MODE_A_COPY}`

  const nextOps: TenancyRenewalOps = {
    ...ops,
    election: 'accepted',
    acceptedAt: day,
    declinedAt: null,
    noticeGivenAt: null,
    monthToMonthNote: null,
    offeredEndDate: newEndDate,
    offeredRent: newRent,
    auditNotes: appendRenewalAuditNotes(ops.auditNotes, notesLine),
  }

  // Keep / create soft BillingSchedule so escalationPct surface stays wired.
  const isoNow = new Date(`${day}T12:00:00`).toISOString()
  const prevSch = tenancy.billingSchedule
  const billingSchedule = {
    id: prevSch?.id ?? `BS-${tenancy.id}`,
    agencyId: tenancy.agencyId,
    occupancyId: tenancy.id,
    chargeType: prevSch?.chargeType ?? 'RENT',
    amountCents: Math.round(newRent * 100),
    dayOfMonth: prevSch?.dayOfMonth ?? tenancy.rentDueDay ?? 1,
    startOn: prevSch?.startOn ?? tenancy.startDate.slice(0, 10),
    endOn: newEndDate,
    escalationPct: prevSch?.escalationPct ?? null,
    nextEscalationOn: prevSch?.nextEscalationOn ?? null,
    createdAt: prevSch?.createdAt ?? isoNow,
    updatedAt: isoNow,
  }

  const next: Tenancy = {
    ...tenancy,
    endDate: newEndDate,
    rent: newRent,
    status: tenancy.status === 'Ended' ? 'Active' : tenancy.status,
    renewalOps: syncCpaNoticeClock(nextOps, newEndDate, day),
    billingSchedule,
  }

  return { tenancy: next, previousEndDate, previousRent, newEndDate, newRent }
}

/**
 * Decline → notice_given on book. Does not invent early-cancel penalty %.
 */
export function declineRenewalOnBook(tenancy: Tenancy, asOf: string): DeclineRenewalResult {
  const day = asOf.slice(0, 10)
  const ops = ensureRenewalOps(tenancy, day)
  const notesLine = `[Renewal ${day} · DECLINE_RENEWAL · in-app] Notice given — vacate path. ${RENEWALS_MODE_A_COPY}`

  const nextOps: TenancyRenewalOps = {
    ...ops,
    election: 'declined',
    declinedAt: day,
    noticeGivenAt: day,
    acceptedAt: null,
    auditNotes: appendRenewalAuditNotes(ops.auditNotes, notesLine),
  }

  return {
    tenancy: { ...tenancy, renewalOps: nextOps },
    noticeGivenAt: day,
  }
}

/**
 * No election past lease_end → month-to-month book note.
 * Does NOT auto-sign a new 12-month fixed term.
 */
export function markMonthToMonthOnBook(tenancy: Tenancy, asOf: string): Tenancy {
  const day = asOf.slice(0, 10)
  if (!tenancy.endDate || tenancy.endDate.slice(0, 10) > day) {
    return tenancy
  }
  const ops = ensureRenewalOps(tenancy, day)
  if (ops.election === 'accepted' || ops.election === 'declined') {
    return { ...tenancy, renewalOps: ops }
  }
  if (ops.election === 'month_to_month' && ops.monthToMonthNote) {
    return { ...tenancy, renewalOps: ops }
  }

  const note = `No renewal election by lease_end ${tenancy.endDate} — continuing month-to-month on book (not an auto-signed new 12-mo fixed term). ${RENEWALS_MODE_A_COPY}`
  const notesLine = `[Renewal ${day} · MONTH_TO_MONTH · in-app] ${note}`

  const nextOps: TenancyRenewalOps = {
    ...ops,
    election: 'month_to_month',
    monthToMonthNote: note,
    auditNotes: appendRenewalAuditNotes(ops.auditNotes, notesLine),
  }

  return { ...tenancy, renewalOps: nextOps }
}

/** True when lease_end has passed with no accept/decline — candidate for M2M note. */
export function needsMonthToMonthNote(
  tenancy: Pick<Tenancy, 'endDate' | 'renewalOps' | 'status'>,
  asOf: string,
): boolean {
  if (tenancy.status === 'Ended') return false
  if (!tenancy.endDate) return false
  if (tenancy.endDate.slice(0, 10) > asOf.slice(0, 10)) return false
  const election = tenancy.renewalOps?.election ?? 'none'
  return election === 'none' || election === 'offered' || election === 'month_to_month'
}
