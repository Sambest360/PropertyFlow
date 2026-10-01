/**
 * DQ-C2 Mode A — FICA pack helpers.
 *
 * Staff manage id + address + fica checklist rows in-app.
 * NOT live bureau / NOT live FICA verification / NOT a TPN hard-gate.
 */
import type { Application, ApplicationDocument } from '../types/domain'

/** Soft-gate pack keys for lease creation / move-in (Mode A). */
export const FICA_PACK_KEYS = ['id', 'address', 'fica'] as const
export type FicaPackKey = (typeof FICA_PACK_KEYS)[number]

export const FICA_PACK_MODE_A_COPY =
  'Mode A soft-demo / non-production FICA pack. Staff review ID, proof of address, and FICA declaration in-app only — not live bureau screening, not live FICA verification, and not a TPN hard-gate.'

/** Workflow actions that create a lease or advance move-in / occupancy. */
export const FICA_SOFT_GATED_ACTION_KEYS = [
  'GENERATE_LEASE',
  'SEND_LEASE',
  'SCHEDULE_MOVE_IN',
  'ACTIVATE_TENANCY',
  'RECOVER_APPROVE',
  /** Early approve paths create a durable lease via effect: 'approve'. */
  'AGENT_APPROVE',
  'CONDITIONALLY_APPROVE',
  'ISSUE_DEPOSIT_INVOICE',
  'REQUEST_DEPOSIT',
] as const

export type FicaSoftGatedActionKey = (typeof FICA_SOFT_GATED_ACTION_KEYS)[number]

export function isFicaSoftGatedAction(actionKey: string): boolean {
  return (FICA_SOFT_GATED_ACTION_KEYS as readonly string[]).includes(actionKey)
}

export function ficaPackDocuments(
  documents: ApplicationDocument[] | undefined | null,
): ApplicationDocument[] {
  const list = documents ?? []
  return FICA_PACK_KEYS.map((key) => {
    const found = list.find((d) => d.key === key)
    return (
      found ?? {
        key,
        label: key === 'id' ? 'ID' : key === 'address' ? 'Proof of address' : 'FICA declaration',
        status: 'required' as const,
      }
    )
  })
}

export function ficaPackGaps(documents: ApplicationDocument[] | undefined | null): FicaPackKey[] {
  return ficaPackDocuments(documents)
    .filter((d) => d.status !== 'verified')
    .map((d) => d.key as FicaPackKey)
}

export function isFicaPackVerified(documents: ApplicationDocument[] | undefined | null): boolean {
  return ficaPackGaps(documents).length === 0
}

export function ficaPackSoftGateMessage(
  documents: ApplicationDocument[] | undefined | null,
): string | null {
  const gaps = ficaPackGaps(documents)
  if (!gaps.length) return null
  const labels = gaps.map((k) => (k === 'id' ? 'ID' : k === 'address' ? 'proof of address' : 'FICA declaration'))
  return `Lease / move-in blocked until staff verify ${labels.join(', ')} (in-app FICA pack — not live bureau).`
}

/** Guard helper for workflow transitions — returns true or a clear block reason. */
export function ficaPackSoftGate(
  app: Pick<Application, 'documents'>,
): true | string {
  return ficaPackSoftGateMessage(app.documents) ?? true
}

export function applicationPassesFicaSoftGate(
  app: Pick<Application, 'documents'>,
): boolean {
  return isFicaPackVerified(app.documents)
}
