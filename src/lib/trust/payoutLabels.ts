/**
 * Display labels for trust payouts (CR9 follow-up). Labels only: status values
 * such as 'settled' stay as data; only what the user reads changes.
 */
export const PAYOUT_LABELS = {
  completedThisPeriod: 'Completed (this period)',
  completedOn: 'Completed',
  subtitle: 'Propose → approve → submit (submitted is not the same as completed; no live bank feed)',
  submittedNote: 'Submitted (in-app) — not yet completed; no partnerPayoutId',
} as const

/** User-visible payout status / filter label. */
export function payoutStatusLabel(status: string): string {
  if (status === 'settled') return 'completed'
  return status.replace('_', ' ')
}
