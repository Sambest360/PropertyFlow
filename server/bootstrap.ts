import { query } from './db.js'
import { readTicketAccessNotes, ticketAccessNotesColumnExists } from './ticketAccessNotes.js'
import { isSafePhotoUrl } from '../src/lib/photoLimits.js'
import { fieldsFromLimitSnapshot, listingLimitsFromSettings } from '../src/lib/listingLimitCopy.js'
import { resolveFrontendRole } from '../src/lib/supabase/idMap.js'
import { mapPool } from './mapPool.js'
import { loadIdMapCache } from './idMapCache.js'
import { USER_TO_UUID } from './entityMap.js'
import {
  ACTIVITY_IDS,
  APP_REF_TO_ID,
  BUILDING_TO_FRONTEND,
  DOC_IDS,
  INVOICE_IDS,
  LEAD_IDS,
  LEASE_IDS,
  MESSAGE_IDS,
  NOTIF_IDS,
  PAYMENT_IDS,
  SLOT_IDS,
  SUB_UUID_TO_FE,
  SUITE_ALERT_IDS,
  THREAD_IDS,
  TICKET_IDS,
  UNIT_TO_PROPERTY,
  mapAgency,
  mapProperty,
} from './idMap.js'
import { canonicalListingId, unitIdForProperty } from '../src/lib/listingIds.js'
import { dedupePropertyAssets, dedupeUnits } from '../src/lib/propertyDedupe.js'
import { resolvePropertyType } from '../src/lib/propertyType.js'
import { deriveAgencyContractors } from '../src/lib/contractors.js'
import type { Lead } from '../src/types/domain.js'
import { hydrateDocumentsFromUploadedJson } from '../src/lib/hydrateApplicationDocs.js'
import { normalizeApplication } from '../src/lib/applicationWorkflow.js'
import { mapAgencyStatusFromDb } from '../src/lib/agencyStatus.js'
import {
  mapDbAssetsToInternalAssets,
  mapDbRoomsToInfraRooms,
  type DbInternalAssetRow,
  type DbRoomRow,
} from '../src/lib/infraRoomsFromBootstrap.js'

/** Global config client id — mirrors src/data/platformLookups. */
const GLOBAL_CLIENT_ID = 'global'

type RoleDb =
  | 'SUPER_ADMIN'
  | 'AGENCY_ADMIN'
  | 'AGENT_ADMIN'
  | 'GROUND_AGENT'
  | 'LANDLORD'
  | 'END_USER'
  | 'CONTRACTOR'

const ROLE_MAP: Record<RoleDb, string> = {
  SUPER_ADMIN: 'super_admin',
  AGENCY_ADMIN: 'client_admin',
  AGENT_ADMIN: 'agent_admin',
  GROUND_AGENT: 'ground_agent',
  LANDLORD: 'landlord',
  END_USER: 'tenant',
  CONTRACTOR: 'contractor',
}

function dateOnly(v: Date | string | null | undefined): string {
  if (!v) return ''
  const s = typeof v === 'string' ? v : v.toISOString()
  return s.slice(0, 10)
}

function iso(v: Date | string | null | undefined): string | null {
  if (!v) return null
  return typeof v === 'string' ? v : v.toISOString()
}

function titleCaseStatus(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function docCategory(c: string): string {
  const map: Record<string, string> = {
    TITLE: 'Title',
    COMPLIANCE: 'Compliance',
    LEASE: 'Lease',
    INSPECTION: 'Inspection',
    MARKETING: 'Marketing',
    ID: 'Other',
    INVOICE: 'Other',
    OTHER: 'Other',
  }
  return map[c] ?? 'Other'
}

function paymentType(t: string): string {
  const map: Record<string, string> = {
    DEPOSIT: 'Deposit',
    FIRST_MONTH_RENT: 'First Month Rent',
    RENT: 'Rent',
    SALE_DEPOSIT: 'Sale Deposit',
    COMMISSION: 'Commission',
    REFUND: 'Refund',
    OTHER: 'Other',
  }
  return map[t] ?? 'Other'
}

function paymentStatus(s: string): string {
  const map: Record<string, string> = {
    DUE: 'Due',
    PAID: 'Paid',
    OVERDUE: 'Overdue',
    CANCELLED: 'Cancelled',
  }
  return map[s] ?? s
}

export function ticketPriority(p: string): string {
  const map: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Urgent',
    // Was 'Urgent': escalation never fired after a reload and a staff save
    // wrote URGENT back.
    EMERGENCY: 'Emergency',
  }
  return map[p] ?? 'Medium'
}

export function ticketStatus(s: string): string {
  // MaintenanceTicket['status'] has no 'Open': an open ticket is 'Requested'
  // (the emergency escalation keys on it).
  const map: Record<string, string> = {
    OPEN: 'Requested',
    TRIAGED: 'Requested',
    IN_PROGRESS: 'In Progress',
    AWAITING_PARTS: 'Awaiting Parts',
    RESOLVED: 'Completed',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  }
  return map[s] ?? 'Requested'
}

function viewingStatus(s: string): string {
  const map: Record<string, string> = {
    SCHEDULED: 'Scheduled',
    COMPLETED: 'Completed',
    NO_SHOW: 'No-show',
    CANCELLED: 'Cancelled',
    RESCHEDULED: 'Scheduled',
  }
  return map[s] ?? 'Scheduled'
}

function slotStatus(s: string): string {
  const map: Record<string, string> = {
    OPEN: 'Open',
    FULL: 'Full',
    CANCELLED: 'Cancelled',
  }
  return map[s] ?? 'Open'
}

function appStage(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Started',
    SUBMITTED: 'Documents Pending',
    UNDER_REVIEW: 'Under Review',
    CREDIT_CHECK: 'Credit Check',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    WITHDRAWN: 'Withdrawn',
    LEASED: 'Active Tenancy',
  }
  return map[status] ?? 'Under Review'
}

export type BootstrapLimits = {
  units?: number
  messages?: number
  notifications?: number
  leads?: number
  applications?: number
  tickets?: number
  payments?: number
  documents?: number
}

const DEFAULT_BOOTSTRAP_LIMITS: Required<BootstrapLimits> = {
  units: 250,
  messages: 300,
  notifications: 200,
  leads: 200,
  applications: 200,
  tickets: 200,
  payments: 200,
  documents: 200,
}

const LITE_BOOTSTRAP_LIMITS: Required<BootstrapLimits> = {
  units: 60,
  messages: 80,
  notifications: 80,
  leads: 80,
  applications: 80,
  tickets: 80,
  payments: 80,
  documents: 80,
}

/**
 * CR10 fix 4: the lite bootstrap never carries signature images. Each party
 * block keeps its status / method / hash but drops signatureDataUrl.
 */
export function stripESignImages(eSign: unknown): Record<string, unknown> | null {
  if (!eSign || typeof eSign !== 'object' || Array.isArray(eSign)) return null
  const out: Record<string, unknown> = { ...(eSign as Record<string, unknown>) }
  for (const party of ['tenant', 'landlord']) {
    const b = out[party]
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      const { signatureDataUrl: _drop, ...rest } = b as Record<string, unknown>
      out[party] = rest
    }
  }
  delete out.signatureDataUrl
  return out
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** P3a follow-up: uuid[] for `id = ANY($1::uuid[])` (index on units.id); non-uuids can never match. */
export function unitIdsAsUuids(ids: string[]): string[] {
  return ids.filter((id) => UUID_RE.test(id))
}

