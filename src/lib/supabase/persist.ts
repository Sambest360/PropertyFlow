/**
 * Supabase persist layer — replaces /api/persist for production.
 */
import { createClient } from '../../utils/supabase/client'
import type { EntityType } from '../api/persistTypes'
import type { PersistAction, PersistOp } from '../api/persist'
import { GLOBAL_CLIENT_ID } from '../../data/platformLookups'
import { ROLE_TO_DB } from './idMap'

import { canonicalListingId, unitIdForProperty, listingIdAliases } from '../listingIds'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(v: string): boolean {
  return UUID_RE.test(v)
}

async function ensureUuid(entityType: EntityType | 'agency', frontendId: string): Promise<string> {
  const supabase = createClient()
  const idsToTry =
    entityType === 'property' || entityType === 'unit'
      ? listingIdAliases(frontendId)
      : [frontendId]
  const typesToTry =
    entityType === 'property' || entityType === 'unit' ? (['unit', 'property'] as const) : [entityType]

  for (const et of typesToTry) {
    for (const fe of idsToTry) {
      const { data: existing } = await supabase
        .from('entity_id_map')
        .select('backend_id')
        .eq('entity_type', et)
        .eq('frontend_id', fe)
        .maybeSingle()
      if (existing?.backend_id) return existing.backend_id
    }
  }
  if (isUuid(frontendId)) return frontendId

  const backendId = crypto.randomUUID()
  const canon = canonicalListingId(frontendId)
  const unitFe = unitIdForProperty(canon)
  const rows =
    entityType === 'property' || entityType === 'unit'
      ? [
          { entity_type: 'property', backend_id: backendId, frontend_id: canon },
          { entity_type: 'unit', backend_id: backendId, frontend_id: unitFe },
        ]
      : [{ entity_type: entityType, backend_id: backendId, frontend_id: frontendId }]

  await supabase.from('entity_id_map').upsert(rows, { onConflict: 'entity_type,backend_id' })
  return backendId
}

async function resolveUuid(entityType: EntityType | 'agency', frontendId: string): Promise<string | null> {
  if (isUuid(frontendId)) return frontendId
  const supabase = createClient()
  const et = entityType === 'property' ? 'unit' : entityType
  const { data } = await supabase
    .from('entity_id_map')
    .select('backend_id')
    .eq('entity_type', et)
    .eq('frontend_id', frontendId)
    .maybeSingle()
  return data?.backend_id ?? null
}

async function clientUuid(agencyId: unknown): Promise<string | null> {
  if (!agencyId) return null
  const feId = String(agencyId)
  if (feId === GLOBAL_CLIENT_ID) {
    return resolveUuid('agency', GLOBAL_CLIENT_ID)
  }
  return resolveUuid('agency', feId)
}

async function userUuid(feId: unknown): Promise<string | null> {
  if (!feId) return null
  return resolveUuid('user', String(feId))
}

async function unitUuid(propertyId: unknown): Promise<string | null> {
  if (!propertyId) return null
  return resolveUuid('property', String(propertyId))
}

