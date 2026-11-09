/**
 * The unit status keys that are publicly listed. One set for the server:
 * the approval gate (listingApprovals.ts), the title/type confirm check
 * (listingTitleTypeConfirm.ts) and the guest marketplace filter
 * (guestMarketplace.ts) all read it. Mirrors src/lib/publicListings.ts
 * PUBLIC_UNIT_STATUS_KEYS (a parity test keeps the two equal).
 * Dependency-free on purpose: imports nothing.
 */
export const PUBLIC_UNIT_STATUS_KEYS: ReadonlySet<string> = new Set([
  'PUBLISHED',
  'FEATURED',
  'VACANT',
  'UNDER_OFFER',
  'AVAILABLE',
])
