import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Test-only password fixtures, built at runtime (not credentials). */
const TEST_FIXTURE_TEMP_PW = ['test', 'fixture', 'temp', 'pw'].join('-')
const TEST_FIXTURE_PLAIN_PW = ['test', 'fixture', 'plain', 'pw'].join('-')
const TEST_FIXTURE_NEW_PW = ['test', 'fixture', 'new', 'pw'].join('-')
const TEST_FIXTURE_HASH = ['$2a', '10', 'test-fixture-hash'].join('$')


/**
 * Jim #80 blockers: user self-promotion, cross-user / cross-agency user writes,
 * owner takeover of notifications and applications, verification writes.
 * Drives the real assertPersistAllowed (+ enforceUserWritePolicy) and the real
 * upsertUser over a small in-memory model of the tables they read.
 */
const query = vi.fn()
const resolveUuid = vi.fn()

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  resolveUuid: (...args: unknown[]) => resolveUuid(...args),
  ensureUuid: vi.fn(async (_t: string, fe: string) => UUID[fe] ?? '00000000-0000-4000-8000-00000000ffff'),
  forgetId: vi.fn(),
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

vi.mock('./supabase/registerUser.js', () => ({ linkStaffAuthUser: vi.fn() }))

/** Listing → unit for applications (p-1 public, p-2 landlord u-o's, p-draft not listed). */
vi.mock('./listingResolve.js', async () => {
  const actual = await vi.importActual<typeof import('./listingResolve.js')>('./listingResolve.js')
  return {
    ...actual,
    resolveLiveListing: async (p: unknown) => {
      const unit = LISTING_UNIT[String(p)]
      if (!unit) throw new Error(`no live listing for ${String(p)}`)
      return { unitId: unit, clientId: CA }
    },
  }
})

const loadIdMapCache = vi.fn()
vi.mock('./idMapCache.js', async () => {
  const actual = await vi.importActual<typeof import('./idMapCache.js')>('./idMapCache.js')
  return { ...actual, loadIdMapCache: (...args: unknown[]) => loadIdMapCache(...args) }
})

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CA = id(1)
const CB = id(2)
const UN1 = id(10)
const UN2 = id(11)
const UN3 = id(12)
const LISTING_UNIT: Record<string, string> = { 'p-1': UN1, 'p-2': UN2, 'p-draft': UN3 }
/** units.status_config_key per unit (isPubliclyListedForApplication). */
const unitStatus: Record<string, string> = { [UN1]: 'PUBLISHED', [UN2]: 'PUBLISHED', [UN3]: 'DRAFT' }
const UUID: Record<string, string> = {
  'u-t': id(20),
  'u-o': id(21),
  'u-admin': id(22),
  'u-agent': id(23),
  'u-b': id(24),
  'u-sa': id(25),
  'u-admin-noperm': id(26),
  'A-t': id(30),
  'A-o': id(31),
  'A-l': id(32),
  'N-o': id(40),
  'N-t': id(41),
  'ag-a': CA,
  'ag-b': CB,
}
const FE_BY_UUID = new Map(Object.entries(UUID).map(([fe, u]) => [u, fe]))

const users: Record<string, { client: string | null; metadata: Record<string, unknown>; email?: string; role?: string }> = {
  [UUID['u-t']]: { client: null, metadata: {} },
  [UUID['u-o']]: { client: null, metadata: {} },
  [UUID['u-admin']]: { client: CA, metadata: {} },
  [UUID['u-admin-noperm']]: { client: CA, metadata: { enabledPermissions: ['assets.view'] } },
  [UUID['u-agent']]: { client: CA, metadata: {} },
  [UUID['u-b']]: { client: CB, metadata: {} },
  [UUID['u-sa']]: { client: null, metadata: {} },
}
type AppRow = {
  applicant: string | null
  unit: string
  client: string
  ref: string
  wf?: string
  docsJson?: Record<string, unknown>
  metadata?: Record<string, unknown>
}
const applications: Record<string, AppRow> = {
  [UUID['A-t']]: { applicant: UUID['u-t'], unit: UN1, client: CA, ref: 'A-t' },
  [UUID['A-o']]: { applicant: UUID['u-o'], unit: UN1, client: CA, ref: 'A-o', wf: 'landlord_review' },
  // On landlord u-o's own property (UN2), waiting for the landlord.
  [UUID['A-l']]: { applicant: UUID['u-t'], unit: UN2, client: CA, ref: 'A-l', wf: 'landlord_review' },
}
const notifications: Record<string, { user: string; client: string | null }> = {
  [UUID['N-o']]: { user: UUID['u-o'], client: CA },
  [UUID['N-t']]: { user: UUID['u-t'], client: CA },
}

