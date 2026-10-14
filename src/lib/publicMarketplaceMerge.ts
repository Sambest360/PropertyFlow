import type { PostgresBootstrap } from './api/postgresClient'
import type { AppUser, PropertyAsset } from '../types/domain'
import type { Building, Unit } from '../data/infrastructure'
import { isPubliclyListed } from './publicListings'

function unionPreferPrimary<T extends { id: string }>(primary: T[], secondary: T[] | undefined): T[] {
  if (!secondary?.length) return primary
  const map = new Map<string, T>()
  for (const row of secondary) map.set(row.id, row)
  for (const row of primary) map.set(row.id, row)
  return Array.from(map.values())
}

/** Union guest/public marketplace rows into a signed-in bootstrap without dropping portal scope. */
export function mergePublicMarketplaceBootstrap(
  session: PostgresBootstrap,
  pub: PostgresBootstrap,
): PostgresBootstrap {
  const mergeList = <T extends { id: string }>(sessionList: T[] | undefined, pubList: T[] | undefined): T[] =>
    unionPreferPrimary((sessionList ?? []) as T[], (pubList ?? []) as T[])

  return {
    ...session,
    agencies: mergeList(session.agencies as { id: string }[], pub.agencies as { id: string }[]),
    users: unionPreferPrimary(
      (session.users as AppUser[]) ?? [],
      (pub.users as AppUser[]) ?? [],
    ),
    buildings: mergeList(session.buildings as Building[], pub.buildings as Building[]),
    units: mergeList(session.units as Unit[], pub.units as Unit[]),
    properties: mergeList(session.properties as PropertyAsset[], pub.properties as PropertyAsset[]),
    viewingSlots: mergeList(
      session.viewingSlots as { id: string }[] | undefined,
      pub.viewingSlots as { id: string }[] | undefined,
    ),
  }
}

export function appStateHasPublicBrowseListings(state: {
  properties: PropertyAsset[]
  units: Unit[]
  users: AppUser[]
}): boolean {
  return state.properties.some((p) => isPubliclyListed(p, { units: state.units, users: state.users }))
}

export function bootstrapHasPublicBrowseListings(boot: PostgresBootstrap): boolean {
  const properties = (boot.properties as PropertyAsset[]) ?? []
  const units = (boot.units as Unit[]) ?? []
  const users = (boot.users as AppUser[]) ?? []
  return properties.some((p) => isPubliclyListed(p, { units, users }))
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
  return null
}

/** Signed-in bootstraps are agency-scoped; merge published listings when browse would be empty. */
export async function enrichBootstrapWithPublicMarketplace(
  boot: PostgresBootstrap,
  lite: boolean,
  timeoutMs: number,
): Promise<PostgresBootstrap> {
  if (bootstrapHasPublicBrowseListings(boot)) return boot
  const pub = await fetchPublicMarketplaceSlice(lite, timeoutMs)
  if (!pub?.properties?.length) return boot
  return mergePublicMarketplaceBootstrap(boot, pub)
}
