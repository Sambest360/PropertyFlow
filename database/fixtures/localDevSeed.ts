/**
 * Shared local-dev fixture. The QA suite and the isolation job should import
 * this module (or the JSON next to it) instead of copying ids and emails.
 *
 * Every address is on the reserved `.test` TLD. Nothing here is a real person
 * or a real agency.
 */

export const LOCAL_DEV_PASSWORD = 'LocalDev-Password-1'

export const localDevRoles = [
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
  'applicant',
] as const

export type LocalDevRole = (typeof localDevRoles)[number]

export type LocalDevDbRole =
  | 'SUPER_ADMIN'
  | 'AGENCY_ADMIN'
  | 'AGENT_ADMIN'
  | 'GROUND_AGENT'
  | 'LANDLORD'
  | 'END_USER'
  | 'CONTRACTOR'

export type LocalDevUser = {
  role: LocalDevRole
  dbRole: LocalDevDbRole
  /** Value stored in users.metadata.frontend_role (what the SPA reads). */
  frontendRole: Exclude<LocalDevRole, 'applicant'>
  email: string
  password: string
  authUserId: string
  userId: string
  frontendId: string
  agencyId: string | null
  agencyFrontendId: string | null
  firstName: string
  lastName: string
  /** Applicants are END_USER rows with no lease. The SPA role is tenant. */
  persona: 'applicant' | null
}

export type LocalDevRecord = {
  id: string
  frontendId: string
}

export type LocalDevAgency = {
  id: string
  frontendId: string
  name: string
  subdomain: string
  email: string
  phone: string
  city: string
  province: string
  building: LocalDevRecord & { name: string; address: string }
  publishedUnit: LocalDevRecord & { title: string; unitNumber: string; rent: number }
  leasedUnit: LocalDevRecord & { title: string; unitNumber: string; rent: number }
  room: LocalDevRecord
  lead: LocalDevRecord & { name: string; email: string }
  application: LocalDevRecord & { reference: string }
  lease: LocalDevRecord & { reference: string }
  ticket: LocalDevRecord
  document: LocalDevRecord
  payment: LocalDevRecord
}

const DB_ROLE: Record<LocalDevRole, LocalDevDbRole> = {
  super_admin: 'SUPER_ADMIN',
  client_admin: 'AGENCY_ADMIN',
  agent_admin: 'AGENT_ADMIN',
  ground_agent: 'GROUND_AGENT',
  agent: 'GROUND_AGENT',
  landlord: 'LANDLORD',
  tenant: 'END_USER',
  contractor: 'CONTRACTOR',
  applicant: 'END_USER',
}

const FRONTEND_ROLE: Record<LocalDevRole, LocalDevUser['frontendRole']> = {
  super_admin: 'super_admin',
  client_admin: 'client_admin',
  agent_admin: 'agent_admin',
  ground_agent: 'ground_agent',
  agent: 'agent',
  landlord: 'landlord',
  tenant: 'tenant',
  contractor: 'contractor',
  applicant: 'tenant',
}

function uuid(prefix: string, n: number): string {
  return `${prefix}-0001-4000-8000-${n.toString(16).padStart(12, '0')}`
}

const AGENCY_ROLES = [
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
  'applicant',
] as const satisfies readonly LocalDevRole[]

const AGENCY_DEFS = [
  {
    slug: 'northwind',
    name: 'Fictional Northwind Lettings',
    city: 'Fictional Bay',
    province: 'Example Province',
    lastName: 'Ledger',
    firstNames: {
      client_admin: 'Ada',
      agent_admin: 'Ben',
      ground_agent: 'Cara',
      agent: 'Dan',
      landlord: 'Eva',
      tenant: 'Finn',
      contractor: 'Gus',
      applicant: 'Hal',
    },
    buildingName: 'Fictional Lantern House',
    address: '1 Example Lane',
    publishedTitle: 'Fictional Lantern flat',
    leasedTitle: 'Fictional Lantern annex',
  },
  {
    slug: 'southridge',
    name: 'Fictional Southridge Estates',
    city: 'Fictional Ridge',
    province: 'Example Province',
    lastName: 'Pebble',
    firstNames: {
      client_admin: 'Iris',
      agent_admin: 'Jules',
      ground_agent: 'Kit',
      agent: 'Lee',
      landlord: 'Mo',
      tenant: 'Nia',
      contractor: 'Omar',
      applicant: 'Pat',
    },
    buildingName: 'Fictional Pebble Court',
    address: '2 Sample Street',
    publishedTitle: 'Fictional Pebble flat',
    leasedTitle: 'Fictional Pebble annex',
  },
] as const