function str(v: unknown, fallback = ''): string {
  if (v == null) return fallback
  return String(v)
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const APP_STAGE_TO_DB: Record<string, string> = {
  Started: 'DRAFT',
  'Documents Pending': 'SUBMITTED',
  'Under Review': 'UNDER_REVIEW',
  'Credit Check': 'CREDIT_CHECK',
  Approved: 'APPROVED',
  Rejected: 'REJECTED',
  Withdrawn: 'WITHDRAWN',
  'Active Tenancy': 'LEASED',
}

const PAY_TYPE_TO_DB: Record<string, string> = {
  Deposit: 'DEPOSIT',
  'First Month Rent': 'FIRST_MONTH_RENT',
  Rent: 'RENT',
  'Sale Deposit': 'SALE_DEPOSIT',
  Commission: 'COMMISSION',
  Refund: 'REFUND',
  Other: 'OTHER',
}

const PAY_STATUS_TO_DB: Record<string, string> = {
  Due: 'DUE',
  Paid: 'PAID',
  Overdue: 'OVERDUE',
  Cancelled: 'CANCELLED',
}

const TICKET_STATUS_TO_DB: Record<string, string> = {
  Open: 'OPEN',
  'In Progress': 'IN_PROGRESS',
  'Awaiting Parts': 'AWAITING_PARTS',
  Completed: 'COMPLETED',
  Cancelled: 'CANCELLED',
}

const TICKET_PRI_TO_DB: Record<string, string> = {
  Low: 'LOW',
  Medium: 'MEDIUM',
  High: 'HIGH',
  Urgent: 'URGENT',
  Emergency: 'EMERGENCY',
}

async function upsertAgency(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('agency', id)
  await supabase.from('clients').upsert({
    id: uuid,
    company_name: str(data.name, 'Agency'),
    subdomain: str(data.slug, id),
    status: str(data.status).toLowerCase() === 'suspended' ? 'suspended' : 'active',
    city: str(data.city),
    settings: {
      frontend_id: id,
      enabledPermissions: data.enabledPermissions ?? [],
      trading_as: str(data.tradingAs) || undefined,
      email: str(data.email) || undefined,
      phone: str(data.phone) || undefined,
      province: str(data.province) || undefined,
      country_code: str(data.countryCode) || undefined,
      timezone: str(data.timezone) || undefined,
    },
    updated_at: new Date().toISOString(),
  })
}

async function upsertUser(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('user', id)
  const clientId = await clientUuid(data.agencyId)
  const roleFe = str(data.role, 'tenant')
  const meta: Record<string, unknown> = {
    frontend_id: id,
    frontend_role: roleFe,
    enabledPermissions: data.enabledPermissions,
    verification: data.verification,
    company: data.company,
    idNumberOrPassport: data.idNumberOrPassport,
    licenseStatus: data.licenseStatus,
    mentorId: data.mentorId,
    commissionSharePct: data.commissionSharePct,
  }
  const name = str(data.name, 'User')
  const parts = name.trim().split(/\s+/)
  const firstName = str(data.firstName) || parts[0] || 'User'
  const lastName = str(data.lastName) || parts.slice(1).join(' ') || firstName
  await supabase.from('users').upsert({
    id: uuid,
    client_id: clientId,
    email: str(data.email, `${id}@propertyflow.local`).toLowerCase(),
    first_name: firstName,
    last_name: lastName,
    phone: str(data.phone) || null,
    role: ROLE_TO_DB[roleFe] ?? 'END_USER',
    active: data.active !== false,
    metadata: meta,
    updated_at: new Date().toISOString(),
  })
}

async function upsertLead(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('lead', id)
  const clientId = await clientUuid(data.agencyId)
  const unitId = await unitUuid(data.propertyId)
  await supabase.from('leads').upsert({
    id: uuid,
    client_id: clientId,
    unit_id: unitId,
    agent_id: await userUuid(data.agentId),
    name: str(data.name),
    email: str(data.email),
    phone: str(data.phone),
    channel: str(data.channel),
    stage: str(data.stage, 'New'),
    interest_type: str(data.type) === 'Buy' ? 'BUY' : 'RENT',
    value_amount: num(data.value),
    notes: str(data.notes),
    updated_at: new Date().toISOString(),
  })
}

async function upsertApplication(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('application', id)
  const clientId = await clientUuid(data.agencyId)
  const unitId = await unitUuid(data.propertyId)
  const stage = str(data.stage)
  await supabase.from('applications').upsert({
    id: uuid,
    client_id: clientId,
    unit_id: unitId,
    agent_id: await userUuid(data.agentId),
    applicant_id: await userUuid(data.applicantUserId),
    reference_code: id,
    application_type: str(data.type) === 'Purchase' ? 'PURCHASE' : 'RENTAL',
    status: APP_STAGE_TO_DB[stage] ?? 'UNDER_REVIEW',
    monthly_income: num(data.income),
    employment_summary: str(data.employment),
    message: str(data.notes),
    move_in_date: str(data.moveInDate) || null,
    metadata: {
      stage,
      progress: data.progress,
      keyCollection: data.keyCollection,
      frontend_id: id,
    },
    updated_at: new Date().toISOString(),
  })
}

async function upsertPayment(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('payment', id)
  const clientId = await clientUuid(data.agencyId)
  await supabase.from('payments').upsert({
    id: uuid,
    client_id: clientId,
    unit_id: await unitUuid(data.propertyId),
    lease_id: data.tenancyId ? await resolveUuid('tenancy', str(data.tenancyId)) : null,
    party_name: str(data.partyName),
    party_user_id: await userUuid(data.partyUserId),
    payment_type: PAY_TYPE_TO_DB[str(data.type)] ?? 'OTHER',
    amount: num(data.amount) ?? 0,
    status: PAY_STATUS_TO_DB[str(data.status)] ?? 'DUE',
    due_date: str(data.dueDate) || new Date().toISOString().slice(0, 10),
    paid_at: data.paidAt ? str(data.paidAt) : null,
    method: str(data.method) || null,
    landlord_visible: data.landlordVisible !== false,
    reference: str(data.reference) || null,
    notes: str(data.notes) || null,
    paid_amount: num(data.paidAmount),
    attachments: data.attachments ?? [],
    recorded_by: await userUuid(data.recordedByUserId),
    updated_at: new Date().toISOString(),
  })
}

async function upsertNotification(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('notification', id)
  await supabase.from('notifications').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    user_id: await userUuid(data.userId),
    title: str(data.title),
    body: str(data.body),
    link_path: str(data.link) || null,
    resource_type: str(data.resource) || null,
    action_type: str(data.action) || null,
    read_at: data.read ? new Date().toISOString() : null,
    created_at: str(data.at) || new Date().toISOString(),
  })
}