function answer(sqlRaw: string, params: unknown[] = []): unknown[] {
  const sql = sqlRaw.replace(/\s+/g, ' ').trim()
  if (sql.includes('FROM units u JOIN buildings b ON b.id = u.building_id') && !sql.includes('WHERE')) {
    return [
      { unit_id: UN1, client_id: CA, agent_id: UUID['u-agent'], landlord_id: null },
      { unit_id: UN2, client_id: CA, agent_id: UUID['u-agent'], landlord_id: UUID['u-o'] },
      { unit_id: UN3, client_id: CA, agent_id: UUID['u-agent'], landlord_id: null },
    ]
  }
  if (sql.includes('FROM units u LEFT JOIN buildings b') && sql.includes('WHERE u.id')) {
    const st = unitStatus[String(params[0])]
    return st ? [{ status_config_key: st, listing_type: 'RENT', landlord_verification: null }] : []
  }
  if (/SELECT role, metadata, email FROM users WHERE id = \$1::uuid/.test(sql)) {
    const u = users[String(params[0])]
    return u ? [{ role: u.role ?? '', metadata: u.metadata, email: u.email ?? null }] : []
  }
  if (sql.startsWith('SELECT uploaded_docs_json, metadata')) {
    const a = applications[String(params[0])]
    return a
      ? [{ uploaded_docs_json: a.docsJson ?? {}, metadata: a.metadata ?? {}, unit_id: a.unit, client_id: a.client }]
      : []
  }
  if (sql.startsWith('UPDATE applications SET status')) {
    const a = applications[String(params[0])]
    return a && a.wf === 'landlord_review' ? [{ id: String(params[0]) }] : []
  }
  if (sql.includes('FROM applications a LEFT JOIN users u')) {
    return Object.values(applications).map((a) => ({
      applicant_id: a.applicant,
      email: null,
      unit_id: a.unit,
      status: 'SUBMITTED',
      reference_code: a.ref,
      metadata: null,
    }))
  }
  if (sql.includes('FROM leases') || sql.includes('FROM maintenance_tickets')) return []
  if (sql.includes('FROM clients WHERE id')) return [{ status: 'active' }]
  if (/SELECT client_id FROM users WHERE id = \$1::uuid/.test(sql)) {
    const u = users[String(params[0])]
    return u ? [{ client_id: u.client }] : []
  }
  if (/SELECT email FROM users WHERE id = \$1::uuid/.test(sql)) {
    const u = users[String(params[0])]
    return u ? [{ email: u.email ?? null }] : []
  }
  if (/SELECT metadata FROM users WHERE id = \$1::uuid/.test(sql)) {
    const u = users[String(params[0])]
    return u ? [{ metadata: u.metadata }] : []
  }
  if (sql.includes('FROM notifications WHERE id')) {
    const n = notifications[String(params[0])]
    return n ? [{ client_id: n.client, user_id: n.user }] : []
  }
  if (sql.includes('FROM "applications" WHERE id')) {
    const a = applications[String(params[0])]
    return a
      ? [{ id: String(params[0]), unit_id: a.unit, client_id: a.client, agent_id: UUID['u-agent'], applicant_id: a.applicant }]
      : []
  }
  return []
}

beforeEach(() => {
  query.mockReset()
  query.mockImplementation(async (sql: string, params?: unknown[]) => answer(sql, params))
  resolveUuid.mockReset()
  resolveUuid.mockImplementation(async (_t: string, fe: string) => UUID[fe] ?? null)
  loadIdMapCache.mockReset()
  loadIdMapCache.mockResolvedValue({
    userBackendToFe: new Map([...FE_BY_UUID].filter(([, fe]) => fe.startsWith('u-'))),
    unitBackendToPropertyFe: new Map([
      [UN1, 'p-1'],
      [UN2, 'p-2'],
      [UN3, 'p-draft'],
    ]),
    agencyBackendToFe: new Map([
      [CA, 'ag-a'],
      [CB, 'ag-b'],
    ]),
  })
})

afterEach(() => {
  vi.resetModules()
})

type Body = {
  resource: 'user' | 'notification' | 'application'
  action: 'upsert' | 'delete'
  id: string
  data?: Record<string, unknown>
}

async function gate(actor: { userId: string; role: string; agencyId: string | null }, body: Body) {
  const { assertPersistAllowed } = await import('./scopeGate.js')
  await assertPersistAllowed(actor as never, body as never)
  return body
}

async function expect403(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ status: 403 })
}

const TENANT = { userId: 'u-t', role: 'tenant', agencyId: null }
const ADMIN = { userId: 'u-admin', role: 'client_admin', agencyId: 'ag-a' }
const SA = { userId: 'u-sa', role: 'super_admin', agencyId: null }
const LANDLORD = { userId: 'u-o', role: 'landlord', agencyId: null }

describe('user writes: self-promotion and cross-user writes', () => {
  it('a tenant making themselves super_admin is refused: privileged fields are stripped', async () => {
    const body = await gate(TENANT, {
      resource: 'user',
      action: 'upsert',
      id: 'u-t',
      data: {
        id: 'u-t',
        name: 'Tess Tenant',
        role: 'super_admin',
        agencyId: 'ag-a',
        active: true,
        enabledPermissions: ['platform.manage'],
        verification: { status: 'approved' },
        licenseStatus: 'principal',
      },
    })
    expect(body.data).toEqual({ id: 'u-t', name: 'Tess Tenant' })
  })

  it('the stripped self-write keeps the stored role, agency and active (upsertUser)', async () => {
    const body = await gate(TENANT, {
      resource: 'user',
      action: 'upsert',
      id: 'u-t',
      data: { id: 'u-t', name: 'Tess Tenant', role: 'super_admin', agencyId: 'ag-a', active: true },
    })
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO users'))!
    const sql = String(insert[0])
    const params = insert[1] as unknown[]
    const flagFor = (col: string) => {
      const m = sql.match(new RegExp(`${col} = CASE WHEN \\$(\\d+)::boolean THEN EXCLUDED\\.${col} ELSE users\\.${col} END`))
      expect(m, col).toBeTruthy()
      return params[Number(m![1]) - 1]
    }
    expect(flagFor('role')).toBe(false)
    expect(flagFor('client_id')).toBe(false)
    expect(flagFor('active')).toBe(false)
    expect(JSON.parse(String(params[8]))).not.toHaveProperty('frontend_role')
  })

  it('a tenant rewriting another user is refused', async () => {
    await expect403(
      gate(TENANT, { resource: 'user', action: 'upsert', id: 'u-o', data: { id: 'u-o', name: 'x', userId: 'u-t' } }),
    )
  })

  it('a payload userId naming the actor does not make another user row theirs', async () => {
    await expect403(
      gate(TENANT, { resource: 'user', action: 'upsert', id: 'u-admin', data: { userId: 'u-t', role: 'tenant' } }),
    )
  })

  it('non-super users cannot delete user rows, not even their own', async () => {
    await expect403(gate(TENANT, { resource: 'user', action: 'delete', id: 'u-t' }))
    await expect403(gate(ADMIN, { resource: 'user', action: 'delete', id: 'u-agent' }))
  })

  it('legitimate self-profile edits (name, phone, company, ID number) still go through', async () => {
    const body = await gate(TENANT, {
      resource: 'user',
      action: 'upsert',
      id: 'u-t',
      data: { id: 'u-t', name: 'Tess T', phone: '+27 82 1', company: 'Tess Co', idNumberOrPassport: '900101' },
    })
    expect(body.data).toEqual({ id: 'u-t', name: 'Tess T', phone: '+27 82 1', company: 'Tess Co', idNumberOrPassport: '900101' })
  })
})

