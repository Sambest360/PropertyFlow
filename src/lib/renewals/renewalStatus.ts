/**
 * Plain-language snapshot of where a lease stands on renewal, the CPA-style
 * expiry notice and the scheduled rent increase — plus the single next step to
 * suggest. Drives the Renewals worklist and the renewal panel.
 */
import type { Tenancy } from '../../types/domain'
import { isEscalationDue } from './escalation'
import { computeCpaNoticeWindow } from './noticeClock'
import { ensureRenewalOps, needsMonthToMonthNote } from './renewalActions'
import type { RenewalElection } from './types'

export type RenewalNextStep = 'month_to_month' | 'notice' | 'escalate' | 'offer' | 'answer' | 'none'

export type NoticeState = 'no_fixed_end' | 'not_yet' | 'open' | 'late' | 'sent'

export type RenewalSnapshot = {
  daysToEnd: number | null
  election: RenewalElection
  electionLabel: string
  notice: { state: NoticeState; windowOpen: string | null; windowClose: string | null; sentAt: string | null }
  escalation: { pct: number | null; nextOn: string | null; due: boolean; newRent: number | null }
  nextStep: RenewalNextStep
  nextStepLabel: string
  /** Lower is more urgent (sorting the worklist). */
  urgency: number
}

/** Days until the lease ends (negative once it has passed). */
export function daysUntil(endDate: string | null | undefined, asOf: string): number | null {
  if (!endDate) return null
  const a = Date.UTC(+asOf.slice(0, 4), +asOf.slice(5, 7) - 1, +asOf.slice(8, 10))
  const b = Date.UTC(+endDate.slice(0, 4), +endDate.slice(5, 7) - 1, +endDate.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

export const ELECTION_LABELS: Record<RenewalElection, string> = {
  none: 'No decision yet',
  offered: 'Renewal offered',
  accepted: 'Renewed',
  declined: 'Not renewing',
  month_to_month: 'Month-to-month',
}

const NEXT_STEP_LABELS: Record<RenewalNextStep, string> = {
  month_to_month: 'Lease ended — note month-to-month',
  notice: 'Record expiry notice',
  escalate: 'Apply rent increase',
  offer: 'Offer renewal',
  answer: "Record tenant's answer",
  none: 'Nothing due',
}

/** Leases ending within this many days are prompted for a renewal offer. */
export const RENEWAL_PROMPT_DAYS = 90

export function renewalSnapshot(tenancy: Tenancy, asOf: string): RenewalSnapshot {
  const day = asOf.slice(0, 10)
  const ops = ensureRenewalOps(tenancy, day)
  const daysToEnd = daysUntil(tenancy.endDate, day)
  const window = computeCpaNoticeWindow(tenancy.endDate, day)

  let noticeState: NoticeState
  if (ops.cpaNotice.noticeSentAt) noticeState = 'sent'
  else if (!window) noticeState = 'no_fixed_end'
  else if (ops.cpaNotice.late || window.pastClose) noticeState = 'late'
  else if (window.open) noticeState = 'open'
  else noticeState = 'not_yet'

  const sch = tenancy.billingSchedule
  const pct = sch?.escalationPct ?? null
  const due = isEscalationDue(sch, day)
  const newRent = pct != null && pct > 0 ? Math.round(tenancy.rent * (1 + pct / 100)) : null

  const settled = ops.election === 'accepted' || ops.election === 'declined'
  let nextStep: RenewalNextStep = 'none'
  let urgency = 1000 + (daysToEnd ?? 9999)
  if (tenancy.status === 'Ended') {
    nextStep = 'none'
  } else if (needsMonthToMonthNote(tenancy, day) && ops.election !== 'month_to_month') {
    nextStep = 'month_to_month'
    urgency = 0
  } else if (noticeState === 'late' && !settled) {
    nextStep = 'notice'
    urgency = 1
  } else if (due) {
    nextStep = 'escalate'
    urgency = 2
  } else if (noticeState === 'open' && !settled) {
    nextStep = 'notice'
    urgency = 3
  } else if (ops.election === 'offered') {
    nextStep = 'answer'
    urgency = 4
  } else if (ops.election === 'none' && daysToEnd != null && daysToEnd <= RENEWAL_PROMPT_DAYS) {
    nextStep = 'offer'
    urgency = 5
  }

  return {
    daysToEnd,
    election: ops.election,
    electionLabel: ELECTION_LABELS[ops.election],
    notice: {
      state: noticeState,
      windowOpen: window?.windowOpen ?? null,
      windowClose: window?.windowClose ?? null,
      sentAt: ops.cpaNotice.noticeSentAt,
    },
    escalation: { pct, nextOn: sch?.nextEscalationOn ?? null, due, newRent },
    nextStep,
    nextStepLabel: NEXT_STEP_LABELS[nextStep],
    urgency,
  }
}

/** "in 42 days", "today", "12 days ago" — for lease-end chips. */
export function daysLabel(days: number | null): string {
  if (days == null) return 'No end date'
  if (days === 0) return 'Ends today'
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`
  const ago = -days
  return `ended ${ago} day${ago === 1 ? '' : 's'} ago`
}
