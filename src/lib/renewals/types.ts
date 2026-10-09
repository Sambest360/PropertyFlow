/**
 * Year-ops renewals + rent escalation — Mode A (soft CPA-style clock).
 * In-app / book only — not CPA legal service, not live notice delivery, not live CPI.
 */

import type { BillingSchedule, Tenancy } from '../../types/domain'

/** Honesty — UI banner + notice footer (safe claim). */
export const RENEWALS_MODE_A_COPY =
  'In-app year-ops renewal clock + escalate/renew/decline + scheduled book increase — in-app only; not CPA legal service, not live notice delivery, not live CPI.'

export const CPA_NOTICE_LATE_COPY = 'late; seek counsel'

export const CPA_DELIVERY_REFUSE_COPY =
  'Live CPA / WhatsApp / SMS / email statutory notice delivery is off — in-app notice only (Mailtrap/WhatsApp stay flag-gated or refuse-closed as today).'

export const CPI_REFUSE_COPY =
  'Live CPI HTTP is off — staff set escalationPct on the book; no automated CPI fetch.'

/** Soft CPA-style window: ≈80 biz days (open) → ≈40 biz days (close) before lease_end. */
export const CPA_NOTICE_OPEN_BIZ_DAYS = 80
export const CPA_NOTICE_CLOSE_BIZ_DAYS = 40

export type RenewalElection =
  | 'none'
  | 'offered'
  | 'accepted'
  | 'declined'
  | 'month_to_month'

export type CpaNoticeState = {
  /** YYYY-MM-DD — window opens (≈80 biz days before lease_end). */
  windowOpen: string | null
  /** YYYY-MM-DD — window closes (≈40 biz days before lease_end). */
  windowClose: string | null
  /** When staff sent in-app cpa_expiry_notice. */
  noticeSentAt: string | null
  /** True when as-of is past windowClose without a notice — flag only. */
  late: boolean
  /** Fixed late copy when late — no invented legal consequences. */
  lateFlagNote: string | null
}

export type TenancyRenewalOps = {
  election: RenewalElection
  offeredAt: string | null
  /** Proposed new fixed-term end (YYYY-MM-DD). */
  offeredEndDate: string | null
  /** Proposed renewed monthly rent (ZAR). */
  offeredRent: number | null
  /** Term months offered (default 12) — accept extends book; never auto-sign without election. */
  offeredTermMonths: number
  acceptedAt: string | null
  declinedAt: string | null
  noticeGivenAt: string | null
  /** Book note when lease_end passed with no election — month-to-month; not a new 12-mo. */
  monthToMonthNote: string | null
  cpaNotice: CpaNoticeState
  /** Append-only audit lines (dunning-style). */
  auditNotes: string[]
}

/** Soft BillingSchedule on tenancy — wires dead escalationPct / nextEscalationOn. */
export type SoftBillingSchedule = BillingSchedule

export type CpaNoticeWindow = {
  leaseEnd: string
  windowOpen: string
  windowClose: string
  /** asOf is on/after open and on/before close. */
  open: boolean
  /** asOf is after close. */
  pastClose: boolean
  /** asOf is before open. */
  beforeOpen: boolean
}

export type CpaExpiryNoticeDraft = {
  kind: 'cpa_expiry_notice'
  title: string
  body: string
  notesLine: string
  nonProduction: true
  channel: 'in_app'
  late: boolean
}

export type RenewalOfferInput = {
  asOf: string
  /** Proposed new end date. Default: current end + termMonths (or asOf + termMonths if open-ended). */
  offeredEndDate?: string
  offeredRent?: number
  termMonths?: number
}

export type AcceptRenewalResult = {
  tenancy: Tenancy
  previousEndDate: string | null
  previousRent: number
  newEndDate: string
  newRent: number
}

export type DeclineRenewalResult = {
  tenancy: Tenancy
  noticeGivenAt: string
}

export type EscalationApplyResult = {
  schedule: SoftBillingSchedule
  previousRentZar: number
  newRentZar: number
  previousAmountCents: number
  newAmountCents: number
  nextEscalationOn: string
  appliedPct: number
}

export class CpaDeliveryNotConfiguredError extends Error {
  readonly code = 'CPA_DELIVERY_REFUSE_CLOSED'
  constructor(message = CPA_DELIVERY_REFUSE_COPY) {
    super(message)
    this.name = 'CpaDeliveryNotConfiguredError'
  }
}

export class CpiHttpNotConfiguredError extends Error {
  readonly code = 'CPI_HTTP_REFUSE_CLOSED'
  constructor(message = CPI_REFUSE_COPY) {
    super(message)
    this.name = 'CpiHttpNotConfiguredError'
  }
}