describe('agency admin user management', () => {
  it('may change role (below super_admin) and active for a user in their agency', async () => {
    const body = await gate(ADMIN, {
      resource: 'user',
      action: 'upsert',
      id: 'u-agent',
      data: { name: 'Agent', role: 'agent_admin', active: false, agencyId: 'ag-a', enabledPermissions: ['users.manage'] },
    })
    expect(body.data).toMatchObject({ role: 'agent_admin', active: false, agencyId: 'ag-a', enabledPermissions: ['users.manage'] })
  })

  it('may create staff in their agency; a create without agencyId is pinned to it', async () => {
    const body = await gate(ADMIN, {
      resource: 'user',
      action: 'upsert',
      id: 'u-new-staff',
      data: { name: 'New Agent', role: 'ground_agent', email: 'n@a.test', tempPassword: TEST_FIXTURE_TEMP_PW },
    })
    expect(body.data).toMatchObject({ role: 'ground_agent', agencyId: 'ag-a' })
  })

  it('assigning super_admin is refused', async () => {
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-agent', data: { role: 'super_admin' } }))
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-new', data: { role: 'super_admin', agencyId: 'ag-a' } }))
  })

  it('moving a user to another agency (or to no agency) is refused', async () => {
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-agent', data: { agencyId: 'ag-b' } }))
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-agent', data: { agencyId: CB } }))
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-agent', data: { agencyId: null } }))
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-new', data: { role: 'ground_agent', agencyId: 'ag-b' } }))
  })

  it('touching a user outside their agency is refused', async () => {
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-b', data: { name: 'x', agencyId: 'ag-a' } }))
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-t', data: { name: 'x' } }))
  })

  it('an agency admin without users.manage gets the self-only rule', async () => {
    const noPerm = { userId: 'u-admin-noperm', role: 'client_admin', agencyId: 'ag-a' }
    await expect403(gate(noPerm, { resource: 'user', action: 'upsert', id: 'u-agent', data: { name: 'x' } }))
    const body = await gate(noPerm, { resource: 'user', action: 'upsert', id: 'u-admin-noperm', data: { name: 'Me', role: 'super_admin' } })
    expect(body.data).toEqual({ name: 'Me' })
  })
})

describe('verification: never through a non-super user write', () => {
  it('a non-super self write cannot change verification', async () => {
    const body = await gate(TENANT, {
      resource: 'user',
      action: 'upsert',
      id: 'u-t',
      data: { name: 'T', verification: { status: 'approved', documents: [] } },
    })
    expect(body.data).not.toHaveProperty('verification')
  })

  it('an agency admin write cannot change verification either', async () => {
    const body = await gate(ADMIN, {
      resource: 'user',
      action: 'upsert',
      id: 'u-agent',
      data: { name: 'A', verification: { status: 'approved' } },
    })
    expect(body.data).not.toHaveProperty('verification')
  })

  it('a super admin write keeps verification and is merged by key, never replaced wholesale', async () => {
    const body = await gate(SA, {
      resource: 'user',
      action: 'upsert',
      id: 'u-t',
      data: { name: 'T', verification: { status: 'approved', reviewedAt: '2026-10-09' } },
    })
    expect(body.data).toHaveProperty('verification')
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO users'))!
    const sql = String(insert[0]).replace(/\s+/g, ' ')
    expect(sql).toContain(
      "jsonb_build_object( 'verification', (users.metadata->'verification') || (EXCLUDED.metadata->'verification') )",
    )
    expect(sql).not.toMatch(/metadata = users\.metadata \|\| EXCLUDED\.metadata,/)
    const meta = JSON.parse(String((insert[1] as unknown[])[8]))
    // Only the keys sent are written; stored documents are left to the merge.
    expect(meta.verification).toEqual({ status: 'approved', reviewedAt: '2026-10-09' })
  })
})

describe('own-row checks use the existing owner before the payload', () => {
  it("taking over another person's notification by id is refused", async () => {
    await expect403(
      gate(TENANT, { resource: 'notification', action: 'upsert', id: 'N-o', data: { userId: 'u-t', read: true } }),
    )
  })

  it('marking their own notification read still works', async () => {
    await expect(
      gate(TENANT, { resource: 'notification', action: 'upsert', id: 'N-t', data: { userId: 'u-t', read: true } }),
    ).resolves.toBeDefined()
  })

  it("taking over another person's application by id is refused", async () => {
    await expect403(
      gate(TENANT, {
        resource: 'application',
        action: 'upsert',
        id: 'A-o',
        data: { applicantUserId: 'u-t', propertyId: 'p-1', agencyId: 'ag-a' },
      }),
    )
  })

  it('updating their own application, and creating a new one, still work', async () => {
    await expect(
      gate(TENANT, { resource: 'application', action: 'upsert', id: 'A-t', data: { applicantUserId: 'u-t', propertyId: 'p-1', agencyId: 'ag-a', phone: '1' } }),
    ).resolves.toBeDefined()
    await expect(
      gate(TENANT, { resource: 'application', action: 'upsert', id: 'A-new', data: { applicantUserId: 'u-t', propertyId: 'p-1', agencyId: 'ag-a' } }),
    ).resolves.toBeDefined()
  })
})

