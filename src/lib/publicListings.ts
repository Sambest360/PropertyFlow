import type { Unit } from '../data/infrastructure'
import type { AppUser, PropertyAsset } from '../types/domain'
import { resolveUnitForProperty } from './applicationApi'

/** Statuses that appear on the public marketplace / applicant surfaces. */
export const PUBLIC_LISTING_STATUSES: readonly PropertyAsset['status'][] = [
  'Published',
  'Featured',
  'Under Offer',
]

/**
 * Whether an applicant / marketplace visitor may see this property.
 * Drafts, archived, maintenance, sold/rented, and units marked not_listed stay hidden.
 * Pending / rejected landlord verification also keeps listings off the market.
 */
export function isPubliclyListed(
  property: PropertyAsset,
  opts?: {
    units?: Unit[]
    users?: AppUser[]
  },
): boolean {
  if (!PUBLIC_LISTING_STATUSES.includes(property.status)) return false

  if (opts?.units?.length) {
    const unit = resolveUnitForProperty(property, opts.units)
    if (unit?.listingType === 'not_listed') return false
  }

  if (opts?.users?.length && property.landlordId) {
    const landlord = opts.users.find((u) => u.id === property.landlordId)
    const v = landlord?.verification
    if (v?.status === 'pending' || v?.status === 'rejected') return false
  }

  return true
}
