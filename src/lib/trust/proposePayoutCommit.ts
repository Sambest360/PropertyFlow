/**
 * CR9 — commit a proposed payout instruction.
 * Adds the row optimistically, awaits the save, and on a failed save removes
 * the row again and reports failure, so the UI never says a payout was
 * proposed when it was not saved.
 */
import type { PayoutInstruction } from '../../types/domain'

export const PROPOSE_PAYOUT_SAVE_FAILED = 'Payout was not saved. Try again.'

type PayoutListState = { payoutInstructions: PayoutInstruction[] }

export async function commitProposedPayout<S extends PayoutListState>(input: {
  row: PayoutInstruction
  patch: (fn: (s: S) => S) => void
  persist: (row: PayoutInstruction) => Promise<boolean>
}): Promise<{ ok: true; instructionId: string } | { ok: false; error: string }> {
  const { row, patch, persist } = input
  patch((s) => ({ ...s, payoutInstructions: [row, ...s.payoutInstructions] }))
  let saved = false
  try {
    saved = await persist(row)
  } catch {
    saved = false
  }
  if (!saved) {
    patch((s) => ({ ...s, payoutInstructions: s.payoutInstructions.filter((p) => p.id !== row.id) }))
    return { ok: false, error: PROPOSE_PAYOUT_SAVE_FAILED }
  }
  return { ok: true, instructionId: row.id }
}