describe('Angela #80: agency-created landlords and contractors start pending', () => {
  async function storedMeta(body: Body) {
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO users'))!
    return JSON.parse(String((insert[1] as unknown[])[8])) as Record<string, unknown>
  }

  it('an agency admin creating a landlord stores verification pending, ignoring the client status', async () => {
    const body = await gate(ADMIN, {
      resource: 'user',
      action: 'upsert',
      id: 'u-new-ll',
      data: {
        name: 'New Landlord',
        role: 'landlord',
        email: 'll@a.test',
        verification: {
          status: 'approved',
          reviewedBy: 'u-admin',
          reviewedAt: '2026-10-09',
          profile: { company: 'LL Co' },
          documents: [{ key: 'id', name: 'id.pdf' }],
        },
      },
    })
    const v = (body.data as Record<string, unknown>).verification as Record<string, unknown>
    expect(v.status).toBe('pending')
    expect(typeof v.submittedAt).toBe('string')
    expect(v).not.toHaveProperty('reviewedBy')
    expect(v).not.toHaveProperty('reviewedAt')
    // Submissions (wizard profile + uploaded docs) are kept, decisions are not.
    expect(v.profile).toEqual({ company: 'LL Co' })
    expect(v.documents).toEqual([{ key: 'id', name: 'id.pdf' }])
    const meta = await storedMeta(body)
    expect((meta.verification as Record<string, unknown>).status).toBe('pending')
  })

  it("that pending landlord's listing is not guest-visible on the public marketplace", async () => {
    const body = await gate(ADMIN, {
      resource: 'user',
      action: 'upsert',
      id: 'u-new-ll',
      data: { name: 'New Landlord', role: 'landlord', email: 'll@a.test' },
    })
    const meta = await storedMeta(body)
    const { filterBootstrapForGuest } = await import('./guestMarketplace.js')
    const listing = {
      source: 'postgres',
      fetchedAt: 'now',
      agencies: [{ id: 'ag-a', name: 'A', status: 'Active' }],
      users: [{ id: 'u-new-ll', role: 'landlord', verification: meta.verification }],
      buildings: [{ id: 'b-1' }],
      units: [{ id: 'unt-p-ll', buildingId: 'b-1', listingType: 'rent', statusKey: 'PUBLISHED' }],
      properties: [
        { id: 'p-ll', unitId: 'unt-p-ll', status: 'Published', agencyId: 'ag-a', agentId: null, landlordId: 'u-new-ll' },
      ],
    }
    const out = filterBootstrapForGuest(listing)
    expect(out.properties).toEqual([])
    const { isPubliclyListed } = await import('../src/lib/publicListings.js')
    expect(
      isPubliclyListed(listing.properties[0] as never, {
        units: listing.units as never,
        users: listing.users as never,
      }),
    ).toBe(false)
    // Control: once a super admin approves, the same listing is visible.
    const approved = filterBootstrapForGuest({
      ...listing,
      users: [{ id: 'u-new-ll', role: 'landlord', verification: { status: 'approved' } }],
    })
    expect((approved.properties as Array<{ id: string }>).map((p) => p.id)).toEqual(['p-ll'])
  })

  it('an agency admin creating a contractor stores verification pending', async () => {
    const body = await gate(ADMIN, {
      resource: 'user',
      action: 'upsert',
      id: 'u-new-co',
      data: { name: 'Fix It', role: 'contractor', email: 'co@a.test', verification: { status: 'approved' } },
    })
    const meta = await storedMeta(body)
    expect((meta.verification as Record<string, unknown>).status).toBe('pending')
  })

  it('a super admin create is unchanged (their verification is written as sent)', async () => {
    const body = await gate(SA, {
      resource: 'user',
      action: 'upsert',
      id: 'u-new-ll',
      data: { name: 'New Landlord', role: 'landlord', agencyId: 'ag-a', verification: { status: 'approved', reviewedBy: 'u-sa' } },
    })
    const meta = await storedMeta(body)
    expect(meta.verification).toEqual({ status: 'approved', reviewedBy: 'u-sa' })
  })

  it('an agency admin edit of an existing landlord does not touch verification', async () => {
    users[UUID['u-o']] = { client: CA, metadata: { frontend_role: 'landlord', verification: { status: 'approved' } } }
    try {
      const body = await gate(ADMIN, {
        resource: 'user',
        action: 'upsert',
        id: 'u-o',
        data: { name: 'Owner Renamed', role: 'landlord', verification: { status: 'pending' } },
      })
      expect(body.data).not.toHaveProperty('verification')
      const meta = await storedMeta(body)
      expect(meta).not.toHaveProperty('verification')
    } finally {
      users[UUID['u-o']] = { client: null, metadata: {} }
    }
  })
})

