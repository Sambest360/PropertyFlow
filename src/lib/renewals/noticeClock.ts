/**
 * Soft CPA-style notice clock — Mode A.
 * Window ≈ 80–40 business days before lease_end.
 * Late flag only ("late; seek counsel") — no invented legal consequences.
 */

import { addBusinessDays } from './bizDays'
import {
  CPA_NOTICE_CLOSE_BIZ_DAYS,
  CPA_NOTICE_LATE_COPY,
  CPA_NOTICE_OPEN_BIZ_DAYS,
  RENEWALS_MODE_A_COPY,
  type CpaExpiryNoticeDraft,
  type CpaNoticeState,
  type CpaNoticeWindow,
  type TenancyRenewalOps,
} from './types'

export function emptyCpaNoticeState(): CpaNoticeState {
  return {
    windowOpen: null,
    windowClose: null,
    noticeSentAt: null,
    late: false,
    lateFlagNote: null,
  }
}

/** Compute soft CPA notice window from lease_end. Null when no fixed end. */
export function computeCpaNoticeWindow(
  leaseEnd: string | null | undefined,
  asOf: string,
): CpaNoticeWindow | null {
  if (!leaseEnd) return null
  const end = leaseEnd.slice(0, 10)
  const asOfDay = asOf.slice(0, 10)
  const windowOpen = addBusinessDays(end, -CPA_NOTICE_OPEN_BIZ_DAYS)
  const windowClose = addBusinessDays(end, -CPA_NOTICE_CLOSE_BIZ_DAYS)
  return {
    leaseEnd: end,
    windowOpen,
    windowClose,
    beforeOpen: asOfDay < windowOpen,
    open: asOfDay >= windowOpen && asOfDay <= windowClose,
    pastClose: asOfDay > windowClose,
  }
}

/**
 * Sync CPA window + late flag onto renewal ops from current lease_end / asOf.
 * Does not invent statutory consequences — late flag copy only.
 */
export function syncCpaNoticeClock(
  ops: TenancyRenewalOps,
  leaseEnd: string | null | undefined,
  asOf: string,
): TenancyRenewalOps {
  const window = computeCpaNoticeWindow(leaseEnd, asOf)
  if (!window) {
    return {
      ...ops,
      cpaNotice: {
        ...ops.cpaNotice,
        windowOpen: null,
        windowClose: null,
        late: false,
        lateFlagNote: null,
      },
    }
  }

  const noticeSent = Boolean(ops.cpaNotice.noticeSentAt)
  const late = window.pastClose && !noticeSent
  return {
    ...ops,
    cpaNotice: {
      ...ops.cpaNotice,
      windowOpen: window.windowOpen,
      windowClose: window.windowClose,
      late,
      lateFlagNote: late ? CPA_NOTICE_LATE_COPY : null,
    },
  }
}

/** Whether staff can send in-app cpa_expiry_notice (window open, or late catch-up). */
export function canSendCpaExpiryNotice(
  leaseEnd: string | null | undefined,
  _ops: TenancyRenewalOps | null | undefined,
  asOf: string,
): boolean {
  void _ops
  const window = computeCpaNoticeWindow(leaseEnd, asOf)
  if (!window) return false
  if (window.beforeOpen) return false
  // Sendable once window has opened (including late) — in-app only.
  return window.open || window.pastClose
}

/**
 * Build sendable in-app cpa_expiry_notice.
 * Honesty: not auto CPA legal service / not live delivery.
 */
export function buildCpaExpiryNotice(params: {
  tenantName: string
  propertyTitle: string
  leaseEnd: string
  asOf: string
  late?: boolean
}): CpaExpiryNoticeDraft {
  const late = Boolean(params.late)
  const title = late
    ? `CPA-style expiry notice (late) · ${params.tenantName}`
    : `CPA-style expiry notice · ${params.tenantName}`
  const body = [
    `${params.tenantName}: fixed-term lease for ${params.propertyTitle} ends ${params.leaseEnd}.`,
    late
      ? `Notice clock late (${CPA_NOTICE_LATE_COPY}).`
      : 'Soft CPA-style notice window is open on the in-app book.',
    RENEWALS_MODE_A_COPY,
  ].join(' ')
  const notesLine = [
    `[CPA notice ${params.asOf} · cpa_expiry_notice · in-app${late ? ' · late' : ''}]`,
    late ? CPA_NOTICE_LATE_COPY + '.' : 'Window open.',
    RENEWALS_MODE_A_COPY,
  ].join(' ')

  return {
    kind: 'cpa_expiry_notice',
    title,
    body,
    notesLine,
    nonProduction: true,
    channel: 'in_app',
    late,
  }
}

export function appendRenewalAuditNotes(
  existing: string[] | null | undefined,
  line: string,
): string[] {
  const prev = existing ?? []
  return [...prev, line]
}
