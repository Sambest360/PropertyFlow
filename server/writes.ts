/**
 * Postgres write handlers for AppStore domain mutations.
 * Accepts frontend demo IDs; resolves/registers UUIDs via entity_id_map.
 */
import { query, withTransaction, clientQuery } from './db.js'
import {
  ensureEntityMapTable,
  ensureUuid,
  forgetId,
  isUuid,
  resolveUuid,
  type EntityType,
} from './entityMap.js'
import { SUB_FE_TO_UUID } from './idMap.js'

export type PersistAction = 'upsert' | 'delete' | 'patch'
export type PersistBody = {
  resource: EntityType
  action: PersistAction
  id: string
  data?: Record<string, unknown>
}

const ROLE_TO_DB: Record<string, string> = {
  super_admin: 'SUPER_ADMIN',
  client_admin: 'AGENCY_ADMIN',
  agency_admin: 'AGENCY_ADMIN',
  agent_admin: 'AGENT_ADMIN',
  agent: 'GROUND_AGENT',
  ground_agent: 'GROUND_AGENT',
  landlord: 'LANDLORD',
  tenant: 'END_USER',
  applicant: 'END_USER',
  contractor: 'CONTRACTOR',
}

const APP_STAGE_TO_DB: Record<string, string> = {
  Started: 'DRAFT',
  'Documents Pending': 'SUBMITTED',
  'Documents Submitted': 'SUBMITTED',
  'Viewing Booked': 'UNDER_REVIEW',
  'Under Review': 'UNDER_REVIEW',
  'Credit Check': 'CREDIT_CHECK',
  Approved: 'APPROVED',
  'Awaiting Payment': 'APPROVED',
  'Deposit Paid': 'APPROVED',
  'Lease Signed': 'LEASED',
  'Move-In Scheduled': 'LEASED',
  'Keys Handed Over': 'LEASED',
  'Active Tenancy': 'LEASED',
  Rejected: 'REJECTED',
  Withdrawn: 'WITHDRAWN',
  Blocked: 'REJECTED',
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
  Requested: 'OPEN',
  'In Progress': 'IN_PROGRESS',
  'Awaiting Parts': 'AWAITING_PARTS',
  Completed: 'COMPLETED',
  Resolved: 'RESOLVED',
  Cancelled: 'CANCELLED',
}

const TICKET_PRI_TO_DB: Record<string, string> = {
  Low: 'LOW',
  Medium: 'MEDIUM',
  High: 'HIGH',
  Urgent: 'URGENT',
  Emergency: 'EMERGENCY',
}

const VIEW_STATUS_TO_DB: Record<string, string> = {
  Scheduled: 'SCHEDULED',
  Completed: 'COMPLETED',
  'No-show': 'NO_SHOW',
  Cancelled: 'CANCELLED',
}

const SLOT_STATUS_TO_DB: Record<string, string> = {
  Open: 'OPEN',
  Full: 'FULL',
  Cancelled: 'CANCELLED',
}

const DOC_CAT_TO_DB: Record<string, string> = {
  Title: 'TITLE',
  Compliance: 'COMPLIANCE',
  Lease: 'LEASE',
  Inspection: 'INSPECTION',
  Marketing: 'MARKETING',
  Other: 'OTHER',
}

const TENANCY_STATUS_TO_DB: Record<string, string> = {
  Active: 'ACTIVE',
  'Pending Move-In': 'PENDING',
  Notice: 'NOTICE',
  Ended: 'ENDED',
  Cancelled: 'CANCELLED',
}

const CONDITION_TO_DB: Record<string, string> = {
  Excellent: 'EXCELLENT',
  Good: 'GOOD',
  Fair: 'FAIR',
  Damaged: 'DAMAGED',
  'Needs Replacement': 'NEEDS_REPLACEMENT',
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

function bool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v
  return fallback
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 1) return { first: parts[0] || 'User', last: '' }
  return { first: parts[0]!, last: parts.slice(1).join(' ') }
}

function listingType(mode: unknown): string {
  const m = String(mode ?? 'rent').toLowerCase()
  if (m === 'sale') return 'SALE'
  if (m === 'both') return 'BOTH'
  if (m === 'not_listed') return 'NOT_LISTED'
  return 'RENT'
}

function unitStatusFromProperty(status: unknown): string {
  const s = String(status ?? '')
  if (s === 'Rented' || s === 'Occupied') return 'OCCUPIED'
  if (s === 'Maintenance') return 'MAINTENANCE'
  if (s === 'Draft' || s === 'Archived') return 'OFF_MARKET'
  return 'AVAILABLE'
}

async function clientId(agencyId: unknown): Promise<string> {
  const id = await resolveUuid('agency', str(agencyId))
  if (!id) throw new Error(`Unknown agency: ${agencyId}`)
  return id
}

async function clientIdOptional(agencyId: unknown): Promise<string | null> {
  if (agencyId == null || agencyId === '') return null
  return clientId(agencyId)
}

