import type { PostgresBootstrap } from './api/postgresClient'
import type { AppUser, PropertyAsset, ViewingSlot } from '../types/domain'
import type { Building, Unit } from '../data/infrastructure'
import { resolveUnitForProperty } from './applicationApi'
import { findByListingId } from './listingIds'
import { isPublicMarketplaceUnit, isPubliclyListed } from './publicListings'

function unionPreferPrimary<T extends { id: string }>(primary: T[], secondary: T[] | undefined): T[] {
  if (!secondary?.length) return primary
  const map = new Map<string, T>()
  for (const row of secondary) map.set(row.id, row)
  for (const row of primary) map.set(row.id, row)
  return Array.from(map.values())
}

function propertyForUnit(
  unitId: string,
  sessionProps: PropertyAsset[],
  pubProps: PropertyAsset[],
): PropertyAsset | undefined {
  return sessionProps.find((p) => p.unitId === unitId) ?? pubProps.find((p) => p.unitId === unitId)
}

/** Scoped portal rows win for workspace — unless only the public copy can render on /browse. */
function mergeUnitsForBrowse(
  sessionUnits: Unit[],
  pubUnits: Unit[],
  sessionProps: PropertyAsset[],
  pubProps: PropertyAsset[],
  users: AppUser[],
): Unit[] {
  const sessionMap = new Map(sessionUnits.map((u) => [u.id, u]))
  const pubMap = new Map(pubUnits.map((u) => [u.id, u]))
  const ids = new Set([...sessionMap.keys(), ...pubMap.keys()])
  const merged: Unit[] = []
  for (const id of ids) {
    const sessionRow = sessionMap.get(id)
    const pubRow = pubMap.get(id)
    if (!sessionRow) {
      if (pubRow) merged.push(pubRow)
      continue
    }
    if (!pubRow) {
      merged.push(sessionRow)
      continue
    }
    const sessionProp = propertyForUnit(id, sessionProps, pubProps)
    const pubProp = propertyForUnit(id, pubProps, sessionProps)
    const sessionOk = isPublicMarketplaceUnit(sessionRow, sessionProp ?? pubProp, { users })
    const pubOk = isPublicMarketplaceUnit(pubRow, pubProp ?? sessionProp, { users })
    if (sessionOk) merged.push(sessionRow)
    else if (pubOk) merged.push(pubRow)
    else merged.push(sessionRow)
  }
  return merged
}

function mergePropertiesForBrowse(
  sessionProps: PropertyAsset[],
  pubProps: PropertyAsset[],
  units: Unit[],
  users: AppUser[],
): PropertyAsset[] {
  const sessionMap = new Map(sessionProps.map((p) => [p.id, p]))
  const pubMap = new Map(pubProps.map((p) => [p.id, p]))
  const ids = new Set([...sessionMap.keys(), ...pubMap.keys()])
  const merged: PropertyAsset[] = []
  for (const id of ids) {
    const sessionRow = sessionMap.get(id)
    const pubRow = pubMap.get(id)
    if (!sessionRow) {
      if (pubRow) merged.push(pubRow)
      continue
    }
    if (!pubRow) {
      merged.push(sessionRow)
      continue
    }
    const sessionOk = isPubliclyListed(sessionRow, { units, users })
    const pubOk = isPubliclyListed(pubRow, { units, users })
    if (sessionOk) merged.push(sessionRow)
    else if (pubOk) merged.push(pubRow)
    else merged.push(sessionRow)
  }
  return merged
}

/** Union guest/public marketplace rows into a signed-in bootstrap without dropping portal scope. */
export function mergePublicMarketplaceBootstrap(
  session: PostgresBootstrap,
  pub: PostgresBootstrap,
): PostgresBootstrap {
  const mergeList = <T extends { id: string }>(sessionList: T[] | undefined, pubList: T[] | undefined): T[] =>
    unionPreferPrimary((sessionList ?? []) as T[], (pubList ?? []) as T[])

  const sessionProps = (session.properties as PropertyAsset[]) ?? []
  const pubProps = (pub.properties as PropertyAsset[]) ?? []
  const sessionUnits = (session.units as Unit[]) ?? []
  const pubUnits = (pub.units as Unit[]) ?? []
  const users = unionPreferPrimary(
    (session.users as AppUser[]) ?? [],
    (pub.users as AppUser[]) ?? [],
  )
  const units = mergeUnitsForBrowse(sessionUnits, pubUnits, sessionProps, pubProps, users)
  const properties = mergePropertiesForBrowse(sessionProps, pubProps, units, users)

  return {
    ...session,
    agencies: mergeList(session.agencies as { id: string }[], pub.agencies as { id: string }[]),
    users,
    buildings: mergeList(session.buildings as Building[], pub.buildings as Building[]),
    units,
    properties,
    viewingSlots: mergeList(
      session.viewingSlots as { id: string }[] | undefined,
      pub.viewingSlots as { id: string }[] | undefined,
    ),
  }
}

function hasRenderablePublicBrowseListings(
  properties: PropertyAsset[],
  units: Unit[],
  users: AppUser[],
): boolean {
  return properties.some((p) => {
    if (!isPubliclyListed(p, { units, users })) return false
    // Browse prefers the units feed whenever units exist — a Published property
    // without a marketplace unit still yields 0 cards for signed-in scoped boots.
    if (!units.length) return true
    const unit = resolveUnitForProperty(p, units)
    return Boolean(unit && isPublicMarketplaceUnit(unit, p, { users }))
  })
}