async function upsertTicket(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('ticket', id)
  await supabase.from('maintenance_tickets').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    unit_id: await unitUuid(data.propertyId),
    category_key: str(data.categoryKey) || null,
    reported_by: await userUuid(data.reportedByUserId),
    title: str(data.title),
    description: str(data.description),
    priority: TICKET_PRI_TO_DB[str(data.priority)] ?? 'MEDIUM',
    status: TICKET_STATUS_TO_DB[str(data.status)] ?? 'OPEN',
    contractor_id: await userUuid(data.contractorId),
    assigned_to: await userUuid(data.assignedAgentId),
    cost_estimate: num(data.cost),
    warranty_covered: Boolean(data.warrantyCovered),
    updated_at: new Date().toISOString(),
  })
}

async function upsertMessage(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('message', id)
  await supabase.from('messages').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    thread_id: await resolveUuid('thread', str(data.threadId)),
    from_user_id: await userUuid(data.fromUserId),
    body: str(data.body),
    created_at: str(data.at) || new Date().toISOString(),
  })
}

async function upsertActivity(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('activity', id)
  await supabase.from('event_log').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    event_type: 'activity',
    payload: { text: data.text, user: data.user },
    created_at: str(data.at) || new Date().toISOString(),
  })
}

async function upsertPropertyEvent(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('property_event', id)
  const unitId = await unitUuid(data.propertyId)
  await supabase.from('event_log').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    event_type: 'property_event',
    subject_id: unitId,
    actor_user_id: await userUuid(data.actorUserId),
    payload: {
      propertyId: data.propertyId,
      actorName: data.actorName,
      action: data.action,
      changes: data.changes,
    },
    created_at: str(data.at) || new Date().toISOString(),
  })
}

async function upsertSuiteAlert(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('suite_alert', id)
  await supabase.from('suite_alerts').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    resource: str(data.resource),
    actions: data.actions ?? [],
    enabled: data.enabled !== false,
    popup_enabled: data.popupEnabled !== false,
    popup_duration_ms: num(data.popupDurationMs) ?? 6000,
    notify_roles: data.notifyRoles ?? [],
    updated_at: new Date().toISOString(),
  })
}

