/**
 * Supabase bootstrap — mirrors server/bootstrap.ts for AppStore hydration.
 */
import { GLOBAL_CLIENT_ID } from '../../data/platformLookups'
import type { LookupConfig } from '../../data/infrastructure'
import type { Lead } from '../../types/domain'
import type { PostgresBootstrap } from '../api/postgresClient'
import { createClient } from '../../utils/supabase/client'
import { latestRefundBySubject } from '../trust/depositDualControl'
import {
  buildIdMapCache,
  EMAIL_TO_USER,
  feFromCache,
  mapAgency,
  mapProperty,
  mapUser,
  resolveFrontendRole,
  type IdMapCache,
} from './idMap'
import { hydrateDocumentsFromUploadedJson } from '../hydrateApplicationDocs'
import { normalizeApplication } from '../applicationWorkflow'
import { canonicalListingId, unitIdForProperty } from '../listingIds'
import { propertyStatusFromUnit } from '../propertyBootstrapFromUnit'
import { resolvePropertyType } from '../propertyType'
import { deriveAgencyContractors } from '../contractors'
import { mapAgencyStatusFromDb } from '../agencyStatus'
import {
  mapDbAssetsToInternalAssets,
  mapDbRoomsToInfraRooms,
  type DbInternalAssetRow,
  type DbRoomRow,
} from '../infraRoomsFromBootstrap'
import { mapRoutesToFe } from '../messaging/modeA'
import { mapViewingSlotRow } from './viewingSlotMap'
import { ensureBootstrapScopedForActor } from '../applyBootstrapScope'

type RoleDb =
  | 'SUPER_ADMIN'
  | 'AGENCY_ADMIN'
  | 'AGENT_ADMIN'
  | 'GROUND_AGENT'
  | 'LANDLORD'
  | 'END_USER'
  | 'CONTRACTOR'

const LITE_LIMITS = {
  units: 60,
  messages: 80,
  notifications: 80,
  leads: 80,
  applications: 80,
  tickets: 80,
  payments: 80,
  documents: 80,
  threads: 80,
  leases: 120,
  bookings: 80,
  viewingSlots: 80,
  lookups: 400,
  buildings: 80,
  entityIdMap: 5_000,
  users: 500,
}

const FULL_LIMITS = {
  units: 250,
  messages: 300,
  notifications: 200,
  leads: 200,
  applications: 200,
  tickets: 200,
  payments: 200,
  documents: 200,
  threads: 500,
  entityIdMap: 20_000,
  users: 2_000,
}

function dateOnly(v: string | null | undefined): string {
  if (!v) return ''
  return v.slice(0, 10)
}

function iso(v: string | null | undefined): string | null {
  return v ?? null
}

function titleCaseStatus(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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

function appStage(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'Started',
    // P0-3: SUBMITTED maps to the explicit guest-submitted stage; the FE
    // legacy fallback stays for rows persisted before this change.
    SUBMITTED: 'Application submitted',
    UNDER_REVIEW: 'Under Review',
    CREDIT_CHECK: 'Credit Check',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    WITHDRAWN: 'Withdrawn',
    LEASED: 'Active Tenancy',
  }
  return map[status] ?? 'Under Review'
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

function mappedFe(
  cache: IdMapCache,
  entityType: string,
  uuid: string,
  fallback: string,
): string {
  return feFromCache(cache, entityType, uuid, fallback) ?? fallback
}


export type FetchSupabaseBootstrapOpts = {
  /** FE role (`tenant`) or DB role (`END_USER`) — gates tenant apps retry. */
  actorRole?: string | null
  actorUserId?: string | null
  actorAgencyId?: string | null
}

function isTenantBootstrapRole(role?: string | null): boolean {
  const r = (role ?? '').trim().toLowerCase()
  return r === 'tenant' || r === 'end_user' || r === 'applicant'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Await a confirmed JWT on the data client before RLS-scoped selects.
 * AuthContext session proof can exist while createClient() has not yet
 * attached the token — tenant applications then return [] under live chrome.
 */
async function awaitConfirmedDataClientSession(
  supabase: ReturnType<typeof createClient>,
  attempts = 4,
  baseDelayMs = 150,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session?.user?.id) {
      const { data: verified, error } = await supabase.auth.getUser()
      if (!error && verified.user?.id) return true
    }
    if (i < attempts - 1) await delay(baseDelayMs * (i + 1))
  }
  return false
}

async function fetchApplicationsWithTenantRetry(
  supabase: ReturnType<typeof createClient>,
  limit: number,
  actorRole: string | null | undefined,
  initial: { data: Record<string, unknown>[] | null; error: { message?: string } | null },
): Promise<{ data: Record<string, unknown>[]; error: { message?: string } | null }> {
  let data = (initial.data ?? []) as Record<string, unknown>[]
  let error = initial.error

  const tenant = isTenantBootstrapRole(actorRole)
  if (!tenant) {
    return { data, error }
  }

  if (!error && data.length > 0) {
    return { data, error: null }
  }

  console.warn('[bootstrap] tenant applications empty/error; awaiting session + retry', {
    error: error?.message ?? null,
    rows: data.length,
    actorRole: actorRole ?? null,
  })

  const sessionOk = await awaitConfirmedDataClientSession(supabase)
  if (!sessionOk) {
    console.warn('[bootstrap] tenant data-client session not confirmed before applications retry')
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const retry = await supabase
      .from('applications')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (retry.error) {
      console.warn('[bootstrap] applications retry error', {
        attempt: attempt + 1,
        message: retry.error.message,
      })
      error = retry.error
    } else {
      error = null
      data = (retry.data ?? []) as Record<string, unknown>[]
      if (data.length > 0) {
        return { data, error: null }
      }
    }
    if (attempt < 2) await delay(200 * (attempt + 1))
  }

  console.warn('[bootstrap] tenant applications still empty after retries', {
    rows: data.length,
    error: error?.message ?? null,
  })
  return { data, error }
}

