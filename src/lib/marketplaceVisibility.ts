import type { Unit } from '../data/infrastructure'
import type { AppUser, PropertyAsset } from '../types/domain'
import { resolveUnitForProperty } from './applicationApi'
import {
  isPubliclyListed,
  PUBLIC_LISTING_STATUSES,
  PUBLIC_UNIT_STATUS_KEYS,
} from './publicListings'
import { resolvePortfolioStatus, type StandardPropertyStatus } from './propertyStatus'

export type GuestMarketplaceBlock = {
  message: string
  /** Landlord user id when verification is blocking guest browse */
  landlordUserId?: string
}

const LIVE_PORTFOLIO_LABELS = new Set<StandardPropertyStatus>([
  'Available',
  'Featured',
  'Under Offer',
])

/** Staff portfolio shows Available/Featured/Under Offer while guests may still be blocked. */
export function portfolioLabelLooksLive(
  property: PropertyAsset,
  occupancy?: string | null,
): boolean {
  if (property.deletedAt) return false
  const { label } = resolvePortfolioStatus(property.status, occupancy)
  return LIVE_PORTFOLIO_LABELS.has(label)
}

/**
 * Why signed-out /browse and GET /api/public/marketplace omit this listing.
 * Returns null when guests would see it (same rules as isPubliclyListed).
 */
export function getGuestMarketplaceBlockReason(
  property: PropertyAsset,
  opts?: { units?: Unit[]; users?: AppUser[] },
): GuestMarketplaceBlock | null {
  if (isPubliclyListed(property, opts)) return null

  if (property.deletedAt) {
    return {
      message:
        'This listing is archived or deleted and is hidden from the public marketplace.',
    }
  }

  if (!PUBLIC_LISTING_STATUSES.includes(property.status)) {
    return {
      message: 'Publish the listing before it can appear on the public marketplace.',
    }
  }

  const units = opts?.units ?? []
  if (units.length) {
    const unit = resolveUnitForProperty(property, units)
    if (unit?.listingType === 'not_listed') {
      return {
        message:
          'This unit is marked not listed. Change listing mode before guests can browse it.',
      }
    }
    if (unit && !PUBLIC_UNIT_STATUS_KEYS.has(unit.statusKey)) {
      return {
        message:
          'The unit is still in a non-public status. Use Make live so the marketplace unit row syncs.',
      }
    }
  }

  if (property.landlordId && opts?.users?.length) {
    const landlord = opts.users.find((u) => u.id === property.landlordId)
    const v = landlord?.verification?.status
    if (v === 'pending') {
      return {
        message: `The linked landlord (${landlord?.name ?? 'owner'}) is pending document verification. Signed-out visitors will not see this listing until a Super Admin approves them.`,
        landlordUserId: property.landlordId,
      }
    }
    if (v === 'rejected') {
      return {
        message: `The linked landlord (${landlord?.name ?? 'owner'}) was rejected. Guests cannot browse this listing until verification is resolved or the property is agency-owned.`,
        landlordUserId: property.landlordId,
      }
    }
  }

  return {
    message:
      'This listing does not pass marketplace visibility rules for signed-out visitors.',
  }
}

/** After a successful publish sync, would guests see this listing? */
export function guestVisibleAfterPublish(
  property: PropertyAsset,
  unit: Unit | undefined,
  users: AppUser[],
): boolean {
  const published: PropertyAsset = { ...property, status: 'Published' }
  const units = unit
    ? [{ ...unit, statusKey: 'PUBLISHED' as Unit['statusKey'] }]
    : []
  return isPubliclyListed(published, { units, users })
}
