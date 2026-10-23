/**
 * Guest (signed-out) marketplace slice of the bootstrap payload.
 *
 * /api/bootstrap answers 401 without a verified actor. Signed-out visitors on
 * the Postgres-API build still need the real published listings, so they read
 * this slice instead: publicly listed properties, their units and buildings,
 * the listing agencies and public viewing slots. No leads, applications,
 * tenancies, payments, tickets, threads, messages, notifications, trust books,
 * users or contact details.
 *
 * Landlord identity never leaves the server: no landlord name, landlord user
 * id, landlordId or verification status. Agent user ids are dropped too
 * (agentId on properties, units and slots). The listing page already shows
 * "listed by <agent name>", so each property keeps only `agentName`, the
 * agent's display name.
 *
 * Listing rule mirrors src/lib/publicListings.ts isPubliclyListed (kept local
 * so the server bundle does not pull extension-less client modules).
 */

import { isFutureViewingSlot } from './viewingSlotTime.js'
import { isOccupiedAdvert } from '../src/lib/occupiedAdvert.js'

const PUBLIC_LISTING_STATUSES = new Set(['Published', 'Featured', 'Under Offer'])
const PUBLIC_UNIT_STATUS_KEYS = new Set([
  'PUBLISHED',
  'FEATURED',
  'VACANT',
  'UNDER_OFFER',
  'AVAILABLE',
])

type Row = Record<string, unknown>

function rows(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]).filter((r) => r && typeof r === 'object') : []
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

function verificationStatus(u: Row | undefined): string | undefined {
  const v = u?.verification
  if (!v || typeof v !== 'object') return undefined
  const s = (v as Row).status
  return typeof s === 'string' ? s : undefined
}

export function isGuestVisibleProperty(property: Row, units: Row[], users: Row[]): boolean {
  if (property.deletedAt) return false
  const unitId = str(property.unitId)
  const unit = unitId ? units.find((u) => u.id === unitId) : undefined
  // Occupied advert (027): listed while the tenant stays, same predicate as the RPC.
  const occupiedAdvert = unit
    ? isOccupiedAdvert({
        statusKey: str(unit.statusKey),
        listingType: str(unit.listingType),
        advertiseWhileOccupied: Boolean(unit.advertiseWhileOccupied),
        availableFrom: str(unit.availableFrom),
      })
    : false
  if (!occupiedAdvert && !PUBLIC_LISTING_STATUSES.has(String(property.status))) return false
  if (unit) {
    if (unit.listingType === 'not_listed') return false
    if (!occupiedAdvert && !PUBLIC_UNIT_STATUS_KEYS.has(String(unit.statusKey))) return false
  }
  const landlordId = str(property.landlordId)
  if (landlordId) {
    const status = verificationStatus(users.find((u) => u.id === landlordId))
    if (status === 'pending' || status === 'rejected') return false
  }
  return true
}

/** List cards get one image per listing; the single-listing (?id=) read gets them all. */
function firstImageOnly<T extends Row>(r: T): T {
  return Array.isArray(r.images) ? { ...r, images: (r.images as unknown[]).slice(0, 1) } : r
}

/**
 * P3a: guest slice. With `listingId`, only that listing (same visibility
 * filter and id hiding), full images; `properties` is empty when it is not
 * publicly listed or unknown (the route answers 404).
 */
export function filterBootstrapForGuest(raw: Row, opts: { listingId?: string } = {}): Row {
  const out = filterBootstrapForGuestAll(raw, opts.listingId)
  if (opts.listingId) return out
  return {
    ...out,
    properties: rows(out.properties).map(firstImageOnly),
    units: rows(out.units).map(firstImageOnly),
    buildings: rows(out.buildings).map(firstImageOnly),
  }
}

function filterBootstrapForGuestAll(raw: Row, listingId?: string): Row {
  const users = rows(raw.users)
  const units = rows(raw.units)
  const properties = rows(raw.properties)
    .filter((p) => isGuestVisibleProperty(p, units, users))
    .filter((p) => !listingId || String(p.id) === listingId)
    // Serial numbers / inventory are staff data, not listing data.
    .map((p): Row => ({ ...p, internalAssets: [] }))
  const propIds = new Set(properties.map((p) => String(p.id)))
  const unitIds = new Set(
    properties.flatMap((p) => [str(p.unitId), `unt-${String(p.id)}`]).filter(Boolean) as string[],
  )
  const publicUnits = units.filter((u) => unitIds.has(String(u.id)))
  const buildingIds = new Set(
    [
      ...publicUnits.map((u) => str(u.buildingId)),
      ...properties.map((p) => str(p.buildingId)),
    ].filter(Boolean) as string[],
  )
  const agencyIds = new Set(properties.map((p) => str(p.agencyId)).filter(Boolean) as string[])
  const agentNames = new Map(
    users
      .filter((u) => typeof u.id === 'string' && typeof u.name === 'string' && u.name)
      .map((u) => [u.id as string, u.name as string]),
  )
  const publicProperties = properties.map((p): Row => {
    const { landlordId: _l, agentId, ...rest } = p
    void _l
    const agentName = str(agentId) ? (agentNames.get(agentId as string) ?? null) : null
    return { ...rest, landlordId: '', agentId: null, agentName }
  })
  const agencies = rows(raw.agencies)
    .filter((a) => agencyIds.has(String(a.id)))
    .map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      city: a.city,
      status: a.status,
      createdAt: a.createdAt,
      enabledPermissions: null,
    }))
  const viewingSlots = rows(raw.viewingSlots)
    .filter((s) => propIds.has(String(s.propertyId)))
    .filter((s) => {
      const status = String(s.status ?? '')
      if (status && status !== 'Open' && status !== 'OPEN') return false
      const date = String(s.date ?? '')
      const time = String(s.time ?? '')
      if (!date || !time) return false
      const duration =
        typeof s.durationMinutes === 'number'
          ? s.durationMinutes
          : Number(s.durationMinutes ?? 0) || undefined
      return isFutureViewingSlot({ date, time, durationMinutes: duration })
    })
    .map((s) => ({
      id: s.id,
      agencyId: s.agencyId,
      propertyId: s.propertyId,
      agentId: '',
      date: s.date,
      time: s.time,
      capacity: s.capacity,
      booked: s.booked,
      status: s.status,
      title: s.title,
      durationMinutes: s.durationMinutes,
    }))
  return {
    source: raw.source ?? 'postgres',
    fetchedAt: raw.fetchedAt ?? new Date().toISOString(),
    scoped: true,
    guest: true,
    actor: null,
    agencies,
    users: [],
    buildings: rows(raw.buildings)
      .filter((b) => buildingIds.has(String(b.id)))
      .map((b): Row => ({ ...b, landlordId: null })),
    units: publicUnits.map((u): Row => ({ ...u, agentId: null })),
    properties: publicProperties,
    leads: [],
    applications: [],
    tenancies: [],
    viewings: [],
    viewingSlots,
    payments: [],
    propertyDocuments: [],
    tickets: [],
    agencyContractors: [],
    threads: [],
    messages: [],
    notifications: [],
    suiteAlerts: [],
    activities: [],
    propertyEvents: [],
    invoices: [],
    trustTransactions: [],
    trustAllocations: [],
    payoutInstructions: [],
    depositHoldings: [],
    arrearsSnapshots: [],
    csvImportBatches: [],
    lookups: rows(raw.lookups),
  }
}