function buildAgencies(): LocalDevAgency[] {
  return AGENCY_DEFS.map((agency, index) => {
    const n = index + 1
    return {
      id: uuid('c1000001', n),
      frontendId: `ag-${agency.slug}`,
      name: agency.name,
      subdomain: agency.slug,
      email: `office.${agency.slug}@example.test`,
      phone: '+27 00 000 0000',
      city: agency.city,
      province: agency.province,
      building: {
        id: uuid('c3000001', n),
        frontendId: `bldg-${agency.slug}`,
        name: agency.buildingName,
        address: agency.address,
      },
      publishedUnit: {
        id: uuid('c4000001', index * 2 + 1),
        frontendId: `unit-${agency.slug}-published`,
        title: agency.publishedTitle,
        unitNumber: '1',
        rent: 8500,
      },
      leasedUnit: {
        id: uuid('c4000001', index * 2 + 2),
        frontendId: `unit-${agency.slug}-leased`,
        title: agency.leasedTitle,
        unitNumber: '2',
        rent: 7200,
      },
      room: { id: uuid('c5000001', n), frontendId: `room-${agency.slug}` },
      lead: {
        id: uuid('c6000001', n),
        frontendId: `lead-${agency.slug}`,
        name: `Fictional Enquirer ${agency.lastName}`,
        email: `enquirer.${agency.slug}@example.test`,
      },
      application: {
        id: uuid('c7000001', n),
        frontendId: `app-${agency.slug}`,
        reference: `APP-${agency.slug.toUpperCase()}-1`,
      },
      lease: {
        id: uuid('c8000001', n),
        frontendId: `lease-${agency.slug}`,
        reference: `LEASE-${agency.slug.toUpperCase()}-1`,
      },
      ticket: { id: uuid('c9000001', n), frontendId: `ticket-${agency.slug}` },
      document: { id: uuid('ca000001', n), frontendId: `doc-${agency.slug}` },
      payment: { id: uuid('cb000001', n), frontendId: `pay-${agency.slug}` },
    }
  })
}

function buildUsers(agencies: LocalDevAgency[]): LocalDevUser[] {
  const users: LocalDevUser[] = [
    {
      role: 'super_admin',
      dbRole: 'SUPER_ADMIN',
      frontendRole: 'super_admin',
      email: 'sam.platform@example.test',
      password: LOCAL_DEV_PASSWORD,
      authUserId: uuid('c2000001', 1),
      userId: uuid('c2100001', 1),
      frontendId: 'u-super-admin',
      agencyId: null,
      agencyFrontendId: null,
      firstName: 'Sam',
      lastName: 'Platform',
      persona: null,
    },
  ]

  agencies.forEach((agency, agencyIndex) => {
    const def = AGENCY_DEFS[agencyIndex]
    AGENCY_ROLES.forEach((role, roleIndex) => {
      const n = 10 + agencyIndex * 10 + roleIndex + 1
      const firstName = def.firstNames[role]
      users.push({
        role,
        dbRole: DB_ROLE[role],
        frontendRole: FRONTEND_ROLE[role],
        email: `${firstName}.${def.lastName}@example.test`.toLowerCase(),
        password: LOCAL_DEV_PASSWORD,
        authUserId: uuid('c2000001', n),
        userId: uuid('c2100001', n),
        frontendId: `u-${def.slug}-${role.replaceAll('_', '-')}`,
        agencyId: agency.id,
        agencyFrontendId: agency.frontendId,
        firstName,
        lastName: def.lastName,
        persona: role === 'applicant' ? 'applicant' : null,
      })
    })
  })

  return users
}

export const localDevAgencies: LocalDevAgency[] = buildAgencies()
export const localDevUsers: LocalDevUser[] = buildUsers(localDevAgencies)

export const localDevSeed = {
  password: LOCAL_DEV_PASSWORD,
  roles: localDevRoles,
  agencies: localDevAgencies,
  users: localDevUsers,
}

export type LocalDevSeed = typeof localDevSeed

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function userBy(agencyId: string, role: LocalDevRole): LocalDevUser {
  const user = localDevUsers.find((row) => row.agencyId === agencyId && row.role === role)
  if (!user) throw new Error(`Missing ${role} for ${agencyId}`)
  return user
}

