import type { PersistRefusal } from './persist'

/**
 * Slice A (MA11): payment ids the rent cycle is writing right now, with the
 * unit label for the toast. A 409 PAYMENT_TERMINAL on one of them means the
 * row was paid meanwhile: no toast (the store still refreshes). A 400
 * PAYMENT_AMOUNT_REQUIRED names the unit. Released once the write settles.
 */
const tracked = new Map<string, string>()

export function trackRentCycleWrite(paymentId: string, unitLabel: string): void {
  tracked.set(paymentId, unitLabel)
}

export function releaseRentCycleWrite(paymentId: string): void {
  tracked.delete(paymentId)
}

export function rentCycleRefusalHandling(
  refusal: Pick<PersistRefusal, 'resource' | 'id' | 'status' | 'code'>,
): { quiet: boolean; body?: string } {
  if (refusal.resource !== 'payment') return { quiet: false }
  const unit = tracked.get(refusal.id)
  if (unit === undefined) return { quiet: false }
  if (refusal.status === 409 && refusal.code === 'PAYMENT_TERMINAL') return { quiet: true }
  if (refusal.code === 'PAYMENT_AMOUNT_REQUIRED') {
    return { quiet: false, body: `This lease has no rent amount set (${unit}).` }
  }
  return { quiet: false }
}