async function upsertViewingSlot(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('viewing_slot', id)
  await supabase.from('viewing_slots').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    unit_id: await unitUuid(data.propertyId),
    agent_id: await userUuid(data.agentId),
    slot_date: str(data.date),
    slot_time: str(data.time),
    capacity: num(data.capacity) ?? 1,
    booked_count: num(data.booked) ?? 0,
    status: str(data.status, 'Open').toUpperCase(),
    title: str(data.title) || null,
    notes: str(data.notes) || null,
    duration_minutes: num(data.durationMinutes),
    updated_at: new Date().toISOString(),
  })
}

async function upsertTenancy(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('tenancy', id)
  await supabase.from('leases').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    unit_id: await unitUuid(data.propertyId),
    tenant_id: await userUuid(data.tenantUserId),
    landlord_id: await userUuid(data.landlordId),
    agent_id: await userUuid(data.agentId),
    start_date: str(data.startDate),
    end_date: str(data.endDate) || null,
    rent_amount: num(data.rent) ?? 0,
    deposit_amount: num(data.deposit) ?? 0,
    status: str(data.status) === 'Active' ? 'ACTIVE' : 'PENDING',
    metadata: { keyCollection: data.keyCollection },
    updated_at: new Date().toISOString(),
  })
}

async function upsertDocument(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('document', id)
  await supabase.from('documents').upsert({
    id: uuid,
    client_id: await clientUuid(data.agencyId),
    unit_id: await unitUuid(data.propertyId),
    name: str(data.name),
    category: str(data.category, 'OTHER').toUpperCase(),
    status: str(data.status, 'pending').toUpperCase(),
    storage_url: str(data.fileUrl) || null,
    note: str(data.note) || null,
    uploaded_at: str(data.uploadedAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
}

async function upsertBuilding(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('building', id)
  const clientId = await clientUuid(data.clientId)
  await supabase.from('buildings').upsert({
    id: uuid,
    client_id: clientId,
    landlord_id: await userUuid(data.landlordId),
    name: str(data.name, 'Building'),
    address: str(data.addressLine1 ?? data.address, 'Address TBC'),
    city: str(data.city, 'Port Elizabeth'),
    province: str(data.province, 'Eastern Cape'),
    suburb: str(data.suburb) || null,
    grading: data.grading ? str(data.grading).charAt(0) : null,
    solar_capacity_kw: num(data.solarCapacityKw) ?? 0,
    has_borehole: Boolean(data.hasBorehole),
    lat: num(data.lat),
    lng: num(data.lng),
    place_id: str(data.placeId) || null,
    formatted_address: str(data.formattedAddress) || null,
    images: data.images ?? [],
    updated_at: new Date().toISOString(),
  })
}

async function upsertUnit(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('unit', id)
  const buildingUuid = await resolveUuid('building', str(data.buildingId))
  if (!buildingUuid) return
  const listingRaw = str(data.listingType ?? data.listingMode, 'rent').toUpperCase()
  const listingType =
    listingRaw === 'RENT' || listingRaw === 'SALE' || listingRaw === 'BOTH' || listingRaw === 'NOT_LISTED'
      ? listingRaw
      : 'RENT'
  await supabase.from('units').upsert({
    id: uuid,
    client_id: await clientUuid(data.clientId ?? data.agencyId),
    building_id: buildingUuid,
    unit_number: str(data.unitNumber, 'MAIN'),
    title: str(data.title),
    square_meters: num(data.squareMeters ?? data.area),
    bedrooms: num(data.bedrooms ?? data.beds) ?? 0,
    bathrooms: num(data.bathrooms ?? data.baths) ?? 0,
    parking: num(data.parking) ?? 0,
    listing_type: listingType,
    price: num(data.price),
    rent: num(data.rent),
    status_config_key: str(data.statusKey ?? data.status, 'DRAFT').toUpperCase(),
    agent_id: await userUuid(data.agentId),
    description: str(data.description) || null,
    amenities: data.amenities ?? [],
    images: data.images ?? [],
    featured: Boolean(data.featured),
    lat: num(data.lat),
    lng: num(data.lng),
    place_id: str(data.placeId) || null,
    formatted_address: str(data.formattedAddress) || null,
    updated_at: new Date().toISOString(),
  })
}

async function upsertRoom(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('room', id)
  const unitUuid = await resolveUuid('unit', str(data.unitId))
  if (!unitUuid) return
  const layout = data.layout as { x?: number; y?: number; w?: number; h?: number } | undefined
  await supabase.from('rooms').upsert({
    id: uuid,
    unit_id: unitUuid,
    client_id: await clientUuid(data.clientId),
    name: str(data.name, 'Room'),
    room_kind: str(data.kind, 'other'),
    beds: num(data.beds) ?? 0,
    baths: num(data.baths) ?? 0,
    area_sqm: num(data.areaSqm ?? data.area),
    layout_x: layout?.x ?? null,
    layout_y: layout?.y ?? null,
    layout_w: layout?.w ?? null,
    layout_h: layout?.h ?? null,
  })
}

async function upsertProperty(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const unitFe = str(data.unitId)
  const unitUuidVal =
    (unitFe ? await resolveUuid('unit', unitFe) : null) ?? (await ensureUuid('property', id))
  const clientId = await clientUuid(data.agencyId)
  const buildingFe = str(data.buildingId)
  const buildingUuid = buildingFe ? await resolveUuid('building', buildingFe) : null

  if (buildingUuid) {
    await supabase.from('units').upsert({
      id: unitUuidVal,
      client_id: clientId,
      building_id: buildingUuid,
      unit_number: str(data.unitNumber ?? data.unitId, 'MAIN').replace(/^unt-/, ''),
      title: str(data.title),
      square_meters: num(data.area),
      bedrooms: num(data.beds) ?? 0,
      bathrooms: num(data.baths),
      parking: num(data.parking),
      listing_type: data.deletedAt
        ? 'NOT_LISTED'
        : str(data.listingMode, 'rent').toUpperCase(),
      price: num(data.price),
      rent: num(data.rent),
      status_config_key:
        data.deletedAt
          ? 'DELETED'
          : str(data.statusKey)
            ? String(str(data.statusKey)).toUpperCase()
            : str(data.status) === 'Rented'
              ? 'OCCUPIED'
              : str(data.status) === 'Maintenance'
                ? 'MAINTENANCE'
                : str(data.status) === 'Draft'
                  ? 'DRAFT'
                  : str(data.status) === 'Featured'
                    ? 'FEATURED'
                    : str(data.status) === 'Under Offer'
                      ? 'UNDER_OFFER'
                      : 'PUBLISHED',
      agent_id: await userUuid(data.agentId),
      description: str(data.description),
      amenities: data.amenities ?? [],
      images: data.images ?? [],
      featured: data.deletedAt ? false : Boolean(data.featured),
      lat: num(data.lat),
      lng: num(data.lng),
      place_id: str(data.placeId) || null,
      formatted_address: str(data.formattedAddress) || null,
      updated_at: new Date().toISOString(),
    })
  }
}

async function deleteEntity(resource: EntityType, id: string): Promise<void> {
  const supabase = createClient()
  const uuid = await resolveUuid(resource === 'property' ? 'property' : resource, id)
  if (!uuid) return

  const tableMap: Partial<Record<EntityType, string>> = {
    agency: 'clients',
    user: 'users',
    lead: 'leads',
    application: 'applications',
    payment: 'payments',
    ticket: 'maintenance_tickets',
    notification: 'notifications',
    message: 'messages',
    document: 'documents',
    viewing: 'bookings',
    viewing_slot: 'viewing_slots',
    tenancy: 'leases',
    suite_alert: 'suite_alerts',
    property: 'units',
    activity: 'event_log',
    property_event: 'event_log',
  }
  const table = tableMap[resource]
  if (!table) return
  await supabase.from(table).delete().eq('id', uuid)
}

async function upsertLookup(id: string, data: Record<string, unknown>): Promise<void> {
  const supabase = createClient()
  const uuid = await ensureUuid('lookup', id)
  const clientId = await clientUuid(data.clientId)
  if (!clientId) throw new Error('lookup requires a valid clientId / agencyId')

  const { error } = await supabase.from('client_lookup_configs').upsert(
    {
      id: uuid,
      client_id: clientId,
      config_type: str(data.configType, 'CUSTOM'),
      key_value: str(data.keyValue, id),
      display_label: str(data.displayLabel, str(data.keyValue, id)),
      is_active: data.isActive !== false,
      sort_order: num(data.sortOrder) ?? 0,
      meta: {
        frontend_id: id,
        frontend_client_id: String(data.clientId ?? ''),
      },
    },
    { onConflict: 'id' },
  )
  if (error) throw error
}

async function upsertEntity(
  resource: EntityType,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  switch (resource) {
    case 'agency':
      return upsertAgency(id, data)
    case 'user':
      return upsertUser(id, data)
    case 'lead':
      return upsertLead(id, data)
    case 'application':
      return upsertApplication(id, data)
    case 'payment':
      return upsertPayment(id, data)
    case 'notification':
      return upsertNotification(id, data)
    case 'ticket':
      return upsertTicket(id, data)
    case 'message':
      return upsertMessage(id, data)
    case 'activity':
      return upsertActivity(id, data)
    case 'property_event':
      return upsertPropertyEvent(id, data)
    case 'suite_alert':
      return upsertSuiteAlert(id, data)
    case 'viewing_slot':
      return upsertViewingSlot(id, data)
    case 'tenancy':
      return upsertTenancy(id, data)
    case 'document':
      return upsertDocument(id, data)
    case 'building':
      return upsertBuilding(id, data)
    case 'unit':
      return upsertUnit(id, data)
    case 'room':
      return upsertRoom(id, data)
    case 'property':
      return upsertProperty(id, data)
    case 'lookup':
      return upsertLookup(id, data)
    default:
      console.warn('[supabase/persist] unhandled resource', resource, id)
  }
}

export async function persistToSupabase(op: PersistOp): Promise<boolean> {
  try {
    if (op.action === 'delete') {
      await deleteEntity(op.resource, op.id)
    } else {
      await upsertEntity(op.resource, op.id, op.data ?? { id: op.id })
    }
    return true
  } catch (err) {
    console.warn('[supabase/persist]', op.resource, op.action, op.id, err)
    return false
  }
}

export async function persistBatchToSupabase(ops: PersistOp[]): Promise<boolean> {
  try {
    await Promise.all(ops.map((op) => persistToSupabase(op)))
    return true
  } catch {
    return false
  }
}

export async function supabaseApproveApplication(params: {
  applicationId: string
  tenancy?: Record<string, unknown>
}): Promise<boolean> {
  const supabase = createClient()
  const { error } = await supabase.rpc('approve_application', {
    p_application_ref: params.applicationId,
    p_tenancy: params.tenancy ?? {},
  })
  if (error) {
    console.warn('[supabase/persist] approve_application', error.message)
    return false
  }
  return true
}

export async function supabaseMarkNotificationsRead(params: {
  ids?: string[]
  userId?: string
  all?: boolean
}): Promise<boolean> {
  const supabase = createClient()
  const now = new Date().toISOString()
  if (params.all && params.userId) {
    const userBackend = await userUuid(params.userId)
    if (!userBackend) return false
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .eq('user_id', userBackend)
      .is('read_at', null)
    return !error
  }
  if (params.ids?.length) {
    const uuids = await Promise.all(params.ids.map((id) => ensureUuid('notification', id)))
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: now })
      .in('id', uuids)
    return !error
  }
  return false
}

export async function persistActionToSupabase(
  resource: EntityType,
  action: PersistAction,
  id: string,
  data?: Record<string, unknown>,
): Promise<boolean> {
  return persistToSupabase({ resource, action, id, data })
}
