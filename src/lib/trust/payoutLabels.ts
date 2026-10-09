/**
 * Display labels for trust payouts (CR9 follow-up). Labels only: status values
 * such as 'settled' stay as data; only what the user reads changes.
 */
/** Jim's exact wording (CR9): the one place 'bank-confirmed' is allowed. */
export const PAYOUT_MARKED_COMPLETE = 'Marked complete (not bank-confirmed)'

export const PAYOUT_LABELS = {
  markedCompleteCard: PAYOUT_MARKED_COMPLETE,
  markedCompleteOn: PAYOUT_MARKED_COMPLETE,
  subtitle: 'Propose → approve → submit (submitted is not the same as marked complete; no live bank feed)',
  submittedNote: 'Submitted (in-app) — not yet marked complete; no partnerPayoutId',
} as const

/** User-visible payout status / filter label. */
export function payoutStatusLabel(status: string): string {
  if (status === 'settled') return PAYOUT_MARKED_COMPLETE
  return status.replace('_', ' ')
}
