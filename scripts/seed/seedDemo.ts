import type { SupabaseClient } from '@supabase/supabase-js'
import type pg from 'pg'
import { AGENCY, AGENCY_FE_ID, AGENCY_ID } from './data/agency.js'
import {
  buildLookupRows,
  GLOBAL_CLIENT_FE_ID,
  GLOBAL_CLIENT_ROW,
  GLOBAL_CLIENT_UUID,
} from './data/lookups.js'
import { PROPERTIES } from './data/properties.js'
import { APPLICANTS, APPLICATION_DEFS, APPLICANT_DB_ROLE } from './data/applicants.js'
import { CONTRACTORS, contractorMetadata } from './data/contractors.js'
import { MAINTENANCE_TICKETS } from './data/maintenance.js'
import { AGENCY_ADMIN, AGENTS } from './data/users.js'
import {
  createAuthUser,
  DEMO_SAMPLE_PDF,
  fixedUuid,
  getAppUserIdByAuth,
  upsertEntityMap,
  type SeedEnv,
} from './helpers.js'
import { seedTrustData } from './seedTrust.js'

export type SeedResult = {
  agencyName: string
  clientId: string
  userCount: number
  propertyCount: number
  applicantCount: number
  applicationCount: number
  contractorCount: number
  maintenanceTicketCount: number
  credentials: Array<{ email: string; role: string; note?: string }>
}

type UserRegistry = Map<string, { appUserId: string; email: string; dbRole: string }>