export async function buildBootstrap(opts?: {
  limits?: BootstrapLimits
  lite?: boolean
  /**
   * D2: refund read-back scope. A front-end agency id loads refund events only
   * for that agency's deposits; null loads none; undefined (super admin) loads
   * them for every deposit returned.
   */
  refundAgencyFe?: string | null
  /** P3a: read only these units by id (no row window). */
  unitIds?: string[]
}) {
  const unitIds = opts?.unitIds
  const lite = Boolean(opts?.lite)
  const baseLimits = lite ? LITE_BOOTSTRAP_LIMITS : DEFAULT_BOOTSTRAP_LIMITS
  const limits = { ...baseLimits, ...opts?.limits }
  const skipHeavy = lite
  const [
    clients,
    users,
    buildings,
    units,
    rooms,
    assets,
    leads,
    applications,
    leases,
    bookings,
    viewingSlots,
    payments,
    documents,
    tickets,
    threads,
    messages,
    notifications,
    suiteAlerts,
    activities,
    propertyEvents,
    invoices,
    trustTxns,
    trustAllocs,
    payouts,
    deposits,
    arrears,
    csvBatches,
    lookupRows,
    leaseSignedRows,
    supportTicketRows,
  ] = await mapPool(
    [
      () =>
        query<{
          id: string
          company_name: string
          subdomain: string
          status: string
          city: string | null
          created_at: Date
          settings: unknown
        }>(
          'SELECT id, company_name, subdomain, status, city, created_at, settings FROM clients ORDER BY company_name',
        ),
      () =>
        query<{
          id: string
          client_id: string | null
          email: string
          first_name: string
          last_name: string
          phone: string | null
          role: RoleDb
          active: boolean
          metadata: Record<string, unknown> | null
        }>(
          'SELECT id, client_id, email, first_name, last_name, phone, role, active, metadata FROM users ORDER BY email',
        ),
      () =>
        query<{
          id: string
          client_id: string
          landlord_id: string | null
          name: string
          address: string
          city: string
          province: string | null
          suburb: string | null
          grading: string | null
          solar_capacity_kw: string | null
          has_borehole: boolean
          lat: string | null
          lng: string | null
          place_id: string | null
          formatted_address: string | null
          geocoded_at: Date | null
          images: unknown
          created_at: Date
        }>('SELECT * FROM buildings ORDER BY name'),
      () =>
        query<{
          id: string
          building_id: string
          client_id: string
          unit_number: string
          square_meters: string | null
          bedrooms: number | null
          bathrooms: string | null
          parking: number | null
          listing_type: string
          price: string | null
          rent: string | null
          status_config_key: string
          agent_id: string | null
          title: string | null
          description: string | null
          amenities: unknown
          images: unknown
          featured: boolean
          lat: string | null
          lng: string | null
          place_id: string | null
          formatted_address: string | null
      geocoded_at: Date | null
      created_at: Date
      updated_at: Date
        }>(
          ...((unitIds
            ? ['SELECT * FROM units WHERE id = ANY($1::uuid[])', [unitIdsAsUuids(unitIds)]]
            : ['SELECT * FROM units ORDER BY created_at DESC LIMIT $1', [limits.units]]) as [string, unknown[]]),
        ),
      () =>
        skipHeavy
          ? Promise.resolve([] as Array<{
              id: string
              unit_id: string
              client_id: string
              name: string
              room_kind: string
              beds: number
              baths: string | null
              area_sqm: string | null
              layout_x: number | null
              layout_y: number | null
              layout_w: number | null
              layout_h: number | null
            }>)
          : query<{
              id: string
              unit_id: string
              client_id: string
              name: string
              room_kind: string
              beds: number
              baths: string | null
              area_sqm: string | null
              layout_x: number | null
              layout_y: number | null
              layout_w: number | null
              layout_h: number | null
            }>('SELECT * FROM rooms'),
      () =>
        skipHeavy
          ? Promise.resolve([] as Array<{
              id: string
              room_id: string | null
              unit_id: string
              client_id: string
              item_name: string
              serial_number: string | null
              asset_type_key: string
              condition_status: string
              brand: string | null
            }>)
          : query<{
              id: string
              room_id: string | null
              unit_id: string
              client_id: string
              item_name: string
              serial_number: string | null
              asset_type_key: string
              condition_status: string
              brand: string | null
            }>('SELECT * FROM internal_assets'),
      () => query('SELECT * FROM leads ORDER BY created_at DESC LIMIT $1', [limits.leads]),
      () =>
        // P0-sync (R12): newest first — ASC submitted_at + LIMIT dropped guest apps
        // past the window while applicants kept optimistic/local copies.
        query('SELECT * FROM applications ORDER BY updated_at DESC NULLS LAST LIMIT $1', [
          limits.applications,
        ]),
      () => query('SELECT * FROM leases ORDER BY start_date'),
      () => query('SELECT * FROM bookings ORDER BY starts_at'),
      () => query('SELECT * FROM viewing_slots ORDER BY slot_date, slot_time'),
      () => query('SELECT * FROM payments ORDER BY due_date LIMIT $1', [limits.payments]),
      () =>
        query('SELECT * FROM documents ORDER BY uploaded_at NULLS LAST LIMIT $1', [
          limits.documents,
        ]),
      () => query('SELECT * FROM maintenance_tickets ORDER BY created_at DESC LIMIT $1', [
        limits.tickets,
      ]),
      () => query('SELECT * FROM message_threads ORDER BY updated_at DESC LIMIT $1', [
        skipHeavy ? 80 : 500,
      ]),
      () => query('SELECT * FROM messages ORDER BY created_at DESC LIMIT $1', [limits.messages]),
      () =>
        query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1', [
          limits.notifications,
        ]),
      () =>
        skipHeavy
          ? Promise.resolve([] as Array<Record<string, unknown>>)
          : query('SELECT * FROM suite_alerts ORDER BY created_at'),
      () =>
        skipHeavy
          ? Promise.resolve([] as Array<Record<string, unknown>>)
          : query(
              `SELECT * FROM event_log WHERE event_type = 'activity' ORDER BY created_at DESC LIMIT 200`,
            ),
      () =>
        skipHeavy
          ? Promise.resolve([] as Array<Record<string, unknown>>)
          : query(
              `SELECT * FROM event_log WHERE event_type = 'property_event' ORDER BY created_at DESC LIMIT 400`,
            ),
      () =>
        skipHeavy
          ? Promise.resolve([] as Array<Record<string, unknown>>)
          : query('SELECT * FROM invoices ORDER BY created_at DESC'),
      // Trust & Banking books (P0-7) — small tables, fetch on both lite/full.
      () => query('SELECT * FROM trust_transactions ORDER BY value_date DESC LIMIT 400'),
      () => query('SELECT * FROM trust_allocations LIMIT 800'),
      () => query('SELECT * FROM payout_instructions ORDER BY created_at DESC LIMIT 200'),
      () => query('SELECT * FROM deposit_holdings ORDER BY created_at DESC LIMIT 200'),
      () =>
        query(
          'SELECT * FROM arrears_snapshots ORDER BY as_of DESC LIMIT 60',
        ),
      () => query('SELECT * FROM csv_import_batches ORDER BY imported_at DESC LIMIT 100'),
      () =>
        query<{
          id: string
          client_id: string
          config_type: string
          key_value: string
          display_label: string
          is_active: boolean
          sort_order: number
          meta: Record<string, unknown> | null
        }>(
          'SELECT id::text AS id, client_id::text, config_type, key_value, display_label, is_active, sort_order, meta FROM client_lookup_configs ORDER BY config_type, sort_order',
        ),
      // CR10: server-written signing audit rows (scoped per actor in scopeGate).
      () =>
        query<Record<string, unknown>>(
          `SELECT id::text AS id, client_id::text AS client_id, subject_id::text AS subject_id,
                  actor_user_id::text AS actor_user_id, payload, created_at
             FROM event_log WHERE event_type = 'lease_signed' ORDER BY created_at DESC`,
        ),
      // CR7 help desk — outside skipHeavy so lite bootstrap carries tickets too.
      // filterBootstrapForActor narrows to own submissions + the viewer's desk.
      () =>
        query(
          `SELECT * FROM event_log WHERE event_type = 'support_ticket' ORDER BY created_at DESC LIMIT 300`,
        ),
    ] as const,
    process.env.VERCEL ? 3 : 8,
    (load) => load(),
  )

  let roomRows = rooms
  let assetRows = assets
  if (skipHeavy && units.length > 0) {
    const unitUuids = units.map((u) => u.id)
    const [scopedRooms, scopedAssets] = await Promise.all([
      query<DbRoomRow>('SELECT * FROM rooms WHERE unit_id = ANY($1::uuid[])', [unitUuids]),
      query<DbInternalAssetRow>('SELECT * FROM internal_assets WHERE unit_id = ANY($1::uuid[])', [
        unitUuids,
      ]),
    ])
    roomRows = scopedRooms
    assetRows = scopedAssets
  }

  // Fresh entity_id_map on every bootstrap — the 30s in-process cache can lag
  // behind creates on another serverless instance and split agency FE ids (ag-*)
  // from user agencyId / scoped rows until sign-in.
  const idCache = await loadIdMapCache(true)
  const userByUuid = labelBootstrapUsers(users as Array<{ id: string; email: string; metadata: Record<string, unknown> | null }>, idCache.userBackendToFe)

  const mapCache = new Map<string, string>()
  for (const [backendId, fe] of idCache.userBackendToFe) {
    mapCache.set(`user:${backendId}`, fe)
  }
  for (const [backendId, fe] of idCache.unitBackendToPropertyFe) {
    mapCache.set(`property:${backendId}`, fe)
    mapCache.set(`unit:${backendId}`, fe)
  }
  // Agency aliases come from the runtime entity_id_map (agency rows) —
  // CLIENT_TO_AGENCY only covers the three legacy seed agencies.
  for (const [backendId, fe] of idCache.agencyBackendToFe) {
    mapCache.set(`agency:${backendId}`, fe)
  }
  // DQ-M1: FE aliases for trust entities so allocate/import survive reload
  {
    const trustTypes = [
      'trust_transaction',
      'trust_allocation',
      'csv_import_batch',
      'payout_instruction',
      'deposit_holding',
      'tenancy',
    ] as const
    const trustRows = await query<{
      entity_type: string
      frontend_id: string
      backend_id: string
    }>(
      `SELECT entity_type, frontend_id, backend_id::text AS backend_id
       FROM entity_id_map
       WHERE entity_type = ANY($1::text[])`,
      [[...trustTypes]],
    )
    for (const row of trustRows) {
      mapCache.set(`${row.entity_type}:${row.backend_id}`, row.frontend_id)
    }
  }
  const mappedFe = (entityType: string, uuid: string, fallback: string) =>
    mapCache.get(`${entityType}:${uuid}`) ?? fallback

  // Agency FE id for any client UUID: entity_id_map alias first, then seed map.
  // Everything with an agencyId must use this so trust books share one id space
  // with agencies/users (scope gate compares against actor.agencyId).
  const agencyFe = (clientId: string | null | undefined): string | null => {
    if (!clientId) return null
    return mapCache.get(`agency:${clientId}`) ?? mapAgency(clientId)
  }

  // P0-5 residual: unmapped backend UUID → Unassigned (null), never leak raw
  // UUID into FE agent scope checks (FA book vs session FE id).
  const USER_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const mapUser = (id: string | null | undefined) => {
    if (!id) return null
    const mapped = userByUuid.get(id)
    if (mapped) return mapped
    if (USER_UUID_RE.test(id)) return null
    return id
  }

  const agencies = clients.map((c) => ({
    id: mappedFe('agency', c.id, mapAgency(c.id)!),
    name: c.company_name,
    slug: c.subdomain,
    city: c.city ?? '',
    status: mapAgencyStatusFromDb(c.status),
    createdAt: dateOnly(c.created_at),
    enabledPermissions: null as null, // AppStore fills defaults
    ...(listingLimitsFromSettings(c.settings)
      ? { settings: { listingLimits: listingLimitsFromSettings(c.settings) } }
      : {}),
  }))

  const appUsers = users.map((u) => {
    const meta = u.metadata ?? {}
    // Same resolution as the session (DB staff roles win; metadata / the
    // designated email list never grant super_admin on a non-SUPER_ADMIN row).
    const feRole = resolveFrontendRole(String(u.role), meta, u.email)
    const verification =
      meta.verification && typeof meta.verification === 'object' ? meta.verification : undefined
    const profile =
      verification &&
      typeof verification === 'object' &&
      (verification as { profile?: unknown }).profile &&
      typeof (verification as { profile: unknown }).profile === 'object'
        ? ((verification as { profile: Record<string, unknown> }).profile)
        : null
    return {
      id: userByUuid.get(u.id)!,
      name: `${u.first_name} ${u.last_name}`.trim(),
      email: u.email,
      role: feRole,
      agencyId: agencyFe(u.client_id),
      phone: u.phone ?? undefined,
      active: u.active,
      enabledPermissions: Array.isArray(meta.enabledPermissions)
        ? meta.enabledPermissions
        : undefined,
      licenseStatus: meta.licenseStatus ?? undefined,
      mentorId: meta.mentorId ?? undefined,
      commissionSharePct:
        typeof meta.commissionSharePct === 'number' ? meta.commissionSharePct : undefined,
      company:
        typeof profile?.company === 'string'
          ? profile.company
          : typeof meta.company === 'string'
            ? meta.company
            : undefined,
      idNumberOrPassport:
        typeof profile?.idNumberOrPassport === 'string'
          ? profile.idNumberOrPassport
          : typeof meta.idNumberOrPassport === 'string'
            ? meta.idNumberOrPassport
            : undefined,
      verification,
      // CR10: own signature only; scopeGate strips it from every other user.
      signature: typeof meta.signature === 'string' ? meta.signature : undefined,
    }
  })

  const mappedBuildings = buildings.map((b) => ({
    id: mappedFe('building', b.id, BUILDING_TO_FRONTEND[b.id] ?? b.id),
    clientId: agencyFe(b.client_id)!,
    landlordId: mapUser(b.landlord_id),
    name: b.name,
    addressLine1: b.address,
    suburb: b.suburb ?? '',
    city: b.city,
    province: b.province ?? '',
    grading: b.grading,
    solarCapacityKw: b.solar_capacity_kw ? Number(b.solar_capacity_kw) : 0,
    hasBorehole: b.has_borehole,
    lat: b.lat ? Number(b.lat) : 0,
    lng: b.lng ? Number(b.lng) : 0,
    placeId: b.place_id,
    formattedAddress: b.formatted_address,
    geocodedAt: iso(b.geocoded_at),
    images: Array.isArray(b.images) ? b.images : [],
    createdAt: dateOnly(b.created_at),
  }))

  const buildingByUuid = new Map(buildings.map((b) => [b.id, b]))
  const feBuildingByUuid = new Map(
    buildings.map((b) => [b.id, BUILDING_TO_FRONTEND[b.id] ?? b.id]),
  )

  const mappedUnits = units.map((u) => {
    const b = buildingByUuid.get(u.building_id)
    return {
      id: unitIdForProperty(canonicalListingId(UNIT_TO_PROPERTY[u.id] ?? mappedFe('property', u.id, mapProperty(u.id) ?? u.id))),
      clientId: agencyFe(u.client_id)!,
      buildingId: feBuildingByUuid.get(u.building_id) ?? u.building_id,
      agentId: mapUser(u.agent_id),
      unitNumber: u.unit_number,
      title: u.title ?? u.unit_number,
      propertyType: (u as { property_type?: string | null }).property_type ?? null,
      squareMeters: u.square_meters ? Number(u.square_meters) : 0,
      bedrooms: u.bedrooms ?? 0,
      bathrooms: u.bathrooms ? Number(u.bathrooms) : 0,
      parking: u.parking ?? 0,
      listingType: u.listing_type.toLowerCase() === 'both' ? 'both' : u.listing_type.toLowerCase(),
      price: u.price != null ? Number(u.price) : null,
      rent: u.rent != null ? Number(u.rent) : null,
      statusKey: u.status_config_key,
      description: u.description ?? '',
      amenities: Array.isArray(u.amenities) ? u.amenities : [],
      images: Array.isArray(u.images) ? u.images : [],
      featured: u.featured,
      lat: u.lat ? Number(u.lat) : b?.lat ? Number(b.lat) : 0,
      lng: u.lng ? Number(u.lng) : b?.lng ? Number(b.lng) : 0,
      placeId: u.place_id ?? b?.place_id ?? null,
      formattedAddress: u.formatted_address ?? b?.formatted_address ?? null,
      geocodedAt: iso(u.geocoded_at) ?? iso(b?.geocoded_at ?? null),
      createdAt: dateOnly(u.created_at),
      updatedAt: iso(u.updated_at),
      _propertyId: canonicalListingId(mappedFe('property', u.id, mapProperty(u.id)!)),
      _buildingUuid: u.building_id,
      _unitUuid: u.id,
    }
  })

  const limitByUnit = new Map<string, ReturnType<typeof fieldsFromLimitSnapshot>>()
  if (units.length > 0) {
    const snapRows = await query<{ id: string; snap: unknown }>(
      `SELECT id::text AS id, unit_listing_limit_snapshot(id) AS snap
         FROM units WHERE id = ANY($1::uuid[])`,
      [units.map((u) => u.id)],
    )
    for (const row of snapRows) limitByUnit.set(row.id, fieldsFromLimitSnapshot(row.snap))
  }

  const properties = mappedUnits.map((u) => {
    const b = mappedBuildings.find((x) => x.id === u.buildingId)
    const unitRooms = roomRows.filter((r) => r.unit_id === u._unitUuid)
    const unitAssets = assetRows.filter((a) => a.unit_id === u._unitUuid)
    const statusKey = u.statusKey
    const deletedAt = statusKey === 'DELETED' ? u.updatedAt : null
    const status =
      statusKey === 'DELETED'
        ? 'Archived'
        : statusKey === 'OCCUPIED'
          ? 'Rented'
          : statusKey === 'MAINTENANCE'
            ? 'Maintenance'
            : statusKey === 'DRAFT' || statusKey === 'OFF_MARKET' || statusKey === 'NOT_LISTED'
              ? 'Draft'
              : u.featured
                ? 'Featured'
                : 'Published'

    return {
      id: u._propertyId,
      agencyId: u.clientId,
      landlordId: b?.landlordId ?? '',
      agentId: u.agentId,
      buildingId: u.buildingId,
      unitId: u.id,
      title: u.title,
      type: resolvePropertyType({ stored: u.propertyType, bedrooms: u.bedrooms }),
      status,
      deletedAt,
      listingMode: u.listingType === 'sale' || u.listingType === 'rent' || u.listingType === 'both'
        ? u.listingType
        : 'rent',
      ...limitByUnit.get(u._unitUuid),
      price: u.price,
      rent: u.rent,
      beds: u.bedrooms,
      baths: u.bathrooms,
      parking: u.parking,
      area: u.squareMeters,
      city: b?.city ?? '',
      suburb: b?.suburb ?? '',
      address: b ? `${b.addressLine1}${u.unitNumber !== 'HOUSE' && u.unitNumber !== 'MAIN' ? `, ${u.unitNumber}` : ''}` : u.title,
      lat: u.lat,
      lng: u.lng,
      placeId: u.placeId,
      formattedAddress: u.formattedAddress,
      geocodedAt: u.geocodedAt,
      images: u.images.length ? u.images : (b?.images ?? []),
      rooms: unitRooms.map((r) => ({
        id: r.id,
        name: r.name,
        beds: r.beds,
        baths: r.baths ? Number(r.baths) : 0,
        area: r.area_sqm ? Number(r.area_sqm) : undefined,
        kind: r.room_kind,
        layout:
          r.layout_x != null
            ? { x: r.layout_x, y: r.layout_y ?? 0, w: r.layout_w ?? 20, h: r.layout_h ?? 20 }
            : undefined,
      })),
      internalAssets: unitAssets.map((a) => ({
        id: a.id,
        roomId: a.room_id,
        itemName: a.item_name,
        serialNumber: a.serial_number ?? undefined,
        assetTypeKey: a.asset_type_key,
        condition: titleCaseStatus(a.condition_status),
        brand: a.brand ?? undefined,
      })),
      amenities: u.amenities,
      description: u.description,
      featured: u.featured,
      createdAt: u.createdAt,
      solarCapacityKw: b?.solarCapacityKw,
      hasBorehole: b?.hasBorehole,
      grading: b?.grading,
    }
  })

  const mappedLeads = (leads as Array<Record<string, unknown>>).map((l) => ({
    id: mappedFe('lead', l.id as string, LEAD_IDS[l.id as string] ?? (l.id as string)),
    agencyId: agencyFe(l.client_id as string)!,
    propertyId: mapProperty(l.unit_id as string | null) ?? '',
    agentId: mapUser(l.agent_id as string | null),
    name: l.name as string,
    email: (l.email as string) ?? '',
    phone: (l.phone as string) ?? '',
    channel: (l.channel as string) ?? '',
    stage: l.stage as string,
    type: (l.interest_type as string) === 'BUY' ? 'Buy' : 'Rent',
    value: l.value_amount != null ? Number(l.value_amount) : 0,
    notes: (l.notes as string) ?? '',
    metadata: (l.metadata as Lead['metadata'] | null) ?? undefined,
    createdAt: dateOnly(l.created_at as Date),
    updatedAt: dateOnly(l.updated_at as Date),
  }))

  const mappedApps = (applications as Array<Record<string, unknown>>).map((a) => {
    const ref = a.reference_code as string
    const meta = (a.metadata as Record<string, unknown> | null) ?? {}
    const stageFromMeta = typeof meta.stage === 'string' ? meta.stage : null
    // P0-sync (R12): denormalised guest identity — users join can miss fresh applicants.
    const metaName =
      (typeof meta.applicant_name === 'string' && meta.applicant_name.trim()) ||
      (typeof meta.applicantName === 'string' && meta.applicantName.trim()) ||
      ''
    const metaEmail =
      (typeof meta.applicant_email === 'string' && meta.applicant_email) ||
      (typeof meta.email === 'string' && meta.email) ||
      ''
    const type = (a.application_type as string) === 'PURCHASE' ? 'Purchase' : 'Rental'
    const workflowStatusFromMeta =
      typeof meta.workflow_status === 'string' && meta.workflow_status
        ? meta.workflow_status
        : null
    const hydrated = hydrateDocumentsFromUploadedJson(type as 'Purchase' | 'Rental', a.uploaded_docs_json)
    const creditCheck =
      hydrated.creditCheck ??
      ((a.status as string) === 'CREDIT_CHECK' ? 'In Progress' : 'Not Started')
    const screeningFromMeta =
      meta.screening && typeof meta.screening === 'object' && !Array.isArray(meta.screening)
        ? meta.screening
        : null
    return {
      id: APP_REF_TO_ID[ref] ?? ref,
      agencyId: agencyFe(a.client_id as string)!,
      propertyId: mapProperty(a.unit_id as string)!,
      agentId: mapUser(a.agent_id as string | null),
      applicantUserId: mapUser(a.applicant_id as string | null),
      applicantName: metaName || 'Applicant',
      email: metaEmail,
      phone: typeof meta.phone === 'string' ? meta.phone : '',
      type,
      workflowStatus: workflowStatusFromMeta ?? undefined,
      stage: stageFromMeta ?? appStage(a.status as string),
      progress: typeof meta.progress === 'number' ? meta.progress : 50,
      income: a.monthly_income != null ? Number(a.monthly_income) : 0,
      employment: (a.employment_summary as string) ?? '',
      creditCheck,
      creditConsent: hydrated.creditConsent ?? true,
      documents: hydrated.documents,
      docs: hydrated.documents.filter((d) => d.status !== 'required').map((d) => d.label),
      screening: hydrated.screening ?? screeningFromMeta ?? undefined,
      viewingSlotId: null,
      notes: (a.message as string) ?? '',
      moveInDate: dateOnly(a.move_in_date as Date | null) || undefined,
      keyCollection: (meta.keyCollection as Record<string, unknown> | undefined) ?? undefined,
      submittedAt: dateOnly(a.submitted_at as Date | null) || dateOnly(a.created_at as Date),
      updatedAt: dateOnly(a.updated_at as Date),
      _applicantUuid: a.applicant_id as string | null,
    }
  })

  // Enrich applicant names from users
  for (const a of mappedApps) {
    if (a._applicantUuid) {
      const u = users.find((x) => x.id === a._applicantUuid)
      if (u) {
        a.applicantName = `${u.first_name} ${u.last_name}`.trim()
        a.email = u.email
        a.phone = u.phone ?? ''
      }
    }
    delete (a as { _applicantUuid?: string })._applicantUuid
  }

  // Fill known APP-904 / APP-905 contact details from seed story
  for (const a of mappedApps) {
    if (a.id === 'APP-904') {
      a.applicantName = 'Riaan Botha'
      a.email = 'riaan.b@email.com'
      a.phone = '+27 82 333 4411'
    }
    if (a.id === 'APP-905') {
      a.applicantName = 'Sarie du Plessis'
      a.email = 'sarie.dp@email.com'
      a.phone = '+27 44 555 9911'
    }
  }

  // Mode A Sipho: preserve TN↔APP join across rehydrate (was hardcoded null).
  const appUuidToFeId = new Map<string, string>()
  for (const a of applications as Array<Record<string, unknown>>) {
    const ref = a.reference_code as string
    const fe = mappedFe('application', a.id as string, APP_REF_TO_ID[ref] ?? ref)
    appUuidToFeId.set(a.id as string, fe)
  }

  const tenancies = (leases as Array<Record<string, unknown>>).map((l) => {
    const tenantUserId = mapUser(l.tenant_id as string | null)
    const tenant = appUsers.find((x) => x.id === tenantUserId)
    const meta = (l.metadata as Record<string, unknown> | null) ?? {}
    const kcMeta = meta.keyCollection
    const keyCollection =
      kcMeta && typeof kcMeta === 'object' && !Array.isArray(kcMeta)
        ? {
            location: String((kcMeta as Record<string, unknown>).location ?? 'Agency office'),
            instructions: String((kcMeta as Record<string, unknown>).instructions ?? 'Bring ID.'),
            contactName: String(
              (kcMeta as Record<string, unknown>).contactName ?? tenant?.name ?? 'Agent',
            ),
            contactPhone: String((kcMeta as Record<string, unknown>).contactPhone ?? ''),
            ...((kcMeta as Record<string, unknown>).emailSentAt
              ? { emailSentAt: String((kcMeta as Record<string, unknown>).emailSentAt) }
              : {}),
          }
        : {
            location: typeof kcMeta === 'string' ? kcMeta : 'Agency office',
            instructions: typeof meta.notes === 'string' ? meta.notes : 'Bring ID.',
            contactName: tenant?.name ?? 'Agent',
            contactPhone: '',
          }
    return {
      id: mappedFe('tenancy', l.id as string, LEASE_IDS[l.id as string] ?? (l.id as string)),
      agencyId: agencyFe(l.client_id as string)!,
      propertyId: mappedFe('property', l.unit_id as string, mapProperty(l.unit_id as string)!),
      landlordId: mapUser(l.landlord_id as string | null) ?? '',
      agentId: mapUser(l.agent_id as string | null),
      applicationId: l.application_id
        ? (appUuidToFeId.get(l.application_id as string) ?? null)
        : null,
      tenantUserId,
      tenantName: tenant?.name ?? 'Tenant',
      tenantEmail: tenant?.email ?? '',
      startDate: dateOnly(l.start_date as Date),
      endDate: dateOnly(l.end_date as Date | null) || null,
      rent: Number(l.rent_amount),
      deposit: Number(l.deposit_amount),
      rentDueDay: Math.min(28, Math.max(1, Number(l.rent_due_day) || 1)),
      status: (l.status as string) === 'ACTIVE' ? ('Active' as const) : ('Pending Move-In' as const),
      leaseStatus: String(l.status ?? '').toLowerCase() as
        | 'pending'
        | 'active'
        | 'notice'
        | 'ended'
        | 'cancelled',
      keyCollection,
      leaseDocumentId: (meta.leaseDocumentId as string | null | undefined) ?? null,
      leasePdfUrl: (meta.leasePdfUrl as string | null | undefined) ?? null,
      eSign: lite ? stripESignImages(meta.eSign) : ((meta.eSign as Record<string, unknown> | null | undefined) ?? null),
      renewalOps: (meta.renewalOps as Record<string, unknown> | null | undefined) ?? null,
      billingSchedule: (meta.billingSchedule as Record<string, unknown> | null | undefined) ?? null,
    }
  })

  const viewings = (bookings as Array<Record<string, unknown>>).map((b, i) => {
    const starts = new Date(b.starts_at as string | Date)
    const slotUuid = b.slot_id as string | null
    return {
      id: mappedFe('viewing', b.id as string, `VW-pg-${i + 1}`),
      agencyId: agencyFe(b.client_id as string)!,
      propertyId: mapProperty(b.unit_id as string)!,
      agentId: mapUser(b.agent_id as string | null) ?? '',
      slotId: slotUuid
        ? mappedFe('viewing_slot', slotUuid, SLOT_IDS[slotUuid] ?? slotUuid)
        : null,
      applicantName: b.visitor_name as string,
      applicantEmail: (b.visitor_email as string) ?? undefined,
      date: dateOnly(starts),
      time: starts.toISOString().slice(11, 16),
      status: viewingStatus(b.status as string),
      attendance:
        (b.status as string) === 'COMPLETED'
          ? 'Attended'
          : (b.status as string) === 'NO_SHOW'
            ? 'No-show'
            : '—',
      feedback: (b.feedback as string) ?? undefined,
      notes: (b.notes as string) ?? undefined,
    }
  })

  const mappedViewingSlots = (viewingSlots as Array<Record<string, unknown>>).map((s, i) => ({
    id: mappedFe(
      'viewing_slot',
      s.id as string,
      SLOT_IDS[s.id as string] ?? `VS-pg-${i + 1}`,
    ),
    agencyId: agencyFe(s.client_id as string)!,
    propertyId: mapProperty(s.unit_id as string)!,
    agentId: mapUser(s.agent_id as string | null) ?? '',
    date: dateOnly(s.slot_date as Date | string),
    time: String(s.slot_time).slice(0, 5),
    capacity: Number(s.capacity),
    booked: Number(s.booked_count),
    status: slotStatus(s.status as string),
    title: (s.title as string) ?? undefined,
    notes: (s.notes as string) ?? undefined,
    durationMinutes: s.duration_minutes != null ? Number(s.duration_minutes) : undefined,
  }))

  const mappedSuiteAlerts = (suiteAlerts as Array<Record<string, unknown>>).map((r) => ({
    id: mappedFe(
      'suite_alert',
      r.id as string,
      SUITE_ALERT_IDS[r.id as string] ?? (r.id as string),
    ),
    agencyId: agencyFe(r.client_id as string | null),
    resource: r.resource as string,
    actions: Array.isArray(r.actions) ? r.actions : [],
    enabled: Boolean(r.enabled),
    popupEnabled: Boolean(r.popup_enabled),
    popupDurationMs: Number(r.popup_duration_ms) || 6000,
    notifyRoles: Array.isArray(r.notify_roles) ? r.notify_roles : [],
  }))

  const mappedActivities = (activities as Array<Record<string, unknown>>).map((e, i) => {
    const payload = (e.payload as Record<string, unknown>) ?? {}
    return {
      id: mappedFe(
        'activity',
        e.id as string,
        ACTIVITY_IDS[e.id as string] ?? `act-pg-${i + 1}`,
      ),
      agencyId: agencyFe(e.client_id as string | null),
      text: String(payload.text ?? ''),
      user: String(payload.user ?? 'System'),
      at: iso(e.created_at as Date)!,
    }
  })

  const mappedPropertyEvents = (propertyEvents as Array<Record<string, unknown>>).map((e, i) => {
    const payload = (e.payload as Record<string, unknown>) ?? {}
    const subjectUnit = e.subject_id as string | null
    const propertyId =
      (payload.propertyId as string) ||
      (subjectUnit ? mapProperty(subjectUnit) : null) ||
      ''
    return {
      id: mappedFe('property_event', e.id as string, `pe-pg-${i + 1}`),
      agencyId: agencyFe(e.client_id as string)!,
      propertyId,
      actorUserId: mapUser(e.actor_user_id as string | null),
      actorName: String(payload.actorName ?? 'System'),
      action: String(payload.action ?? 'updated'),
      at: iso(e.created_at as Date)!,
      changes: Array.isArray(payload.changes) ? payload.changes : undefined,
    }
  })

  // CR10: lease_signed rows -> LeaseSignEvent (never an image; hash only).
  const mappedLeaseSignEvents = (leaseSignedRows as Array<Record<string, unknown>>).map((e) => {
    const p = (e.payload as Record<string, unknown>) ?? {}
    const leaseUuid = (e.subject_id as string | null) ?? (p.leaseId as string | null) ?? null
    return {
      id: String(e.id),
      tenancyId: leaseUuid ? mappedFe('tenancy', leaseUuid, LEASE_IDS[leaseUuid] ?? String(p.tenancyId ?? leaseUuid)) : String(p.tenancyId ?? ''),
      agencyId: agencyFe(e.client_id as string),
      envelopeId: typeof p.envelopeId === 'string' ? p.envelopeId : null,
      party: p.party === 'landlord' ? 'landlord' : 'tenant',
      signerUserId: mapUser(e.actor_user_id as string | null),
      role: typeof p.role === 'string' ? p.role : null,
      method: typeof p.method === 'string' ? p.method : null,
      onBehalf: p.on_behalf === true,
      outcome: p.outcome === 'declined' ? ('declined' as const) : ('signed' as const),
      onBehalfConfirmation: typeof p.on_behalf_confirmation === 'string' ? p.on_behalf_confirmation : null,
      imageSha256: typeof p.image_sha256 === 'string' ? p.image_sha256 : null,
      signedAt: typeof p.signed_at === 'string' ? p.signed_at : iso(e.created_at as Date),
      ip: typeof p.ip === 'string' ? p.ip : null,
      userAgent: typeof p.user_agent === 'string' ? p.user_agent : null,
    }
  })

  const mappedSupportTickets = (supportTicketRows as Array<Record<string, unknown>>).map((e) => {
    const payload = (e.payload as Record<string, unknown>) ?? {}
    const uuid = e.id as string
    const text = (v: unknown) => (typeof v === 'string' ? v : '')
    return {
      id: text(payload.frontendId) || mappedFe('support_ticket', uuid, uuid),
      agencyId: agencyFe(e.client_id as string | null),
      submittedByUserId:
        text(payload.submittedByUserId) || mapUser(e.actor_user_id as string | null) || '',
      submitterName: text(payload.submitterName),
      submitterRole: text(payload.submitterRole),
      subject: text(payload.subject),
      body: text(payload.body),
      status: payload.status === 'resolved' ? 'resolved' : 'open',
      createdAt: iso(e.created_at as Date)!,
      resolvedByUserId: text(payload.resolvedByUserId) || null,
      resolvedByName: text(payload.resolvedByName) || null,
      resolvedAt: text(payload.resolvedAt) || null,
      resolutionNote: text(payload.resolutionNote) || null,
    }
  })

  const mappedInvoices = (invoices as Array<Record<string, unknown>>).map((inv) => ({
    id: mappedFe(
      'invoice',
      inv.id as string,
      INVOICE_IDS[inv.id as string] ?? (inv.id as string),
    ),
    clientId: agencyFe(inv.client_id as string)!,
    subscriptionId: inv.subscription_id
      ? (SUB_UUID_TO_FE[inv.subscription_id as string] ?? (inv.subscription_id as string))
      : null,
    billingPeriodStart: dateOnly(inv.billing_period_start as Date | string),
    billingPeriodEnd: dateOnly(inv.billing_period_end as Date | string),
    baseAmount: Number(inv.base_amount),
    assetUsageAmount: Number(inv.asset_usage_amount),
    vatAmount: Number(inv.vat_amount),
    totalAmountDue: Number(inv.total_amount_due),
    paymentStatus: inv.payment_status as string,
    lineItems: Array.isArray(inv.line_items) ? inv.line_items : [],
    createdAt: iso(inv.created_at as Date)!,
  }))

  // --- Trust & Banking books (P0-7): map client_id → FE agencyId, users → FE ids ---
  const mappedTrustTxns = (trustTxns as Array<Record<string, unknown>>).map((t) => ({
    id: mappedFe('trust_transaction', t.id as string, t.id as string),
    agencyId: agencyFe(t.client_id as string)!,
    direction: t.direction as string,
    amountCents: Number(t.amount_cents),
    currency: (t.currency as string) ?? 'ZAR',
    valueDate: dateOnly(t.value_date as Date | string),
    postedAt: iso(t.posted_at as Date) ?? new Date().toISOString(),
    partnerTxnId: (t.partner_txn_id as string) ?? null,
    bankRef: (t.bank_ref as string) ?? null,
    description: (t.description as string) ?? '',
    counterpartyHash: (t.counterparty_hash as string) ?? null,
    status: t.status as string,
    rawPayloadDocumentId: (t.raw_payload_document_id as string) ?? null,
    createdAt: iso(t.created_at as Date) ?? new Date().toISOString(),
    updatedAt: iso(t.updated_at as Date) ?? new Date().toISOString(),
  }))

  const txnUuidToFe = new Map(
    (trustTxns as Array<Record<string, unknown>>).map((t) => [
      t.id as string,
      mappedFe('trust_transaction', t.id as string, t.id as string),
    ]),
  )

  const mappedTrustAllocs = (trustAllocs as Array<Record<string, unknown>>).map((a) => ({
    id: mappedFe('trust_allocation', a.id as string, a.id as string),
    agencyId: agencyFe(a.client_id as string)!,
    trustTransactionId: a.trust_transaction_id
      ? (txnUuidToFe.get(a.trust_transaction_id as string) ?? (a.trust_transaction_id as string))
      : '',
    occupancyId: a.occupancy_id
      ? (mapCache.get(`tenancy:${a.occupancy_id as string}`) ??
          LEASE_IDS[a.occupancy_id as string] ??
          (a.occupancy_id as string))
      : null,
    bucketCode: (a.bucket_code as string) ?? 'unallocated',
    chargeId: (a.charge_id as string) ?? null,
    amountCents: Number(a.amount_cents),
    allocatedBy: mapUser(a.allocated_by as string | null) ?? '',
    allocatedAt: iso(a.allocated_at as Date) ?? new Date().toISOString(),
  }))

  const mappedPayouts = (payouts as Array<Record<string, unknown>>).map((p) => ({
    id: mappedFe('payout_instruction', p.id as string, p.id as string),
    agencyId: agencyFe(p.client_id as string)!,
    occupancyId: (p.occupancy_id as string) ?? null,
    propertyId: p.unit_id ? (mapProperty(p.unit_id as string) ?? '') : '',
    payeeType: (p.payee_type as string) ?? 'landlord',
    payeeId: mapUser(p.payee_id as string | null) ?? ((p.payee_id as string) ?? ''),
    bankAccountId: (p.bank_account_id as string) ?? '',
    amountCents: Number(p.amount_cents),
    bucketCode: (p.bucket_code as string) ?? 'owner_payable',
    status: p.status as string,
    proposedBy: mapUser(p.proposed_by as string | null) ?? '',
    approvedBy: mapUser(p.approved_by as string | null),
    submittedAt: iso(p.submitted_at as Date | null),
    settledAt: iso(p.settled_at as Date | null),
    partnerPayoutId: (p.partner_payout_id as string) ?? null,
    failureReason: (p.failure_reason as string) ?? null,
    idempotencyKey: (p.idempotency_key as string) ?? '',
    createdAt: iso(p.created_at as Date) ?? new Date().toISOString(),
    updatedAt: iso(p.updated_at as Date) ?? new Date().toISOString(),
  }))

  // D2: recorded refund splits live in event_log only (no deposit_holdings column).
  let refundByDeposit = new Map<string, Record<string, unknown>>()
  const refundScope = opts?.refundAgencyFe
  const refundDeposits = (deposits as Array<Record<string, unknown>>).filter(
    (d) =>
      d.status === 'refunded' &&
      (refundScope === undefined || (refundScope !== null && agencyFe(d.client_id as string) === refundScope)),
  )
  if (refundDeposits.length) {
    try {
      const { latestRefundBySubject } = await import('./depositRoutes.js')
      refundByDeposit = latestRefundBySubject(
        await query(
          `SELECT id::text AS id, subject_id::text AS subject_id, payload, created_at FROM event_log
            WHERE event_type = 'deposit_refund_recorded' AND subject_type = 'deposit_holding'
              AND subject_id = ANY($1::uuid[]) AND client_id = ANY($2::uuid[])
            ORDER BY created_at DESC`,
          [
            refundDeposits.map((d) => String(d.id)),
            [...new Set(refundDeposits.map((d) => String(d.client_id)))],
          ],
        ),
      )
    } catch (err) {
      console.warn('[bootstrap] deposit refund read-back failed', err instanceof Error ? err.message : err)
    }
  }

  const mappedDeposits = (deposits as Array<Record<string, unknown>>).map((d) => ({
    id: mappedFe('deposit_holding', d.id as string, d.id as string),
    agencyId: agencyFe(d.client_id as string)!,
    occupancyId: (d.occupancy_id as string) ?? '',
    expectedCents: Number(d.expected_cents),
    heldCents: Number(d.held_cents),
    interestAccruedCents: Number(d.interest_accrued_cents),
    status: d.status as string,
    statutoryDeadlineOn: d.statutory_deadline_on
      ? dateOnly(d.statutory_deadline_on as Date | string)
      : null,
    interestRateUnknown: Boolean(d.interest_rate_unknown),
    releaseProposedBy: mapUser(d.release_proposed_by as string | null),
    releaseApprovedBy: mapUser(d.release_approved_by as string | null),
    refund: (refundByDeposit.get(String(d.id)) ?? null) as never,
    createdAt: iso(d.created_at as Date) ?? new Date().toISOString(),
    updatedAt: iso(d.updated_at as Date) ?? new Date().toISOString(),
  }))

  const mappedArrears = (arrears as Array<Record<string, unknown>>).map((s) => ({
    id: mappedFe('arrears', s.id as string, s.id as string),
    agencyId: agencyFe(s.client_id as string)!,
    occupancyId: (s.occupancy_id as string) ?? '',
    asOf: dateOnly(s.as_of as Date | string),
    currentCents: Number(s.current_cents),
    d30: Number(s.d30),
    d60: Number(s.d60),
    d90: Number(s.d90),
    d90plus: Number(s.d90plus),
    createdAt: iso(s.created_at as Date) ?? new Date().toISOString(),
  }))

  const mappedCsvBatches = (csvBatches as Array<Record<string, unknown>>).map((b) => ({
    id: mappedFe('csv_import_batch', b.id as string, b.id as string),
    agencyId: agencyFe(b.client_id as string)!,
    filename: (b.filename as string) ?? '',
    rowCount: Number(b.row_count),
    importedAt: iso(b.imported_at as Date) ?? new Date().toISOString(),
    importedBy: mapUser(b.imported_by as string | null) ?? '',
    status: (b.status as string) === 'pending' ? 'processing' : (b.status as string),
  }))

  const mappedPayments = (payments as Array<Record<string, unknown>>).map((p) => ({
    id: mappedFe('payment', p.id as string, PAYMENT_IDS[p.id as string] ?? (p.id as string)),
    agencyId: agencyFe(p.client_id as string)!,
    propertyId: mapProperty(p.unit_id as string | null) ?? '',
    applicationId: null as string | null,
    tenancyId: p.lease_id ? (LEASE_IDS[p.lease_id as string] ?? (p.lease_id as string)) : null,
    partyName: p.party_name as string,
    partyUserId: mapUser(p.party_user_id as string | null),
    type: paymentType(p.payment_type as string),
    amount: Number(p.amount),
    status: paymentStatus(p.status as string),
    dueDate: dateOnly(p.due_date as Date),
    paidAt: p.paid_at ? dateOnly(p.paid_at as Date) : null,
    method: (p.method as string) ?? null,
    landlordVisible: Boolean(p.landlord_visible),
    reference: (p.reference as string) ?? undefined,
    notes: (p.notes as string) ?? undefined,
    paidAmount: p.paid_amount != null ? Number(p.paid_amount) : undefined,
    attachments: Array.isArray(p.attachments) ? p.attachments : [],
    recordedByUserId: mapUser(p.recorded_by as string | null),
    recordedByName: null as string | null,
  }))

  for (const p of mappedPayments) {
    if (p.recordedByUserId) {
      const u = appUsers.find((x) => x.id === p.recordedByUserId)
      p.recordedByName = u?.name ?? null
    }
  }

  const propertyDocuments = (documents as Array<Record<string, unknown>>).map((d) => ({
    id: mappedFe('document', d.id as string, DOC_IDS[d.id as string] ?? (d.id as string)),
    agencyId: agencyFe(d.client_id as string)!,
    propertyId: mapProperty(d.unit_id as string | null) ?? '',
    name: d.name as string,
    category: docCategory(d.category as string),
    // Raw documents.category (e.g. 'ID') — the FE category folds ID into Other;
    // the scope gate classifies applicant-pack files by it.
    sourceType: (d.category as string) ?? null,
    status: (d.status as string).toLowerCase(),
    uploadedAt: dateOnly(d.uploaded_at as Date | null) || dateOnly(d.created_at as Date),
    fileUrl: (d.storage_url as string) ?? undefined,
    note: (d.note as string) ?? undefined,
    applicationId: d.application_id
      ? (appUuidToFeId.get(d.application_id as string) ?? null)
      : (null as string | null),
    // Links the scope gate uses for the portal own-rows rule (tenant docs).
    tenancyId: d.lease_id
      ? mappedFe(
          'tenancy',
          d.lease_id as string,
          LEASE_IDS[d.lease_id as string] ?? (d.lease_id as string),
        )
      : (null as string | null),
    uploadedByUserId: mapUser(d.uploaded_by as string | null),
    applicantName: (d.applicant_name as string) ?? undefined,
  }))

  const mappedTickets = (tickets as Array<Record<string, unknown>>).map((t) => ({
    id: mappedFe('ticket', t.id as string, TICKET_IDS[t.id as string] ?? (t.id as string)),
    agencyId: agencyFe(t.client_id as string)!,
    propertyId: mapProperty(t.unit_id as string)!,
    unitId: null as string | null,
    categoryKey: (t.category_key as string) ?? undefined,
    assetLabel: undefined as string | undefined,
    reportedBy: 'Reporter',
    reportedByUserId: mapUser(t.reported_by as string | null),
    // Tenancy link (lease_id), same FE id form as the tenancies list.
    tenancyId: t.lease_id
      ? mappedFe('tenancy', t.lease_id as string, LEASE_IDS[t.lease_id as string] ?? (t.lease_id as string))
      : (null as string | null),
    title: t.title as string,
    priority: ticketPriority(t.priority as string),
    status: ticketStatus(t.status as string),
    contractorId: mapUser(t.contractor_id as string | null),
    assignedAgentId: mapUser(t.assigned_to as string | null),
    cost: t.cost_actual != null ? Number(t.cost_actual) : t.cost_estimate != null ? Number(t.cost_estimate) : 0,
    photos: Array.isArray(t.photos) ? (t.photos as unknown[]).length : 0,
    // Stored photo URLs (data:image or http(s)); the tenant view keeps them on
    // the tenant's own reports only, so the rule holds after a reload.
    // Same URL rule as the writer: old rows can't put javascript: etc. into an href.
    photoUrls: Array.isArray(t.photos) ? (t.photos as unknown[]).filter(isSafePhotoUrl) : ([] as string[]),
    openedAt: dateOnly(t.created_at as Date),
    openedAtIso: iso(t.created_at as Date),
    description: t.description as string,
    accessNotes: readTicketAccessNotes(t),
    resolutionNotes: undefined as string | undefined,
    resolvedAt: iso(t.completed_at as Date | null),
    warrantyCovered: Boolean(t.warranty_covered),
    escalatedAt: iso(t.escalated_at as Date | null),
    // Responsibility rule snapshot (migration 029; absent columns read as unset).
    responsibleParty: (t.responsible_party as string | null | undefined) ?? null,
    ruleItemId: (t.rule_item_id as string | null | undefined) ?? null,
    isSafetyFlag: Boolean(t.is_safety_flag),
    overrideReason: (t.override_reason as string | null | undefined) ?? null,
  }))

  for (const t of mappedTickets) {
    if (t.reportedByUserId) {
      const u = appUsers.find((x) => x.id === t.reportedByUserId)
      if (u) t.reportedBy = u.name
    }
  }

  const mappedThreads = (threads as Array<Record<string, unknown>>).map((th) => {
    const parts = Array.isArray(th.participant_ids) ? (th.participant_ids as string[]) : []
    return {
      id: mappedFe('thread', th.id as string, THREAD_IDS[th.id as string] ?? (th.id as string)),
      agencyId: agencyFe(th.client_id as string)!,
      propertyId: th.unit_id
        ? mappedFe('property', th.unit_id as string, mapProperty(th.unit_id as string)!)
        : null,
      applicationId: null as string | null,
      subject: th.subject as string,
      participantIds: parts.map((p) => userByUuid.get(p) ?? p),
      routesTo:
        (th.routes_to as string) === 'AGENCY'
          ? 'agency'
          : (th.routes_to as string) === 'LANDLORD'
            ? 'landlord'
            : 'agent',
      updatedAt: iso(th.updated_at as Date)!,
    }
  })

  const mappedMessages = (messages as Array<Record<string, unknown>>).map((m) => ({
    id: mappedFe('message', m.id as string, MESSAGE_IDS[m.id as string] ?? (m.id as string)),
    threadId: mappedFe(
      'thread',
      m.thread_id as string,
      THREAD_IDS[m.thread_id as string] ?? (m.thread_id as string),
    ),
    agencyId: agencyFe(m.client_id as string)!,
    fromUserId: mapUser(m.from_user_id as string)!,
    body: m.body as string,
    at: iso(m.created_at as Date)!,
  }))

  const mappedNotifications = (notifications as Array<Record<string, unknown>>).map((n) => ({
    id: mappedFe(
      'notification',
      n.id as string,
      NOTIF_IDS[n.id as string] ?? (n.id as string),
    ),
    userId: mapUser(n.user_id as string)!,
    agencyId: agencyFe(n.client_id as string | null),
    title: n.title as string,
    body: n.body as string,
    at: iso(n.created_at as Date)!,
    read: Boolean(n.read_at),
    link: (n.link_path as string) ?? undefined,
    resource: (n.resource_type as string) ?? undefined,
    action: (n.action_type as string) ?? undefined,
  }))

  // Strip internal fields from units for client
  const cleanUnits = mappedUnits.map(({ _propertyId: _p, _buildingUuid: _b, _unitUuid: _u, ...rest }) => rest)

  // Include configured lookup rows (id-map meta stripped from the payload;
  // type-specific meta such as LEAD_STAGE requirements is preserved).
  const mappedLookups = (lookupRows as Array<Record<string, unknown>>).map((l) => {
    const meta = (l.meta as Record<string, unknown> | null) ?? {}
    const { frontend_id: _fid, frontend_client_id: _fcid, ...extraMeta } = meta
    return {
      id: mappedFe('lookup', l.id as string, `lk-pg-${l.id as string}`),
      clientId: agencyFe(l.client_id as string) ?? GLOBAL_CLIENT_ID,
      configType: l.config_type as string,
      keyValue: l.key_value as string,
      displayLabel: l.display_label as string,
      isActive: Boolean(l.is_active),
      sortOrder: Number(l.sort_order) || 0,
      ...(Object.keys(extraMeta).length ? { meta: extraMeta } : {}),
    }
  })

  const ticketAccessNotesSupported = await ticketAccessNotesColumnExists()

  const unitUuidToFeId = new Map(mappedUnits.map((u) => [u._unitUuid, u.id]))
  const roomUuidToFeId = new Map(roomRows.map((r) => [r.id, mappedFe('room', r.id, r.id)]))
  const infraRooms = mapDbRoomsToInfraRooms(roomRows, {
    resolveFeId: mappedFe,
    unitUuidToFeId,
    mapAgencyFe: agencyFe,
  })
  const internalAssets = mapDbAssetsToInternalAssets(assetRows, {
    resolveFeId: mappedFe,
    unitUuidToFeId,
    mapAgencyFe: agencyFe,
    roomUuidToFeId,
  })

  const unitsOut = dedupeUnits(cleanUnits)
  const propertiesOut = dedupePropertyAssets(properties, unitsOut)
  const keptUnitIds = new Set(
    propertiesOut.flatMap((p) => [p.unitId, p.id].filter(Boolean) as string[]),
  )
  const unitsScoped = unitsOut.filter((u) => keptUnitIds.has(u.id))

  const idMapRows = await query<{
    entity_type: string
    frontend_id: string
    backend_id: string
  }>(`SELECT entity_type, frontend_id, backend_id::text AS backend_id FROM entity_id_map`)

  return {
    source: 'postgres',
    fetchedAt: new Date().toISOString(),
    idMapRows,
    /** False until migration 013 adds maintenance_tickets.access_notes. */
    ticketAccessNotesSupported,
    agencies,
    users: appUsers,
    buildings: mappedBuildings,
    units: unitsScoped,
    properties: propertiesOut,
    leads: mappedLeads,
    applications: mappedApps.map((row) => normalizeApplication(row as import('../src/types/domain.js').Application)),
    tenancies,
    viewings,
    viewingSlots: mappedViewingSlots,
    payments: mappedPayments,
    propertyDocuments,
    tickets: mappedTickets,
    threads: mappedThreads,
    messages: mappedMessages,
    notifications: mappedNotifications,
    suiteAlerts: mappedSuiteAlerts,
    activities: mappedActivities,
    propertyEvents: mappedPropertyEvents,
    leaseSignEvents: mappedLeaseSignEvents,
    invoices: mappedInvoices,
    agencyContractors: deriveAgencyContractors(appUsers as never),
    trustTransactions: mappedTrustTxns,
    trustAllocations: mappedTrustAllocs,
    payoutInstructions: mappedPayouts,
    depositHoldings: mappedDeposits,
    arrearsSnapshots: mappedArrears,
    csvImportBatches: mappedCsvBatches,
    lookups: mappedLookups,
    supportTickets: mappedSupportTickets,
    infraRooms,
    internalAssets,
  }
}

/**
 * Front-end label per users.id. No email fallback: anyone can register a seed
 * address. Round-tripped idMapCache wins; otherwise metadata.frontend_id, then
 * a static seed id only when USER_TO_UUID[fe] equals this exact uuid.
 */
export function labelBootstrapUsers(
  users: Array<{ id: string; email: string; metadata: Record<string, unknown> | null }>,
  userBackendToFe: Map<string, string>,
): Map<string, string> {
  const staticByUuid = new Map(Object.entries(USER_TO_UUID).map(([fe, uuid]) => [uuid, fe]))
  const out = new Map<string, string>()
  for (const u of users) {
    const meta = u.metadata ?? {}
    const fromMeta = typeof meta.frontend_id === 'string' && meta.frontend_id ? meta.frontend_id : null
    out.set(u.id, fromMeta ?? staticByUuid.get(u.id) ?? u.id)
  }
  for (const [backendId, fe] of userBackendToFe) out.set(backendId, fe)
  return out
}
