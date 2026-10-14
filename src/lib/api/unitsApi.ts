/**
 * GET /api/v1/units — cursor-paginated property search feed.
 * Card-ready payloads: primary image, load-shedding flag, entry fees, nested building metrics.
 */

import type { Building, Unit } from '../../data/infrastructure'
import type { PropertyAsset } from '../../types/domain'
import { buildUnitCardActions } from './actions'
import type {
  ActorContext,
  BuildingStructuralContext,
  CursorFeedResponse,
  DisplayMetadata,
  HateoasAction,
} from './contracts'
import { buildDisplayMetadata, formatZARLabel } from './displayMetadata'
import type { AppUser } from '../../types/domain'
import { canonicalListingId } from '../listingIds'
import { isPublicMarketplaceUnit } from '../publicListings'
import type { Place } from '../placeCatalog'
import { propertyMatchesAreas } from '../placeCatalog'

export type UnitSearchFilters = {
  /** Free-text across title, suburb, city, unit number */
  q?: string
  /** Property type chips (marketplace browse), e.g. ['Apartment'] */
  types?: string[]
  listing_type?: 'rent' | 'sale' | 'both' | 'all'
  min_rent?: number
  max_rent?: number
  min_price?: number
  max_price?: number
  bedrooms_min?: number
  bathrooms_min?: number
  parking_min?: number
  /** Utility / green tier */
  grading?: Array<'P' | 'A' | 'B' | 'C'>
  min_solar_kw?: number
  has_borehole?: boolean
  load_shedding_free?: boolean
  premium_tier?: boolean
  amenities?: string[]
  status_keys?: string[]
  featured_only?: boolean
  /** Geospatial bounding box (degrees) */
  sw_lat?: number
  sw_lng?: number
  ne_lat?: number
  ne_lng?: number
  /** Radius search from a point (km) */
  near_lat?: number
  near_lng?: number
  near_radius_km?: number
  client_id?: string
  /** When true, hide draft/occupied/off-market units from public browse feeds. */
  marketplace_public?: boolean
  /** Curated suburb/city chips from browse `areas=` param (G04). */
  area_places?: Place[]
  cursor?: string | null
  limit?: number
  sort?: 'featured' | 'rent_asc' | 'rent_desc' | 'price_asc' | 'price_desc' | 'newest' | 'beds_desc'
}

export type UnitCardPayload = {
  id: string
  client_id: string
  unit_number: string
  title: string
  listing_type: string
  status_key: string
  bedrooms: number
  bathrooms: number
  parking: number
  square_meters: number
  rent: number | null
  price: number | null
  /** Deposit in ZAR (1× rent default for rentals) */
  deposit: number | null
  /** Rent + deposit — total cash to move in */
  total_entry_fees: number | null
  featured: boolean
  primary_image: string | null
  images: string[]
  amenities: string[]
  lat: number | null
  lng: number | null
  is_load_shedding_free: boolean
  is_premium_tier: boolean
  badges: string[]
  building: BuildingStructuralContext
  /** Marketplace property id when linked */
  property_id?: string | null
  display_metadata: DisplayMetadata
  actions: HateoasAction[]
}

const DEFAULT_LIMIT = 24
const MAX_LIMIT = 60

