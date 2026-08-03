/**
 * Supabase bootstrap — mirrors server/bootstrap.ts for AppStore hydration.
 */
import { createClient } from '../../utils/supabase/client'
import type { PostgresBootstrap } from '../api/postgresClient'
import {
  buildIdMapCache,
  EMAIL_TO_USER,
  feFromCache,
  mapAgency,
  mapProperty,
  mapUser,
  ROLE_FROM_DB,
  type IdMapCache,
} from './idMap'

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

export async function fetchSupabaseBootstrap(lite = true): Promise<PostgresBootstrap | null> {
  const supabase = createClient()
  const limits = lite ? LITE_LIMITS : FULL_LIMITS
  const skipHeavy = lite

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
  ] = await Promise.all([
    supabase.from('entity_id_map').select('entity_type, backend_id, frontend_id'),
    supabase.from('clients').select('id, company_name, subdomain, status, city, created_at, settings'),
    supabase.from('users').select('id, client_id, email, first_name, last_name, phone, role, active, metadata'),
    supabase.from('buildings').select('*').order('name'),
    supabase.from('units').select('*').order('created_at', { ascending: false }).limit(limits.units),
    skipHeavy
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase.from('rooms').select('*'),
    skipHeavy
      ? Promise.resolve({ data: [] as Record<string, unknown>[] })
      : supabase.from('internal_assets').select('*'),
    supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(limits.leads),
    supabase
      .from('applications')
      .select('*')
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .limit(limits.applications),
    supabase.from('leases').select('*').order('start_date'),
    supabase.from('bookings').select('*').order('starts_at'),
    supabase.from('viewing_slots').select('*').order('slot_date'),
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
  ])

  const clients = clientsRes.data ?? []
  const users = usersRes.data ?? []
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

  const agencies = clients.map((c) => ({
    id: mappedFe(cache, 'agency', c.id, c.id),
    name: c.company_name,
    slug: c.subdomain,
    city: c.city ?? '',
    status: c.status === 'active' ? 'Active' : 'Suspended',
    createdAt: dateOnly(c.created_at),
    enabledPermissions: null as null,
  }))

  const appUsers = users.map((u) => {
    const meta = (u.metadata as Record<string, unknown> | null) ?? {}
    const feRole =
      typeof meta.frontend_role === 'string' && meta.frontend_role
        ? meta.frontend_role
        : ROLE_FROM_DB[u.role as RoleDb] ?? 'tenant'
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

  const buildingByUuid = new Map((buildingsRes.data ?? []).map((b) => [b.id, b]))
  const feBuildingByUuid = new Map(
    (buildingsRes.data ?? []).map((b) => [b.id, mappedFe(cache, 'building', b.id, b.id)]),
  )

  const unitsRaw = (unitsRes.data ?? []).map((u) => {
    const b = buildingByUuid.get(u.building_id)
    return {
      id: `unt-${mapPropertyFe(u.id) ?? u.id}`,
      clientId: mapAgencyFe(u.client_id)!,
      buildingId: feBuildingByUuid.get(u.building_id) ?? u.building_id,
      agentId: mapUserFe(u.agent_id),
      unitNumber: u.unit_number,
      title: u.title ?? u.unit_number,
      squareMeters: u.square_meters ? Number(u.square_meters) : 0,
      bedrooms: u.bedrooms ?? 0,
      bathrooms: u.bathrooms ? Number(u.bathrooms) : 0,
      parking: u.parking ?? 0,
      listingType:
        u.listing_type?.toLowerCase() === 'both' ? 'both' : u.listing_type?.toLowerCase() ?? 'rent',
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
      _propertyId: mapPropertyFe(u.id)!,
      _unitUuid: u.id,
    }
  })

  const rooms = roomsRes.data ?? []
  const assets = assetsRes.data ?? []

  const properties = unitsRaw.map((u) => {
    const b = buildings.find((x) => x.id === u.buildingId)
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

  const cleanUnits = unitsRaw.map(({ _propertyId, _unitUuid, ...rest }) => rest)

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
    createdAt: dateOnly(l.created_at),
    updatedAt: dateOnly(l.updated_at),
  }))

  const applications = (applicationsRes.data ?? []).map((a) => {
    const meta = (a.metadata as Record<string, unknown> | null) ?? {}
    const stageFromMeta = typeof meta.stage === 'string' ? meta.stage : null
    return {
      id: a.reference_code,
      agencyId: mapAgencyFe(a.client_id)!,
      propertyId: mapPropertyFe(a.unit_id)!,
      agentId: mapUserFe(a.agent_id),
      applicantUserId: mapUserFe(a.applicant_id),
      applicantName: 'Applicant',
      email: '',
      phone: '',
      type: a.application_type === 'PURCHASE' ? 'Purchase' : 'Rental',
      stage: stageFromMeta ?? appStage(a.status),
      progress: typeof meta.progress === 'number' ? meta.progress : 50,
      income: a.monthly_income != null ? Number(a.monthly_income) : 0,
      employment: a.employment_summary ?? '',
      creditCheck: a.status === 'CREDIT_CHECK' ? 'In Progress' : 'Not Started',
      creditConsent: true,
      documents: [],
      docs: [],
      viewingSlotId: null,
      notes: a.message ?? '',
      moveInDate: dateOnly(a.move_in_date) || undefined,
      keyCollection: meta.keyCollection as Record<string, unknown> | undefined,
      submittedAt: dateOnly(a.submitted_at) || dateOnly(a.created_at),
      updatedAt: dateOnly(a.updated_at),
      _applicantUuid: a.applicant_id as string | null,
    }
  })

  for (const a of applications) {
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

  const tenancies = (leasesRes.data ?? []).map((l) => {
    const tenantUserId = mapUserFe(l.tenant_id)
    const tenant = appUsers.find((x) => x.id === tenantUserId)
    const meta = (l.metadata as Record<string, unknown> | null) ?? {}
    return {
      id: mappedFe(cache, 'tenancy', l.id, l.id),
      agencyId: mapAgencyFe(l.client_id)!,
      propertyId: mapPropertyFe(l.unit_id)!,
      landlordId: mapUserFe(l.landlord_id) ?? 'u-owner1',
      agentId: mapUserFe(l.agent_id),
      applicationId: null as string | null,
      tenantUserId,
      tenantName: tenant?.name ?? 'Tenant',
      tenantEmail: tenant?.email ?? '',
      startDate: dateOnly(l.start_date),
      endDate: dateOnly(l.end_date) || null,
      rent: Number(l.rent_amount),
      deposit: Number(l.deposit_amount),
      status: l.status === 'ACTIVE' ? ('Active' as const) : ('Pending Move-In' as const),
      keyCollection: meta.keyCollection ?? {
        location: 'Agency office',
        instructions: 'Bring ID.',
        contactName: tenant?.name ?? 'Agent',
        contactPhone: '',
      },
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

  const viewingSlots = (viewingSlotsRes.data ?? []).map((s, i) => ({
    id: mappedFe(cache, 'viewing_slot', s.id, `VS-pg-${i + 1}`),
    agencyId: mapAgencyFe(s.client_id)!,
    propertyId: mapPropertyFe(s.unit_id)!,
    agentId: mapUserFe(s.agent_id) ?? '',
    date: dateOnly(s.slot_date),
    time: String(s.slot_time).slice(0, 5),
    capacity: Number(s.capacity),
    booked: Number(s.booked_count),
    status: slotStatus(s.status),
    title: s.title ?? undefined,
    notes: s.notes ?? undefined,
    durationMinutes: s.duration_minutes != null ? Number(s.duration_minutes) : undefined,
  }))

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
      routesTo: th.routes_to === 'AGENCY' ? 'agency' : 'agent',
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

  return {
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
  }
}