describe('Jim B6: role is normalised and checked against an allow-list', () => {
  it("' super_admin' (and other spellings) from an agency admin is refused", async () => {
    for (const role of [' super_admin', 'super_admin ', 'SUPER_ADMIN', ' Super_Admin\t']) {
      await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-agent', data: { role } }))
      await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-new', data: { role, agencyId: 'ag-a' } }))
    }
  })

  it('a role outside the agency-assignable list is refused', async () => {
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-agent', data: { role: 'platform_owner' } }))
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-agent', data: { role: 'super-admin' } }))
  })

  it('an allowed role is stored normalised, and upsertUser maps it to the right DB role', async () => {
    const body = await gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-agent', data: { name: 'A', role: '  Agent_Admin ' } })
    expect((body.data as Record<string, unknown>).role).toBe('agent_admin')
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO users'))!
    const params = insert[1] as unknown[]
    expect(params[6]).toBe('AGENT_ADMIN')
    expect(JSON.parse(String(params[8])).frontend_role).toBe('agent_admin')
  })

  it('a tenant sending a padded super_admin role still has it stripped', async () => {
    const body = await gate(TENANT, { resource: 'user', action: 'upsert', id: 'u-t', data: { name: 'T', role: ' super_admin' } })
    expect(body.data).toEqual({ name: 'T' })
  })

  it('a super admin may still assign super_admin; an unknown role is a 400', async () => {
    const body = await gate(SA, { resource: 'user', action: 'upsert', id: 'u-agent', data: { role: ' Super_Admin ' } })
    expect((body.data as Record<string, unknown>).role).toBe('super_admin')
    await expect(gate(SA, { resource: 'user', action: 'upsert', id: 'u-agent', data: { role: 'root' } })).rejects.toMatchObject({ status: 400 })
  })
})

describe('Jim B7: credentials never travel through a non-super user write', () => {
  it('a self write cannot set passwordHash, password or tempPassword', async () => {
    const body = await gate(TENANT, {
      resource: 'user',
      action: 'upsert',
      id: 'u-t',
      data: { name: 'T', passwordHash: TEST_FIXTURE_HASH, password: TEST_FIXTURE_NEW_PW, tempPassword: TEST_FIXTURE_TEMP_PW },
    })
    expect(body.data).toEqual({ name: 'T' })
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO users'))!
    expect(String(insert[0])).not.toContain('password_hash = COALESCE(EXCLUDED.password_hash')
    expect(insert[1] as unknown[]).not.toContain(TEST_FIXTURE_HASH)
  })

  it('an agency admin editing an existing user cannot set any credential', async () => {
    const body = await gate(ADMIN, {
      resource: 'user',
      action: 'upsert',
      id: 'u-agent',
      data: { name: 'A', passwordHash: TEST_FIXTURE_HASH, password: TEST_FIXTURE_PLAIN_PW, tempPassword: TEST_FIXTURE_TEMP_PW },
    })
    expect(body.data).toEqual({ name: 'A' })
  })

  it('an agency admin create keeps tempPassword (and maps a plain password to it), never passwordHash', async () => {
    const a = await gate(ADMIN, {
      resource: 'user',
      action: 'upsert',
      id: 'u-new-1',
      data: { name: 'N', role: 'ground_agent', tempPassword: TEST_FIXTURE_TEMP_PW, passwordHash: TEST_FIXTURE_HASH },
    })
    expect(a.data).toMatchObject({ tempPassword: TEST_FIXTURE_TEMP_PW })
    expect(a.data).not.toHaveProperty('passwordHash')
    const b = await gate(ADMIN, {
      resource: 'user',
      action: 'upsert',
      id: 'u-new-2',
      data: { name: 'N', role: 'ground_agent', password: TEST_FIXTURE_PLAIN_PW },
    })
    expect(b.data).toMatchObject({ tempPassword: TEST_FIXTURE_PLAIN_PW })
    expect(b.data).not.toHaveProperty('password')
  })

  it('a non-admin "create" of their own row cannot carry a temp password', async () => {
    const body = await gate(TENANT, { resource: 'user', action: 'upsert', id: 'u-t', data: { name: 'T', tempPassword: 'x' } })
    expect(body.data).not.toHaveProperty('tempPassword')
  })
})

