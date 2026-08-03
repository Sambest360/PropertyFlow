import { query } from './db.js'
import { mapPool } from './mapPool.js'
import { loadIdMapCache } from './idMapCache.js'
import {
  ACTIVITY_IDS,
  APP_REF_TO_ID,
  BUILDING_TO_FRONTEND,
  DOC_IDS,
  EMAIL_TO_USER,
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

function ticketPriority(p: string): string {
  const map: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    URGENT: 'Urgent',
    EMERGENCY: 'Urgent',
  }
  return map[p] ?? 'Medium'
}

function ticketStatus(s: string): string {
  const map: Record<string, string> = {
    OPEN: 'Open',
    TRIAGED: 'Open',
    IN_PROGRESS: 'In Progress',
    AWAITING_PARTS: 'Awaiting Parts',
    RESOLVED: 'Completed',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  }
  return map[s] ?? 'Open'
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

export async function buildBootstrap(opts?: { limits?: BootstrapLimits; lite?: boolean }) {
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
        }>(
          'SELECT id, company_name, subdomain, status, city, created_at FROM clients ORDER BY company_name',
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
        }>('SELECT * FROM units ORDER BY created_at DESC LIMIT $1', [limits.units]),
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
        query('SELECT * FROM applications ORDER BY submitted_at NULLS LAST LIMIT $1', [
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
    ] as const,
    process.env.VERCEL ? 3 : 8,
    (load) => load(),
  )

  const userByUuid = new Map<string, string>()
  for (const u of users) {
    const meta = u.metadata ?? {}
    const fromMeta = typeof meta.frontend_id === 'string' ? meta.frontend_id : null
    const fe = fromMeta ?? EMAIL_TO_USER[u.email.toLowerCase()] ?? u.id
    userByUuid.set(u.id, fe)
  }

  // Runtime + seed aliases from entity_id_map (shared cache — no N+1)
  const idCache = await loadIdMapCache()
  for (const [backendId, fe] of idCache.userBackendToFe) {
    userByUuid.set(backendId, fe)
  }

  const mapCache = new Map<string, string>()
  for (const [backendId, fe] of idCache.userBackendToFe) {
    mapCache.set(`user:${backendId}`, fe)
  }
  for (const [backendId, fe] of idCache.unitBackendToPropertyFe) {
    mapCache.set(`property:${backendId}`, fe)
    mapCache.set(`unit:${backendId}`, fe)
  }
  const mappedFe = (entityType: string, uuid: string, fallback: string) =>
    mapCache.get(`${entityType}:${uuid}`) ?? fallback

  const mapUser = (id: string | null | undefined) => (id ? (userByUuid.get(id) ?? id) : null)

  const agencies = clients.map((c) => ({
    id: mappedFe('agency', c.id, mapAgency(c.id)!),
    name: c.company_name,
    slug: c.subdomain,
    city: c.city ?? '',
    status: c.status === 'active' ? 'Active' : 'Suspended',
    createdAt: dateOnly(c.created_at),
    enabledPermissions: null as null, // AppStore fills defaults
  }))

  const appUsers = users.map((u) => {
    const meta = u.metadata ?? {}
    const feRole =
      typeof meta.frontend_role === 'string' && meta.frontend_role
        ? meta.frontend_role
        : ROLE_MAP[u.role as RoleDb] ?? 'tenant'
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
      agencyId: mapAgency(u.client_id),
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
    }
  })

  const mappedBuildings = buildings.map((b) => ({
    id: mappedFe('building', b.id, BUILDING_TO_FRONTEND[b.id] ?? b.id),
    clientId: mapAgency(b.client_id)!,
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
      id: `unt-${UNIT_TO_PROPERTY[u.id] ?? u.id}`,
      clientId: mapAgency(u.client_id)!,
      buildingId: feBuildingByUuid.get(u.building_id) ?? u.building_id,
      agentId: mapUser(u.agent_id),
      unitNumber: u.unit_number,
      title: u.title ?? u.unit_number,
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
      _propertyId: mappedFe('property', u.id, mapProperty(u.id)!),
      _buildingUuid: u.building_id,
      _unitUuid: u.id,
    }
  })

  const properties = mappedUnits.map((u) => {
    const b = mappedBuildings.find((x) => x.id === u.buildingId)
    const unitRooms = rooms.filter((r) => r.unit_id === u._unitUuid)
    const unitAssets = assets.filter((a) => a.unit_id === u._unitUuid)
    const statusKey = u.statusKey
    const status =
      statusKey === 'OCCUPIED'
        ? 'Rented'
        : statusKey === 'MAINTENANCE'
          ? 'Maintenance'
          : u.featured
            ? 'Featured'
            : 'Published'

    return {
      id: u._propertyId,
      agencyId: u.clientId,
      landlordId: b?.landlordId ?? 'u-owner1',
      agentId: u.agentId,
      buildingId: u.buildingId,
      unitId: u.id,
      title: u.title,
      type: u.bedrooms === 0 ? 'Office' : u.bedrooms >= 3 ? 'House' : 'Apartment',
      status,
      listingMode: u.listingType === 'sale' || u.listingType === 'rent' || u.listingType === 'both'
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
    agencyId: mapAgency(l.client_id as string)!,
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
    createdAt: dateOnly(l.created_at as Date),
    updatedAt: dateOnly(l.updated_at as Date),
  }))

  const mappedApps = (applications as Array<Record<string, unknown>>).map((a) => {
    const ref = a.reference_code as string
    const meta = (a.metadata as Record<string, unknown> | null) ?? {}
    const stageFromMeta = typeof meta.stage === 'string' ? meta.stage : null
    return {
      id: APP_REF_TO_ID[ref] ?? ref,
      agencyId: mapAgency(a.client_id as string)!,
      propertyId: mapProperty(a.unit_id as string)!,
      agentId: mapUser(a.agent_id as string | null),
      applicantUserId: mapUser(a.applicant_id as string | null),
      applicantName: 'Applicant',
      email: '',
      phone: '',
      type: (a.application_type as string) === 'PURCHASE' ? 'Purchase' : 'Rental',
      stage: stageFromMeta ?? appStage(a.status as string),
      progress: typeof meta.progress === 'number' ? meta.progress : 50,
      income: a.monthly_income != null ? Number(a.monthly_income) : 0,
      employment: (a.employment_summary as string) ?? '',
      creditCheck: (a.status as string) === 'CREDIT_CHECK' ? 'In Progress' : 'Not Started',
      creditConsent: true,
      documents: [],
      docs: [],
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
      agencyId: mapAgency(l.client_id as string)!,
      propertyId: mappedFe('property', l.unit_id as string, mapProperty(l.unit_id as string)!),
      landlordId: mapUser(l.landlord_id as string | null) ?? 'u-owner1',
      agentId: mapUser(l.agent_id as string | null),
      applicationId: null as string | null,
      tenantUserId,
      tenantName: tenant?.name ?? 'Tenant',
      tenantEmail: tenant?.email ?? '',
      startDate: dateOnly(l.start_date as Date),
      endDate: dateOnly(l.end_date as Date | null) || null,
      rent: Number(l.rent_amount),
      deposit: Number(l.deposit_amount),
      status: (l.status as string) === 'ACTIVE' ? ('Active' as const) : ('Pending Move-In' as const),
      keyCollection,
    }
  })

  const viewings = (bookings as Array<Record<string, unknown>>).map((b, i) => {
    const starts = new Date(b.starts_at as string | Date)
    const slotUuid = b.slot_id as string | null
    return {
      id: mappedFe('viewing', b.id as string, `VW-pg-${i + 1}`),
      agencyId: mapAgency(b.client_id as string)!,
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
    agencyId: mapAgency(s.client_id as string)!,
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
    agencyId: mapAgency(r.client_id as string | null),
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
      agencyId: mapAgency(e.client_id as string | null),
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
      agencyId: mapAgency(e.client_id as string)!,
      propertyId,
      actorUserId: mapUser(e.actor_user_id as string | null),
      actorName: String(payload.actorName ?? 'System'),
      action: String(payload.action ?? 'updated'),
      at: iso(e.created_at as Date)!,
      changes: Array.isArray(payload.changes) ? payload.changes : undefined,
    }
  })

  const mappedInvoices = (invoices as Array<Record<string, unknown>>).map((inv) => ({
    id: mappedFe(
      'invoice',
      inv.id as string,
      INVOICE_IDS[inv.id as string] ?? (inv.id as string),
    ),
    clientId: mapAgency(inv.client_id as string)!,
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

  const mappedPayments = (payments as Array<Record<string, unknown>>).map((p) => ({
    id: mappedFe('payment', p.id as string, PAYMENT_IDS[p.id as string] ?? (p.id as string)),
    agencyId: mapAgency(p.client_id as string)!,
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
    agencyId: mapAgency(d.client_id as string)!,
    propertyId: mapProperty(d.unit_id as string | null) ?? '',
    name: d.name as string,
    category: docCategory(d.category as string),
    status: (d.status as string).toLowerCase(),
    uploadedAt: dateOnly(d.uploaded_at as Date | null) || dateOnly(d.created_at as Date),
    fileUrl: (d.storage_url as string) ?? undefined,
    note: (d.note as string) ?? undefined,
    applicationId: null as string | null,
    applicantName: (d.applicant_name as string) ?? undefined,
  }))

  const mappedTickets = (tickets as Array<Record<string, unknown>>).map((t) => ({
    id: mappedFe('ticket', t.id as string, TICKET_IDS[t.id as string] ?? (t.id as string)),
    agencyId: mapAgency(t.client_id as string)!,
    propertyId: mapProperty(t.unit_id as string)!,
    unitId: null as string | null,
    categoryKey: (t.category_key as string) ?? undefined,
    assetLabel: undefined as string | undefined,
    reportedBy: 'Reporter',
    reportedByUserId: mapUser(t.reported_by as string | null),
    title: t.title as string,
    priority: ticketPriority(t.priority as string),
    status: ticketStatus(t.status as string),
    contractorId: mapUser(t.contractor_id as string | null),
    assignedAgentId: mapUser(t.assigned_to as string | null),
    cost: t.cost_actual != null ? Number(t.cost_actual) : t.cost_estimate != null ? Number(t.cost_estimate) : 0,
    photos: Array.isArray(t.photos) ? (t.photos as unknown[]).length : 0,
    openedAt: dateOnly(t.created_at as Date),
    openedAtIso: iso(t.created_at as Date),
    description: t.description as string,
    resolutionNotes: undefined as string | undefined,
    resolvedAt: iso(t.completed_at as Date | null),
    warrantyCovered: Boolean(t.warranty_covered),
    escalatedAt: iso(t.escalated_at as Date | null),
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
      agencyId: mapAgency(th.client_id as string)!,
      propertyId: th.unit_id
        ? mappedFe('property', th.unit_id as string, mapProperty(th.unit_id as string)!)
        : null,
      applicationId: null as string | null,
      subject: th.subject as string,
      participantIds: parts.map((p) => userByUuid.get(p) ?? p),
      routesTo: (th.routes_to as string) === 'AGENCY' ? 'agency' : 'agent',
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
    agencyId: mapAgency(m.client_id as string)!,
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
    agencyId: mapAgency(n.client_id as string | null),
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

  return {
    source: 'postgres',
    fetchedAt: new Date().toISOString(),
    agencies,
    users: appUsers,
    buildings: mappedBuildings,
    units: cleanUnits,
    properties,
    leads: mappedLeads,
    applications: mappedApps,
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
    invoices: mappedInvoices,
  }
}