function metadata(user: LocalDevUser): string {
  const body: Record<string, unknown> = {
    frontend_id: user.frontendId,
    frontend_role: user.frontendRole,
    mustChangePassword: false,
  }
  if (user.persona) body.persona = user.persona
  if (user.role === 'landlord' || user.role === 'contractor') {
    body.verification = { status: 'approved' }
  } else if (user.role === 'tenant' || user.role === 'applicant') {
    body.verification = { status: 'not_required' }
  }
  if (user.role === 'agent') body.licenseStatus = 'candidate'
  if (user.role === 'ground_agent') body.licenseStatus = 'full'
  return `${sqlString(JSON.stringify(body))}::jsonb`
}

function insertAuthUser(user: LocalDevUser): string {
  // Signup metadata says tenant so handle_new_auth_user does not open a
  // private landlord portfolio. The following UPDATE sets the real role.
  // The first insert (super admin) is still forced to SUPER_ADMIN by that trigger.
  const meta = JSON.stringify({
    first_name: user.firstName,
    last_name: user.lastName,
    role: 'tenant',
  })
  return `
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  ${sqlString(user.authUserId)}::uuid,
  'authenticated',
  'authenticated',
  ${sqlString(user.email)},
  crypt(${sqlString(LOCAL_DEV_PASSWORD)}, gen_salt('bf', 10)),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '{"provider":"email","providers":["email"]}'::jsonb,
  ${sqlString(meta)}::jsonb,
  false,
  false,
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  '', '', '', ''
);
INSERT INTO auth.identities (
  user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
) VALUES (
  ${sqlString(user.authUserId)}::uuid,
  'email',
  ${sqlString(user.authUserId)},
  jsonb_build_object(
    'sub', ${sqlString(user.authUserId)},
    'email', ${sqlString(user.email)},
    'email_verified', true,
    'phone_verified', false
  ),
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
UPDATE public.users SET
  id = ${sqlString(user.userId)}::uuid,
  client_id = ${user.agencyId ? `${sqlString(user.agencyId)}::uuid` : 'NULL'},
  first_name = ${sqlString(user.firstName)},
  last_name = ${sqlString(user.lastName)},
  role = ${sqlString(user.dbRole)},
  active = TRUE,
  password_hash = NULL,
  metadata = ${metadata(user)},
  updated_at = TIMESTAMPTZ '2026-01-15 00:00:00+00'
WHERE auth_user_id = ${sqlString(user.authUserId)}::uuid;
`
}

function mapInsert(entityType: string, frontendId: string, backendId: string): string {
  return `INSERT INTO entity_id_map (entity_type, frontend_id, backend_id) VALUES (${sqlString(entityType)}, ${sqlString(frontendId)}, ${sqlString(backendId)}::uuid);`
}

