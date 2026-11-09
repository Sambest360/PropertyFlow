/**
 * Only the owner (the full super admin) makes a listing live, takes it down,
 * features it or marks it Under Offer. Mirrors server/listingLiveStatus.ts;
 * the server is the real check, this only shapes the buttons.
 */
import { isFullSuperAdmin } from './platformTier'
import { isOccupiedAdvert } from './occupiedAdvert'
import { PUBLIC_UNIT_STATUS_KEYS } from './publicListings'
import { actorHeaders } from './api/actorAuth'
import { resolveApiAuthorizationHeader } from './api/authClient'

export function canChangeListingLiveStatus(u: { role?: string | null; platformTier?: string | null } | null | undefined): boolean {
  return isFullSuperAdmin(u)
}

/** Public now: a public unit status (not NOT_LISTED) or an occupied advert. */
export function listingIsLiveNow(row: {
  statusKey?: string | null
  listingType?: string | null
  advertiseWhileOccupied?: boolean | null
  availableFrom?: string | null
}): boolean {
  if (String(row.listingType ?? '').toUpperCase() === 'NOT_LISTED') return false
  if (isOccupiedAdvert({ statusKey: row.statusKey ?? null, listingType: row.listingType ?? null, advertiseWhileOccupied: row.advertiseWhileOccupied ?? null, availableFrom: row.availableFrom ?? null })) return true
  return PUBLIC_UNIT_STATUS_KEYS.has(String(row.statusKey ?? '').toUpperCase())
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

/** Owner take-down (same request ListingApprovalsPage sends for a decision). */
export async function withdrawListingApi(listingId: string, note: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/listing-approvals/${encodeURIComponent(listingId)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...(await resolveApiAuthorizationHeader()) },
    body: JSON.stringify({ decision: 'withdraw', note }),
  })
  const body = (await res.json().catch(() => ({}))) as { message?: string }
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`)
}