/** Opaque cursor: createdAt|id for stable descending feeds (browser-safe). */
export function encodeUnitCursor(updatedAt: string, id: string): string {
  const raw = `${updatedAt}|${id}`
  if (typeof btoa === 'function') {
    return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  return encodeURIComponent(raw)
}

export function decodeUnitCursor(cursor: string | null | undefined): { updatedAt: string; id: string } | null {
  if (!cursor) return null
  try {
    let raw = cursor
    if (typeof atob === 'function') {
      const padded = cursor.replace(/-/g, '+').replace(/_/g, '/')
      const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
      raw = atob(padded + pad)
    } else {
      raw = decodeURIComponent(cursor)
    }
    const [updatedAt, id] = raw.split('|')
    if (!updatedAt || !id) return null
    return { updatedAt, id }
  } catch {
    return null
  }
}

export const encodeCursorBrowser = encodeUnitCursor
export const decodeCursorBrowser = decodeUnitCursor

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function isLoadSheddingFree(building: Building, amenities: string[]): boolean {
  if (building.solarCapacityKw >= 3) return true
  if (building.hasBorehole && building.solarCapacityKw > 0) return true
  return amenities.some((a) => /generator|inverter|solar|ups/i.test(a))
}

export function isPremiumTier(building: Building): boolean {
  if (building.grading === 'P') return true
  return building.solarCapacityKw >= 20 && building.hasBorehole
}

export function resolveDeposit(unit: Unit, property?: PropertyAsset): number | null {
  if (unit.listingType === 'sale' || unit.listingType === 'not_listed') {
    if (unit.price != null) return Math.round(unit.price * 0.1)
    return null
  }
  const rent = unit.rent ?? property?.rent ?? null
  if (rent == null) return null
  return rent * 2
}

export function resolveTotalEntryFees(unit: Unit, property?: PropertyAsset): number | null {
  if (unit.listingType === 'sale') {
    const deposit = resolveDeposit(unit, property)
    return deposit
  }
  const rent = unit.rent ?? property?.rent ?? null
  const deposit = resolveDeposit(unit, property)
  if (rent == null || deposit == null) return null
  return rent + deposit
}

export function buildBuildingContext(building: Building, amenities: string[]): BuildingStructuralContext {
  const loadFree = isLoadSheddingFree(building, amenities)
  const premium = isPremiumTier(building)
  return {
    id: building.id,
    name: building.name,
    suburb: building.suburb,
    city: building.city,
    province: building.province,
    grading: building.grading,
    solar_capacity_kw: building.solarCapacityKw,
    has_borehole: building.hasBorehole,
    is_load_shedding_free: loadFree,
    is_premium_tier: premium,
    lat: building.lat,
    lng: building.lng,
  }
}

export function buildUnitCard(params: {
  unit: Unit
  building: Building
  property?: PropertyAsset
  actor?: ActorContext | null
  now?: Date
}): UnitCardPayload {
  const { unit, building, property, actor, now } = params
  const amenities = unit.amenities.length ? unit.amenities : property?.amenities ?? []
  const buildingCtx = buildBuildingContext(building, amenities)
  const deposit = resolveDeposit(unit, property)
  const totalEntry = resolveTotalEntryFees(unit, property)
  const images = unit.images.length ? unit.images : property?.images ?? []
  const badges: string[] = []
  if (unit.featured || property?.featured) badges.push('Featured')
  if (buildingCtx.is_load_shedding_free) badges.push('Load-shedding free')
  if (buildingCtx.is_premium_tier) badges.push('Premium tier')
  if (building.grading) badges.push(`Grade ${building.grading}`)
  if (building.hasBorehole) badges.push('Borehole')
  if (building.solarCapacityKw > 0) badges.push(`${building.solarCapacityKw} kW solar`)

  const statusLabel = unit.statusKey.replace(/_/g, ' ')
  const display_metadata = buildDisplayMetadata({
    updatedAt: unit.createdAt,
    createdAt: unit.createdAt,
    statusLabel,
    primaryAmount: unit.rent ?? unit.price,
    primarySuffix: unit.rent != null ? ' / month' : '',
    secondaryAmount: totalEntry,
    secondarySuffix: totalEntry != null && unit.rent != null ? ' to move in' : '',
    now,
  })

  return {
    id: unit.id,
    client_id: unit.clientId,
    unit_number: unit.unitNumber,
    title: unit.title || property?.title || `${building.name} · ${unit.unitNumber}`,
    listing_type: unit.listingType,
    status_key: unit.statusKey,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    parking: unit.parking,
    square_meters: unit.squareMeters,
    rent: unit.rent,
    price: unit.price,
    deposit,
    total_entry_fees: totalEntry,
    featured: unit.featured || Boolean(property?.featured),
    primary_image: images[0] ?? null,
    images,
    amenities,
    lat: unit.lat ?? building.lat,
    lng: unit.lng ?? building.lng,
    is_load_shedding_free: buildingCtx.is_load_shedding_free,
    is_premium_tier: buildingCtx.is_premium_tier,
    badges,
    building: buildingCtx,
    property_id: property?.id ? canonicalListingId(property.id) : null,
    display_metadata,
    actions: buildUnitCardActions({
      unitId: unit.id,
      listingType: unit.listingType,
      statusKey: unit.statusKey,
      actor,
    }),
  }
}

function listingMatches(unit: Unit, listingType?: UnitSearchFilters['listing_type']): boolean {
  if (!listingType || listingType === 'all') return unit.listingType !== 'not_listed'
  if (listingType === 'both') return unit.listingType === 'both' || unit.listingType === 'rent' || unit.listingType === 'sale'
  if (listingType === 'rent') return unit.listingType === 'rent' || unit.listingType === 'both'
  if (listingType === 'sale') return unit.listingType === 'sale' || unit.listingType === 'both'
  return true
}

/**
 * Property type for a unit — linked marketplace properties carry their real type;
 * infrastructure-only units derive one with the same convention as mapGuestMarketplace.
 */
function derivedUnitType(unit: Unit, property?: PropertyAsset): string {
  if (property?.type) return property.type
  if (unit.bedrooms === 0) return 'Office'
  return unit.bedrooms >= 3 ? 'House' : 'Apartment'
}

function unitTypeMatches(unit: Unit, property: PropertyAsset | undefined, types: string[]): boolean {
  const unitType = derivedUnitType(unit, property)
  return types.some((t) => t.toLowerCase() === unitType.toLowerCase())
}

function inBoundingBox(
  lat: number | null | undefined,
  lng: number | null | undefined,
  f: UnitSearchFilters,
): boolean {
  if (f.sw_lat == null || f.sw_lng == null || f.ne_lat == null || f.ne_lng == null) return true
  if (lat == null || lng == null) return false
  return lat >= f.sw_lat && lat <= f.ne_lat && lng >= f.sw_lng && lng <= f.ne_lng
}

function matchesNear(lat: number | null | undefined, lng: number | null | undefined, f: UnitSearchFilters): boolean {
  if (f.near_lat == null || f.near_lng == null) return true
  if (lat == null || lng == null) return false
  const radius = f.near_radius_km ?? 15
  return haversineKm(f.near_lat, f.near_lng, lat, lng) <= radius
}

export function searchUnitsFeed(params: {
  units: Unit[]
  buildings: Building[]
  properties?: PropertyAsset[]
  filters: UnitSearchFilters
  actor?: ActorContext | null
  now?: Date
  users?: AppUser[]
}): CursorFeedResponse<UnitCardPayload> {
  const { units, buildings, properties = [], filters, actor, now, users = [] } = params
  const buildingById = new Map(buildings.map((b) => [b.id, b]))
  const propertyByUnit = new Map(
    properties.filter((p) => p.unitId).map((p) => [p.unitId as string, p]),
  )

  let rows = units.filter((unit) => {
    const building = buildingById.get(unit.buildingId)
    if (!building) return false
    const property = propertyByUnit.get(unit.id)
    if (filters.marketplace_public && !isPublicMarketplaceUnit(unit, property, { users })) {
      return false
    }
    if (filters.client_id && unit.clientId !== filters.client_id) return false
    if (!listingMatches(unit, filters.listing_type)) return false
    if (filters.types?.length && !unitTypeMatches(unit, property, filters.types)) return false

    if (filters.status_keys?.length && !filters.status_keys.includes(unit.statusKey)) return false
    if (filters.featured_only && !unit.featured && !propertyByUnit.get(unit.id)?.featured) return false

    if (filters.bedrooms_min != null && unit.bedrooms < filters.bedrooms_min) return false
    if (filters.bathrooms_min != null && unit.bathrooms < filters.bathrooms_min) return false
    if (filters.parking_min != null && unit.parking < filters.parking_min) return false

    if (filters.min_rent != null && (unit.rent == null || unit.rent < filters.min_rent)) return false
    if (filters.max_rent != null && (unit.rent == null || unit.rent > filters.max_rent)) return false
    if (filters.min_price != null && (unit.price == null || unit.price < filters.min_price)) return false
    if (filters.max_price != null && (unit.price == null || unit.price > filters.max_price)) return false

    if (filters.grading?.length && (!building.grading || !filters.grading.includes(building.grading))) {
      return false
    }
    if (filters.min_solar_kw != null && building.solarCapacityKw < filters.min_solar_kw) return false
    if (filters.has_borehole === true && !building.hasBorehole) return false

    const amenities = unit.amenities.length
      ? unit.amenities
      : propertyByUnit.get(unit.id)?.amenities ?? []
    const loadFree = isLoadSheddingFree(building, amenities)
    const premium = isPremiumTier(building)
    if (filters.load_shedding_free === true && !loadFree) return false
    if (filters.premium_tier === true && !premium) return false
    if (filters.amenities?.length && !filters.amenities.every((a) => amenities.includes(a))) return false

    const lat = unit.lat ?? building.lat
    const lng = unit.lng ?? building.lng
    if (!inBoundingBox(lat, lng, filters)) return false
    if (!matchesNear(lat, lng, filters)) return false

    if (filters.area_places?.length) {
      const prop = propertyByUnit.get(unit.id)
      const suburb = prop?.suburb ?? building.suburb
      const city = prop?.city ?? building.city
      if (!propertyMatchesAreas({ suburb, city }, filters.area_places)) return false
    }

    if (filters.q) {
      const q = filters.q.toLowerCase()
      const hay = [
        unit.title,
        unit.unitNumber,
        unit.description,
        building.name,
        building.suburb,
        building.city,
        propertyByUnit.get(unit.id)?.title,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }

    return true
  })

  const sort = filters.sort ?? 'featured'
  rows = [...rows].sort((a, b) => {
    if (sort === 'rent_asc') return (a.rent ?? 1e15) - (b.rent ?? 1e15)
    if (sort === 'rent_desc') return (b.rent ?? 0) - (a.rent ?? 0)
    if (sort === 'price_asc') return (a.price ?? 1e15) - (b.price ?? 1e15)
    if (sort === 'price_desc') return (b.price ?? 0) - (a.price ?? 0)
    if (sort === 'beds_desc') return b.bedrooms - a.bedrooms
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt)
    if (a.featured !== b.featured) return a.featured ? -1 : 1
    return b.createdAt.localeCompare(a.createdAt)
  })

  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const cursor = decodeCursorBrowser(filters.cursor)
  if (cursor) {
    rows = rows.filter((u) => {
      if (u.createdAt < cursor.updatedAt) return true
      if (u.createdAt > cursor.updatedAt) return false
      return u.id < cursor.id
    })
  }

  const page = rows.slice(0, limit)
  const hasMore = rows.length > limit
  const last = page[page.length - 1]
  const cards = page.map((unit) => {
    const building = buildingById.get(unit.buildingId)!
    return buildUnitCard({
      unit,
      building,
      property: propertyByUnit.get(unit.id),
      actor,
      now,
    })
  })

  const totalBeforeCursor = cursor
    ? null
    : units.filter((u) => buildingById.has(u.buildingId)).length

  return {
    data: cards,
    pagination: {
      next_cursor: hasMore && last ? encodeUnitCursor(last.createdAt, last.id) : null,
      prev_cursor: null,
      has_more: hasMore,
      limit,
      /** Full filtered count on first page only — avoids expensive recounts mid-scroll */
      total_estimate: cursor ? null : rows.length,
    },
    meta: {
      endpoint: 'GET /api/v1/units',
      catalog_size: totalBeforeCursor,
      filters_applied: Object.keys(filters).filter((k) => (filters as Record<string, unknown>)[k] != null),
      entry_fee_formula: 'rent + (2 × rent deposit) for rentals; 10% sale deposit for purchases',
      sample_entry_fee_label: cards[0]
        ? formatZARLabel(cards[0].total_entry_fees, ' to move in')
        : null,
    },
  }
}

/** Map marketplace PropertyAsset browse → unit-card shape when no infra unit is linked. */
export function propertyToUnitCard(
  property: PropertyAsset,
  building: Building | undefined,
  actor?: ActorContext | null,
): UnitCardPayload {
  const syntheticBuilding: Building =
    building ??
    ({
      id: property.buildingId ?? `b-synth-${property.id}`,
      clientId: property.agencyId,
      landlordId: property.landlordId,
      name: property.title,
      addressLine1: property.address,
      suburb: property.suburb,
      city: property.city,
      province: 'Eastern Cape',
      grading: (property.grading as Building['grading']) ?? null,
      solarCapacityKw: property.solarCapacityKw ?? 0,
      hasBorehole: property.hasBorehole ?? false,
      lat: property.lat,
      lng: property.lng,
      images: property.images,
      createdAt: property.createdAt,
    } satisfies Building)

  const unit: Unit = {
    id: property.unitId ?? property.id,
    clientId: property.agencyId,
    buildingId: syntheticBuilding.id,
    agentId: property.agentId,
    unitNumber: property.unitId ? '—' : property.id.slice(-4),
    title: property.title,
    squareMeters: property.area,
    bedrooms: property.beds,
    bathrooms: property.baths,
    parking: property.parking,
    listingType:
      property.listingMode === 'both'
        ? 'both'
        : property.listingMode === 'sale'
          ? 'sale'
          : 'rent',
    price: property.price,
    rent: property.rent,
    statusKey:
      property.status === 'Featured'
        ? 'FEATURED'
        : property.status === 'Rented'
          ? 'OCCUPIED'
          : 'PUBLISHED',
    description: property.description,
    amenities: property.amenities,
    images: property.images,
    featured: property.featured,
    lat: property.lat,
    lng: property.lng,
    createdAt: property.createdAt,
  }

  return buildUnitCard({ unit, building: syntheticBuilding, property, actor })
}
