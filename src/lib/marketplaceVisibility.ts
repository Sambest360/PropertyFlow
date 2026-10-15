import type { Building, Unit } from '../data/infrastructure'
import type { AppUser, PropertyAsset } from '../types/domain'
import { resolveUnitForProperty } from './applicationApi'
import {
  isPubliclyListed,
  PUBLIC_LISTING_STATUSES,
  PUBLIC_UNIT_STATUS_KEYS,
} from './publicListings'
import { resolvePortfolioStatus, type StandardPropertyStatus } from './propertyStatus'

const PUBLIC_PROPERTY_STATUSES: PropertyAsset['status'][] = ['Published', 'Featured', 'Under Offer']

/** Unit row fields that match a published property status (same rules as publishProperty). */
export function expectedMarketplaceUnitFields(
  property: PropertyAsset,
): Pick<Unit, 'statusKey' | 'listingType'> | null {
  if (property.deletedAt) return { statusKey: 'DELETED', listingType: 'not_listed' }
  if (!PUBLIC_LISTING_STATUSES.includes(property.status)) return null
  const listingType: Unit['listingType'] =
    property.listingMode === 'sale' ? 'sale' : property.listingMode === 'both' ? 'both' : 'rent'
  const statusKey: Unit['statusKey'] =
    property.status === 'Featured'
      ? 'FEATURED'
      : property.status === 'Under Offer'
        ? 'UNDER_OFFER'
        : 'PUBLISHED'
  return { statusKey, listingType }
}

/** Same unit status + listingType mapping as publishProperty. */
export function computeUnitPatchForPropertyStatus(
  property: PropertyAsset,
  unit: Unit | undefined,
  status: PropertyAsset['status'],
): Unit | null {
  if (!unit) return null
  const unitListingType: Unit['listingType'] =
    property.listingMode === 'sale' ? 'sale' : property.listingMode === 'both' ? 'both' : 'rent'
  const nextUnitStatus: Unit['statusKey'] = PUBLIC_PROPERTY_STATUSES.includes(status)
    ? status === 'Featured'
      ? 'FEATURED'
      : status === 'Under Offer'
        ? 'UNDER_OFFER'
        : 'PUBLISHED'
    : property.status === 'Rented'
      ? 'OCCUPIED'
      : property.status === 'Maintenance'
        ? 'MAINTENANCE'
        : 'DRAFT'
  if (unit.statusKey === nextUnitStatus && unit.listingType === unitListingType) return null
  return { ...unit, statusKey: nextUnitStatus, listingType: unitListingType }
}

/**
 * In-memory fix when property is public but the linked unit row still has draft/occupied keys.
 * Does not persist — publish/delete refresh handles durable writes.
 */
export function repairUnitsForMarketplaceVisibility(
  properties: PropertyAsset[],
  units: Unit[],
  users: AppUser[],
): Unit[] {
  const byId = new Map(units.map((u) => [u.id, u]))
  for (const property of properties) {
    const unitId = property.unitId?.trim()
    if (!unitId) continue
    const unit = byId.get(unitId)
    if (!unit) continue
    if (property.deletedAt) continue
    if (unit.statusKey === 'DELETED') continue
    if (isPubliclyListed(property, { units: [unit], users })) continue
    const expected = expectedMarketplaceUnitFields(property)
    if (!expected) continue
    const repaired = { ...unit, ...expected }
    if (isPubliclyListed(property, { units: [repaired], users })) {
      byId.set(unitId, repaired)
    }
  }
  return units.map((u) => byId.get(u.id) ?? u)
}

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

function landlordVerificationBlock(
  landlordId: string | null | undefined,
  users: AppUser[] | undefined,
  scope: 'property' | 'building',
): GuestMarketplaceBlock | null {
  if (!landlordId || !users?.length) return null
  const landlord = users.find((u) => u.id === landlordId)
  const v = landlord?.verification?.status
  const who = landlord?.name ?? 'owner'
  const prefix =
    scope === 'building'
      ? `The building’s linked landlord (${who})`
      : `The linked landlord (${who})`
  if (v === 'pending') {
    return {
      message: `${prefix} is pending document verification. Signed-out visitors will not see this listing until a Super Admin approves them.`,
      landlordUserId: landlordId,
    }
  }
  if (v === 'rejected') {
    return {
      message: `${prefix} was rejected. Guests cannot browse this listing until verification is resolved or the property is agency-owned.`,
      landlordUserId: landlordId,
    }
  }
  return null
}

/** Mirrors Supabase get_public_marketplace_bootstrap* building landlord filter. */
export function buildingBlocksGuestMarketplace(
  property: PropertyAsset,
  buildings: Building[] | undefined,
  users: AppUser[] | undefined,
): GuestMarketplaceBlock | null {
  const buildingId = property.buildingId?.trim()
  if (!buildingId || !buildings?.length) return null
  const building = buildings.find((b) => b.id === buildingId)
  if (!building?.landlordId) return null
  if (property.landlordId && property.landlordId === building.landlordId) return null
  return landlordVerificationBlock(building.landlordId, users, 'building')
}

/** Staff portfolio shows Available/Featured/Under Offer while guests may still be blocked. */
export function portfolioLabelLooksLive(
  property: PropertyAsset,
  occupancy?: string | null,
): boolean {
  if (property.deletedAt) return false
  const { label } = resolvePortfolioStatus(property.status, occupancy)
  return LIVE_PORTFOLIO_LABELS.has(label)
}

export type GuestMarketplaceBlockOpts = {
  units?: Unit[]
  users?: AppUser[]
  buildings?: Building[]
}

/**
 * Why signed-out /browse and GET /api/public/marketplace omit this listing.
 * Returns null when guests would see it (same rules as isPubliclyListed + building landlord).
 */
export function getGuestMarketplaceBlockReason(
  property: PropertyAsset,
  opts?: GuestMarketplaceBlockOpts,
): GuestMarketplaceBlock | null {
  const buildingBlock = buildingBlocksGuestMarketplace(property, opts?.buildings, opts?.users)
  if (buildingBlock) return buildingBlock

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

  const propertyLandlordBlock = landlordVerificationBlock(
    property.landlordId,
    opts?.users,
    'property',
  )
  if (propertyLandlordBlock) return propertyLandlordBlock

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
  buildings?: Building[],
): boolean {
  const published: PropertyAsset = { ...property, status: 'Published' }
  const units = unit
    ? [{ ...unit, statusKey: 'PUBLISHED' as Unit['statusKey'] }]
    : []
  if (buildingBlocksGuestMarketplace(published, buildings, users)) return false
  return isPubliclyListed(published, { units, users })
}
