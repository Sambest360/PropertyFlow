import type { Unit } from '../data/infrastructure'
import type { AppUser, PropertyAsset } from '../types/domain'
import { resolveUnitForProperty } from './applicationApi'

/** Statuses that appear on the public marketplace / applicant surfaces. */
export const PUBLIC_LISTING_STATUSES: readonly PropertyAsset['status'][] = [
  'Published',
  'Featured',
  'Under Offer',
]

/** Unit occupancy keys eligible for public rent/buy browse (excludes draft / occupied / maintenance). */
export const PUBLIC_UNIT_STATUS_KEYS = new Set([
  'PUBLISHED',
  'FEATURED',
  'VACANT',
  'UNDER_OFFER',
])

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
  if (property.deletedAt) return false
  if (!PUBLIC_LISTING_STATUSES.includes(property.status)) return false

  if (opts?.units?.length) {
    const unit = resolveUnitForProperty(property, opts.units)
    if (unit?.listingType === 'not_listed') return false
    if (unit && !PUBLIC_UNIT_STATUS_KEYS.has(unit.statusKey)) return false
  }

  if (opts?.users?.length && property.landlordId) {
    const landlord = opts.users.find((u) => u.id === property.landlordId)
    const v = landlord?.verification
    if (v?.status === 'pending' || v?.status === 'rejected') return false
  }

  return true
}

/** Whether a unit row may appear in public rent/buy browse feeds. */
export function isPublicMarketplaceUnit(
  unit: Unit,
  property?: PropertyAsset | null,
  opts?: { users?: AppUser[] },
): boolean {
  if (unit.listingType === 'not_listed') return false
  if (!PUBLIC_UNIT_STATUS_KEYS.has(unit.statusKey)) return false
  if (!property) return true
  return isPubliclyListed(property, { units: [unit], users: opts?.users })
}
