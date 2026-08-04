import type { SupabaseClient } from '@supabase/supabase-js'
import type pg from 'pg'
import { AGENCY, AGENCY_FE_ID, AGENCY_ID, LOOKUP_CONFIGS } from './data/agency.js'
import { CONTRACTORS, contractorMetadata } from './data/contractors.js'
import { PROPERTIES } from './data/properties.js'
import { APPLICATION_DEFS, LEASE_ASSIGNMENTS, TENANTS, TENANT_DB_ROLE } from './data/tenants.js'
import { AGENCY_ADMIN, AGENTS } from './data/users.js'
import {
  createAuthUser,
  DEMO_SAMPLE_PDF,
  fixedUuid,
  getAppUserIdByAuth,
  upsertEntityMap,
  type SeedEnv,
} from './helpers.js'

export type SeedResult = {
  agencyName: string
  clientId: string
  userCount: number
  propertyCount: number
  credentials: Array<{ email: string; role: string; note?: string }>
}

type UserRegistry = Map<string, { appUserId: string; email: string; dbRole: string }>

export async function seedDemo(
  _pool: pg.Pool,
  admin: SupabaseClient,
  env: SeedEnv,
): Promise<SeedResult> {
  const users: UserRegistry = new Map()
  const unitByFe = new Map<string, { unitId: string; buildingId: string; agentFeId: string; rent: number | null }>()
  const credentials: SeedResult['credentials'] = []

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

  for (let i = 0; i < LOOKUP_CONFIGS.length; i++) {
    const lc = LOOKUP_CONFIGS[i]
    const { error } = await admin.from('client_lookup_configs').insert({
      id: fixedUuid('b1100001', i + 1),
      client_id: AGENCY_ID,
      config_type: lc.config_type,
      key_value: lc.key_value,
      display_label: lc.display_label,
      is_active: true,
      sort_order: lc.sort_order,
    })
    if (error) throw error
  }

  async function registerStaff(def: {
    feId: string
    email: string
    firstName: string
    lastName: string
    phone: string
    dbRole: 'AGENT_ADMIN' | 'GROUND_AGENT'
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

  // --- Staff ---
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

  // --- Tenants ---
  for (const t of TENANTS) {
    const authId = await createAuthUser(admin, {
      email: t.email,
      firstName: t.firstName,
      lastName: t.lastName,
      phone: t.phone,
      dbRole: TENANT_DB_ROLE,
      feId: t.feId,
      clientId: AGENCY_ID,
      password: env.demoPassword,
      metadata: { verification: { status: 'not_required' } },
    })
    const appUserId = await getAppUserIdByAuth(admin, authId)
    users.set(t.feId, { appUserId, email: t.email, dbRole: TENANT_DB_ROLE })
    credentials.push({ email: t.email, role: 'tenant' })
  }

  // --- Contractors ---
  for (const c of CONTRACTORS) {
    const meta = contractorMetadata(c)
    const authId = await createAuthUser(admin, {
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      dbRole: 'CONTRACTOR',
      feId: c.feId,
      clientId: AGENCY_ID,
      password: env.demoPassword,
      metadata: meta,
    })
    const appUserId = await getAppUserIdByAuth(admin, authId)
    users.set(c.feId, { appUserId, email: c.email, dbRole: 'CONTRACTOR' })
    credentials.push({
      email: c.email,
      role: 'contractor',
      note: c.verificationStatus,
    })
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
      status_config_key: p.status,
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
    unitByFe.set(p.feId, { unitId, buildingId, agentFeId: p.agentFeId, rent: p.rent })

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

    if (p.featured) {
      const { error: mktErr } = await admin.from('documents').insert({
        id: fixedUuid('b4210001', i + 1),
        client_id: AGENCY_ID,
        unit_id: unitId,
        name: 'Marketing brochure',
        category: 'MARKETING',
        status: 'UPLOADED',
        storage_url: DEMO_SAMPLE_PDF,
        mime_type: 'application/pdf',
        uploaded_at: new Date().toISOString(),
      })
      if (mktErr) throw mktErr
    }

    if (p.withRooms) {
      const roomKinds = ['bedroom', 'bathroom', 'kitchen', 'living'] as const
      for (let r = 0; r < Math.min(p.bedrooms + 2, roomKinds.length); r++) {
        const { error: rErr } = await admin.from('rooms').insert({
          id: fixedUuid('b5000001', i * 4 + r + 1),
          unit_id: unitId,
          client_id: AGENCY_ID,
          name: roomKinds[r] === 'bedroom' ? `Bedroom ${r + 1}` : roomKinds[r],
          room_kind: roomKinds[r],
          beds: roomKinds[r] === 'bedroom' ? 1 : 0,
          baths: roomKinds[r] === 'bathroom' ? 1 : 0,
          sort_order: r + 1,
        })
        if (rErr) throw rErr
      }
    }
  }

  // --- Leases ---
  for (let i = 0; i < LEASE_ASSIGNMENTS.length; i++) {
    const la = LEASE_ASSIGNMENTS[i]
    const tenant = users.get(la.tenantFeId)
    const unit = unitByFe.get(la.propertyFeId)
    if (!tenant || !unit) throw new Error(`Lease refs missing: ${la.tenantFeId} / ${la.propertyFeId}`)
    const agent = users.get(unit.agentFeId)
    const rent = unit.rent ?? 15000

    const appId = fixedUuid('b7000001', i + 1)
    const { error: appErr } = await admin.from('applications').insert({
      id: appId,
      client_id: AGENCY_ID,
      unit_id: unit.unitId,
      applicant_id: tenant.appUserId,
      agent_id: agent?.appUserId ?? null,
      reference_code: `APP-${la.ref}`,
      application_type: 'RENTAL',
      status: 'LEASED',
      monthly_income: 45000 + i * 3000,
      employment_summary: 'Demo employer — seeded',
      submitted_at: new Date(Date.now() - 90 * 86400000).toISOString(),
    })
    if (appErr) throw appErr

    const { error: leaseErr } = await admin.from('leases').insert({
      id: fixedUuid('b8000001', i + 1),
      client_id: AGENCY_ID,
      unit_id: unit.unitId,
      application_id: appId,
      tenant_id: tenant.appUserId,
      landlord_id: null,
      agent_id: agent?.appUserId ?? null,
      lease_reference: la.ref,
      status: 'ACTIVE',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      rent_amount: rent,
      deposit_amount: rent * 2,
      rent_due_day: 1,
      document_url: DEMO_SAMPLE_PDF,
    })
    if (leaseErr) throw leaseErr

    const { error: leaseDocErr } = await admin.from('documents').insert({
      id: fixedUuid('b4220001', i + 1),
      client_id: AGENCY_ID,
      unit_id: unit.unitId,
      lease_id: fixedUuid('b8000001', i + 1),
      name: `Lease agreement ${la.ref}`,
      category: 'LEASE',
      status: 'VERIFIED',
      storage_url: DEMO_SAMPLE_PDF,
      mime_type: 'application/pdf',
      applicant_name: tenant.email,
      uploaded_at: new Date().toISOString(),
    })
    if (leaseDocErr) throw leaseDocErr
  }

  // --- Pipeline applications ---
  for (let i = 0; i < APPLICATION_DEFS.length; i++) {
    const app = APPLICATION_DEFS[i]
    const tenant = users.get(app.tenantFeId)
    const unit = unitByFe.get(app.propertyFeId)
    if (!tenant || !unit) throw new Error(`Application refs missing`)
    const agent = users.get(unit.agentFeId)

    const { error } = await admin.from('applications').insert({
      id: fixedUuid('b7010001', i + 1),
      client_id: AGENCY_ID,
      unit_id: unit.unitId,
      applicant_id: tenant.appUserId,
      agent_id: agent?.appUserId ?? null,
      reference_code: app.ref,
      application_type: app.type,
      status: app.status,
      monthly_income: 52000 + i * 5000,
      employment_summary: 'Seeded applicant — manual test',
      move_in_date: '2026-09-01',
      submitted_at: new Date().toISOString(),
    })
    if (error) throw error
  }

  // --- Vendor routes ---
  let routeIdx = 0
  for (const c of CONTRACTORS) {
    if (!c.vendorCategories?.length) continue
    const contractor = users.get(c.feId)
    if (!contractor) continue
    for (const cat of c.vendorCategories) {
      routeIdx += 1
      const { error } = await admin.from('vendor_category_routes').insert({
        id: fixedUuid('b9000001', routeIdx),
        client_id: AGENCY_ID,
        category_key: cat,
        contractor_user_id: contractor.appUserId,
        is_active: true,
      })
      if (error) throw error
    }
  }

  return {
    agencyName: AGENCY.company_name,
    clientId: AGENCY_ID,
    userCount: users.size,
    propertyCount: PROPERTIES.length,
    credentials,
  }
}