export async function seedDemo(
  _pool: pg.Pool,
  admin: SupabaseClient,
  env: SeedEnv,
): Promise<SeedResult> {
  const users: UserRegistry = new Map()
  const unitByFe = new Map<string, { unitId: string; buildingId: string; agentFeId: string }>()
  const credentials: SeedResult['credentials'] = []

  // --- Global config client (preserve if already present after clear) ---
  const { data: existingGlobal } = await admin
    .from('clients')
    .select('id')
    .eq('id', GLOBAL_CLIENT_UUID)
    .maybeSingle()

  if (!existingGlobal) {
    const { error: globalClientErr } = await admin.from('clients').insert({
      ...GLOBAL_CLIENT_ROW,
      updated_at: new Date().toISOString(),
    })
    if (globalClientErr) throw globalClientErr

    const globalLookups = buildLookupRows(GLOBAL_CLIENT_UUID, GLOBAL_CLIENT_FE_ID, 'b1100000')
    for (let i = 0; i < globalLookups.length; i += 50) {
      const chunk = globalLookups.slice(i, i + 50)
      const { error } = await admin.from('client_lookup_configs').insert(chunk)
      if (error) throw error
    }
  }

  await upsertEntityMap(admin, 'agency', GLOBAL_CLIENT_FE_ID, GLOBAL_CLIENT_UUID)

  // --- Agency ---
  const { error: clientErr } = await admin.from('clients').insert({
    id: AGENCY_ID,
    company_name: AGENCY.company_name,
    subdomain: AGENCY.subdomain,
    status: AGENCY.status,
    trading_as: AGENCY.trading_as,
    email: AGENCY.email,
    phone: AGENCY.phone,
    city: AGENCY.city,
    province: AGENCY.province,
    country_code: AGENCY.country_code,
    timezone: AGENCY.timezone,
    currency_code: AGENCY.currency_code,
    settings: AGENCY.settings,
    updated_at: new Date().toISOString(),
  })
  if (clientErr) throw clientErr

  await upsertEntityMap(admin, 'agency', AGENCY_FE_ID, AGENCY_ID)

  const agencyLookups = buildLookupRows(AGENCY_ID, AGENCY_FE_ID, 'b1100001')
  for (let i = 0; i < agencyLookups.length; i += 50) {
    const chunk = agencyLookups.slice(i, i + 50)
    const { error } = await admin.from('client_lookup_configs').insert(chunk)
    if (error) throw error
  }

  async function registerStaff(def: {
    feId: string
    email: string
    firstName: string
    lastName: string
    phone: string
    dbRole: 'AGENCY_ADMIN' | 'AGENT_ADMIN' | 'GROUND_AGENT'
    extraMeta?: Record<string, unknown>
  }) {
    const authId = await createAuthUser(admin, {
      email: def.email,
      firstName: def.firstName,
      lastName: def.lastName,
      phone: def.phone,
      dbRole: def.dbRole,
      feId: def.feId,
      clientId: AGENCY_ID,
      password: env.demoPassword,
      metadata: def.extraMeta,
    })
    const appUserId = await getAppUserIdByAuth(admin, authId)
    users.set(def.feId, { appUserId, email: def.email, dbRole: def.dbRole })
    credentials.push({ email: def.email, role: def.dbRole })
  }

  // --- Agency admin + agents ---
  await registerStaff({
    ...AGENCY_ADMIN,
    extraMeta: { licenseStatus: 'n/a' },
  })

  for (const agent of AGENTS) {
    await registerStaff({
      feId: agent.feId,
      email: agent.email,
      firstName: agent.firstName,
      lastName: agent.lastName,
      phone: agent.phone,
      dbRole: agent.dbRole,
      extraMeta: {
        licenseStatus: agent.licenseStatus ?? 'full',
        commissionSharePct: agent.commissionSharePct,
      },
    })
  }

  // --- Contractors (approved + pending verification) ---
  for (const contractor of CONTRACTORS) {
    const authId = await createAuthUser(admin, {
      email: contractor.email,
      firstName: contractor.firstName,
      lastName: contractor.lastName,
      phone: contractor.phone,
      dbRole: 'CONTRACTOR',
      feId: contractor.feId,
      clientId: AGENCY_ID,
      password: env.demoPassword,
      metadata: contractorMetadata(contractor),
    })
    const appUserId = await getAppUserIdByAuth(admin, authId)
    users.set(contractor.feId, { appUserId, email: contractor.email, dbRole: 'CONTRACTOR' })
    const note =
      contractor.verificationStatus === 'approved' ? 'approved' : 'pending verification'
    credentials.push({ email: contractor.email, role: 'contractor', note })
  }

  // --- Vendor category routing (preferred contractors per trade) ---
  let vendorRouteIdx = 0
  for (const contractor of CONTRACTORS) {
    if (contractor.verificationStatus !== 'approved' || !contractor.vendorCategories?.length) continue
    const contractorUser = users.get(contractor.feId)
    if (!contractorUser) continue
    for (const categoryKey of contractor.vendorCategories) {
      vendorRouteIdx += 1
      const { error } = await admin.from('vendor_category_routes').insert({
        id: fixedUuid('b9010001', vendorRouteIdx),
        client_id: AGENCY_ID,
        category_key: categoryKey,
        contractor_user_id: contractorUser.appUserId,
        is_active: true,
      })
      if (error) throw error
    }
  }

  // --- Applicants (no tenants / leases) ---
  for (const applicant of APPLICANTS) {
    const authId = await createAuthUser(admin, {
      email: applicant.email,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      phone: applicant.phone,
      dbRole: APPLICANT_DB_ROLE,
      feId: applicant.feId,
      clientId: AGENCY_ID,
      password: env.demoPassword,
      metadata: { verification: { status: 'not_required' } },
    })
    const appUserId = await getAppUserIdByAuth(admin, authId)
    users.set(applicant.feId, { appUserId, email: applicant.email, dbRole: APPLICANT_DB_ROLE })
    credentials.push({ email: applicant.email, role: 'applicant' })
  }

  // --- Properties ---
  let buildingIdx = 0
  for (let i = 0; i < PROPERTIES.length; i++) {
    const p = PROPERTIES[i]
    buildingIdx += 1
    const buildingId = fixedUuid('b3000001', buildingIdx)
    const unitId = fixedUuid('b4000001', i + 1)
    const agent = users.get(p.agentFeId)
    if (!agent) throw new Error(`Agent not found: ${p.agentFeId}`)

    const { error: bErr } = await admin.from('buildings').insert({
      id: buildingId,
      client_id: AGENCY_ID,
      landlord_id: null,
      name: p.buildingName,
      address: p.address,
      city: 'Cape Town',
      province: 'Western Cape',
      suburb: p.suburb,
      grading: i % 3 === 0 ? 'A' : 'B',
      solar_capacity_kw: i % 4 === 0 ? 3.5 : 0,
      has_borehole: i % 5 === 0,
      lat: p.lat,
      lng: p.lng,
      formatted_address: `${p.address}, ${p.suburb}, Cape Town`,
      images: p.images,
      updated_at: new Date().toISOString(),
    })
    if (bErr) throw bErr

    const { error: uErr } = await admin.from('units').insert({
      id: unitId,
      building_id: buildingId,
      client_id: AGENCY_ID,
      unit_number: 'UNIT-1',
      square_meters: p.sqm,
      bedrooms: p.bedrooms,
      bathrooms: p.bathrooms,
      parking: p.parking,
      listing_type: p.listingType,
      price: p.price,
      rent: p.rent,
      status_config_key: p.statusKey,
      agent_id: agent.appUserId,
      title: p.title,
      description: p.description,
      amenities: p.amenities,
      images: p.images,
      featured: p.featured,
      lat: p.lat,
      lng: p.lng,
      formatted_address: `${p.address}, ${p.suburb}, Cape Town`,
      updated_at: new Date().toISOString(),
    })
    if (uErr) throw uErr

    await upsertEntityMap(admin, 'property', p.feId, unitId)
    await upsertEntityMap(admin, 'unit', p.feId, unitId)
    unitByFe.set(p.feId, { unitId, buildingId, agentFeId: p.agentFeId })

    for (let m = 0; m < p.images.length; m++) {
      const { error: mErr } = await admin.from('media_assets').insert({
        id: fixedUuid('b4100001', i * 3 + m + 1),
        client_id: AGENCY_ID,
        building_id: buildingId,
        unit_id: unitId,
        kind: 'IMAGE',
        storage_url: p.images[m],
        caption: p.title,
        sort_order: m,
        is_primary: m === 0,
      })
      if (mErr) throw mErr
    }

    if (p.statusKey !== 'DRAFT') {
      const { error: cocErr } = await admin.from('documents').insert({
        id: fixedUuid('b4200001', i + 1),
        client_id: AGENCY_ID,
        unit_id: unitId,
        building_id: buildingId,
        name: 'Electrical COC',
        category: 'COMPLIANCE',
        status: 'VERIFIED',
        storage_url: DEMO_SAMPLE_PDF,
        mime_type: 'application/pdf',
        uploaded_at: new Date().toISOString(),
      })
      if (cocErr) throw cocErr
    }
  }

  // --- Viewing slots on first published listings (for marketplace booking demos) ---
  const slotBase = new Date()
  slotBase.setDate(slotBase.getDate() + 3)
  let slotIdx = 0
  for (const p of PROPERTIES) {
    if (p.statusKey === 'DRAFT' || slotIdx >= 6) continue
    const unit = unitByFe.get(p.feId)
    if (!unit) continue
    const agent = users.get(unit.agentFeId)
    slotIdx += 1
    const slotId = fixedUuid('b8010001', slotIdx)
    const slotFeId = `VS-SCB-${String(slotIdx).padStart(3, '0')}`
    const slotDate = new Date(slotBase)
    slotDate.setDate(slotDate.getDate() + slotIdx)
    const dateStr = slotDate.toISOString().slice(0, 10)

    const { error: slotErr } = await admin.from('viewing_slots').insert({
      id: slotId,
      client_id: AGENCY_ID,
      unit_id: unit.unitId,
      agent_id: agent?.appUserId ?? null,
      slot_date: dateStr,
      slot_time: slotIdx % 2 === 0 ? '10:00' : '14:30',
      capacity: 3,
      booked_count: 0,
      status: 'OPEN',
      title: `Open viewing — ${p.title.slice(0, 40)}`,
      duration_minutes: 30,
      updated_at: new Date().toISOString(),
    })
    if (slotErr) throw slotErr
    await upsertEntityMap(admin, 'viewing_slot', slotFeId, slotId)
  }

  // --- Maintenance tickets (assigned + claimable jobs for contractor portal demos) ---
  for (let i = 0; i < MAINTENANCE_TICKETS.length; i++) {
    const ticket = MAINTENANCE_TICKETS[i]
    const unit = unitByFe.get(ticket.propertyFeId)
    if (!unit) throw new Error(`Maintenance ticket property missing: ${ticket.propertyFeId}`)
    const agent = users.get(ticket.agentFeId)
    const contractor = ticket.contractorFeId ? users.get(ticket.contractorFeId) : undefined

    const { error } = await admin.from('maintenance_tickets').insert({
      id: fixedUuid('b9020001', i + 1),
      client_id: AGENCY_ID,
      unit_id: unit.unitId,
      assigned_to: agent?.appUserId ?? null,
      contractor_id: contractor?.appUserId ?? null,
      category_key: ticket.categoryKey,
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
      warranty_covered: ticket.warrantyCovered ?? false,
      photos: [],
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
    await upsertEntityMap(admin, 'maintenance_ticket', ticket.feId, fixedUuid('b9020001', i + 1))
  }

  // --- Pipeline applications (no leases) ---
  for (let i = 0; i < APPLICATION_DEFS.length; i++) {
    const app = APPLICATION_DEFS[i]
    const applicant = users.get(app.applicantFeId)
    const unit = unitByFe.get(app.propertyFeId)
    if (!applicant || !unit) throw new Error(`Application refs missing: ${app.applicantFeId} / ${app.propertyFeId}`)
    const agent = users.get(unit.agentFeId)

    const { error } = await admin.from('applications').insert({
      id: fixedUuid('b7010001', i + 1),
      client_id: AGENCY_ID,
      unit_id: unit.unitId,
      applicant_id: applicant.appUserId,
      agent_id: agent?.appUserId ?? null,
      reference_code: app.ref,
      application_type: app.type,
      status: app.status,
      monthly_income: 52000 + i * 5000,
      employment_summary: 'Seeded applicant — manual test',
      move_in_date: app.type === 'RENTAL' ? '2026-09-01' : null,
      submitted_at: new Date().toISOString(),
    })
    if (error) throw error
  }

  // --- Trust & Banking demo data (GO#5 P0-7) ---
  const trustRefs = {
    unitIdByFe: new Map(PROPERTIES.map((p) => [p.feId, { unitId: unitByFe.get(p.feId)?.unitId ?? '' }])),
    appUserByFe: users,
  }
  await seedTrustData(admin, trustRefs)

  const draftCount = PROPERTIES.filter((p) => p.statusKey === 'DRAFT').length
  const rentCount = PROPERTIES.filter((p) => p.listingType === 'RENT' || p.listingType === 'BOTH').length
  const saleCount = PROPERTIES.filter((p) => p.listingType === 'SALE' || p.listingType === 'BOTH').length

  console.log(
    `Seeded ${PROPERTIES.length} properties (${rentCount} for rent, ${saleCount} for sale, ${draftCount} draft/unpublished)`,
  )
  console.log(
    `Seeded ${APPLICANTS.length} applicants, ${APPLICATION_DEFS.length} applications (no tenants, leases, or slot bookings)`,
  )
  console.log(
    `Seeded ${CONTRACTORS.length} contractors (${CONTRACTORS.filter((c) => c.verificationStatus === 'approved').length} approved), ${MAINTENANCE_TICKETS.length} maintenance tickets`,
  )
  console.log(
    `Seeded trust books: 7 transactions (1 unallocated, 1 split), 2 live payouts (dual-control), 3 deposit holdings, arrears ageing`,
  )

  return {
    agencyName: AGENCY.company_name,
    clientId: AGENCY_ID,
    userCount: users.size,
    propertyCount: PROPERTIES.length,
    applicantCount: APPLICANTS.length,
    applicationCount: APPLICATION_DEFS.length,
    contractorCount: CONTRACTORS.length,
    maintenanceTicketCount: MAINTENANCE_TICKETS.length,
    credentials,
  }
}
