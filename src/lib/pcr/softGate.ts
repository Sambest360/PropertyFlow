/**
 * Mode A PCR soft-gate for keys / move-in.
 * Cleared when incoming inspection has `ingoingPcrSigned`
 * (staff+tenant soft ack OR documented no-show + admin override).
 */

import type { Application } from '../../types/domain'
import { findInspection, isIngoingPcrSigned } from './inspections.js'

/** Keys / key-handover / activate after incoming PCR. */
export const PCR_SOFT_GATED_ACTION_KEYS = [
  'KEYS_READY',
  'COMPLETE_KEY_HANDOVER',
  'ACTIVATE_TENANCY',
] as const

export type PcrSoftGatedActionKey = (typeof PCR_SOFT_GATED_ACTION_KEYS)[number]

export function isPcrSoftGatedAction(actionKey: string): boolean {
  return (PCR_SOFT_GATED_ACTION_KEYS as readonly string[]).includes(actionKey)
}

export function isIngoingPcrClearedForKeys(
  app: Pick<Application, 'pcrInspections' | 'type'>,
): boolean {
  if (app.type === 'Purchase') return true
  return isIngoingPcrSigned(app)
}

export function pcrSoftGateMessage(
  app: Pick<Application, 'pcrInspections' | 'type'>,
): string | null {
  if (app.type === 'Purchase') return null
  if (isIngoingPcrClearedForKeys(app)) return null
  const incoming = findInspection(app, 'incoming')
  if (!incoming) {
    return 'Keys / move-in blocked until an incoming PCR pack is soft-signed (staff + tenant ack) or recorded via audited no-show / admin override (in-app PCR — not PropertyInspect parity).'
  }
  return `Keys / move-in blocked until incoming PCR is soft-signed or audited override (current: ${incoming.status} — in-app, not RHA legal advice).`
}

/** Guard helper — returns true or a clear block reason. */
export function pcrSoftGate(
  app: Pick<Application, 'pcrInspections' | 'type'>,
): true | string {
  return pcrSoftGateMessage(app) ?? true
}

export function applicationPassesPcrSoftGate(
  app: Pick<Application, 'pcrInspections' | 'type'>,
): boolean {
  return pcrSoftGateMessage(app) === null
}
