/**
 * Mode A theater honesty — soft-warn deposit damage claims without an outgoing PCR path.
 * NOT a hard auto-forfeit.
 */

import type { Application } from '../../types/domain'
import { findInspection } from './inspections.js'

export const DEPOSIT_DAMAGE_SOFT_WARN =
  'Damage / deduction talk without an outgoing inspection path is a soft warning only — not a hard auto-forfeit, and not RHA statutory deposit advice.'

/**
 * Soft-warn when staff claim deposit damage / deductions without an outgoing PCR.
 * Returns null when no damage claim, or when an outgoing inspection exists.
 */
export function depositDamageWithoutOutgoingSoftWarn(params: {
  claimingDamageOrDeduction: boolean
  application?: Pick<Application, 'pcrInspections'> | null
  hasOutgoingInspection?: boolean
}): string | null {
  if (!params.claimingDamageOrDeduction) return null
  const hasOutgoing =
    params.hasOutgoingInspection ??
    Boolean(findInspection(params.application, 'outgoing'))
  if (hasOutgoing) return null
  return DEPOSIT_DAMAGE_SOFT_WARN
}

/** Soft-warn copy for REFUND_DEPOSIT / closure when no outgoing path. */
export function refundDepositOutgoingSoftWarn(
  app: Pick<Application, 'pcrInspections' | 'type'> | null | undefined,
): string | null {
  if (!app || app.type === 'Purchase') return null
  if (findInspection(app, 'outgoing')) return null
  return 'Soft-warn: no outgoing PCR path on file. Process deposit carefully — PropertyFlow does not auto-forfeit; not RHA legal advice.'
}