/** CR10 N4: the user metadata keys the bootstrap reads (signature is never one of them). */
export const USER_META_KEYS = [
  'frontend_id',
  'frontend_role',
  'verification',
  'enabledPermissions',
  'licenseStatus',
  'mentorId',
  'commissionSharePct',
  'company',
  'idNumberOrPassport',
] as const

export const USERS_SELECT =
  'id, client_id, email, first_name, last_name, phone, role, active, ' +
  USER_META_KEYS.map((k) => `meta_${k}:metadata->${k}`).join(', ')

/** Rebuild `metadata` from the per-key JSON path columns. */
export function rebuildUserMetadata(row: Record<string, unknown>): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('meta_')) {
      if (v !== null && v !== undefined) metadata[k.slice(5)] = v
    } else out[k] = v
  }
  out.metadata = metadata
  return out
}

export async function fetchSupabaseBootstrap(
  lite = true,
  opts?: FetchSupabaseBootstrapOpts,
): Promise<PostgresBootstrap | null> {
  const supabase = createClient()
  const limits = lite ? LITE_LIMITS : FULL_LIMITS
  const skipHeavy = lite
  const actorRole = opts?.actorRole ?? null

  // Tenant remint: confirm JWT on the data client before the parallel select fan-out
  // so applications RLS (applicant_id = current_app_user_id) can see APP rows.
  if (isTenantBootstrapRole(actorRole)) {
    const ok = await awaitConfirmedDataClientSession(supabase)
    if (!ok) {
      console.warn('[bootstrap] tenant session not confirmed on data client before bootstrap')
    }
  }

  const [
    idMapRes,
    clientsRes,
    usersRes,
    buildingsRes,
    unitsRes,
    roomsRes,
    assetsRes,
    leadsRes,
    applicationsRes,
    leasesRes,
    bookingsRes,
    viewingSlotsRes,
    paymentsRes,
    documentsRes,
    ticketsRes,
    threadsRes,
    messagesRes,
    notificationsRes,
    suiteAlertsRes,
    activitiesRes,
    propertyEventsRes,
    invoicesRes,
    lookupsRes,
    trustTxnsRes,
    trustAllocsRes,
    payoutsRes,
    depositsRes,
    arrearsRes,
    csvBatchesRes,
  ] = await Promise.all([

    supabase
      .from('entity_id_map')
      .select('entity_type, backend_id, frontend_id')
      .limit(lite ? LITE_LIMITS.entityIdMap : FULL_LIMITS.entityIdMap),
    supabase.from('clients').select('id, company_name, subdomain, status, city, created_at, settings'),
    // CR10 N4: never read users.metadata whole (it holds other users' signature).
    supabase
      .from('users')
      .select(USERS_SELECT)
      .limit(lite ? LITE_LIMITS.users : FULL_LIMITS.users),
    supabase.from('buildings').select('*').order('name').limit(lite ? LITE_LIMITS.buildings : 10_000),
    supabase.from('units').select('*').order('created_at', { ascending: false }).limit(limits.units),
    skipHeavy
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase.from('rooms').select('*'),
    skipHeavy
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase.from('internal_assets').select('*'),
    supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(limits.leads),
    // P0-sync (R9): order by updated_at (NOT NULL, stamped on every write).
    // The previous submitted_at ordering pushed NULL-submitted_at rows (guest
    // applications written before the submitted_at stamp existed) past the
    // row LIMIT — staff detail/list/search all answered "not found" for an
    // application the applicant could see.
    supabase
      .from('applications')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limits.applications),
    supabase
      .from('leases')
      .select('*')
      .order('start_date')
      .limit(lite ? LITE_LIMITS.leases : 10_000),
    supabase
      .from('bookings')
      .select('*')
      .order('starts_at')
      .limit(lite ? LITE_LIMITS.bookings : 10_000),
    supabase
      .from('viewing_slots')
      .select('*')
      .order('slot_date')
      .limit(lite ? LITE_LIMITS.viewingSlots : 10_000),
    supabase.from('payments').select('*').order('due_date').limit(limits.payments),
    supabase.from('documents').select('*').order('uploaded_at', { ascending: false, nullsFirst: false }).limit(limits.documents),
    supabase.from('maintenance_tickets').select('*').order('created_at', { ascending: false }).limit(limits.tickets),
    supabase.from('message_threads').select('*').order('updated_at', { ascending: false }).limit(limits.threads),
    supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(limits.messages),
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limits.notifications),
    skipHeavy
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase.from('suite_alerts').select('*'),
    skipHeavy
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase
          .from('event_log')
          .select('*')
          .eq('event_type', 'activity')
          .order('created_at', { ascending: false })
          .limit(200),
    skipHeavy
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase
          .from('event_log')
          .select('*')
          .eq('event_type', 'property_event')
          .order('created_at', { ascending: false })
          .limit(400),
    skipHeavy
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase.from('invoices').select('*').order('created_at', { ascending: false }),
    supabase
      .from('client_lookup_configs')
      .select('id, client_id, config_type, key_value, display_label, is_active, sort_order, meta')
      .order('config_type')
      .order('sort_order')
      .limit(lite ? LITE_LIMITS.lookups : 10_000),
    // Trust & Banking books (P0-7) — small tables, fetch on both lite/full.
    supabase.from('trust_transactions').select('*').order('value_date', { ascending: false }).limit(400),
    supabase.from('trust_allocations').select('*').limit(800),
    supabase.from('payout_instructions').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('deposit_holdings').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('arrears_snapshots').select('*').order('as_of', { ascending: false }).limit(60),
    supabase.from('csv_import_batches').select('*').order('imported_at', { ascending: false }).limit(100),
  ])

  const clients = clientsRes.data ?? []
  const users = ((usersRes.data ?? []) as unknown as Record<string, unknown>[]).map(rebuildUserMetadata) as unknown as Array<{
    id: string
    client_id: string | null
    email: string
    first_name: string
    last_name: string
    phone: string | null
    role: string
    active: boolean
    metadata: Record<string, unknown> | null
  }>
  const cache = buildIdMapCache(idMapRes.data ?? [], clients)

  const userByUuid = new Map<string, string>()
  for (const u of users) {
    const meta = (u.metadata as Record<string, unknown> | null) ?? {}
    const fromMeta = typeof meta.frontend_id === 'string' ? meta.frontend_id : null
    userByUuid.set(u.id, fromMeta ?? EMAIL_TO_USER[u.email.toLowerCase()] ?? u.id)
  }
  for (const row of idMapRes.data ?? []) {
    if (row.entity_type === 'user') userByUuid.set(row.backend_id, row.frontend_id)
  }

  const mapUserFe = (id: string | null | undefined) => mapUser(cache, userByUuid, id)
  const mapAgencyFe = (id: string | null | undefined) => mapAgency(cache, id)
  const mapPropertyFe = (id: string | null | undefined) => mapProperty(cache, id)

  const agencies = clients
    .filter((c) => {
      const settings = (c.settings as Record<string, unknown> | null) ?? {}
      return settings.frontend_id !== GLOBAL_CLIENT_ID && !settings.isGlobalConfigClient
    })
    .map((c) => {
      const settingsRaw = (c.settings as Record<string, unknown> | null) ?? {}
      const applicationJourney =
        settingsRaw.applicationJourney &&
        typeof settingsRaw.applicationJourney === 'object' &&
        !Array.isArray(settingsRaw.applicationJourney)
          ? (settingsRaw.applicationJourney as import('../journey/types').AgencyJourneyOverride)
          : undefined
      return {
        id: mappedFe(cache, 'agency', c.id, c.id),
        name: c.company_name,
        slug: c.subdomain,
        city: c.city ?? '',
        status: mapAgencyStatusFromDb(c.status),
        createdAt: dateOnly(c.created_at),
        enabledPermissions: null as null,
        settings: applicationJourney ? { applicationJourney } : undefined,
      }
    })

  const appUsers = users.map((u) => {
    const meta = (u.metadata as Record<string, unknown> | null) ?? {}
    const feRole = resolveFrontendRole(u.role as RoleDb, meta, u.email)
    const verification =
      meta.verification && typeof meta.verification === 'object' ? meta.verification : undefined
    return {
      id: userByUuid.get(u.id)!,
      name: `${u.first_name} ${u.last_name}`.trim(),
      email: u.email,
      role: feRole,
      agencyId: mapAgencyFe(u.client_id),
      phone: u.phone ?? undefined,
      active: u.active,
      enabledPermissions: Array.isArray(meta.enabledPermissions) ? meta.enabledPermissions : undefined,
      licenseStatus: meta.licenseStatus ?? undefined,
      mentorId: meta.mentorId ?? undefined,
      commissionSharePct:
        typeof meta.commissionSharePct === 'number' ? meta.commissionSharePct : undefined,
      company: typeof meta.company === 'string' ? meta.company : undefined,
      idNumberOrPassport:
        typeof meta.idNumberOrPassport === 'string' ? meta.idNumberOrPassport : undefined,
      verification,
    }
  })

  const buildings = (buildingsRes.data ?? []).map((b) => ({
    id: mappedFe(cache, 'building', b.id, b.id),
    clientId: mapAgencyFe(b.client_id)!,
    landlordId: mapUserFe(b.landlord_id),
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

  const buildingByUuid = new Map(
    (buildingsRes.data ?? []).map((b) => [b.id, b] as [string, (typeof buildingsRes.data)[number]]),
  )
  const feBuildingByUuid = new Map(
    (buildingsRes.data ?? []).map((b) => [b.id, mappedFe(cache, 'building', b.id, b.id)]),
  )

  const unitsRaw = (unitsRes.data ?? []).map((u) => {
    const b = buildingByUuid.get(u.building_id)
    const statusKey = u.status_config_key
    const rawListing = u.listing_type?.toLowerCase()
    const listingType =
      statusKey === 'DELETED' || rawListing === 'not_listed'
        ? 'not_listed'
        : rawListing === 'both'
          ? 'both'
          : rawListing ?? 'rent'
    return {
      id: unitIdForProperty(canonicalListingId(mapPropertyFe(u.id) ?? u.id)),
      clientId: mapAgencyFe(u.client_id)!,
      buildingId: feBuildingByUuid.get(u.building_id) ?? u.building_id,
      agentId: mapUserFe(u.agent_id),
      unitNumber: u.unit_number,
      title: u.title ?? u.unit_number,
      propertyType: (u as { property_type?: string | null }).property_type ?? null,
      squareMeters: u.square_meters ? Number(u.square_meters) : 0,
      bedrooms: u.bedrooms ?? 0,
      bathrooms: u.bathrooms ? Number(u.bathrooms) : 0,
      parking: u.parking ?? 0,
      listingType,
      price: u.price != null ? Number(u.price) : null,
      rent: u.rent != null ? Number(u.rent) : null,
      statusKey,
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
      _propertyId: canonicalListingId(mapPropertyFe(u.id) ?? u.id),
      _unitUuid: u.id,
      _updatedAt: iso(u.updated_at),
    }
  })

  let rooms = roomsRes.data ?? []
  let assets = assetsRes.data ?? []
  if (skipHeavy) {
    const unitUuids = unitsRaw.map((u) => u._unitUuid as string)
    if (unitUuids.length > 0) {
      const [scopedRoomsRes, scopedAssetsRes] = await Promise.all([
        supabase.from('rooms').select('*').in('unit_id', unitUuids),
        supabase.from('internal_assets').select('*').in('unit_id', unitUuids),
      ])
      rooms = scopedRoomsRes.data ?? []
      assets = scopedAssetsRes.data ?? []
    }
  }

  const unitUuidToFeId = new Map(unitsRaw.map((u) => [u._unitUuid as string, u.id]))
  const roomUuidToFeId = new Map(
    rooms.map((r) => [
      r.id as string,
      feFromCache(cache, 'room', r.id as string, r.id as string) ?? (r.id as string),
    ]),
  )
  const infraRooms = mapDbRoomsToInfraRooms(rooms as DbRoomRow[], {
    cache,
    unitUuidToFeId,
    mapAgencyFe,
  })
  const internalAssets = mapDbAssetsToInternalAssets(assets as DbInternalAssetRow[], {
    cache,
    unitUuidToFeId,
    mapAgencyFe,
    roomUuidToFeId,
  })

  const properties = unitsRaw.map((u) => {
    const b = buildings.find((x) => x.id === u.buildingId)
    const unitRooms = rooms.filter((r) => r.unit_id === u._unitUuid)
    const unitAssets = assets.filter((a) => a.unit_id === u._unitUuid)
    const { status, deletedAt } = propertyStatusFromUnit(u.statusKey, u.featured, u._updatedAt)

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
      listingMode:
        u.listingType === 'sale' || u.listingType === 'rent' || u.listingType === 'both'
          ? u.listingType
          : 'rent',
      price: u.price,
      rent: u.rent,
      beds: u.bedrooms,
      baths: u.bathrooms,
      parking: u.parking,
      area: u.squareMeters,
      city: b?.city ?? '',
      suburb: b?.suburb ?? '',
      address: b
        ? `${b.addressLine1}${u.unitNumber !== 'HOUSE' && u.unitNumber !== 'MAIN' ? `, ${u.unitNumber}` : ''}`
        : u.title,
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

  const cleanUnits = unitsRaw.map(({ _propertyId, _unitUuid, _updatedAt, ...rest }) => rest)

  const leads = (leadsRes.data ?? []).map((l) => ({
    id: mappedFe(cache, 'lead', l.id, l.id),
    agencyId: mapAgencyFe(l.client_id)!,
    propertyId: mapPropertyFe(l.unit_id) ?? '',
    agentId: mapUserFe(l.agent_id),
    name: l.name,
    email: l.email ?? '',
    phone: l.phone ?? '',
    channel: l.channel ?? '',
    stage: l.stage,
    type: l.interest_type === 'BUY' ? 'Buy' : 'Rent',
    value: l.value_amount != null ? Number(l.value_amount) : 0,
    notes: l.notes ?? '',
    metadata: (l.metadata as Lead['metadata'] | null) ?? undefined,
    createdAt: dateOnly(l.created_at),
    updatedAt: dateOnly(l.updated_at),
  }))

  const applicationsResolved = await fetchApplicationsWithTenantRetry(
    supabase,
    limits.applications,
    actorRole,
    applicationsRes as { data: Record<string, unknown>[] | null; error: { message?: string } | null },
  )
  const applicationsResData = applicationsResolved.data

  const applicationsRaw = applicationsResData.map((a) => {
    const meta = (a.metadata as Record<string, unknown> | null) ?? {}
    const stageFromMeta = typeof meta.stage === 'string' ? meta.stage : null
    // P0-integrity: prefer the persisted machine status so staff and applicant
    // resolve the exact same stage. metadata.stage alone can disagree with the
    // DB status column (status won on legacy rows), producing the 13% vs 14%
    // split the E2E observed.
    const workflowStatusFromMeta = typeof meta.workflow_status === 'string' && meta.workflow_status ? (meta.workflow_status as import('../../types/domain').Application['workflowStatus']) : null
    const type = a.application_type === 'PURCHASE' ? 'Purchase' : 'Rental'
    const hydrated = hydrateDocumentsFromUploadedJson(type, a.uploaded_docs_json)
    const creditCheck =
      hydrated.creditCheck ??
      (a.status === 'CREDIT_CHECK' ? 'In Progress' : 'Not Started')
    const screeningFromMeta =
      meta.screening && typeof meta.screening === 'object' && !Array.isArray(meta.screening)
        ? meta.screening
        : null
    return {
      id: a.reference_code as string,
      agencyId: mapAgencyFe(a.client_id as string | null)!,
      propertyId: mapPropertyFe(a.unit_id as string | null)!,
      agentId: mapUserFe(a.agent_id as string | null),
      applicantUserId: mapUserFe(a.applicant_id as string | null),
      applicantName: (typeof meta.applicant_name === 'string' && meta.applicant_name.trim()) || 'Applicant',
      email: (typeof meta.applicant_email === 'string' && meta.applicant_email) || '',
      phone: '',
      type,
      workflowStatus: workflowStatusFromMeta ?? undefined,
      stage: stageFromMeta ?? appStage(a.status as string),
      progress: typeof meta.progress === 'number' ? meta.progress : 50,
      income: a.monthly_income != null ? Number(a.monthly_income) : 0,
      employment: (a.employment_summary as string | null) ?? '',
      creditCheck,
      creditConsent: hydrated.creditConsent ?? true,
      documents: hydrated.documents,
      docs: hydrated.documents.filter((d) => d.status !== 'required').map((d) => d.label),
      screening: hydrated.screening ?? screeningFromMeta ?? undefined,
      creditCheckConsents: hydrated.creditCheckConsents,
      screeningConsent:
        meta.screeningConsent && typeof meta.screeningConsent === 'object'
          ? (meta.screeningConsent as import('../../types/domain').Application['screeningConsent'])
          : undefined,
      idNumberOrPassport:
        typeof meta.id_number_or_passport === 'string' ? meta.id_number_or_passport : undefined,
      viewingSlotId: null,
      notes: (a.message as string | null) ?? '',
      declineReason:
        typeof meta.decline_reason === 'string' && meta.decline_reason.trim()
          ? meta.decline_reason.trim()
          : undefined,
      moveInDate: dateOnly(a.move_in_date as string | null) || undefined,
      keyCollection: meta.keyCollection as Record<string, unknown> | undefined,
      submittedAt: dateOnly(a.submitted_at as string | null) || dateOnly(a.created_at as string | null),
      updatedAt: dateOnly(a.updated_at as string | null),
      journeySnapshot:
        a.journey_snapshot && typeof a.journey_snapshot === 'object' && !Array.isArray(a.journey_snapshot)
          ? (a.journey_snapshot as import('../journey/types').JourneySnapshot)
          : undefined,
      journeyVersion:
        typeof a.journey_version === 'number' ? (a.journey_version as number) : undefined,
      applicantUuid: a.applicant_id as string | null,
    }
  })

  const applications = applicationsRaw.map((row) => {
    if (row.applicantUuid) {
      const u = users.find((x) => x.id === row.applicantUuid)
      if (u) {
        row.applicantName = `${u.first_name} ${u.last_name}`.trim()
        row.email = u.email
        row.phone = u.phone ?? ''
      }
    }
    const { applicantUuid: _drop, ...appRow } = row
    return normalizeApplication(appRow as import('../../types/domain').Application)
  })

  // Mode A Sipho: preserve TN↔APP join across rehydrate (mirrors server/bootstrap).
  const appUuidToFeId = new Map<string, string>(
    applicationsResData.map((a: { id: string; reference_code: string }) => [
      a.id,
      mappedFe(cache, 'application', a.id, a.reference_code),
    ]),
  )

  const tenancies = (leasesRes.data ?? []).map((l) => {
    const tenantUserId = mapUserFe(l.tenant_id)
    const tenant = appUsers.find((x) => x.id === tenantUserId)
    const meta = (l.metadata as Record<string, unknown> | null) ?? {}
    return {
      id: mappedFe(cache, 'tenancy', l.id, l.id),
      agencyId: mapAgencyFe(l.client_id)!,
      propertyId: mapPropertyFe(l.unit_id)!,
      landlordId: mapUserFe(l.landlord_id) ?? '',
      agentId: mapUserFe(l.agent_id),
      applicationId: l.application_id
        ? (appUuidToFeId.get(l.application_id) ?? null)
        : null,
      tenantUserId,
      tenantName: tenant?.name ?? 'Tenant',
      tenantEmail: tenant?.email ?? '',
      startDate: dateOnly(l.start_date),
      endDate: dateOnly(l.end_date) || null,
      rent: Number(l.rent_amount),
      deposit: Number(l.deposit_amount),
      rentDueDay: Math.min(28, Math.max(1, Number(l.rent_due_day) || 1)),
      status: l.status === 'ACTIVE' ? ('Active' as const) : ('Pending Move-In' as const),
      keyCollection: meta.keyCollection ?? {
        location: 'Agency office',
        instructions: 'Bring ID.',
        contactName: tenant?.name ?? 'Agent',
        contactPhone: '',
      },
      leaseDocumentId: (meta.leaseDocumentId as string | null | undefined) ?? null,
      leasePdfUrl: (meta.leasePdfUrl as string | null | undefined) ?? null,
      eSign: (meta.eSign as import('../../types/domain').TenancyESign | null | undefined) ?? null,
      renewalOps: (meta.renewalOps as import('../../types/domain').TenancyRenewalOpsRecord | null | undefined) ?? null,
      billingSchedule: (meta.billingSchedule as import('../../types/domain').BillingSchedule | null | undefined) ?? null,
    }
  })

  const viewings = (bookingsRes.data ?? []).map((b, i) => {
    const starts = new Date(b.starts_at)
    return {
      id: mappedFe(cache, 'viewing', b.id, `VW-pg-${i + 1}`),
      agencyId: mapAgencyFe(b.client_id)!,
      propertyId: mapPropertyFe(b.unit_id)!,
      agentId: mapUserFe(b.agent_id) ?? '',
      slotId: b.slot_id ? mappedFe(cache, 'viewing_slot', b.slot_id, b.slot_id) : null,
      applicantName: b.visitor_name,
      applicantEmail: b.visitor_email ?? undefined,
      date: dateOnly(b.starts_at),
      time: starts.toISOString().slice(11, 16),
      status: viewingStatus(b.status),
      attendance:
        b.status === 'COMPLETED' ? 'Attended' : b.status === 'NO_SHOW' ? 'No-show' : '—',
      feedback: b.feedback ?? undefined,
      notes: b.notes ?? undefined,
    }
  })

  const viewingSlots = (viewingSlotsRes.data ?? []).map((s, i) =>
    mapViewingSlotRow(s, {
      index: i,
      mapFeId: (entityType, uuid, fallback) => mappedFe(cache, entityType, uuid, fallback),
      mapAgency: mapAgencyFe,
      mapPropertyFromUnit: mapPropertyFe,
      mapUser: mapUserFe,
    }),
  )

  const payments = (paymentsRes.data ?? []).map((p) => ({
    id: mappedFe(cache, 'payment', p.id, p.id),
    agencyId: mapAgencyFe(p.client_id)!,
    propertyId: mapPropertyFe(p.unit_id) ?? '',
    applicationId: null as string | null,
    tenancyId: p.lease_id ? mappedFe(cache, 'tenancy', p.lease_id, p.lease_id) : null,
    partyName: p.party_name,
    partyUserId: mapUserFe(p.party_user_id),
    type: paymentType(p.payment_type),
    amount: Number(p.amount),
    status: paymentStatus(p.status),
    dueDate: dateOnly(p.due_date),
    paidAt: p.paid_at ? dateOnly(p.paid_at) : null,
    method: p.method ?? null,
    landlordVisible: Boolean(p.landlord_visible),
    reference: p.reference ?? undefined,
    notes: p.notes ?? undefined,
    paidAmount: p.paid_amount != null ? Number(p.paid_amount) : undefined,
    attachments: Array.isArray(p.attachments) ? p.attachments : [],
    recordedByUserId: mapUserFe(p.recorded_by),
    recordedByName: null as string | null,
  }))

  for (const p of payments) {
    if (p.recordedByUserId) {
      const u = appUsers.find((x) => x.id === p.recordedByUserId)
      p.recordedByName = u?.name ?? null
    }
  }

  const propertyDocuments = (documentsRes.data ?? []).map((d) => ({
    id: mappedFe(cache, 'document', d.id, d.id),
    agencyId: mapAgencyFe(d.client_id)!,
    propertyId: mapPropertyFe(d.unit_id) ?? '',
    name: d.name,
    category: docCategory(d.category),
    status: String(d.status).toLowerCase(),
    uploadedAt: dateOnly(d.uploaded_at) || dateOnly(d.created_at),
    fileUrl: d.storage_url ?? undefined,
    note: d.note ?? undefined,
    applicationId: null as string | null,
    applicantName: d.applicant_name ?? undefined,
  }))

  const tickets = (ticketsRes.data ?? []).map((t) => ({
    id: mappedFe(cache, 'ticket', t.id, t.id),
    agencyId: mapAgencyFe(t.client_id)!,
    propertyId: mapPropertyFe(t.unit_id)!,
    unitId: null as string | null,
    categoryKey: t.category_key ?? undefined,
    reportedBy: 'Reporter',
    reportedByUserId: mapUserFe(t.reported_by),
    title: t.title,
    priority: ticketPriority(t.priority),
    status: ticketStatus(t.status),
    contractorId: mapUserFe(t.contractor_id),
    assignedAgentId: mapUserFe(t.assigned_to),
    cost:
      t.cost_actual != null
        ? Number(t.cost_actual)
        : t.cost_estimate != null
          ? Number(t.cost_estimate)
          : 0,
    photos: Array.isArray(t.photos) ? t.photos.length : 0,
    openedAt: dateOnly(t.created_at),
    openedAtIso: iso(t.created_at),
    description: t.description,
    warrantyCovered: Boolean(t.warranty_covered),
    escalatedAt: iso(t.escalated_at),
  }))

  for (const t of tickets) {
    if (t.reportedByUserId) {
      const u = appUsers.find((x) => x.id === t.reportedByUserId)
      if (u) t.reportedBy = u.name
    }
  }

  const threads = (threadsRes.data ?? []).map((th) => {
    const parts = Array.isArray(th.participant_ids) ? (th.participant_ids as string[]) : []
    return {
      id: mappedFe(cache, 'thread', th.id, th.id),
      agencyId: mapAgencyFe(th.client_id)!,
      propertyId: th.unit_id ? mapPropertyFe(th.unit_id) : null,
      applicationId: null as string | null,
      subject: th.subject,
      participantIds: parts.map((p) => userByUuid.get(p) ?? p),
      routesTo: mapRoutesToFe(th.routes_to),
      updatedAt: iso(th.updated_at)!,
    }
  })

  const messages = (messagesRes.data ?? []).map((m) => ({
    id: mappedFe(cache, 'message', m.id, m.id),
    threadId: mappedFe(cache, 'thread', m.thread_id, m.thread_id),
    agencyId: mapAgencyFe(m.client_id)!,
    fromUserId: mapUserFe(m.from_user_id)!,
    body: m.body,
    at: iso(m.created_at)!,
  }))

  const notifications = (notificationsRes.data ?? []).map((n) => ({
    id: mappedFe(cache, 'notification', n.id, n.id),
    userId: mapUserFe(n.user_id)!,
    agencyId: mapAgencyFe(n.client_id),
    title: n.title,
    body: n.body,
    at: iso(n.created_at)!,
    read: Boolean(n.read_at),
    link: n.link_path ?? undefined,
    resource: n.resource_type ?? undefined,
    action: n.action_type ?? undefined,
  }))

  const suiteAlerts = (suiteAlertsRes.data ?? []).map((r) => ({
    id: mappedFe(cache, 'suite_alert', r.id as string, r.id as string),
    agencyId: mapAgencyFe(r.client_id as string | null),
    resource: r.resource,
    actions: Array.isArray(r.actions) ? r.actions : [],
    enabled: Boolean(r.enabled),
    popupEnabled: Boolean(r.popup_enabled),
    popupDurationMs: Number(r.popup_duration_ms) || 6000,
    notifyRoles: Array.isArray(r.notify_roles) ? r.notify_roles : [],
  }))

  const activities = (activitiesRes.data ?? []).map((e, i) => {
    const payload = (e.payload as Record<string, unknown>) ?? {}
    return {
      id: mappedFe(cache, 'activity', e.id as string, `act-pg-${i + 1}`),
      agencyId: mapAgencyFe(e.client_id as string | null),
      text: String(payload.text ?? ''),
      user: String(payload.user ?? 'System'),
      at: iso(e.created_at as string)!,
    }
  })

  const propertyEvents = (propertyEventsRes.data ?? []).map((e, i) => {
    const payload = (e.payload as Record<string, unknown>) ?? {}
    const subjectUnit = e.subject_id as string | null
    return {
      id: mappedFe(cache, 'property_event', e.id as string, `pe-pg-${i + 1}`),
      agencyId: mapAgencyFe(e.client_id as string)!,
      propertyId: (payload.propertyId as string) || mapPropertyFe(subjectUnit) || '',
      actorUserId: mapUserFe(e.actor_user_id as string | null),
      actorName: String(payload.actorName ?? 'System'),
      action: String(payload.action ?? 'updated'),
      at: iso(e.created_at as string)!,
      changes: Array.isArray(payload.changes) ? payload.changes : undefined,
    }
  })

  const invoices = (invoicesRes.data ?? []).map((inv) => ({
    id: mappedFe(cache, 'invoice', inv.id as string, inv.id as string),
    clientId: mapAgencyFe(inv.client_id as string)!,
    subscriptionId: inv.subscription_id ? String(inv.subscription_id) : null,
    billingPeriodStart: dateOnly(inv.billing_period_start as string),
    billingPeriodEnd: dateOnly(inv.billing_period_end as string),
    baseAmount: Number(inv.base_amount),
    assetUsageAmount: Number(inv.asset_usage_amount),
    vatAmount: Number(inv.vat_amount),
    totalAmountDue: Number(inv.total_amount_due),
    paymentStatus: inv.payment_status,
    lineItems: Array.isArray(inv.line_items) ? inv.line_items : [],
    createdAt: iso(inv.created_at as string)!,
  }))

  // --- Trust & Banking books (P0-7): map client_id → FE agencyId ---
  const trustTransactions = (trustTxnsRes.data ?? []).map((t) => ({
    id: mappedFe(cache, 'trust_txn', t.id as string, t.id as string),
    agencyId: mapAgencyFe(t.client_id as string)!,
    direction: t.direction as string,
    amountCents: Number(t.amount_cents),
    currency: (t.currency as string) ?? 'ZAR',
    valueDate: dateOnly(t.value_date as string),
    postedAt: iso(t.posted_at as string) ?? new Date().toISOString(),
    partnerTxnId: (t.partner_txn_id as string) ?? null,
    bankRef: (t.bank_ref as string) ?? null,
    description: (t.description as string) ?? '',
    counterpartyHash: (t.counterparty_hash as string) ?? null,
    status: t.status as string,
    rawPayloadDocumentId: (t.raw_payload_document_id as string) ?? null,
    createdAt: iso(t.created_at as string) ?? new Date().toISOString(),
    updatedAt: iso(t.updated_at as string) ?? new Date().toISOString(),
  }))

  const txnFeById = new Map(
    (trustTxnsRes.data ?? []).map((t) => [
      t.id as string,
      mappedFe(cache, 'trust_txn', t.id as string, t.id as string),
    ]),
  )

  const trustAllocations = (trustAllocsRes.data ?? []).map((a) => ({
    id: mappedFe(cache, 'trust_alloc', a.id as string, a.id as string),
    agencyId: mapAgencyFe(a.client_id as string)!,
    trustTransactionId: a.trust_transaction_id
      ? (txnFeById.get(a.trust_transaction_id as string) ?? (a.trust_transaction_id as string))
      : '',
    occupancyId: (a.occupancy_id as string) ?? null,
    bucketCode: (a.bucket_code as string) ?? 'unallocated',
    chargeId: (a.charge_id as string) ?? null,
    amountCents: Number(a.amount_cents),
    allocatedBy: mapUserFe(a.allocated_by as string | null) ?? '',
    allocatedAt: iso(a.allocated_at as string) ?? new Date().toISOString(),
  }))

  const payoutInstructions = (payoutsRes.data ?? []).map((p) => ({
    id: mappedFe(cache, 'payout', p.id as string, p.id as string),
    agencyId: mapAgencyFe(p.client_id as string)!,
    occupancyId: (p.occupancy_id as string) ?? null,
    propertyId: p.unit_id ? (mapPropertyFe(p.unit_id as string) ?? '') : '',
    payeeType: (p.payee_type as string) ?? 'landlord',
    payeeId: mapUserFe(p.payee_id as string | null) ?? ((p.payee_id as string) ?? ''),
    bankAccountId: (p.bank_account_id as string) ?? '',
    amountCents: Number(p.amount_cents),
    bucketCode: (p.bucket_code as string) ?? 'owner_payable',
    status: p.status as string,
    proposedBy: mapUserFe(p.proposed_by as string | null) ?? '',
    approvedBy: mapUserFe(p.approved_by as string | null),
    submittedAt: iso(p.submitted_at as string | null),
    settledAt: iso(p.settled_at as string | null),
    partnerPayoutId: (p.partner_payout_id as string) ?? null,
    failureReason: (p.failure_reason as string) ?? null,
    idempotencyKey: (p.idempotency_key as string) ?? '',
    createdAt: iso(p.created_at as string) ?? new Date().toISOString(),
    updatedAt: iso(p.updated_at as string) ?? new Date().toISOString(),
  }))

  // D2: recorded refund splits live in event_log only.
  // Only the deposits already loaded (RLS-scoped) that are refunded; no global limit.
  const depositUuids = (depositsRes.data ?? []).filter((d) => d.status === 'refunded').map((d) => String(d.id))
  const refundEvents = depositUuids.length
    ? await supabase
        .from('event_log')
        .select('id, subject_id, payload, created_at')
        .eq('event_type', 'deposit_refund_recorded')
        .in('subject_id', depositUuids)
        .order('created_at', { ascending: false })
    : { data: [] as Record<string, unknown>[], error: null }
  if (refundEvents.error) {
    console.warn('[supabase/data] deposit refund read-back failed', refundEvents.error.message)
  }
  const refundByDeposit = latestRefundBySubject(
    (refundEvents.data ?? []) as Array<{ id?: unknown; subject_id?: unknown; payload?: unknown; created_at?: unknown }>,
  )
  const depositHoldings = (depositsRes.data ?? []).map((d) => ({
    id: mappedFe(cache, 'deposit', d.id as string, d.id as string),
    agencyId: mapAgencyFe(d.client_id as string)!,
    occupancyId: (d.occupancy_id as string) ?? '',
    expectedCents: Number(d.expected_cents),
    heldCents: Number(d.held_cents),
    interestAccruedCents: Number(d.interest_accrued_cents),
    status: d.status as string,
    statutoryDeadlineOn: d.statutory_deadline_on ? dateOnly(d.statutory_deadline_on as string) : null,
    interestRateUnknown: Boolean(d.interest_rate_unknown),
    releaseProposedBy: mapUserFe(d.release_proposed_by as string | null),
    releaseApprovedBy: mapUserFe(d.release_approved_by as string | null),
    refund: refundByDeposit.get(String(d.id)) ?? null,
    createdAt: iso(d.created_at as string) ?? new Date().toISOString(),
    updatedAt: iso(d.updated_at as string) ?? new Date().toISOString(),
  }))

  const arrearsSnapshots = (arrearsRes.data ?? []).map((s) => ({
    id: mappedFe(cache, 'arrears', s.id as string, s.id as string),
    agencyId: mapAgencyFe(s.client_id as string)!,
    occupancyId: (s.occupancy_id as string) ?? '',
    asOf: dateOnly(s.as_of as string),
    currentCents: Number(s.current_cents),
    d30: Number(s.d30),
    d60: Number(s.d60),
    d90: Number(s.d90),
    d90plus: Number(s.d90plus),
    createdAt: iso(s.created_at as string) ?? new Date().toISOString(),
  }))

  const csvImportBatches = (csvBatchesRes.data ?? []).map((b) => ({
    id: mappedFe(cache, 'csv_batch', b.id as string, b.id as string),
    agencyId: mapAgencyFe(b.client_id as string)!,
    filename: (b.filename as string) ?? '',
    rowCount: Number(b.row_count),
    importedAt: iso(b.imported_at as string) ?? new Date().toISOString(),
    importedBy: mapUserFe(b.imported_by as string | null) ?? '',
    status: b.status as string,
  }))

  const lookups: LookupConfig[] = (lookupsRes.data ?? []).map((row, i) => {
    const meta = (row.meta as Record<string, unknown> | null) ?? {}
    const feClient =
      typeof meta.frontend_client_id === 'string' && meta.frontend_client_id
        ? meta.frontend_client_id
        : mapAgencyFe(row.client_id as string) ?? GLOBAL_CLIENT_ID
    const feId =
      typeof meta.frontend_id === 'string' && meta.frontend_id
        ? meta.frontend_id
        : mappedFe(cache, 'lookup', row.id as string, `lk-pg-${i + 1}`)
    // Strip id-map keys; keep type-specific extras (e.g. LEAD_STAGE requirements).
    const { frontend_id: _fid, frontend_client_id: _fcid, ...extraMeta } = meta
    return {
      id: feId,
      clientId: feClient,
      configType: String(row.config_type),
      keyValue: String(row.key_value),
      displayLabel: String(row.display_label),
      isActive: Boolean(row.is_active),
      sortOrder: Number(row.sort_order) || 0,
      ...(Object.keys(extraMeta).length ? { meta: extraMeta } : {}),
    }
  })

  const payload: PostgresBootstrap = {
    source: 'postgres',
    fetchedAt: new Date().toISOString(),
    agencies,
    users: appUsers,
    buildings,
    units: cleanUnits,
    properties,
    leads,
    applications,
    tenancies,
    viewings,
    viewingSlots,
    payments,
    propertyDocuments,
    tickets,
    threads,
    messages,
    notifications,
    suiteAlerts,
    activities,
    propertyEvents,
    invoices,
    lookups,
    agencyContractors: deriveAgencyContractors(appUsers),
    trustTransactions,
    trustAllocations,
    payoutInstructions,
    depositHoldings,
    arrearsSnapshots,
    csvImportBatches,
    infraRooms,
    internalAssets,
    idMapRows: (idMapRes.data ?? []).map((row) => ({
      entity_type: String(row.entity_type),
      backend_id: String(row.backend_id),
      frontend_id: String(row.frontend_id),
    })),
  }

  const actor =
    opts?.actorUserId && opts?.actorRole
      ? {
          userId: opts.actorUserId,
          role: opts.actorRole,
          agencyId: opts.actorAgencyId ?? null,
        }
      : null

  const withActor = actor
    ? {
        ...payload,
        actor: { userId: actor.userId, role: String(actor.role), agencyId: actor.agencyId },
      }
    : payload

  return ensureBootstrapScopedForActor(withActor, actor) as PostgresBootstrap
}
