/**
 * CR10 part 7: the signed copy of a lease. No partner endpoint for the signed
 * document is confirmed, and the SigniFlow status response carries no URL, so
 * there is never a signed-copy link today. The generated lease PDF is the
 * unsigned draft and is never relabelled as signed.
 */
export const SIGNED_COPY_COPY = {
  mock: 'Signed copy not available in this environment.',
  pending: 'Signed copy not available yet.',
} as const

export type SignedCopyState = { kind: 'link'; url: string } | { kind: 'none'; text: string } | { kind: 'hidden' }

export function signedCopyState(
  eSign: { status?: string; provider?: string; nonProduction?: boolean; signedPdfUrl?: string | null } | null | undefined,
): SignedCopyState {
  if (!eSign || eSign.status !== 'completed') return { kind: 'hidden' }
  if (eSign.provider === 'mock' || eSign.nonProduction) return { kind: 'none', text: SIGNED_COPY_COPY.mock }
  // Only a URL the server stored (none today) would become a link.
  if (typeof eSign.signedPdfUrl === 'string' && /^https:\/\//.test(eSign.signedPdfUrl)) {
    return { kind: 'link', url: eSign.signedPdfUrl }
  }
  return { kind: 'none', text: SIGNED_COPY_COPY.pending }
}
