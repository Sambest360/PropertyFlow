/**
 * Guest (signed-out) marketplace slice of the bootstrap payload.
 *
 * /api/bootstrap answers 401 without a verified actor. Signed-out visitors on
 * the Postgres-API build still need the real published listings, so they read
 * this slice instead: publicly listed properties, their units and buildings,
 * the listing agencies, public viewing slots, and a name-only directory of the
 * listing landlords / agents. No leads, applications, tenancies, payments,
 * tickets, threads, messages, notifications, trust books or contact details.
 *
 * Listing rule mirrors src/lib/publicListings.ts isPubliclyListed (kept local
 * so the server bundle does not pull extension-less client modules).
 */

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
  if (!PUBLIC_LISTING_STATUSES.has(String(property.status))) return false
  const unitId = str(property.unitId)
  if (unitId) {
    const unit = units.find((u) => u.id === unitId)
    if (unit) {
      if (unit.listingType === 'not_listed') return false
      if (!PUBLIC_UNIT_STATUS_KEYS.has(String(unit.statusKey))) return false
    }
  }
  const landlordId = str(property.landlordId)
  if (landlordId) {
    const status = verificationStatus(users.find((u) => u.id === landlordId))
    if (status === 'pending' || status === 'rejected') return false
  }
  return true
}

export function filterBootstrapForGuest(raw: Row): Row {
  const users = rows(raw.users)
  const units = rows(raw.units)
  const properties = rows(raw.properties)
    .filter((p) => isGuestVisibleProperty(p, units, users))
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
  const directoryIds = new Set(
    [
      ...properties.flatMap((p) => [str(p.landlordId), str(p.agentId)]),
      ...rows(raw.buildings)
        .filter((b) => buildingIds.has(String(b.id)))
        .map((b) => str(b.landlordId)),
    ].filter(Boolean) as string[],
  )
  const directory = users
    .filter((u) => directoryIds.has(String(u.id)))
    .map((u) => {
      const status = verificationStatus(u)
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        agencyId: u.agencyId ?? null,
        active: u.active,
        ...(status ? { verification: { status } } : {}),
      }
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
    .map((s) => ({
      id: s.id,
      agencyId: s.agencyId,
      propertyId: s.propertyId,
      agentId: s.agentId,
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
    users: directory,
    buildings: rows(raw.buildings).filter((b) => buildingIds.has(String(b.id))),
    units: publicUnits,
    properties,
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