describe('Jim: writes that omit name / tempPassword keep the stored values', () => {
  async function upsertSql(data: Record<string, unknown>) {
    const { handlePersist } = await import('./writes.js')
    await handlePersist({ resource: 'user', action: 'upsert', id: 'u-t', data } as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO users'))!
    return { sql: String(insert[0]).replace(/\s+/g, ' '), params: insert[1] as unknown[] }
  }

  it('a write without name keeps first_name / last_name', async () => {
    const { sql, params } = await upsertSql({ id: 'u-t', phone: '+27 82 1' })
    for (const col of ['first_name', 'last_name']) {
      const m = sql.match(new RegExp(`${col} = CASE WHEN \\$(\\d+)::boolean THEN EXCLUDED\\.${col} ELSE users\\.${col} END`))
      expect(m, col).toBeTruthy()
      expect(params[Number(m![1]) - 1]).toBe(false)
    }
  })

  it('a write with a name still updates it', async () => {
    const { sql, params } = await upsertSql({ id: 'u-t', name: 'Tess Tenant' })
    const m = sql.match(/first_name = CASE WHEN \$(\d+)::boolean THEN EXCLUDED\.first_name ELSE users\.first_name END/)
    expect(params[Number(m![1]) - 1]).toBe(true)
    expect(params[3]).toBe('Tess')
    expect(params[4]).toBe('Tenant')
  })

  it('a write without tempPassword does not send mustChangePassword (stored flag kept by the merge)', async () => {
    const { params } = await upsertSql({ id: 'u-t', name: 'T' })
    expect(JSON.parse(String(params[8]))).not.toHaveProperty('mustChangePassword')
  })

  it('an admin create with tempPassword sets mustChangePassword', async () => {
    const body = await gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-new-3', data: { name: 'N', role: 'ground_agent', tempPassword: TEST_FIXTURE_TEMP_PW } })
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO users'))!
    expect(JSON.parse(String((insert[1] as unknown[])[8])).mustChangePassword).toBe(true)
  })
})

describe('Jim B8: designated super-admin emails are reserved and never grant the role', () => {
  it('a tenant changing their own email to a listed address is refused', async () => {
    await expect403(gate(TENANT, { resource: 'user', action: 'upsert', id: 'u-t', data: { name: 'T', email: ' SamBampo200@gmail.com ' } }))
  })

  it('an agency admin creating or editing a user onto a listed address is refused', async () => {
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-new-x', data: { name: 'X', role: 'tenant', email: 'super@propertyflow.app' } }))
    await expect403(gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-agent', data: { email: 'ephraimbampo317@gmail.com' } }))
  })

  it('a super admin cannot move another row onto a listed address either', async () => {
    await expect403(gate(SA, { resource: 'user', action: 'upsert', id: 'u-t', data: { email: 'super@propertyflow.app' } }))
  })

  it('the row that already has the listed address can still be written', async () => {
    users[UUID['u-sa']] = { client: null, metadata: {}, email: 'super@propertyflow.app' }
    try {
      await expect(
        gate(SA, { resource: 'user', action: 'upsert', id: 'u-sa', data: { name: 'Sam', email: 'super@propertyflow.app' } }),
      ).resolves.toBeDefined()
    } finally {
      users[UUID['u-sa']] = { client: null, metadata: {} }
    }
  })

  it('resolveFrontendRole honours the list only when the DB role is already SUPER_ADMIN', async () => {
    const { resolveFrontendRole } = await import('../src/lib/supabase/idMap.js')
    expect(resolveFrontendRole('END_USER', { frontend_role: 'tenant' }, 'sambampo200@gmail.com')).toBe('tenant')
    expect(resolveFrontendRole('END_USER', null, 'super@propertyflow.app')).toBe('tenant')
    expect(resolveFrontendRole('GROUND_AGENT', null, 'super@propertyflow.app')).toBe('ground_agent')
    expect(resolveFrontendRole('SUPER_ADMIN', { frontend_role: 'tenant' }, 'super@propertyflow.app')).toBe('super_admin')
  })

  it('metadata frontend_role super_admin never grants the role on a non-SUPER_ADMIN row', async () => {
    const { resolveFrontendRole } = await import('../src/lib/supabase/idMap.js')
    expect(resolveFrontendRole('END_USER', { frontend_role: 'super_admin' }, 'x@y.test')).toBe('tenant')
    expect(resolveFrontendRole('LANDLORD', { frontend_role: ' Super_Admin ' }, 'x@y.test')).toBe('landlord')
  })
})

async function persistAndInsert(body: Body) {
  const { handlePersist } = await import('./writes.js')
  await handlePersist(body as never)
  return query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO applications'))
}

describe('Angela #80 (330a350): role change to landlord / contractor goes back to pending', () => {
  async function storedUserMeta(body: Body) {
    const { handlePersist } = await import('./writes.js')
    await handlePersist(body as never)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO users'))!
    return JSON.parse(String((insert[1] as unknown[])[8])) as Record<string, unknown>
  }

  for (const role of ['landlord', 'contractor']) {
    it(`an agency admin changing an existing tenant to ${role} sets verification pending with a server submittedAt`, async () => {
      users[UUID['u-o']] = {
        client: CA,
        role: 'END_USER',
        metadata: { frontend_role: 'tenant', verification: { status: 'approved', reviewedBy: 'u-sa' } },
      }
      try {
        const before = Date.now()
        const body = await gate(ADMIN, {
          resource: 'user',
          action: 'upsert',
          id: 'u-o',
          data: {
            name: 'Owner',
            role: ` ${role.toUpperCase()} `,
            verification: { status: 'approved', submittedAt: '2000-01-01T00:00:00.000Z', reviewedBy: 'u-admin' },
          },
        })
        const v = (body.data as Record<string, unknown>).verification as Record<string, unknown>
        expect(v).toMatchObject({ status: 'pending', reviewedAt: null, reviewedBy: null, rejectNote: null })
        expect(Date.parse(String(v.submittedAt))).toBeGreaterThanOrEqual(before - 1000)
        expect(v.submittedAt).not.toBe('2000-01-01T00:00:00.000Z')
        const meta = await storedUserMeta(body)
        expect((meta.verification as Record<string, unknown>).status).toBe('pending')
      } finally {
        users[UUID['u-o']] = { client: null, metadata: {} }
      }
    })
  }

  it('an existing landlord re-saved as landlord keeps their verification (no change of role)', async () => {
    users[UUID['u-o']] = { client: CA, role: 'LANDLORD', metadata: { verification: { status: 'approved' } } }
    try {
      const body = await gate(ADMIN, { resource: 'user', action: 'upsert', id: 'u-o', data: { name: 'O', role: 'landlord' } })
      expect(body.data).not.toHaveProperty('verification')
    } finally {
      users[UUID['u-o']] = { client: null, metadata: {} }
    }
  })

  it('a create drops a client-set lookedAt from the submitted documents', async () => {
    const body = await gate(ADMIN, {
      resource: 'user',
      action: 'upsert',
      id: 'u-new-ll',
      data: {
        name: 'New Landlord',
        role: 'landlord',
        email: 'll2@a.test',
        verification: {
          status: 'approved',
          documents: [
            { key: 'id_copy', label: 'ID', name: 'id.pdf', mimeType: 'application/pdf', dataUrl: 'data:x', uploadedAt: '2026-10-01', lookedAt: '2026-10-02' },
          ],
        },
      },
    })
    const v = (body.data as Record<string, unknown>).verification as Record<string, unknown>
    expect(v.status).toBe('pending')
    const docs = v.documents as Array<Record<string, unknown>>
    expect(docs).toHaveLength(1)
    expect(docs[0]).not.toHaveProperty('lookedAt')
    expect(docs[0]).toMatchObject({ key: 'id_copy', name: 'id.pdf', dataUrl: 'data:x' })
  })
})

describe('Angela #80 (330a350): landlord application writes change only the decision fields', () => {
  it('a landlord decision on their own property is a narrow UPDATE (no generic upsert, extras ignored)', async () => {
    const { assertPersistAllowed } = await import('./scopeGate.js')
    const body: Body = {
      resource: 'application',
      action: 'upsert',
      id: 'A-l',
      data: {
        workflowStatus: 'rejected',
        stage: 'Approved',
        status: 'APPROVED',
        email: '',
        phone: '',
        documents: [],
        agentId: 'u-o',
        applicantUserId: 'u-o',
        income: 1,
        propertyId: 'p-1',
      },
    }
    const out = await assertPersistAllowed(LANDLORD as never, body as never)
    expect(out.handled).toMatchObject({ ok: true, id: 'A-l' })
    const upd = query.mock.calls.find((c) => String(c[0]).includes('UPDATE applications'))!
    expect(upd[1]).toEqual([UUID['A-l'], 'REJECTED', 'rejected', 'Rejected', 0])
    expect(String(upd[0])).toContain("metadata->>'workflow_status' = 'landlord_review'")
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO applications'))).toBe(false)
    const { LANDLORD_APPLICATION_DECISION_FIELDS } = await import('./portalWritePolicy.js')
    expect([...LANDLORD_APPLICATION_DECISION_FIELDS]).toEqual(['workflowStatus', 'stage', 'progress'])
  })

  it('a landlord conditional approval derives stage / progress on the server', async () => {
    const { assertPersistAllowed } = await import('./scopeGate.js')
    const out = await assertPersistAllowed(LANDLORD as never, {
      resource: 'application', action: 'upsert', id: 'A-l', data: { workflowStatus: 'conditionally_approved', progress: 100 },
    } as never)
    expect(out.handled).toBeTruthy()
    const upd = query.mock.calls.find((c) => String(c[0]).includes('UPDATE applications'))!
    expect(upd[1]).toEqual([UUID['A-l'], null, 'conditionally_approved', 'Conditionally approved', 45])
  })

  it('the server stage / progress table matches the client workflow', async () => {
    const { LANDLORD_APPLICATION_DECISIONS } = await import('./portalWritePolicy.js')
    const { workflowProgress, workflowStageLabel } = await import('../src/lib/applicationWorkflow.js')
    for (const [key, d] of Object.entries(LANDLORD_APPLICATION_DECISIONS)) {
      expect(d.stage).toBe(workflowStageLabel('Rental', key as never))
      expect(d.progress).toBe(workflowProgress('Rental', key as never))
    }
  })

  it('anything but a review decision is refused', async () => {
    for (const data of [{ workflowStatus: 'lease_signed' }, { stage: 'Approved' }, { email: 'x@y.test' }]) {
      await expect403(gate(LANDLORD, { resource: 'application', action: 'upsert', id: 'A-l', data }))
    }
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO applications'))).toBe(false)
  })

  it('a decision on an application not waiting for the landlord is a 409', async () => {
    applications[UUID['A-l']].wf = 'conditionally_approved'
    try {
      await expect(
        gate(LANDLORD, { resource: 'application', action: 'upsert', id: 'A-l', data: { workflowStatus: 'rejected' } }),
      ).rejects.toMatchObject({ status: 409 })
    } finally {
      applications[UUID['A-l']].wf = 'landlord_review'
    }
  })

  it("a landlord cannot decide on an application on someone else's property, even naming their own", async () => {
    await expect403(
      gate(LANDLORD, { resource: 'application', action: 'upsert', id: 'A-o', data: { workflowStatus: 'rejected', propertyId: 'p-2' } }),
    )
  })
})

describe('Angela #80 (330a350): a redacted application row never blanks the stored values', () => {
  const STORED_DOCS = {
    documents: [
      { key: 'id', label: 'ID', status: 'uploaded', file: { name: 'id.pdf', dataUrl: 'data:id' }, uploadedAt: '2026-10-01' },
      { key: 'payslips', label: 'Payslips', status: 'verified', file: { name: 'p.pdf', dataUrl: 'data:p' } },
    ],
    creditCheck: 'Passed',
    screening: { status: 'passed' },
  }
  const STORED_META = {
    email: 'real@applicant.test',
    applicant_email: 'real@applicant.test',
    phone: '0821234567',
    keyCollection: { contactPhone: '0839999999', emailSentAt: '2026-10-03' },
    stage: 'Under Review',
    workflow_status: 'agent_review',
  }

  it('blank email / phone, file-less documents and a blank key-collection phone keep the stored values', async () => {
    applications[UUID['A-t']].docsJson = STORED_DOCS
    applications[UUID['A-t']].metadata = STORED_META
    try {
      const { redactApplicationContact } = await import('./scopeGate.js')
      const redacted = redactApplicationContact({
        id: 'A-t',
        propertyId: 'p-1',
        agencyId: 'ag-a',
        applicantUserId: 'u-t',
        applicantName: 'Tess',
        email: STORED_META.email,
        phone: STORED_META.phone,
        documents: STORED_DOCS.documents.map((d) => (d.key === 'payslips' ? { ...d, status: 'rejected' } : d)),
        keyCollection: { contactPhone: '0839999999', emailSentAt: '2026-10-04' },
        stage: 'Under Review',
        workflowStatus: 'agent_review',
      })
      expect(redacted.email).toBe('')
      const insert = (await persistAndInsert({ resource: 'application', action: 'upsert', id: 'A-t', data: redacted as never }))!
      const params = insert[1] as unknown[]
      const docs = JSON.parse(String(params[11])) as { documents: Array<Record<string, unknown>>; creditCheck: unknown; screening: unknown }
      expect(docs.documents.map((d) => (d.file as { dataUrl: string }).dataUrl)).toEqual(['data:id', 'data:p'])
      // A real field change in the redacted row still lands.
      expect(docs.documents[1].status).toBe('rejected')
      expect(docs.documents[0].uploadedAt).toBe('2026-10-01')
      expect(docs.creditCheck).toBe('Passed')
      expect(docs.screening).toEqual({ status: 'passed' })
      const meta = JSON.parse(String(params[13])) as Record<string, unknown>
      // Blank contact keys are left out, so metadata || EXCLUDED keeps the stored ones.
      expect(meta).not.toHaveProperty('email')
      expect(meta).not.toHaveProperty('applicant_email')
      expect(meta).not.toHaveProperty('phone')
      expect(meta.keyCollection).toEqual({ contactPhone: '0839999999', emailSentAt: '2026-10-04' })
    } finally {
      delete applications[UUID['A-t']].docsJson
      delete applications[UUID['A-t']].metadata
    }
  })

  it('a row with no documents at all keeps the stored list', async () => {
    applications[UUID['A-t']].docsJson = STORED_DOCS
    try {
      const insert = (await persistAndInsert({
        resource: 'application', action: 'upsert', id: 'A-t', data: { propertyId: 'p-1', applicantUserId: 'u-t', notes: 'n' },
      }))!
      const docs = JSON.parse(String((insert[1] as unknown[])[11])) as { documents: unknown[] }
      expect(docs.documents).toEqual(STORED_DOCS.documents)
    } finally {
      delete applications[UUID['A-t']].docsJson
    }
  })

  it('a new application with a blank email still writes the keys (nothing to keep)', async () => {
    const insert = (await persistAndInsert({
      resource: 'application', action: 'upsert', id: 'A-new', data: { propertyId: 'p-1', email: '', phone: '' },
    }))!
    const meta = JSON.parse(String((insert[1] as unknown[])[13])) as Record<string, unknown>
    expect(meta).toMatchObject({ email: null, applicant_email: null, phone: null })
  })
})

describe('Angela #80 (330a350): tenant application writes', () => {
  it('a tenant update strips stage, status, workflowStatus, agentId and agencyId and keeps the stored listing', async () => {
    const body = await gate(TENANT, {
      resource: 'application',
      action: 'upsert',
      id: 'A-t',
      data: {
        applicantUserId: 'u-t',
        propertyId: 'p-2',
        unitId: 'unt-p-2',
        agencyId: 'ag-b',
        agentId: 'u-agent',
        stage: 'Approved',
        status: 'APPROVED',
        workflowStatus: 'conditionally_approved',
        progress: 100,
        screening: { status: 'passed' },
        creditCheck: 'Passed',
        phone: '0820000000',
      },
    })
    expect(body.data).toEqual({ applicantUserId: 'u-t', phone: '0820000000' })
    const insert = (await persistAndInsert(body))!
    const sql = String(insert[0])
    const params = insert[1] as unknown[]
    expect(params[2]).toBe(UN1) // stored unit, not p-2's
    expect(sql).toContain('status = CASE WHEN $16::boolean THEN EXCLUDED.status ELSE applications.status END')
    expect(sql).toContain('agent_id = CASE WHEN $17::boolean THEN EXCLUDED.agent_id ELSE applications.agent_id END')
    expect(params[15]).toBe(false)
    expect(params[16]).toBe(false)
    const meta = JSON.parse(String(params[13])) as Record<string, unknown>
    expect(meta).not.toHaveProperty('stage')
    expect(meta).not.toHaveProperty('workflow_status')
    expect(meta).not.toHaveProperty('progress')
  })

  it('a tenant can create an application only on a publicly listed property', async () => {
    await expect403(
      gate(TENANT, { resource: 'application', action: 'upsert', id: 'A-new', data: { applicantUserId: 'u-t', propertyId: 'p-draft' } }),
    )
    await expect403(
      gate(TENANT, { resource: 'application', action: 'upsert', id: 'A-new', data: { applicantUserId: 'u-t', propertyId: 'p-nowhere' } }),
    )
    const ok = await gate(TENANT, {
      resource: 'application',
      action: 'upsert',
      id: 'A-new',
      data: { applicantUserId: 'u-t', propertyId: 'p-1', stage: 'Approved', agentId: 'u-agent' },
    })
    expect(ok.data).toEqual({ applicantUserId: 'u-t', propertyId: 'p-1' })
  })
})

describe('Angela #80 (330a350): a landlord never decides their own application', () => {
  it('a landlord who is the applicant on a property they do not own is refused', async () => {
    // A-o: applicant u-o (our landlord), on p-1 (no landlord) — applicant shortcut must not reach the decision.
    await expect403(gate(LANDLORD, { resource: 'application', action: 'upsert', id: 'A-o', data: { workflowStatus: 'conditionally_approved' } }))
    expect(query.mock.calls.some((c) => String(c[0]).includes('UPDATE applications'))).toBe(false)
  })
})