export function appStateHasPublicBrowseListings(state: {
  properties: PropertyAsset[]
  units: Unit[]
  users: AppUser[]
}): boolean {
  return hasRenderablePublicBrowseListings(state.properties, state.units, state.users)
}

/** True when the bootstrap already carries rows that would render on /browse. */
export function bootstrapHasPublicBrowseListings(boot: PostgresBootstrap): boolean {
  const properties = (boot.properties as PropertyAsset[]) ?? []
  const units = (boot.units as Unit[]) ?? []
  const users = (boot.users as AppUser[]) ?? []
  return hasRenderablePublicBrowseListings(properties, units, users)
}

export async function fetchPublicMarketplaceSlice(
  lite: boolean,
  timeoutMs: number,
): Promise<PostgresBootstrap | null> {
  const { isApiEnabled, isSupabaseMode } = await import('./api/config')
  if (isSupabaseMode) {
    const { fetchPublicMarketplaceBootstrap } = await import('./supabase/publicMarketplace')
    return fetchPublicMarketplaceBootstrap(lite)
  }
  if (isApiEnabled) {
    const { fetchPublicMarketplaceFromApi } = await import('./api/postgresClient')
    return fetchPublicMarketplaceFromApi(timeoutMs, lite)
  }
  const { buildPublicMarketplaceDemoBootstrap } = await import('./publicMarketplaceDemo')
  return buildPublicMarketplaceDemoBootstrap()
}

/** Narrow public slice for a direct /listing/:id URL when scoped store rows are missing. */
export async function fetchPublicListingSlice(
  listingParam: string,
  timeoutMs: number,
): Promise<PostgresBootstrap | null> {
  const { isApiEnabled } = await import('./api/config')
  if (isApiEnabled) {
    const { fetchPublicListingBootstrapFromApi } = await import('./api/postgresClient')
    const { listingIdAliases } = await import('./listingIds')
    for (const alias of listingIdAliases(listingParam)) {
      const slice = await fetchPublicListingBootstrapFromApi(alias, timeoutMs)
      if (slice && findByListingId((slice.properties as PropertyAsset[]) ?? [], listingParam)) {
        return slice
      }
    }
    return null
  }
  const full = await fetchPublicMarketplaceSlice(true, timeoutMs)
  if (!full) return null
  const property = findByListingId((full.properties as PropertyAsset[]) ?? [], listingParam)
  if (!property) return null
  const unitId = property.unitId
  const units = ((full.units as Unit[]) ?? []).filter((u) => u.id === unitId)
  const buildingIds = new Set(units.map((u) => u.buildingId).filter(Boolean) as string[])
  return {
    ...full,
    properties: [property],
    units,
    buildings: ((full.buildings as Building[]) ?? []).filter((b) => buildingIds.has(b.id)),
  }
}

/** Union a one-off public listing fetch into store rows for detail-page resolution. */
export function mergeListingLookupState(
  state: {
    properties: PropertyAsset[]
    units: Unit[]
    users: AppUser[]
    viewingSlots?: ViewingSlot[]
  },
  pub: PostgresBootstrap | null,
): {
  properties: PropertyAsset[]
  units: Unit[]
  users: AppUser[]
  viewingSlots: ViewingSlot[]
} {
  if (!pub) {
    return {
      properties: state.properties,
      units: state.units,
      users: state.users,
      viewingSlots: state.viewingSlots ?? [],
    }
  }
  const sessionBoot = {
    source: 'postgres' as const,
    fetchedAt: '',
    properties: state.properties,
    units: state.units,
    users: state.users,
    viewingSlots: state.viewingSlots,
  } as PostgresBootstrap
  const merged = mergePublicMarketplaceBootstrap(sessionBoot, pub)
  return {
    properties: (merged.properties as PropertyAsset[]) ?? state.properties,
    units: (merged.units as Unit[]) ?? state.units,
    users: (merged.users as AppUser[]) ?? state.users,
    viewingSlots: (merged.viewingSlots as ViewingSlot[]) ?? state.viewingSlots ?? [],
  }
}

/** Whether a signed-in bootstrap should union the guest marketplace slice. */
export function needsPublicMarketplaceMerge(boot: PostgresBootstrap): boolean {
  return boot.scoped === true || !bootstrapHasPublicBrowseListings(boot)
}

/** Signed-in bootstraps are agency-scoped; merge published listings when browse would be empty. */
export async function enrichBootstrapWithPublicMarketplace(
  boot: PostgresBootstrap,
  lite: boolean,
  timeoutMs: number,
): Promise<PostgresBootstrap> {
  if (!needsPublicMarketplaceMerge(boot)) return boot
  const pub = await fetchPublicMarketplaceSlice(lite, timeoutMs)
  if (!pub) return boot
  const pubProps = (pub.properties as PropertyAsset[] | undefined) ?? []
  const pubUnits = (pub.units as Unit[] | undefined) ?? []
  if (!pubProps.length && !pubUnits.length) return boot
  return mergePublicMarketplaceBootstrap(boot, pub)
}