async function resolveSubscriptionId(
  feSubId: unknown,
  clientUuid: string,
): Promise<string | null> {
  if (feSubId) {
    const fe = str(feSubId)
    if (SUB_FE_TO_UUID[fe]) return SUB_FE_TO_UUID[fe]!
    if (isUuid(fe)) return fe
  }
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM client_subscriptions WHERE client_id = $1::uuid LIMIT 1`,
    [clientUuid],
  )
  return rows[0]?.id ?? null
}

async function userId(fe: unknown): Promise<string | null> {
  if (!fe) return null
  return resolveUuid('user', str(fe))
}

async function unitIdFromProperty(propertyId: unknown): Promise<string | null> {
  if (!propertyId) return null
  return (
    (await resolveUuid('property', str(propertyId))) ??
    (await resolveUuid('unit', str(propertyId)))
  )
}

export async function handlePersist(body: PersistBody): Promise<{ ok: true; id: string; uuid: string }> {
  await ensureEntityMapTable()
  const { resource, action, id, data = {} } = body
  if (!resource || !action || !id) {
    throw Object.assign(new Error('resource, action, and id are required'), { status: 400 })
  }

  if (action === 'delete') {
    await deleteEntity(resource, id)
    return { ok: true, id, uuid: (await resolveUuid(resource, id)) ?? id }
  }

  const uuid = await upsertEntity(resource, id, data)
  return { ok: true, id, uuid }
}

async function deleteEntity(resource: EntityType, frontendId: string): Promise<void> {
  const uuid = await resolveUuid(resource, frontendId)
  if (!uuid) {
    await forgetId(resource, frontendId)
    return
  }

  const tableByType: Partial<Record<EntityType, string>> = {
    agency: 'clients',
    user: 'users',
    building: 'buildings',
    unit: 'units',
    property: 'units',
    room: 'rooms',
    asset: 'internal_assets',
    lead: 'leads',
    application: 'applications',
    tenancy: 'leases',
    viewing: 'bookings',
    viewing_slot: 'viewing_slots',
    payment: 'payments',
    ticket: 'maintenance_tickets',
    document: 'documents',
    notification: 'notifications',
    thread: 'message_threads',
    message: 'messages',
    lookup: 'client_lookup_configs',
    suite_alert: 'suite_alerts',
    activity: 'event_log',
    property_event: 'event_log',
    invoice: 'invoices',
  }
  const table = tableByType[resource]
  if (table) {
    await query(`DELETE FROM ${table} WHERE id = $1::uuid`, [uuid])
  }
  await forgetId(resource, frontendId)
  if (resource === 'property') await forgetId('unit', `unt-${frontendId}`)
}

async function upsertEntity(
  resource: EntityType,
  frontendId: string,
  data: Record<string, unknown>,
): Promise<string> {
  switch (resource) {
    case 'agency':
      return upsertAgency(frontendId, data)
    case 'user':
      return upsertUser(frontendId, data)
    case 'building':
      return upsertBuilding(frontendId, data)
    case 'property':
    case 'unit':
      return upsertProperty(frontendId, data)
    case 'room':
      return upsertRoom(frontendId, data)
    case 'asset':
      return upsertAsset(frontendId, data)
    case 'lead':
      return upsertLead(frontendId, data)
    case 'application':
      return upsertApplication(frontendId, data)
    case 'tenancy':
      return upsertTenancy(frontendId, data)
    case 'viewing':
      return upsertViewing(frontendId, data)
    case 'viewing_slot':
      return upsertViewingSlot(frontendId, data)
    case 'payment':
      return upsertPayment(frontendId, data)
    case 'ticket':
      return upsertTicket(frontendId, data)
    case 'document':
      return upsertDocument(frontendId, data)
    case 'notification':
      return upsertNotification(frontendId, data)
    case 'thread':
      return upsertThread(frontendId, data)
    case 'message':
      return upsertMessage(frontendId, data)
    case 'lookup':
      return upsertLookup(frontendId, data)
    case 'suite_alert':
      return upsertSuiteAlert(frontendId, data)
    case 'activity':
      return upsertActivity(frontendId, data)
    case 'property_event':
      return upsertPropertyEvent(frontendId, data)
    case 'invoice':
      return upsertInvoice(frontendId, data)
    default:
      throw Object.assign(new Error(`Unsupported resource: ${resource}`), { status: 400 })
  }
}

async function upsertAgency(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('agency', feId)
  const status = str(d.status, 'Active') === 'Suspended' ? 'suspended' : 'active'
  await query(
    `INSERT INTO clients (id, company_name, subdomain, status, city, settings, updated_at)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       subdomain = EXCLUDED.subdomain,
       status = EXCLUDED.status,
       city = EXCLUDED.city,
       settings = clients.settings || EXCLUDED.settings,
       updated_at = NOW()`,
    [
      uuid,
      str(d.name, 'Agency'),
      str(d.slug, feId),
      status,
      str(d.city),
      JSON.stringify({
        frontend_id: feId,
        enabledPermissions: d.enabledPermissions ?? [],
      }),
    ],
  )
  return uuid
}

async function upsertUser(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('user', feId)
  const { first, last } = splitName(str(d.name, 'User'))
  const feRole = str(d.role, 'tenant')
  const role = ROLE_TO_DB[feRole] ?? 'END_USER'
  const client = d.agencyId ? await clientId(d.agencyId) : null
  const email = str(d.email, `${feId}@propertyflow.local`)
  let passwordSql = `crypt('ChangeMe123!', gen_salt('bf'))`
  let passwordParam: string | null = null
  if (typeof d.passwordHash === 'string' && d.passwordHash) {
    passwordSql = `$10`
    passwordParam = d.passwordHash
  } else if (typeof d.tempPassword === 'string' && d.tempPassword) {
    const { hashPassword } = await import('./auth.js')
    passwordSql = `$10`
    passwordParam = await hashPassword(d.tempPassword)
  } else if (typeof d.password === 'string' && d.password) {
    const { hashPassword } = await import('./auth.js')
    passwordSql = `$10`
    passwordParam = await hashPassword(d.password)
  }
  const meta = {
    frontend_id: feId,
    frontend_role: feRole,
    enabledPermissions: d.enabledPermissions ?? null,
    licenseStatus: d.licenseStatus ?? null,
    mentorId: d.mentorId ?? null,
    commissionSharePct: d.commissionSharePct ?? null,
    mustChangePassword: Boolean(d.tempPassword),
    ...(d.verification ? { verification: d.verification } : {}),
    ...(d.company ? { company: d.company } : {}),
    ...(d.idNumberOrPassport ? { idNumberOrPassport: d.idNumberOrPassport } : {}),
  }
  if (passwordParam) {
    await query(
      `INSERT INTO users (
         id, client_id, email, password_hash, first_name, last_name, phone, role, active, metadata, updated_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, $10, $4, $5, $6, $7, $8, $9::jsonb, NOW()
       )
       ON CONFLICT (id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         email = EXCLUDED.email,
         password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         phone = EXCLUDED.phone,
         role = EXCLUDED.role,
         active = EXCLUDED.active,
         metadata = users.metadata || EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        uuid,
        client,
        email,
        first,
        last || first,
        d.phone ? str(d.phone) : null,
        role,
        bool(d.active, true),
        JSON.stringify(meta),
        passwordParam,
      ],
    )
  } else {
    await query(
      `INSERT INTO users (
         id, client_id, email, password_hash, first_name, last_name, phone, role, active, metadata, updated_at
       ) VALUES (
         $1::uuid, $2::uuid, $3, ${passwordSql}, $4, $5, $6, $7, $8, $9::jsonb, NOW()
       )
       ON CONFLICT (id) DO UPDATE SET
         client_id = EXCLUDED.client_id,
         email = EXCLUDED.email,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         phone = EXCLUDED.phone,
         role = EXCLUDED.role,
         active = EXCLUDED.active,
         metadata = users.metadata || EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        uuid,
        client,
        email,
        first,
        last || first,
        d.phone ? str(d.phone) : null,
        role,
        bool(d.active, true),
        JSON.stringify(meta),
      ],
    )
  }
  return uuid
}

async function upsertBuilding(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('building', feId)
  const client = await clientId(d.clientId ?? d.agencyId)
  const landlord = await userId(d.landlordId)
  await query(
    `INSERT INTO buildings (
       id, client_id, landlord_id, name, address, city, province, suburb, grading,
       solar_capacity_kw, has_borehole, lat, lng, place_id, formatted_address, geocoded_at,
       images, notes, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14, $15, $16::timestamptz,
       $17::jsonb, $18, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       landlord_id = EXCLUDED.landlord_id,
       name = EXCLUDED.name,
       address = EXCLUDED.address,
       city = EXCLUDED.city,
       province = EXCLUDED.province,
       suburb = EXCLUDED.suburb,
       grading = EXCLUDED.grading,
       solar_capacity_kw = EXCLUDED.solar_capacity_kw,
       has_borehole = EXCLUDED.has_borehole,
       lat = COALESCE(EXCLUDED.lat, buildings.lat),
       lng = COALESCE(EXCLUDED.lng, buildings.lng),
       place_id = COALESCE(EXCLUDED.place_id, buildings.place_id),
       formatted_address = COALESCE(EXCLUDED.formatted_address, buildings.formatted_address),
       geocoded_at = COALESCE(EXCLUDED.geocoded_at, buildings.geocoded_at),
       images = EXCLUDED.images,
       notes = EXCLUDED.notes,
       updated_at = NOW()`,
    [
      uuid,
      client,
      landlord,
      str(d.name, 'Building'),
      str(d.addressLine1 ?? d.address, 'Address TBD'),
      str(d.city, 'City'),
      str(d.province, 'GP'),
      str(d.suburb) || null,
      d.grading ? str(d.grading).slice(0, 1).toUpperCase() : null,
      num(d.solarCapacityKw) ?? 0,
      bool(d.hasBorehole),
      num(d.lat),
      num(d.lng),
      d.placeId ? str(d.placeId) : null,
      d.formattedAddress ? str(d.formattedAddress) : null,
      d.geocodedAt ? str(d.geocodedAt) : null,
      JSON.stringify(Array.isArray(d.images) ? d.images : []),
      d.notes ? str(d.notes) : null,
    ],
  )
  return uuid
}

async function upsertProperty(feId: string, d: Record<string, unknown>): Promise<string> {
  // Flat PropertyAsset → units row (+ ensure building if provided)
  const propFe = feId.startsWith('unt-') ? feId.slice(4) : feId
  const uuid = await ensureUuid('property', propFe)
  await ensureUuid('unit', `unt-${propFe}`, uuid)

  let buildingUuid = d.buildingId ? await resolveUuid('building', str(d.buildingId)) : null
  const client = await clientId(d.agencyId ?? d.clientId)

  if (!buildingUuid) {
    // Create a lightweight building shell for orphan property creates
    buildingUuid = await ensureUuid('building', `bld-auto-${propFe}`)
    await query(
      `INSERT INTO buildings (id, client_id, name, address, city, province, suburb, lat, lng, place_id, formatted_address, geocoded_at, images, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET
         address = COALESCE(EXCLUDED.address, buildings.address),
         city = COALESCE(EXCLUDED.city, buildings.city),
         suburb = COALESCE(EXCLUDED.suburb, buildings.suburb),
         lat = COALESCE(EXCLUDED.lat, buildings.lat),
         lng = COALESCE(EXCLUDED.lng, buildings.lng),
         place_id = COALESCE(EXCLUDED.place_id, buildings.place_id),
         formatted_address = COALESCE(EXCLUDED.formatted_address, buildings.formatted_address),
         geocoded_at = COALESCE(EXCLUDED.geocoded_at, buildings.geocoded_at),
         updated_at = NOW()`,
      [
        buildingUuid,
        client,
        str(d.title, propFe),
        str(d.address, 'Address TBD'),
        str(d.city, 'City'),
        'GP',
        str(d.suburb) || null,
        num(d.lat),
        num(d.lng),
        d.placeId ? str(d.placeId) : null,
        d.formattedAddress ? str(d.formattedAddress) : null,
        d.geocodedAt ? str(d.geocodedAt) : null,
        JSON.stringify(Array.isArray(d.images) ? d.images : []),
      ],
    )
  } else if (d.lat != null || d.placeId || d.formattedAddress || d.address) {
    // Geocode / address fields often live on the building
    await query(
      `UPDATE buildings SET
         address = COALESCE(NULLIF($2, ''), address),
         city = COALESCE(NULLIF($3, ''), city),
         suburb = COALESCE(NULLIF($4, ''), suburb),
         lat = COALESCE($5, lat),
         lng = COALESCE($6, lng),
         place_id = COALESCE($7, place_id),
         formatted_address = COALESCE($8, formatted_address),
         geocoded_at = COALESCE($9::timestamptz, geocoded_at),
         updated_at = NOW()
       WHERE id = $1::uuid`,
      [
        buildingUuid,
        str(d.address),
        str(d.city),
        str(d.suburb),
        num(d.lat),
        num(d.lng),
        d.placeId ? str(d.placeId) : null,
        d.formattedAddress ? str(d.formattedAddress) : null,
        d.geocodedAt ? str(d.geocodedAt) : null,
      ],
    )
  }

  const agent = await userId(d.agentId)
  const unitNumber = str(d.unitNumber ?? d.title, propFe).slice(0, 40)

  await query(
    `INSERT INTO units (
       id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
       listing_type, price, rent, status_config_key, agent_id, title, description, amenities,
       images, featured, lat, lng, place_id, formatted_address, geocoded_at, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13::uuid, $14, $15, $16::jsonb,
       $17::jsonb, $18, $19, $20, $21, $22, $23::timestamptz, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       building_id = EXCLUDED.building_id,
       client_id = EXCLUDED.client_id,
       unit_number = EXCLUDED.unit_number,
       square_meters = EXCLUDED.square_meters,
       bedrooms = EXCLUDED.bedrooms,
       bathrooms = EXCLUDED.bathrooms,
       parking = EXCLUDED.parking,
       listing_type = EXCLUDED.listing_type,
       price = EXCLUDED.price,
       rent = EXCLUDED.rent,
       status_config_key = EXCLUDED.status_config_key,
       agent_id = EXCLUDED.agent_id,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       amenities = EXCLUDED.amenities,
       images = EXCLUDED.images,
       featured = EXCLUDED.featured,
       lat = COALESCE(EXCLUDED.lat, units.lat),
       lng = COALESCE(EXCLUDED.lng, units.lng),
       place_id = COALESCE(EXCLUDED.place_id, units.place_id),
       formatted_address = COALESCE(EXCLUDED.formatted_address, units.formatted_address),
       geocoded_at = COALESCE(EXCLUDED.geocoded_at, units.geocoded_at),
       updated_at = NOW()`,
    [
      uuid,
      buildingUuid,
      client,
      unitNumber,
      num(d.area) ?? num(d.squareMeters),
      num(d.beds) ?? num(d.bedrooms) ?? 0,
      num(d.baths) ?? num(d.bathrooms) ?? 0,
      num(d.parking) ?? 0,
      listingType(d.listingMode ?? d.listingType),
      num(d.price),
      num(d.rent),
      str(d.statusKey) || unitStatusFromProperty(d.status),
      agent,
      str(d.title, unitNumber),
      str(d.description),
      JSON.stringify(Array.isArray(d.amenities) ? d.amenities : []),
      JSON.stringify(Array.isArray(d.images) ? d.images : []),
      bool(d.featured) || str(d.status) === 'Featured',
      num(d.lat),
      num(d.lng),
      d.placeId ? str(d.placeId) : null,
      d.formattedAddress ? str(d.formattedAddress) : null,
      d.geocodedAt ? str(d.geocodedAt) : null,
    ],
  )
  return uuid
}

async function upsertRoom(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('room', feId)
  const unit =
    (await resolveUuid('unit', str(d.unitId))) ??
    (await unitIdFromProperty(d.propertyId ?? d.unitId))
  if (!unit) throw new Error('room requires unitId')
  const client = await clientId(d.clientId ?? d.agencyId)
  const layout = (d.layout as Record<string, number> | undefined) ?? undefined
  const kind = str(d.kind ?? d.roomKind, 'other').toLowerCase()
  const roomKind = [
    'bedroom',
    'bathroom',
    'kitchen',
    'living',
    'dining',
    'study',
    'garage',
    'other',
  ].includes(kind)
    ? kind
    : 'other'

  await query(
    `INSERT INTO rooms (
       id, unit_id, client_id, name, room_kind, beds, baths, area_sqm,
       layout_x, layout_y, layout_w, layout_h, sort_order
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       room_kind = EXCLUDED.room_kind,
       beds = EXCLUDED.beds,
       baths = EXCLUDED.baths,
       area_sqm = EXCLUDED.area_sqm,
       layout_x = EXCLUDED.layout_x,
       layout_y = EXCLUDED.layout_y,
       layout_w = EXCLUDED.layout_w,
       layout_h = EXCLUDED.layout_h,
       sort_order = EXCLUDED.sort_order`,
    [
      uuid,
      unit,
      client,
      str(d.name, 'Room'),
      roomKind,
      num(d.beds) ?? 0,
      num(d.baths) ?? 0,
      num(d.area) ?? num(d.areaSqm),
      layout?.x ?? null,
      layout?.y ?? null,
      layout?.w ?? null,
      layout?.h ?? null,
      num(d.sortOrder) ?? 0,
    ],
  )
  return uuid
}

async function upsertAsset(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('asset', feId)
  const unit =
    (await resolveUuid('unit', str(d.unitId))) ?? (await unitIdFromProperty(d.propertyId))
  if (!unit) throw new Error('asset requires unitId')
  const client = await clientId(d.clientId ?? d.agencyId)
  const room = d.roomId ? await resolveUuid('room', str(d.roomId)) : null
  const condition =
    CONDITION_TO_DB[str(d.condition)] ??
    str(d.conditionStatus, 'GOOD').toUpperCase().replace(/\s+/g, '_')

  await query(
    `INSERT INTO internal_assets (
       id, room_id, unit_id, client_id, item_name, serial_number, asset_type_key,
       condition_status, brand, purchase_value, warranty_expires_at, notes, metadata, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7,
       $8, $9, $10, $11::timestamptz, $12, $13::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       room_id = EXCLUDED.room_id,
       item_name = EXCLUDED.item_name,
       serial_number = EXCLUDED.serial_number,
       asset_type_key = EXCLUDED.asset_type_key,
       condition_status = EXCLUDED.condition_status,
       brand = EXCLUDED.brand,
       purchase_value = EXCLUDED.purchase_value,
       warranty_expires_at = EXCLUDED.warranty_expires_at,
       notes = EXCLUDED.notes,
       metadata = internal_assets.metadata || EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      uuid,
      room,
      unit,
      client,
      str(d.itemName ?? d.name, 'Asset'),
      d.serialNumber ? str(d.serialNumber) : null,
      str(d.assetTypeKey ?? d.type, 'APPLIANCE').toUpperCase(),
      ['EXCELLENT', 'GOOD', 'FAIR', 'DAMAGED', 'NEEDS_REPLACEMENT'].includes(condition)
        ? condition
        : 'GOOD',
      d.brand ? str(d.brand) : null,
      num(d.purchaseValue),
      d.warrantyExpiresAt ? str(d.warrantyExpiresAt) : null,
      d.notes ? str(d.notes) : null,
      JSON.stringify({ frontend_id: feId }),
    ],
  )
  return uuid
}

async function upsertLead(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('lead', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  const agent = await userId(d.agentId)
  const interest = str(d.type, 'Rent').toLowerCase().startsWith('b') ? 'BUY' : 'RENT'

  await query(
    `INSERT INTO leads (
       id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
       interest_type, value_amount, notes, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9,
       $10, $11, $12, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       unit_id = EXCLUDED.unit_id,
       agent_id = EXCLUDED.agent_id,
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       channel = EXCLUDED.channel,
       stage = EXCLUDED.stage,
       interest_type = EXCLUDED.interest_type,
       value_amount = EXCLUDED.value_amount,
       notes = EXCLUDED.notes,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      agent,
      str(d.name, 'Lead'),
      d.email ? str(d.email) : null,
      d.phone ? str(d.phone) : null,
      d.channel ? str(d.channel) : null,
      str(d.stage, 'New'),
      interest,
      num(d.value),
      d.notes ? str(d.notes) : null,
    ],
  )
  return uuid
}

async function upsertApplication(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('application', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  if (!unit) throw new Error('application requires propertyId')
  const applicant = await userId(d.applicantUserId)
  const agent = await userId(d.agentId)
  const status =
    APP_STAGE_TO_DB[str(d.stage)] ??
    str(d.status, 'SUBMITTED').toUpperCase().replace(/\s+/g, '_')
  const appType = str(d.type, 'Rental').toLowerCase().startsWith('p') ? 'PURCHASE' : 'RENTAL'
  const ref = str(d.referenceCode ?? feId)

  await query(
    `INSERT INTO applications (
       id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type,
       status, monthly_income, employment_summary, message, uploaded_docs_json,
       move_in_date, metadata, submitted_at, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7,
       $8, $9, $10, $11, $12::jsonb,
       $13::date, $14::jsonb, COALESCE($15::timestamptz, NOW()), NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       unit_id = EXCLUDED.unit_id,
       applicant_id = EXCLUDED.applicant_id,
       agent_id = EXCLUDED.agent_id,
       status = EXCLUDED.status,
       monthly_income = EXCLUDED.monthly_income,
       employment_summary = EXCLUDED.employment_summary,
       message = EXCLUDED.message,
       uploaded_docs_json = EXCLUDED.uploaded_docs_json,
       move_in_date = COALESCE(EXCLUDED.move_in_date, applications.move_in_date),
       metadata = applications.metadata || EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      applicant,
      agent,
      ref,
      appType,
      status,
      num(d.income),
      d.employment ? str(d.employment) : null,
      d.notes ? str(d.notes) : null,
      JSON.stringify({
        documents: d.documents ?? d.docs ?? [],
        creditCheck: d.creditCheck ?? null,
        creditConsent: d.creditConsent ?? null,
      }),
      d.moveInDate ? str(d.moveInDate) : null,
      JSON.stringify({
        frontend_id: feId,
        applicantName: d.applicantName ?? null,
        email: d.email ?? null,
        phone: d.phone ?? null,
        viewingSlotId: d.viewingSlotId ?? null,
        progress: d.progress ?? null,
        keyCollection: d.keyCollection ?? null,
        stage: d.stage ?? null,
      }),
      d.submittedAt ? str(d.submittedAt) : null,
    ],
  )
  return uuid
}

async function upsertTenancy(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('tenancy', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  if (!unit) throw new Error('tenancy requires propertyId')
  const tenant = await userId(d.tenantUserId)
  const landlord = await userId(d.landlordId)
  const agent = await userId(d.agentId)
  const app = d.applicationId ? await resolveUuid('application', str(d.applicationId)) : null
  const status = TENANCY_STATUS_TO_DB[str(d.status, 'Active')] ?? 'ACTIVE'

  await query(
    `INSERT INTO leases (
       id, client_id, unit_id, application_id, tenant_id, landlord_id, agent_id,
       lease_reference, status, start_date, end_date, rent_amount, deposit_amount, metadata, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
       $8, $9, $10::date, $11::date, $12, $13, $14::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       rent_amount = EXCLUDED.rent_amount,
       deposit_amount = EXCLUDED.deposit_amount,
       tenant_id = EXCLUDED.tenant_id,
       landlord_id = EXCLUDED.landlord_id,
       agent_id = EXCLUDED.agent_id,
       metadata = leases.metadata || EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      app,
      tenant,
      landlord,
      agent,
      str(d.leaseReference ?? feId),
      status,
      str(d.startDate, new Date().toISOString().slice(0, 10)),
      d.endDate ? str(d.endDate) : null,
      num(d.rent) ?? 0,
      num(d.deposit) ?? 0,
      JSON.stringify({
        frontend_id: feId,
        tenantName: d.tenantName ?? null,
        keyCollection: d.keyCollection ?? null,
      }),
    ],
  )
  return uuid
}

async function upsertViewing(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('viewing', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  if (!unit) throw new Error('viewing requires propertyId')
  const agent = await userId(d.agentId)
  const slot = d.slotId ? await resolveUuid('viewing_slot', str(d.slotId)) : null
  const date = str(d.date, new Date().toISOString().slice(0, 10))
  const time = str(d.time, '10:00')
  const starts = `${date}T${time}:00`
  const status = VIEW_STATUS_TO_DB[str(d.status, 'Scheduled')] ?? 'SCHEDULED'

  await query(
    `INSERT INTO bookings (
       id, client_id, unit_id, slot_id, agent_id, visitor_name, visitor_email, starts_at, status, notes, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::timestamptz, $9, $10, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       visitor_name = EXCLUDED.visitor_name,
       visitor_email = EXCLUDED.visitor_email,
       starts_at = EXCLUDED.starts_at,
       status = EXCLUDED.status,
       agent_id = EXCLUDED.agent_id,
       slot_id = EXCLUDED.slot_id,
       notes = EXCLUDED.notes,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      slot,
      agent,
      str(d.applicantName, 'Visitor'),
      d.applicantEmail ? str(d.applicantEmail) : null,
      starts,
      status,
      d.notes ? str(d.notes) : null,
    ],
  )
  return uuid
}

async function upsertViewingSlot(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('viewing_slot', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  if (!unit) throw new Error('viewing_slot requires propertyId')
  const agent = await userId(d.agentId)
  const status = SLOT_STATUS_TO_DB[str(d.status, 'Open')] ?? 'OPEN'
  const capacity = num(d.capacity) ?? 3
  const booked = num(d.booked) ?? 0

  await query(
    `INSERT INTO viewing_slots (
       id, client_id, unit_id, agent_id, slot_date, slot_time, capacity, booked_count,
       status, title, notes, duration_minutes, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, $6, $7, $8,
       $9, $10, $11, $12, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       agent_id = EXCLUDED.agent_id,
       slot_date = EXCLUDED.slot_date,
       slot_time = EXCLUDED.slot_time,
       capacity = EXCLUDED.capacity,
       booked_count = EXCLUDED.booked_count,
       status = EXCLUDED.status,
       title = EXCLUDED.title,
       notes = EXCLUDED.notes,
       duration_minutes = EXCLUDED.duration_minutes,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      agent,
      str(d.date, new Date().toISOString().slice(0, 10)),
      str(d.time, '10:00'),
      capacity,
      booked,
      status,
      d.title ? str(d.title) : null,
      d.notes ? str(d.notes) : null,
      num(d.durationMinutes) ?? 30,
    ],
  )
  return uuid
}

async function upsertPayment(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('payment', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  const lease = d.tenancyId ? await resolveUuid('tenancy', str(d.tenancyId)) : null
  const app = d.applicationId ? await resolveUuid('application', str(d.applicationId)) : null
  const party = await userId(d.partyUserId)
  const recorded = await userId(d.recordedByUserId)
  const payType = PAY_TYPE_TO_DB[str(d.type, 'Other')] ?? 'OTHER'
  const status = PAY_STATUS_TO_DB[str(d.status, 'Due')] ?? 'DUE'

  await query(
    `INSERT INTO payments (
       id, client_id, unit_id, lease_id, application_id, party_user_id, party_name,
       payment_type, amount, paid_amount, status, due_date, paid_at, method, reference,
       notes, landlord_visible, recorded_by, attachments, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7,
       $8, $9, $10, $11, $12::date, $13::timestamptz, $14, $15,
       $16, $17, $18::uuid, $19::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       amount = EXCLUDED.amount,
       paid_amount = EXCLUDED.paid_amount,
       status = EXCLUDED.status,
       due_date = EXCLUDED.due_date,
       paid_at = EXCLUDED.paid_at,
       method = EXCLUDED.method,
       reference = EXCLUDED.reference,
       notes = EXCLUDED.notes,
       attachments = EXCLUDED.attachments,
       recorded_by = EXCLUDED.recorded_by,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      lease,
      app,
      party,
      str(d.partyName, 'Party'),
      payType,
      num(d.amount) ?? 0,
      num(d.paidAmount),
      status,
      str(d.dueDate, new Date().toISOString().slice(0, 10)),
      d.paidAt ? str(d.paidAt) : null,
      d.method ? str(d.method) : null,
      d.reference ? str(d.reference) : null,
      d.notes ? str(d.notes) : null,
      bool(d.landlordVisible, true),
      recorded,
      JSON.stringify(Array.isArray(d.attachments) ? d.attachments : []),
    ],
  )
  return uuid
}

async function upsertTicket(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('ticket', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId ?? d.unitId)
  if (!unit) throw new Error('ticket requires propertyId')
  const reported = await userId(d.reportedByUserId)
  const assigned = await userId(d.assignedAgentId ?? d.assignedTo)
  const contractor = await userId(d.contractorId)
  const asset = d.internalAssetId ? await resolveUuid('asset', str(d.internalAssetId)) : null
  const status = TICKET_STATUS_TO_DB[str(d.status, 'Open')] ?? 'OPEN'
  const priority = TICKET_PRI_TO_DB[str(d.priority, 'Medium')] ?? 'MEDIUM'

  await query(
    `INSERT INTO maintenance_tickets (
       id, client_id, unit_id, asset_id, reported_by, assigned_to, contractor_id,
       category_key, title, description, priority, status, warranty_covered,
       escalated_at, cost_estimate, cost_actual, photos, completed_at, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
       $8, $9, $10, $11, $12, $13,
       $14::timestamptz, $15, $16, $17::jsonb, $18::timestamptz, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       asset_id = EXCLUDED.asset_id,
       assigned_to = EXCLUDED.assigned_to,
       contractor_id = EXCLUDED.contractor_id,
       category_key = EXCLUDED.category_key,
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       priority = EXCLUDED.priority,
       status = EXCLUDED.status,
       warranty_covered = EXCLUDED.warranty_covered,
       escalated_at = COALESCE(EXCLUDED.escalated_at, maintenance_tickets.escalated_at),
       cost_estimate = EXCLUDED.cost_estimate,
       cost_actual = EXCLUDED.cost_actual,
       photos = EXCLUDED.photos,
       completed_at = EXCLUDED.completed_at,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      asset,
      reported,
      assigned,
      contractor,
      d.categoryKey ? str(d.categoryKey).toUpperCase() : null,
      str(d.title, 'Ticket'),
      str(d.description, ''),
      priority,
      status,
      bool(d.warrantyCovered),
      d.escalatedAt ? str(d.escalatedAt) : null,
      num(d.cost),
      num(d.cost),
      JSON.stringify(Array.isArray(d.photos) ? d.photos : []),
      status === 'COMPLETED' || status === 'RESOLVED' ? new Date().toISOString() : null,
    ],
  )
  return uuid
}

async function upsertDocument(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('document', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  const building = d.buildingId ? await resolveUuid('building', str(d.buildingId)) : null
  const uploadedBy = await userId(d.uploadedByUserId)
  const category = DOC_CAT_TO_DB[str(d.category, 'Other')] ?? 'OTHER'
  const statusMap: Record<string, string> = {
    Required: 'REQUIRED',
    Uploaded: 'UPLOADED',
    Verified: 'VERIFIED',
    Rejected: 'REJECTED',
  }
  const status = statusMap[str(d.status, 'Uploaded')] ?? 'UPLOADED'

  await query(
    `INSERT INTO documents (
       id, client_id, unit_id, building_id, uploaded_by, name, category, status,
       storage_url, note, applicant_name, uploaded_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8,
       $9, $10, $11, COALESCE($12::timestamptz, NOW())
     )
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       category = EXCLUDED.category,
       status = EXCLUDED.status,
       storage_url = EXCLUDED.storage_url,
       note = EXCLUDED.note,
       applicant_name = EXCLUDED.applicant_name`,
    [
      uuid,
      client,
      unit,
      building,
      uploadedBy,
      str(d.name, 'Document'),
      category,
      status,
      d.url ? str(d.url) : d.storageUrl ? str(d.storageUrl) : null,
      d.note ? str(d.note) : null,
      d.applicantName ? str(d.applicantName) : null,
      d.uploadedAt ? str(d.uploadedAt) : null,
    ],
  )
  return uuid
}

async function upsertNotification(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('notification', feId)
  const user = await userId(d.userId)
  if (!user) throw new Error('notification requires userId')
  const client = d.agencyId ? await resolveUuid('agency', str(d.agencyId)) : null

  await query(
    `INSERT INTO notifications (
       id, client_id, user_id, title, body, link_path, resource_type, action_type, broadcast_id, read_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9::uuid, $10::timestamptz
     )
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       body = EXCLUDED.body,
       link_path = EXCLUDED.link_path,
       read_at = EXCLUDED.read_at`,
    [
      uuid,
      client,
      user,
      str(d.title, 'Notification'),
      str(d.body, ''),
      d.link ? str(d.link) : null,
      d.resource ? str(d.resource) : null,
      d.action ? str(d.action) : null,
      d.broadcastId && String(d.broadcastId).length > 30 ? str(d.broadcastId) : null,
      d.read ? (d.readAt ? str(d.readAt) : new Date().toISOString()) : null,
    ],
  )
  return uuid
}

async function upsertThread(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('thread', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  const app = d.applicationId ? await resolveUuid('application', str(d.applicationId)) : null
  const routes = str(d.routesTo, 'Agent').toUpperCase().startsWith('AGENCY') ? 'AGENCY' : 'AGENT'

  // Map participant frontend ids → UUIDs when possible
  const rawParts = Array.isArray(d.participantIds) ? d.participantIds : []
  const parts: string[] = []
  for (const p of rawParts) {
    const u = await resolveUuid('user', str(p))
    parts.push(u ?? str(p))
  }

  await query(
    `INSERT INTO message_threads (
       id, client_id, unit_id, application_id, subject, routes_to, participant_ids, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       subject = EXCLUDED.subject,
       routes_to = EXCLUDED.routes_to,
       participant_ids = EXCLUDED.participant_ids,
       updated_at = NOW()`,
    [
      uuid,
      client,
      unit,
      app,
      str(d.subject, 'Thread'),
      routes,
      JSON.stringify(parts),
    ],
  )
  return uuid
}

async function upsertMessage(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('message', feId)
  const thread = await resolveUuid('thread', str(d.threadId))
  if (!thread) throw new Error('message requires threadId')
  const client = await clientId(d.agencyId)
  const from = await userId(d.fromUserId)
  if (!from) throw new Error('message requires fromUserId')

  await query(
    `INSERT INTO messages (id, thread_id, client_id, from_user_id, body, created_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, COALESCE($6::timestamptz, NOW()))
     ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body`,
    [uuid, thread, client, from, str(d.body, ''), d.at ? str(d.at) : null],
  )
  await query(`UPDATE message_threads SET updated_at = NOW() WHERE id = $1::uuid`, [thread])
  return uuid
}

async function upsertLookup(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('lookup', feId)
  const client = await clientId(d.clientId === 'global' || !d.clientId ? 'ag-horizon' : d.clientId)
  await query(
    `INSERT INTO client_lookup_configs (
       id, client_id, config_type, key_value, display_label, is_active, sort_order, meta
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb
     )
     ON CONFLICT (id) DO UPDATE SET
       display_label = EXCLUDED.display_label,
       is_active = EXCLUDED.is_active,
       sort_order = EXCLUDED.sort_order,
       key_value = EXCLUDED.key_value`,
    [
      uuid,
      client,
      str(d.configType, 'CUSTOM'),
      str(d.keyValue, feId),
      str(d.displayLabel, str(d.keyValue, feId)),
      bool(d.isActive, true),
      num(d.sortOrder) ?? 0,
      JSON.stringify({ frontend_id: feId }),
    ],
  )
  return uuid
}

async function upsertSuiteAlert(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('suite_alert', feId)
  const client = await clientIdOptional(d.agencyId)
  const actions = Array.isArray(d.actions) ? d.actions : ['created', 'updated', 'deleted']
  const notifyRoles = Array.isArray(d.notifyRoles) ? d.notifyRoles : []

  await query(
    `INSERT INTO suite_alerts (
       id, client_id, resource, actions, enabled, popup_enabled, popup_duration_ms, notify_roles, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4::jsonb, $5, $6, $7, $8::jsonb, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       resource = EXCLUDED.resource,
       actions = EXCLUDED.actions,
       enabled = EXCLUDED.enabled,
       popup_enabled = EXCLUDED.popup_enabled,
       popup_duration_ms = EXCLUDED.popup_duration_ms,
       notify_roles = EXCLUDED.notify_roles,
       updated_at = NOW()`,
    [
      uuid,
      client,
      str(d.resource, 'property'),
      JSON.stringify(actions),
      bool(d.enabled, true),
      bool(d.popupEnabled, true),
      num(d.popupDurationMs) ?? 6000,
      JSON.stringify(notifyRoles),
    ],
  )
  return uuid
}

async function upsertActivity(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('activity', feId)
  const client = await clientIdOptional(d.agencyId)
  const payload = {
    text: str(d.text, ''),
    user: str(d.user, 'System'),
  }

  await query(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, $2::uuid, 'activity', 'agency', NULL, NULL, $3::jsonb, COALESCE($4::timestamptz, NOW()))
     ON CONFLICT (id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       payload = EXCLUDED.payload`,
    [uuid, client, JSON.stringify(payload), d.at ? str(d.at) : null],
  )
  return uuid
}

async function upsertPropertyEvent(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('property_event', feId)
  const client = await clientId(d.agencyId)
  const unit = await unitIdFromProperty(d.propertyId)
  const actor = await userId(d.actorUserId)
  const payload = {
    actorName: str(d.actorName, 'System'),
    action: str(d.action, 'updated'),
    changes: Array.isArray(d.changes) ? d.changes : [],
    propertyId: str(d.propertyId, ''),
  }

  await query(
    `INSERT INTO event_log (
       id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at
     ) VALUES (
       $1::uuid, $2::uuid, 'property_event', 'property', $3::uuid, $4::uuid, $5::jsonb,
       COALESCE($6::timestamptz, NOW())
     )
     ON CONFLICT (id) DO UPDATE SET
       payload = EXCLUDED.payload,
       actor_user_id = EXCLUDED.actor_user_id,
       subject_id = EXCLUDED.subject_id`,
    [uuid, client, unit, actor, JSON.stringify(payload), d.at ? str(d.at) : null],
  )
  return uuid
}

async function upsertInvoice(feId: string, d: Record<string, unknown>): Promise<string> {
  const uuid = await ensureUuid('invoice', feId)
  const client = await clientId(d.clientId)
  const subscriptionId = await resolveSubscriptionId(d.subscriptionId, client)
  const lineItems = Array.isArray(d.lineItems) ? d.lineItems : []
  const status = str(d.paymentStatus, 'UNPAID').toUpperCase()
  const allowed = new Set(['UNPAID', 'PAID', 'FAILED', 'VOID'])
  const paymentStatus = allowed.has(status) ? status : 'UNPAID'

  await query(
    `INSERT INTO invoices (
       id, client_id, subscription_id, billing_period_start, billing_period_end,
       base_amount, asset_usage_amount, vat_amount, total_amount_due, payment_status, line_items, created_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::date, $5::date,
       $6, $7, $8, $9, $10, $11::jsonb, COALESCE($12::timestamptz, NOW())
     )
     ON CONFLICT (id) DO UPDATE SET
       payment_status = EXCLUDED.payment_status,
       base_amount = EXCLUDED.base_amount,
       asset_usage_amount = EXCLUDED.asset_usage_amount,
       vat_amount = EXCLUDED.vat_amount,
       total_amount_due = EXCLUDED.total_amount_due,
       line_items = EXCLUDED.line_items`,
    [
      uuid,
      client,
      subscriptionId,
      str(d.billingPeriodStart, new Date().toISOString().slice(0, 10)),
      str(d.billingPeriodEnd, new Date().toISOString().slice(0, 10)),
      num(d.baseAmount) ?? 0,
      num(d.assetUsageAmount) ?? 0,
      num(d.vatAmount) ?? 0,
      num(d.totalAmountDue) ?? 0,
      paymentStatus,
      JSON.stringify(lineItems),
      d.createdAt ? str(d.createdAt) : null,
    ],
  )
  return uuid
}

/** Approve application: status → APPROVED, create lease, mark unit OCCUPIED. */
export async function approveApplicationTx(params: {
  applicationId: string
  actorUserId?: string
  tenancy?: Record<string, unknown>
}): Promise<{ applicationUuid: string; leaseUuid: string | null }> {
  await ensureEntityMapTable()
  const appUuid = await resolveUuid('application', params.applicationId)
  if (!appUuid) throw Object.assign(new Error('Application not found'), { status: 404 })

  return withTransaction(async (client) => {
    const apps = await clientQuery<{
      id: string
      client_id: string
      unit_id: string
      applicant_id: string | null
      agent_id: string | null
      status: string
      monthly_income: string | null
    }>(client, `SELECT * FROM applications WHERE id = $1::uuid FOR UPDATE`, [appUuid])
    const app = apps[0]
    if (!app) throw Object.assign(new Error('Application not found'), { status: 404 })

    const actorUuid = params.actorUserId
      ? await resolveUuid('user', params.actorUserId)
      : null
    await clientQuery(
      client,
      `UPDATE applications SET status = 'APPROVED', decided_at = NOW(), decided_by = $2::uuid, updated_at = NOW()
       WHERE id = $1::uuid`,
      [appUuid, actorUuid],
    )

    await clientQuery(
      client,
      `UPDATE units SET status_config_key = 'OCCUPIED', updated_at = NOW() WHERE id = $1::uuid`,
      [app.unit_id],
    )

    let leaseUuid: string | null = null
    const t = params.tenancy
    if (t?.id) {
      leaseUuid = await ensureUuid('tenancy', str(t.id))
      const landlord = t.landlordId ? await resolveUuid('user', str(t.landlordId)) : null
      await clientQuery(
        client,
        `INSERT INTO leases (
           id, client_id, unit_id, application_id, tenant_id, landlord_id, agent_id,
           lease_reference, status, start_date, end_date, rent_amount, deposit_amount, metadata, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
           $8, 'PENDING', $9::date, $10::date, $11, $12, $13::jsonb, NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           application_id = EXCLUDED.application_id,
           updated_at = NOW()`,
        [
          leaseUuid,
          app.client_id,
          app.unit_id,
          appUuid,
          app.applicant_id,
          landlord,
          app.agent_id,
          str(t.id),
          str(t.startDate, new Date().toISOString().slice(0, 10)),
          t.endDate ? str(t.endDate) : null,
          num(t.rent) ?? 0,
          num(t.deposit) ?? 0,
          JSON.stringify({ frontend_id: str(t.id), from_approval: true }),
        ],
      )
    }

    return { applicationUuid: appUuid, leaseUuid }
  })
}

/** Mark notification(s) read. */
export async function markNotificationsRead(params: {
  ids?: string[]
  userId?: string
  all?: boolean
}): Promise<{ updated: number }> {
  await ensureEntityMapTable()
  if (params.all && params.userId) {
    const user = await resolveUuid('user', params.userId)
    if (!user) return { updated: 0 }
    const rows = await query(
      `UPDATE notifications SET read_at = NOW() WHERE user_id = $1::uuid AND read_at IS NULL RETURNING id`,
      [user],
    )
    return { updated: rows.length }
  }
  let updated = 0
  for (const id of params.ids ?? []) {
    const uuid = await resolveUuid('notification', id)
    if (!uuid) continue
    const rows = await query(
      `UPDATE notifications SET read_at = NOW() WHERE id = $1::uuid RETURNING id`,
      [uuid],
    )
    updated += rows.length
  }
  return { updated }
}