/** SQL applied by `supabase db reset` and `npm run db:seed:local`. */
export function renderLocalDevSeedSql(): string {
  const agencyIds = localDevAgencies.map((agency) => sqlString(agency.id)).join(', ')
  const lines: string[] = [
    '-- Local development fixture. Generated from database/fixtures/localDevSeed.ts.',
    '-- Fake agencies only. Re-running replaces rows owned by this fixture.',
    'BEGIN;',
    `DELETE FROM clients WHERE id IN (${agencyIds});`,
    `DELETE FROM auth.users WHERE email LIKE '%@example.test';`,
    `DELETE FROM entity_id_map WHERE frontend_id LIKE 'ag-%' OR frontend_id LIKE 'u-%' OR frontend_id LIKE 'bldg-%' OR frontend_id LIKE 'unit-%' OR frontend_id LIKE 'room-%' OR frontend_id LIKE 'lead-%' OR frontend_id LIKE 'app-%' OR frontend_id LIKE 'lease-%' OR frontend_id LIKE 'ticket-%' OR frontend_id LIKE 'doc-%' OR frontend_id LIKE 'pay-%';`,
  ]

  for (const agency of localDevAgencies) {
    lines.push(`
INSERT INTO clients (
  id, company_name, subdomain, status, trading_as, email, phone, city, province,
  country_code, timezone, currency_code, settings, updated_at
) VALUES (
  ${sqlString(agency.id)}::uuid,
  ${sqlString(agency.name)},
  ${sqlString(agency.subdomain)},
  'active',
  ${sqlString(agency.name)},
  ${sqlString(agency.email)},
  ${sqlString(agency.phone)},
  ${sqlString(agency.city)},
  ${sqlString(agency.province)},
  'ZA',
  'Africa/Johannesburg',
  'ZAR',
  ${sqlString(JSON.stringify({ frontend_id: agency.frontendId, fictional: true }))}::jsonb,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);`)
  }

  for (const user of localDevUsers) lines.push(insertAuthUser(user))

  lines.push(`
DELETE FROM entity_id_map m
WHERE m.entity_type = 'user'
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.backend_id);
DELETE FROM entity_id_map m
WHERE m.entity_type = 'agency'
  AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.id = m.backend_id);
`)

  for (const agency of localDevAgencies) {
    lines.push(mapInsert('agency', agency.frontendId, agency.id))
  }
  for (const user of localDevUsers) {
    lines.push(mapInsert('user', user.frontendId, user.userId))
  }

  for (const agency of localDevAgencies) {
    const landlord = userBy(agency.id, 'landlord')
    const agent = userBy(agency.id, 'ground_agent')
    const tenant = userBy(agency.id, 'tenant')
    const applicant = userBy(agency.id, 'applicant')
    const contractor = userBy(agency.id, 'contractor')
    lines.push(`
INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb, grading,
  lat, lng, formatted_address, updated_at
) VALUES (
  ${sqlString(agency.building.id)}::uuid,
  ${sqlString(agency.id)}::uuid,
  ${sqlString(landlord.userId)}::uuid,
  ${sqlString(agency.building.name)},
  ${sqlString(agency.building.address)},
  ${sqlString(agency.city)},
  ${sqlString(agency.province)},
  'Fictional Suburb',
  'B',
  -33.9000000,
  18.4000000,
  ${sqlString(`${agency.building.address}, ${agency.city}`)},
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms,
  listing_type, rent, status_config_key, agent_id, title, description, featured, updated_at
) VALUES
(
  ${sqlString(agency.publishedUnit.id)}::uuid,
  ${sqlString(agency.building.id)}::uuid,
  ${sqlString(agency.id)}::uuid,
  ${sqlString(agency.publishedUnit.unitNumber)},
  54,
  2,
  1,
  'RENT',
  ${agency.publishedUnit.rent},
  'PUBLISHED',
  ${sqlString(agent.userId)}::uuid,
  ${sqlString(agency.publishedUnit.title)},
  'Fictional published listing for local development. Not a real property.',
  TRUE,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
),
(
  ${sqlString(agency.leasedUnit.id)}::uuid,
  ${sqlString(agency.building.id)}::uuid,
  ${sqlString(agency.id)}::uuid,
  ${sqlString(agency.leasedUnit.unitNumber)},
  42,
  1,
  1,
  'RENT',
  ${agency.leasedUnit.rent},
  'OCCUPIED',
  ${sqlString(agent.userId)}::uuid,
  ${sqlString(agency.leasedUnit.title)},
  'Fictional occupied unit for the local lease. Not a real property.',
  FALSE,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO rooms (id, unit_id, client_id, name, room_kind, beds, sort_order)
VALUES (
  ${sqlString(agency.room.id)}::uuid,
  ${sqlString(agency.publishedUnit.id)}::uuid,
  ${sqlString(agency.id)}::uuid,
  'Fictional lounge',
  'living',
  0,
  1
);
INSERT INTO leads (
  id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
  interest_type, notes, updated_at
) VALUES (
  ${sqlString(agency.lead.id)}::uuid,
  ${sqlString(agency.id)}::uuid,
  ${sqlString(agency.publishedUnit.id)}::uuid,
  ${sqlString(agent.userId)}::uuid,
  ${sqlString(agency.lead.name)},
  ${sqlString(agency.lead.email)},
  '+27 00 000 0001',
  'website',
  'New',
  'RENT',
  'Fictional lead. Not a real enquiry.',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO applications (
  id, client_id, unit_id, applicant_id, agent_id, reference_code, application_type,
  status, monthly_income, employment_summary, message, submitted_at, updated_at
) VALUES (
  ${sqlString(agency.application.id)}::uuid,
  ${sqlString(agency.id)}::uuid,
  ${sqlString(agency.publishedUnit.id)}::uuid,
  ${sqlString(applicant.userId)}::uuid,
  ${sqlString(agent.userId)}::uuid,
  ${sqlString(agency.application.reference)},
  'RENTAL',
  'SUBMITTED',
  42000,
  'Fictional employment. Not a real applicant.',
  'Fictional application for local development.',
  TIMESTAMPTZ '2026-01-15 00:00:00+00',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO leases (
  id, client_id, unit_id, tenant_id, landlord_id, agent_id, lease_reference,
  status, start_date, end_date, rent_amount, deposit_amount, updated_at
) VALUES (
  ${sqlString(agency.lease.id)}::uuid,
  ${sqlString(agency.id)}::uuid,
  ${sqlString(agency.leasedUnit.id)}::uuid,
  ${sqlString(tenant.userId)}::uuid,
  ${sqlString(landlord.userId)}::uuid,
  ${sqlString(agent.userId)}::uuid,
  ${sqlString(agency.lease.reference)},
  'ACTIVE',
  DATE '2026-01-01',
  DATE '2026-12-31',
  ${agency.leasedUnit.rent},
  15000,
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO maintenance_tickets (
  id, client_id, unit_id, lease_id, reported_by, contractor_id, category_key,
  title, description, priority, status, updated_at
) VALUES (
  ${sqlString(agency.ticket.id)}::uuid,
  ${sqlString(agency.id)}::uuid,
  ${sqlString(agency.leasedUnit.id)}::uuid,
  ${sqlString(agency.lease.id)}::uuid,
  ${sqlString(tenant.userId)}::uuid,
  ${sqlString(contractor.userId)}::uuid,
  'plumbing',
  'Fictional dripping tap',
  'Fictional maintenance ticket. Not a real repair.',
  'MEDIUM',
  'OPEN',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO documents (
  id, client_id, unit_id, building_id, lease_id, uploaded_by, name, category,
  status, storage_url, mime_type, note, uploaded_at
) VALUES (
  ${sqlString(agency.document.id)}::uuid,
  ${sqlString(agency.id)}::uuid,
  ${sqlString(agency.leasedUnit.id)}::uuid,
  ${sqlString(agency.building.id)}::uuid,
  ${sqlString(agency.lease.id)}::uuid,
  ${sqlString(agent.userId)}::uuid,
  ${sqlString(`Fictional ${agency.subdomain} lease pack.txt`)},
  'LEASE',
  'UPLOADED',
  ${sqlString(`local-dev/${agency.subdomain}-lease.txt`)},
  'text/plain',
  'Fictional document. The bytes live in the local Storage bucket.',
  TIMESTAMPTZ '2026-01-15 00:00:00+00'
);
INSERT INTO payments (
  id, client_id, unit_id, lease_id, party_user_id, party_name, payment_type,
  amount, paid_amount, status, due_date, paid_at, method, reference, notes, updated_at
) VALUES (
  ${sqlString(agency.payment.id)}::uuid,
  ${sqlString(agency.id)}::uuid,
  ${sqlString(agency.leasedUnit.id)}::uuid,
  ${sqlString(agency.lease.id)}::uuid,
  ${sqlString(tenant.userId)}::uuid,
  ${sqlString(`${tenant.firstName} ${tenant.lastName}`)},
  'RENT',
  ${agency.leasedUnit.rent},
  ${agency.leasedUnit.rent},
  'PAID',
  DATE '2026-02-01',
  TIMESTAMPTZ '2026-02-01 08:00:00+00',
  'EFT',
  ${sqlString(`FAKE-${agency.subdomain.toUpperCase()}-RENT`)},
  'Fictional rent receipt. Not a real payment.',
  TIMESTAMPTZ '2026-02-01 08:00:00+00'
);`)
    lines.push(mapInsert('building', agency.building.frontendId, agency.building.id))
    lines.push(mapInsert('unit', agency.publishedUnit.frontendId, agency.publishedUnit.id))
    lines.push(mapInsert('unit', agency.leasedUnit.frontendId, agency.leasedUnit.id))
    lines.push(mapInsert('lead', agency.lead.frontendId, agency.lead.id))
    lines.push(mapInsert('application', agency.application.frontendId, agency.application.id))
    lines.push(mapInsert('lease', agency.lease.frontendId, agency.lease.id))
    lines.push(mapInsert('ticket', agency.ticket.frontendId, agency.ticket.id))
    lines.push(mapInsert('document', agency.document.frontendId, agency.document.id))
    lines.push(mapInsert('payment', agency.payment.frontendId, agency.payment.id))
  }

  lines.push('COMMIT;', '')
  return lines.join('\n')
}
