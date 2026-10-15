import type { Building } from '../data/infrastructure'
import type { PropertyAsset } from '../types/domain'

export const STANDALONE_BUILDING_KEY = '__standalone__'

export type BuildingGroupKey = string

/** Minimal row shape for grouping — portfolio cards / owner portal both fit. */
export type BuildingGroupable = {
  property: PropertyAsset
}

export type BuildingPortfolioGroup<T extends BuildingGroupable = BuildingGroupable> = {
  key: BuildingGroupKey
  building: Building | null
  label: string
  suburbCity: string
  items: T[]
  unitCount: number
}

function buildingLabel(building: Building | null, fallbackSuburb: string, fallbackCity: string): string {
  if (building?.name?.trim()) return building.name.trim()
  const area = [fallbackSuburb, fallbackCity].filter(Boolean).join(', ')
  return area || 'Standalone property'
}

/**
 * Groups portfolio rows under Building → Units.
 * Properties without buildingId (or unknown id) land in a Standalone bucket (last).
 * Multi-unit buildings sort before single-unit; standalone last.
 */
export function groupPortfolioByBuilding<T extends BuildingGroupable>(
  items: T[],
  buildings: Building[],
): BuildingPortfolioGroup<T>[] {
  const byId = new Map(buildings.map((b) => [b.id, b]))
  const buckets = new Map<string, T[]>()

  for (const item of items) {
    const bid = item.property.buildingId?.trim() || ''
    const key = bid && byId.has(bid) ? bid : STANDALONE_BUILDING_KEY
    const list = buckets.get(key)
    if (list) list.push(item)
    else buckets.set(key, [item])
  }

  const groups: BuildingPortfolioGroup<T>[] = []

  for (const [key, groupItems] of buckets) {
    const building = key === STANDALONE_BUILDING_KEY ? null : (byId.get(key) ?? null)
    const sample = groupItems[0]?.property
    const sortedItems = [...groupItems].sort((a, b) => a.property.title.localeCompare(b.property.title))
    groups.push({
      key,
      building,
      label:
        key === STANDALONE_BUILDING_KEY
          ? 'Standalone properties'
          : buildingLabel(building, sample?.suburb ?? '', sample?.city ?? ''),
      suburbCity: building
        ? `${building.suburb}, ${building.city}`
        : sample
          ? `${sample.suburb}, ${sample.city}`
          : '',
      items: sortedItems,
      unitCount: sortedItems.length,
    })
  }

  groups.sort((a, b) => {
    if (a.key === STANDALONE_BUILDING_KEY) return 1
    if (b.key === STANDALONE_BUILDING_KEY) return -1
    if (b.unitCount !== a.unitCount) return b.unitCount - a.unitCount
    return a.label.localeCompare(b.label)
  })

  return groups
}

/** Collapsible header when the group exposes both rent and sale markets. */
export function shouldUseBuildingGroupChrome<T extends BuildingGroupable>(
  group: BuildingPortfolioGroup<T>,
): boolean {
  let hasSale = false
  let hasRent = false
  for (const { property } of group.items) {
    if (property.listingMode === 'both') return true
    if (property.listingMode === 'sale') hasSale = true
    if (property.listingMode === 'rent') hasRent = true
  }
  return hasSale && hasRent
}

function listingModeGroupSortRank(mode: PropertyAsset['listingMode']): number {
  return mode === 'sale' ? 1 : 0
}

/** Rent (and dual) listings before sale within a sale+rent group. */
export function sortPortfolioItemsForSaleRentGroup<T extends BuildingGroupable>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const byMode =
      listingModeGroupSortRank(a.property.listingMode) -
      listingModeGroupSortRank(b.property.listingMode)
    if (byMode !== 0) return byMode
    return a.property.title.localeCompare(b.property.title)
  })
}

export function isDualListingPortfolioItem(item: BuildingGroupable): boolean {
  return item.property.listingMode === 'both'
}

/** Sibling listed properties that share a building (excludes `propertyId`). */
export function siblingUnitsInBuilding(
  properties: PropertyAsset[],
  buildingId: string | null | undefined,
  propertyId: string,
): PropertyAsset[] {
  const bid = buildingId?.trim()
  if (!bid) return []
  return properties
    .filter((p) => p.id !== propertyId && p.buildingId === bid)
    .sort((a, b) => a.title.localeCompare(b.title))
}

/** Buildings that appear in a scoped property set (for filter dropdowns). */
export function buildingsInScope(
  properties: PropertyAsset[],
  buildings: Building[],
): Building[] {
  const ids = new Set(
    properties.map((p) => p.buildingId?.trim()).filter((id): id is string => Boolean(id)),
  )
  return buildings
    .filter((b) => ids.has(b.id))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function propertyMatchesBuildingFilter(
  property: PropertyAsset,
  buildingFilter: string,
): boolean {
  if (buildingFilter === 'all') return true
  if (buildingFilter === STANDALONE_BUILDING_KEY) {
    return !property.buildingId?.trim()
  }
  return property.buildingId === buildingFilter
}

export function propertyMatchesOccupancyFilter(
  occupancy: string | null | undefined,
  occupancyFilter: string,
): boolean {
  if (occupancyFilter === 'all') return true
  if (occupancyFilter === 'unknown') return !occupancy
  return (occupancy ?? '') === occupancyFilter
}
