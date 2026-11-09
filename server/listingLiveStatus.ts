/**
 * Only the owner (the full super admin) makes a listing live, takes it down,
 * features it or marks it Under Offer. Agency staff, landlords and
 * Administrators edit details only; their publish requests wait for approval.
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { PUBLIC_UNIT_STATUS_KEYS } from './publicUnitStatus.js'
import { isOccupiedAdvert } from '../src/lib/occupiedAdvert.js'
import { isFullSuperAdmin, platformTierFrom } from '../src/lib/platformTier.js'

/** True only for the full super admin. Any miss or error is false (fail closed). */
export async function actorIsOwner(role: string | null, userFeId: string | null): Promise<boolean> {
  if (role !== 'super_admin' || !userFeId) return false
  try {
    const uuid = await resolveUuid('user', userFeId)
    if (!uuid) return false
    const row = (
      await query<{ role: string | null; metadata: Record<string, unknown> | null }>(
        `SELECT role, metadata FROM users WHERE id = $1::uuid`,
        [uuid],
      )
    )[0]
    if (!row || row.role !== 'SUPER_ADMIN') return false
    return isFullSuperAdmin({ role: 'super_admin', platformTier: platformTierFrom('super_admin', row.metadata) })
  } catch {
    return false
  }
}

export type LiveClass = 'hidden' | 'published' | 'featured' | 'under_offer'

export type LiveRow = {
  statusKey: string
  listingType: string | null
  featured: boolean
  advertiseWhileOccupied: boolean
  availableFrom: string | null
}

export function listingLiveClass(row: LiveRow): LiveClass {
  if (String(row.listingType ?? '').toUpperCase() === 'NOT_LISTED') return 'hidden'
  if (isOccupiedAdvert(row)) return 'published'
  // Upper-cased, NOT trimmed: a stored junk ' VACANT' stays non-public.
  const key = String(row.statusKey ?? '').toUpperCase()
  if (!PUBLIC_UNIT_STATUS_KEYS.has(key)) return 'hidden'
  if (key === 'UNDER_OFFER') return 'under_offer'
  if (key === 'FEATURED' || row.featured) return 'featured'
  return 'published'
}

export const LISTING_LIVE_OWNER_ONLY_MESSAGE =
  'Only a Lekaya Rentals admin can make a listing live, take it down, feature it or mark it Under Offer. You can still edit its details.'

/** A message when this change of live state is not allowed, else null. */
export function liveChangeRefusal(opts: {
  isOwner: boolean
  stored: LiveRow | null
  requested: { statusKey: string; listingType: string | null; featured: boolean | undefined }
}): string | null {
  if (opts.isOwner) return null
  const { stored, requested } = opts
  if (requested.featured !== undefined && requested.featured !== (stored?.featured ?? false)) return LISTING_LIVE_OWNER_ONLY_MESSAGE
  if (!stored) return null
  const storedClass = listingLiveClass(stored)
  const requestedClass = listingLiveClass({
    statusKey: requested.statusKey,
    listingType: requested.listingType,
    featured: requested.featured ?? stored.featured,
    advertiseWhileOccupied: stored.advertiseWhileOccupied,
    availableFrom: stored.availableFrom,
  })
  if (storedClass !== 'hidden' && requestedClass !== storedClass) return LISTING_LIVE_OWNER_ONLY_MESSAGE
  return null
}
