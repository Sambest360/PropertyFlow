/**
 * Owner-keyed sessionStorage snapshot for workspace portfolio rows.
 * Restores immediately on reload while bootstrap refetches (stale-while-revalidate).
 */
import type { Building, Unit } from '../data/infrastructure'
import type { Lead, MaintenanceTicket, PropertyAsset, Role, ViewingSlot } from '../types/domain'
import { isFieldAgent } from './permissions'
import { buildPropertyScope, ticketInScope, toPropertyLinks } from './scope'
export const PORTFOLIO_SNAPSHOT_KEY = 'propertyflow-portfolio-v1'

export type PortfolioSnapshotSource = PortfolioSnapshotSlice

export type PortfolioSnapshotSlice = {
  properties: PropertyAsset[]
  units: Unit[]
  buildings: Building[]
  viewingSlots: ViewingSlot[]
  leads: Lead[]
  tickets: MaintenanceTicket[]
}

export type PortfolioSnapshotActor = {
  userId: string
  role: Role
  agencyId: string | null
}

type PortfolioSnapshotEnvelope = {
  ownerUserId: string
  fetchedAt: string
  slice: PortfolioSnapshotSlice
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } catch {
    return null
  }
}

function filterSliceForFieldAgent(slice: PortfolioSnapshotSlice, actor: PortfolioSnapshotActor): PortfolioSnapshotSlice {
  const scope = buildPropertyScope(
    {
      role: actor.role,
      userId: actor.userId,
      agencyId: actor.agencyId,
      agencySuspended: false,
    },
    {
      properties: toPropertyLinks(slice.properties),
      tickets: slice.tickets,
    },
  )
  const allowed = scope.allowedPropertyIds
  const buildingIds = new Set(
    slice.properties.filter((p) => allowed.has(p.id)).map((p) => p.buildingId).filter(Boolean) as string[],
  )
  return {
    properties: slice.properties.filter((p) => allowed.has(p.id)),
    units: slice.units.filter((u) => {
      const pid = u.id.startsWith('unt-') ? u.id.slice(4) : u.id
      return allowed.has(pid) || (u.buildingId ? buildingIds.has(u.buildingId) : false)
    }),
    buildings: slice.buildings.filter((b) => buildingIds.has(b.id)),
    viewingSlots: slice.viewingSlots.filter((v) => allowed.has(v.propertyId)),
    leads: slice.leads.filter((l) => allowed.has(l.propertyId)),
    tickets: slice.tickets.filter((t) => ticketInScope(scope, t)),
  }
}

export function pickPortfolioSnapshotSlice(
  state: PortfolioSnapshotSource,
  actor?: PortfolioSnapshotActor | null,
): PortfolioSnapshotSlice {
  const slice: PortfolioSnapshotSlice = {
    properties: state.properties,
    units: state.units,
    buildings: state.buildings,
    viewingSlots: state.viewingSlots,
    leads: state.leads,
    tickets: state.tickets,
  }
  if (actor && isFieldAgent(actor.role)) return filterSliceForFieldAgent(slice, actor)
  return slice
}

export function writePortfolioSnapshot(ownerUserId: string, slice: PortfolioSnapshotSlice): void {
  const store = storage()
  if (!store || !ownerUserId) return
  const env: PortfolioSnapshotEnvelope = {
    ownerUserId,
    fetchedAt: new Date().toISOString(),
    slice,
  }
  try {
    store.setItem(PORTFOLIO_SNAPSHOT_KEY, JSON.stringify(env))
  } catch {
    /* quota — non-fatal */
  }
}

export function writePortfolioSnapshotFromState(
  ownerUserId: string,
  state: PortfolioSnapshotSource,
  actor?: PortfolioSnapshotActor | null,
): void {
  if (!ownerUserId) return
  writePortfolioSnapshot(ownerUserId, pickPortfolioSnapshotSlice(state, actor))
}

export function readPortfolioSnapshot(
  currentUserId: string | null | undefined,
  actor?: PortfolioSnapshotActor | null,
): PortfolioSnapshotSlice | null {
  if (!currentUserId) return null
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PORTFOLIO_SNAPSHOT_KEY)
    if (!raw) return null
    const env = JSON.parse(raw) as PortfolioSnapshotEnvelope
    if (!env?.slice || env.ownerUserId !== currentUserId) return null
    const slice: PortfolioSnapshotSlice = {
      properties: env.slice.properties ?? [],
      units: env.slice.units ?? [],
      buildings: env.slice.buildings ?? [],
      viewingSlots: env.slice.viewingSlots ?? [],
      leads: env.slice.leads ?? [],
      tickets: env.slice.tickets ?? [],
    }
    if (actor && isFieldAgent(actor.role)) return filterSliceForFieldAgent(slice, actor)
    return slice
  } catch {
    return null
  }
}

export function hasPortfolioSnapshotForUser(currentUserId: string | null | undefined): boolean {
  return readPortfolioSnapshot(currentUserId) !== null
}

export function clearPortfolioSnapshot(): void {
  const store = storage()
  if (!store) return
  try {
    store.removeItem(PORTFOLIO_SNAPSHOT_KEY)
  } catch {
    /* ignore */
  }
}

/** Merge snapshot portfolio fields into a loaded AppState base (live mode cold start). */
export function mergePortfolioSnapshotIntoState<T extends PortfolioSnapshotSource>(
  base: T,
  currentUserId: string | null | undefined,
  actor?: PortfolioSnapshotActor | null,
): T {
  const snap = readPortfolioSnapshot(currentUserId, actor)
  if (!snap) return base
  return {
    ...base,
    properties: snap.properties,
    units: snap.units,
    buildings: snap.buildings,
    viewingSlots: snap.viewingSlots,
    leads: snap.leads,
    tickets: snap.tickets,
  }
}
