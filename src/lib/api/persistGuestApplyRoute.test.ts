/**
 * PR #69: guest full application on /listing/PR-1011 (Postgres-API mode).
 *
 * Production is the Postgres-API build. persistToApi
 * quickHealth() first, which aborts GET /api/health after 800 ms. Live
 * /api/health pings the database and answered in 1.3-2.3 s, so persistToApi
 * returned false without ever POSTing /api/persist, and createApplication
 * deleted the optimistic APP ("Application could not be saved for agency
 * review").
 *
 * This test drives the client persistToApi into the real Hono app
 * (server/index.ts): the real /api/persist route, requireActorAndGate
 * (enrichActor + the real assertPersistAllowed, including the property-book
 * load and canWriteEntity), and handlePersist → upsertApplication. Nothing in
 * the gate is skipped or stubbed. Only Postgres is replaced, by a small table
 * store that answers by SQL shape (including the property-book query).
 * The guest user and the listing agent u-james are real users rows here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Application } from '../../types/domain'
import { maskIdNumber } from '../screening/consentTerms'

process.env.PF_SKIP_SERVE = '1'

vi.mock('./config', () => ({ isApiEnabled: true }))

const HORIZON_CLIENT = 'a1000001-0001-4000-8000-000000000001'
const BAYVIEW_CLIENT = 'a1000001-0001-4000-8000-000000000003'
const FRAMESBY_UNIT = 'a4000001-0001-4000-8000-000000000008'
const BEACHVIEW_B14 = 'a4000001-0001-4000-8000-000000000003'
const BAYVIEW_BUILDING = 'a3000001-0001-4000-8000-000000000007'
/** units.id for unt-skyline-b14 (Humewood Beach Apartment B14, Horizon). */
const HUMEWOOD_UNIT = '40588530-0459-4dd3-9ef4-1eb521982479'
const HUMEWOOD_BUILDING = 'f1a2b3c4-0000-4000-8000-00000000b14b'
const GUEST_FE = 'u-7c1e9a42'
const GUEST_UUID = 'b9000001-0001-4000-8000-000000000042'
const JAMES_UUID = 'a2000001-0001-4000-8000-000000000004'

type MapRow = { entity_type: string; frontend_id: string; backend_id: string }
type UserRow = {
  id: string
  client_id: string | null
  email: string
  frontend_id: string | null
  /** users.role (bootstrap read); END_USER when absent. */
  role?: string
}
type AppRow = { id: string; params: unknown[] }

const db = vi.hoisted(() => ({
  map: [] as MapRow[],
  users: new Map<string, UserRow>(),
  clients: new Set<string>(),
  units: new Map<string, { id: string; client_id: string | null; building_id: string; title: string; agent_id: string | null }>(),
  buildings: new Map<string, { id: string; client_id: string | null; landlord_id: string | null }>(),
  applications: new Map<string, AppRow>(),
  sql: [] as string[],
  /** T1 round trip: GET /api/bootstrap reads many tables; unknown reads answer []. */
  lenient: false,
}))

vi.mock('../../../server/db.js', () => {
  const run = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    db.sql.push(sql)
    if (/CREATE (TABLE|UNIQUE INDEX)/.test(sql)) return []
    if (sql.includes('INSERT INTO entity_id_map')) {
      const update = /DO UPDATE/i.test(sql)
      for (let i = 0; i + 2 < params.length; i += 3) {
        const [et, fe, be] = [String(params[i]), String(params[i + 1]), String(params[i + 2])]
        const sameFe = db.map.find((r) => r.entity_type === et && r.frontend_id === fe)
        if (sameFe) {
          if (update) sameFe.backend_id = be
          continue
        }
        if (db.map.some((r) => r.entity_type === et && r.backend_id === be)) continue
        db.map.push({ entity_type: et, frontend_id: fe, backend_id: be })
      }
      return []
    }
    // --- Real scope gate (buildActorPropertyScope / loadIdMapCache) reads ---
    if (/SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map\s*$/.test(sql.trim())) {
      return db.map.map((r) => ({ ...r }))
    }
    if (/^SELECT id::text AS id, email FROM users$/.test(sql.trim())) {
      return [...db.users.values()].map((u) => ({ id: u.id, email: u.email }))
    }
    if (/FROM units u\s+JOIN buildings b ON b\.id = u\.building_id\s*$/.test(sql.trim())) {
      // The property book: every unit with its agency, agent and building landlord.
      return [...db.units.values()].map((u) => ({
        unit_id: u.id,
        client_id: u.client_id,
        agent_id: u.agent_id,
        landlord_id: db.buildings.get(u.building_id)?.landlord_id ?? null,
      }))
    }
    if (sql.includes('FROM applications a') && sql.includes('LEFT JOIN users u')) {
      return [...db.applications.values()].map((a) => ({
        applicant_id: a.params[3] ?? null,
        email: db.users.get(String(a.params[3]))?.email ?? null,
        unit_id: a.params[2],
        status: a.params[7],
        reference_code: a.params[5],
        metadata: null,
      }))
    }
    if (/^SELECT tenant_id, unit_id FROM leases$/.test(sql.trim())) return []
    if (sql.includes('FROM maintenance_tickets') && !sql.includes('WHERE')) return []
    if (/SELECT status FROM clients WHERE id = \$1::uuid/.test(sql)) {
      return db.clients.has(String(params[0])) ? [{ status: 'active' }] : []
    }
    if (/SELECT id::text AS id FROM applications WHERE reference_code = \$1/.test(sql)) {
      return [...db.applications.values()]
        .filter((a) => a.params[5] === params[0])
        .map((a) => ({ id: a.id }))
    }
    if (sql.includes('FROM entity_id_map m') && sql.includes('JOIN units')) {
      const types = params[0] as string[]
      const fes = params[1] as string[]
      return db.map
        .filter((r) => types.includes(r.entity_type) && fes.includes(r.frontend_id) && db.units.has(r.backend_id))
        .map((r) => {
          const u = db.units.get(r.backend_id)!
          return {
            id: u.id,
            backend_id: r.backend_id,
            unit_client: u.client_id,
            building_client: db.buildings.get(u.building_id)?.client_id ?? null,
          }
        })
    }
    if (sql.includes('FROM entity_id_map')) {
      const types = params[0] as string[]
      const fes = params[1] as string[]
      return db.map
        .filter((r) => types.includes(r.entity_type) && fes.includes(r.frontend_id))
        .slice(0, 1)
        .map((r) => ({ backend_id: r.backend_id }))
    }
    if (/SELECT client_id FROM users WHERE id = \$1::uuid/.test(sql)) {
      const u = db.users.get(String(params[0]))
      return u ? [{ client_id: u.client_id }] : []
    }
    // Viewing-before-apply gate: the guest attended an in-person viewing of the unit.
    if (sql.includes('/* apply-eligibility */')) {
      const u = db.units.get(String(params[0]))
      if (!u) return []
      return [{
        unit_id: u.id,
        client_id: u.client_id,
        building_id: u.building_id,
        listing_type: 'RENT',
        require_viewing_to_apply: null,
        settings: {},
        completed_bookings: [{
          id: 'c5000001-0001-4000-8000-000000000042',
          unitId: u.id,
          buildingId: u.building_id,
          viewingMode: 'IN_PERSON',
          applicantId: GUEST_UUID,
          visitorEmail: 'ayanda.mokoena@example.com',
          visitorPhone: null,
          attendedAt: '2026-10-01T09:00:00.000Z',
        }],
        live_override: null,
      }]
    }
    if (/SELECT email, phone FROM users WHERE id = \$1::uuid/.test(sql)) {
      const u = db.users.get(String(params[0]))
      return u ? [{ email: u.email, phone: null }] : []
    }
    if (/SELECT id::text AS id FROM users WHERE id = \$1::uuid/.test(sql)) {
      const u = db.users.get(String(params[0]))
      return u ? [{ id: u.id }] : []
    }
    if (sql.includes('FROM users WHERE LOWER(TRIM(email))')) {
      const e = String(params[0])
      return [...db.users.values()].filter((u) => u.email.toLowerCase() === e).map((u) => ({ id: u.id }))
    }
    if (sql.includes("FROM users WHERE metadata->>'frontend_id'")) {
      return [...db.users.values()].filter((u) => u.frontend_id === params[0]).map((u) => ({ id: u.id }))
    }
    if (/SELECT id::text AS id FROM clients WHERE id = \$1::uuid/.test(sql)) {
      return db.clients.has(String(params[0])) ? [{ id: String(params[0]) }] : []
    }
    // #80: upsertApplication reads the stored row (redacted-field merge), the
    // listing agent for a portal create, and the gate checks the listing is public.
    if (sql.includes('SELECT uploaded_docs_json, metadata') && sql.includes('FROM applications WHERE id')) {
      const a = db.applications.get(String(params[0]))
      return a
        ? [{ uploaded_docs_json: a.params[11], metadata: a.params[13], unit_id: a.params[2], client_id: a.params[1], applicant_id: a.params[3] }]
        : []
    }
    // loadExisting for an update (scope gate).
    if (sql.includes('FROM "applications" WHERE id = $1::uuid')) {
      const a = db.applications.get(String(params[0]))
      return a
        ? [{ id: a.id, unit_id: a.params[2], client_id: a.params[1], agent_id: a.params[4], applicant_id: a.params[3] }]
        : []
    }
    // Applicant policy (#80 c3f25ac) reads the stored workflow before an update.
    if (/^SELECT status, application_type, metadata, uploaded_docs_json FROM applications WHERE id = \$1::uuid$/.test(sql.trim())) {
      const a = db.applications.get(String(params[0]))
      return a
        ? [{ status: a.params[7], application_type: a.params[6], metadata: a.params[13], uploaded_docs_json: a.params[11] }]
        : []
    }
    if (/SELECT agent_id::text AS agent_id FROM units WHERE id = \$1::uuid/.test(sql)) {
      const u = db.units.get(String(params[0]))
      return u ? [{ agent_id: u.agent_id }] : []
    }
    if (sql.includes('FROM units u') && sql.includes('LEFT JOIN users l') && sql.includes('WHERE u.id = $1::uuid')) {
      // Every unit in this store is a published rental listing.
      return db.units.has(String(params[0]))
        ? [{ status_config_key: 'PUBLISHED', listing_type: 'RENT', landlord_verification: null }]
        : []
    }
    if (sql.includes('INSERT INTO applications')) {
      // ON CONFLICT: status kept unless $16, metadata merged over the stored one.
      const prev = db.applications.get(String(params[0]))
      if (prev) {
        const next = [...params]
        if (params[15] === false) next[7] = prev.params[7]
        next[13] = JSON.stringify({ ...JSON.parse(String(prev.params[13])), ...JSON.parse(String(params[13])) })
        if (params[3] == null) next[3] = prev.params[3]
        db.applications.set(String(params[0]), { id: String(params[0]), params: next })
      } else {
        db.applications.set(String(params[0]), { id: String(params[0]), params })
      }
      return []
    }
    // --- T1 round trip: the bootstrap reads (server/bootstrap.ts buildBootstrap) ---
    if (/^SELECT \* FROM applications ORDER BY/.test(sql.trim())) {
      const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v ?? null)
      return [...db.applications.values()].map((a) => ({
        id: a.id,
        client_id: a.params[1],
        unit_id: a.params[2],
        applicant_id: a.params[3],
        agent_id: a.params[4],
        reference_code: a.params[5],
        application_type: a.params[6],
        status: a.params[7],
        monthly_income: a.params[8],
        employment_summary: a.params[9],
        message: a.params[10],
        uploaded_docs_json: json(a.params[11]),
        move_in_date: null,
        metadata: json(a.params[13]),
        submitted_at: new Date('2026-10-30T08:00:00Z'),
        created_at: new Date('2026-10-30T08:00:00Z'),
        updated_at: new Date('2026-10-30T08:00:00Z'),
      }))
    }
    if (sql.includes('FROM users ORDER BY email')) {
      return [...db.users.values()].map((u) => ({
        id: u.id,
        client_id: u.client_id,
        email: u.email,
        first_name: u.email.split('@')[0],
        last_name: '',
        // The account row has no phone: the applicant typed it on the application.
        phone: null,
        role: u.role ?? 'END_USER',
        active: true,
        metadata: u.frontend_id ? { frontend_id: u.frontend_id } : {},
      }))
    }
    if (sql.includes('FROM clients ORDER BY company_name')) {
      return [...db.clients].map((id) => ({ id, company_name: id, subdomain: id, status: 'active', city: null, created_at: new Date(), settings: {} }))
    }
    if (/^SELECT \* FROM buildings ORDER BY name/.test(sql.trim())) {
      return [...db.buildings.values()].map((b) => ({ ...b, name: b.id, created_at: new Date() }))
    }
    if (/^SELECT \* FROM units ORDER BY created_at/.test(sql.trim())) {
      return [...db.units.values()].map((u) => ({ ...u, status: 'AVAILABLE', listing_type: 'RENT', created_at: new Date() }))
    }
    // Staff write: the permission gate reads the actor's stored list (none: role defaults).
    if (sql.includes("SELECT metadata->'enabledPermissions' AS enabled")) {
      return db.users.has(String(params[0])) ? [{ enabled: null, version: null }] : []
    }
    // listingResolve: a full-row save resends propertyId PR-1011 (seed collision fallback by title).
    if (sql.includes("u.title ILIKE '%Humewood Beach Apartment B14%'")) {
      return [...db.units.values()]
        .filter((u) => u.title.includes('Humewood Beach Apartment B14'))
        .map((u) => ({ id: u.id, backend_id: u.id, unit_client: u.client_id, building_client: db.buildings.get(u.building_id)?.client_id ?? null }))
    }
    if (db.lenient) return []
    throw new Error(`unexpected sql in guest apply route test: ${sql.slice(0, 160)}`)
  }
  return {
    databaseConfigured: true,
    databaseConfigError: undefined,
    databaseConfigWarning: undefined,
    pool: { query: async (sql: string, params?: unknown[]) => ({ rows: await run(sql, params) }) },
    query: (sql: string, params?: unknown[]) => run(sql, params),
    withTransaction: vi.fn(),
    clientQuery: vi.fn(),
    pingDatabase: vi.fn(async () => undefined),
  }
})

/** Client createApplication payload for the guest on /listing/PR-1011. */
async function guestApplication(): Promise<Application> {
  const { normalizeApplication } = await import('../applicationWorkflow')
  const { buildDocumentChecklist } = await import('../workflow')
  const today = new Date().toISOString().slice(0, 10)
  return normalizeApplication({
    id: 'APP-guest-pr1011',
    agencyId: 'ag-horizon',
    propertyId: 'PR-1011',
    unitId: 'unt-skyline-b14',
    agentId: 'u-james',
    applicantUserId: GUEST_FE,
    applicantName: 'Ayanda Mokoena',
    email: 'ayanda.mokoena@example.com',
    phone: '0821234567',
    type: 'Rental',
    workflowStatus: 'application_submitted',
    stage: 'Application submitted',
    progress: 10,
    income: 32000,
    employment: 'Declared on application',
    idNumberOrPassport: '9001015009087',
    uploadedDocs: {
      bankStatementsUrl: 'https://yourplatform.co.za/docs/bank',
      idCopyUrl: 'https://yourplatform.co.za/docs/id',
      payslipUrl: 'https://yourplatform.co.za/docs/payslip',
    },
    creditCheck: 'Not Started',
    creditConsent: false,
    documents: buildDocumentChecklist('Rental'),
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: today,
    updatedAt: today,
  } as Application)
}

describe('guest full application on PR-1011 reaches /api/persist (API mode)', () => {
  const calls: string[] = []
  const statuses: string[] = []

  beforeEach(async () => {
    calls.length = 0
    statuses.length = 0
    db.sql = []
    db.map = [
      // Live public listing row for unt-skyline-b14. The static Framesby seed
      // pair (PR-1011 / unt-PR-1011) is added by the real ensureEntityMapTable.
      { entity_type: 'unit', frontend_id: 'unt-skyline-b14', backend_id: HUMEWOOD_UNIT },
      { entity_type: 'user', frontend_id: GUEST_FE, backend_id: GUEST_UUID },
    ]
    db.users = new Map([
      [GUEST_UUID, { id: GUEST_UUID, client_id: null, email: 'ayanda.mokoena@example.com', frontend_id: GUEST_FE }],
      [JAMES_UUID, { id: JAMES_UUID, client_id: HORIZON_CLIENT, email: 'james@horizonrealty.co.za', frontend_id: null }],
    ])
    db.clients = new Set([HORIZON_CLIENT, BAYVIEW_CLIENT])
    db.units = new Map([
      [HUMEWOOD_UNIT, { id: HUMEWOOD_UNIT, client_id: HORIZON_CLIENT, building_id: HUMEWOOD_BUILDING, title: 'Humewood Beach Apartment B14', agent_id: JAMES_UUID }],
      [FRAMESBY_UNIT, { id: FRAMESBY_UNIT, client_id: BAYVIEW_CLIENT, building_id: BAYVIEW_BUILDING, title: 'Framesby cottage — Protea Lane', agent_id: null }],
      [BEACHVIEW_B14, { id: BEACHVIEW_B14, client_id: HORIZON_CLIENT, building_id: 'a3000001-0001-4000-8000-000000000002', title: 'Beachview Towers B14 — 2-bed rental', agent_id: null }],
    ])
    db.buildings = new Map([
      [HUMEWOOD_BUILDING, { id: HUMEWOOD_BUILDING, client_id: HORIZON_CLIENT, landlord_id: null }],
      [BAYVIEW_BUILDING, { id: BAYVIEW_BUILDING, client_id: BAYVIEW_CLIENT, landlord_id: null }],
    ])
    db.applications = new Map()

    const { default: app } = await import('../../../server/index')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        if (url.startsWith('/api/health')) {
          // Live /api/health pings the database: 1.3-2.3 s, past the 800 ms abort.
          return new Promise<Response>((resolve, reject) => {
            const timer = setTimeout(() => resolve(Response.json({ ok: true })), 1_500)
            init?.signal?.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(new DOMException('The operation was aborted.', 'AbortError'))
            })
          })
        }
        const res = await app.fetch(new Request(`http://propertyflow.test${url}`, init))
        statuses.push(`${init?.method ?? 'GET'} ${url} ${res.status}`)
        return res
      }),
    )
    const { setApiActor } = await import('./actorAuth')
    setApiActor({ userId: GUEST_FE, role: 'tenant', agencyId: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the application through the gated route and saves it on Humewood / Horizon', async () => {
    const { persistToApi } = await import('./persist')
    const appRow = await guestApplication()

    const ok = await persistToApi({
      resource: 'application',
      action: 'upsert',
      id: appRow.id,
      data: { ...(appRow as unknown as Record<string, unknown>), id: appRow.id },
    })

    expect(calls).toContain('POST /api/persist')
    expect(ok).toBe(true)

    // The real gate ran: enrichActor looked the guest up by their users row,
    // buildActorPropertyScope loaded the property book and the application
    // scan, and loadExisting looked for an existing APP-guest-pr1011 row.
    expect(db.sql.some((s) => /SELECT client_id FROM users WHERE id = \$1::uuid/.test(s))).toBe(true)
    expect(db.sql.some((s) => /FROM units u\s+JOIN buildings b ON b\.id = u\.building_id/.test(s))).toBe(true)
    expect(db.sql.some((s) => s.includes('FROM applications a') && s.includes('LEFT JOIN users u'))).toBe(true)
    expect(db.sql.some((s) => /FROM applications WHERE reference_code = \$1/.test(s))).toBe(true)
    expect(statuses).toContain('POST /api/persist 200')

    expect(db.applications.size).toBe(1)
    const saved = [...db.applications.values()][0]!
    const [, clientId, unitId, applicantId, agentId, ref, , status] = saved.params
    expect(unitId).toBe(HUMEWOOD_UNIT)
    expect(unitId).not.toBe(FRAMESBY_UNIT)
    expect(unitId).not.toBe(BEACHVIEW_B14)
    expect(clientId).toBe(HORIZON_CLIENT)
    expect(clientId).not.toBe(BAYVIEW_CLIENT)
    expect(applicantId).toBe(GUEST_UUID)
    expect(agentId).toBe(JAMES_UUID)
    expect(ref).toBe('APP-guest-pr1011')
    expect(status).toBe('SUBMITTED')
    // Reload maps the Humewood unit uuid back to the public PR-1011 listing (idMap).
    const { mapProperty } = await import('../../../server/idMap.js')
    expect(mapProperty(unitId as string)).toBe('PR-1011')
    // The saved id is mapped, so the next load can find APP-guest-pr1011.
    expect(
      db.map.find((r) => r.entity_type === 'application' && r.frontend_id === 'APP-guest-pr1011')?.backend_id,
    ).toBe(saved.id)
  })

  it('#69 / Angela c3f25ac: the guest save keeps its initial stage after reload (stored stage, workflowStatus, status)', async () => {
    const { persistToApi } = await import('./persist')
    const appRow = await guestApplication()
    expect(
      await persistToApi({
        resource: 'application',
        action: 'upsert',
        id: appRow.id,
        data: { ...(appRow as unknown as Record<string, unknown>), id: appRow.id },
      }),
    ).toBe(true)
    const stored = () => {
      const saved = [...db.applications.values()][0]!
      return { status: saved.params[7], meta: JSON.parse(String(saved.params[13])) as Record<string, unknown> }
    }
    // What a reload reads back: never a null workflow_status / stage.
    const { normalizeApplication, workflowProgress } = await import('../applicationWorkflow')
    expect(stored().status).toBe('SUBMITTED')
    expect(stored().meta).toMatchObject({
      workflow_status: 'application_submitted',
      stage: 'Application submitted',
      progress: workflowProgress('Rental', 'application_submitted'),
    })
    const reloaded = normalizeApplication({
      ...appRow,
      workflowStatus: stored().meta.workflow_status,
      stage: stored().meta.stage,
    } as Application)
    expect(reloaded.workflowStatus).toBe('application_submitted')
    expect(reloaded.stage).toBe('Application submitted')

    // The guest edits their phone after the reload: still application_submitted.
    expect(
      await persistToApi({
        resource: 'application',
        action: 'upsert',
        id: appRow.id,
        data: { ...(reloaded as unknown as Record<string, unknown>), id: appRow.id, phone: '0830000000' },
      }),
    ).toBe(true)
    expect(stored().status).toBe('SUBMITTED')
    expect(stored().meta).toMatchObject({
      workflow_status: 'application_submitted',
      stage: 'Application submitted',
      phone: '0830000000',
    })
  })

  it('answers false when the real scope gate refuses the application', async () => {
    const { persistToApi } = await import('./persist')
    const appRow = await guestApplication()
    // Same guest, but filing in another person's name: not their own
    // application and not on their property book, so the gate must refuse.
    const OTHER_FE = 'u-someone-else'
    db.map.push({ entity_type: 'user', frontend_id: OTHER_FE, backend_id: 'b9000001-0001-4000-8000-000000000099' })

    const ok = await persistToApi({
      resource: 'application',
      action: 'upsert',
      id: appRow.id,
      data: { ...(appRow as unknown as Record<string, unknown>), id: appRow.id, applicantUserId: OTHER_FE },
    })

    expect(calls).toContain('POST /api/persist')
    expect(statuses).toContain('POST /api/persist 403')
    expect(ok).toBe(false)
    // The refusal came from assertPersistAllowed after the property-book load.
    expect(db.sql.some((s) => /FROM units u\s+JOIN buildings b ON b\.id = u\.building_id/.test(s))).toBe(true)
    expect(db.sql.some((s) => s.includes('INSERT INTO applications'))).toBe(false)
    expect(db.applications.size).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Hardening T1: the applicant's details survive the round trip and later
  // writes, through the real /api/persist and /api/bootstrap routes.
  // ---------------------------------------------------------------------------
  const DETAILS = {
    phone: '0821234567',
    employerName: 'Algoa Logistics',
    jobTitle: 'Dispatcher',
    idNumberOrPassport: '9001015009087',
  }
  const LL_FE = 'u-ll-humewood'
  const LL_UUID = 'b9000001-0001-4000-8000-0000000000a1'
  const OTHER_ADMIN_FE = 'u-garden-admin'
  const OTHER_ADMIN_UUID = 'b9000001-0001-4000-8000-0000000000a2'
  const STAFF = { userId: 'u-james', role: 'ground_agent', agencyId: 'ag-horizon' } as const
  const TENANT = { userId: GUEST_FE, role: 'tenant', agencyId: null } as const
  const SUPER = { userId: 'u-super', role: 'super_admin', agencyId: null } as const

  function addRoundTripPeople() {
    db.users.set(JAMES_UUID, { ...db.users.get(JAMES_UUID)!, role: 'GROUND_AGENT' })
    db.users.set(LL_UUID, { id: LL_UUID, client_id: HORIZON_CLIENT, email: 'owner.humewood@example.com', frontend_id: LL_FE, role: 'LANDLORD' })
    db.users.set(OTHER_ADMIN_UUID, { id: OTHER_ADMIN_UUID, client_id: BAYVIEW_CLIENT, email: 'admin@garden.example', frontend_id: OTHER_ADMIN_FE, role: 'CLIENT_ADMIN' })
    db.map.push({ entity_type: 'user', frontend_id: LL_FE, backend_id: LL_UUID })
    db.map.push({ entity_type: 'user', frontend_id: OTHER_ADMIN_FE, backend_id: OTHER_ADMIN_UUID })
    db.buildings.set(HUMEWOOD_BUILDING, { ...db.buildings.get(HUMEWOOD_BUILDING)!, landlord_id: LL_UUID })
  }

  async function bootstrapApp(actor: { userId: string; role: string; agencyId: string | null }) {
    const { actorHeaders } = await import('./actorAuth')
    db.lenient = true
    try {
      const res = await fetch('/api/bootstrap', { headers: actorHeaders(actor as never) })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { applications: Array<Record<string, unknown>> }
      return body.applications.find((a) => a.id === 'APP-guest-pr1011')
    } finally {
      db.lenient = false
    }
  }

  async function persistAs(
    actor: { userId: string; role: string; agencyId: string | null },
    data: Record<string, unknown>,
  ) {
    const { setApiActor } = await import('./actorAuth')
    const { persistToApi } = await import('./persist')
    setApiActor(actor as never)
    return persistToApi({ resource: 'application', action: 'upsert', id: 'APP-guest-pr1011', data: { ...data, id: 'APP-guest-pr1011' } })
  }

  const pick = (a: Record<string, unknown> | undefined) => ({
    phone: a?.phone,
    employerName: a?.employerName,
    jobTitle: a?.jobTitle,
    idNumberOrPassport: a?.idNumberOrPassport,
  })
  const storedMeta = () => JSON.parse(String([...db.applications.values()][0]!.params[13])) as Record<string, unknown>

  it('T1: an application with no employer is accepted (employer is optional)', async () => {
    addRoundTripPeople()
    const appRow = await guestApplication()
    const { employerName: _e, jobTitle: _j, ...noEmployer } = DETAILS
    expect(
      await persistAs(TENANT, { ...(appRow as unknown as Record<string, unknown>), ...noEmployer, employerName: undefined, jobTitle: undefined }),
    ).toBe(true)
    expect(storedMeta()).toMatchObject({ phone: DETAILS.phone, idNumberOrPassport: DETAILS.idNumberOrPassport })
    expect(storedMeta().employerName ?? null).toBeNull()
    const own = await bootstrapApp(TENANT)
    expect(own?.employerName ?? null).toBeNull()
    expect(own?.phone).toBe(DETAILS.phone)
  })

  it('pin (M12): a CREATE that sends a masked ID stores null, never the masked value', async () => {
    addRoundTripPeople()
    const appRow = await guestApplication()
    expect(db.applications.size).toBe(0)
    expect(
      await persistAs(TENANT, {
        ...(appRow as unknown as Record<string, unknown>),
        ...DETAILS,
        idNumberOrPassport: maskIdNumber(DETAILS.idNumberOrPassport),
      }),
    ).toBe(true)
    expect(db.applications.size).toBe(1)
    expect(storedMeta().idNumberOrPassport).toBeNull()
    expect(storedMeta().phone).toBe(DETAILS.phone)
  })

  it('T1 contract: tenant apply -> bootstrap as the tenant and as the listing agency staff returns phone, employer, job title and ID', async () => {
    addRoundTripPeople()
    const appRow = await guestApplication()
    expect(await persistAs(TENANT, { ...(appRow as unknown as Record<string, unknown>), ...DETAILS })).toBe(true)
    expect(storedMeta()).toMatchObject(DETAILS)

    expect(pick(await bootstrapApp(TENANT))).toEqual(DETAILS)
    expect(pick(await bootstrapApp(STAFF))).toEqual(DETAILS)
  })

  it('T1 C5: a second applicant write and a staff full-row save that send blank or null keep the stored details', async () => {
    addRoundTripPeople()
    const appRow = await guestApplication()
    expect(await persistAs(TENANT, { ...(appRow as unknown as Record<string, unknown>), ...DETAILS })).toBe(true)

    // Applicant: a later write (e.g. document upload) that carries blanks.
    const mine = (await bootstrapApp(TENANT))!
    expect(
      await persistAs(TENANT, { ...mine, phone: '', employerName: '', jobTitle: null, idNumberOrPassport: '' }),
    ).toBe(true)
    expect(storedMeta()).toMatchObject(DETAILS)

    // Applicant: a narrow write with the keys MISSING from the payload.
    const { phone: _p, employerName: _e, jobTitle: _j, idNumberOrPassport: _i, ...narrow } = mine
    void _p; void _e; void _j; void _i
    expect(await persistAs(TENANT, narrow)).toBe(true)
    expect(storedMeta()).toMatchObject(DETAILS)

    // Agency staff: a full-row save with blank / null details.
    const staffCopy = (await bootstrapApp(STAFF))!
    expect(
      await persistAs(STAFF, { ...staffCopy, phone: '', employerName: null, jobTitle: '', idNumberOrPassport: null }),
    ).toBe(true)
    expect(storedMeta()).toMatchObject(DETAILS)
    expect(pick(await bootstrapApp(STAFF))).toEqual(DETAILS)
    expect(pick(await bootstrapApp(TENANT))).toEqual(DETAILS)
  })

  it('T1 C5(i): a stored row whose metadata LACKS the keys loads without them, and the applicant can re-enter them', async () => {
    addRoundTripPeople()
    const appRow = await guestApplication()
    const { phone: _p, idNumberOrPassport: _i, ...withoutDetails } = appRow as unknown as Record<string, unknown>
    void _p; void _i
    expect(await persistAs(TENANT, withoutDetails)).toBe(true)
    // Simulate the live row: metadata has none of the four keys.
    const saved = [...db.applications.values()][0]!
    const meta = storedMeta()
    for (const k of Object.keys(DETAILS)) delete meta[k]
    saved.params[13] = JSON.stringify(meta)

    const before = (await bootstrapApp(TENANT))!
    expect(before.employerName).toBeUndefined()
    expect(before.jobTitle).toBeUndefined()
    expect(before.idNumberOrPassport).toBeUndefined()
    expect(before.phone ?? '').toBe('')

    // Your details: the applicant re-enters them; the round trip persists.
    expect(await persistAs(TENANT, { ...before, ...DETAILS })).toBe(true)
    expect(storedMeta()).toMatchObject(DETAILS)
    expect(pick(await bootstrapApp(TENANT))).toEqual(DETAILS)
    expect(pick(await bootstrapApp(STAFF))).toEqual(DETAILS)
  })

  it('T1 C6: the landlord and another agency\'s staff never receive the ID number', async () => {
    addRoundTripPeople()
    const appRow = await guestApplication()
    expect(await persistAs(TENANT, { ...(appRow as unknown as Record<string, unknown>), ...DETAILS })).toBe(true)

    const landlord = await bootstrapApp({ userId: LL_FE, role: 'landlord', agencyId: 'ag-horizon' })
    expect(landlord?.idNumberOrPassport ?? undefined).toBeUndefined()
    const other = await bootstrapApp({ userId: OTHER_ADMIN_FE, role: 'client_admin', agencyId: 'ag-garden' })
    // Unconditional: whether or not the row reaches them, the full ID never does.
    expect(other?.idNumberOrPassport ?? null).not.toBe(DETAILS.idNumberOrPassport)
    expect(JSON.stringify(other ?? null)).not.toContain(DETAILS.idNumberOrPassport)
    // Super admin is not exempt: masked.
    const sa = await bootstrapApp(SUPER)
    expect(sa).toBeTruthy()
    expect(sa?.idNumberOrPassport).toBe(maskIdNumber(DETAILS.idNumberOrPassport))
    // The listing agency's staff and the applicant still get it in full.
    expect((await bootstrapApp(STAFF))?.idNumberOrPassport).toBe(DETAILS.idNumberOrPassport)
    expect((await bootstrapApp(TENANT))?.idNumberOrPassport).toBe(DETAILS.idNumberOrPassport)
  })

  it('T1 O5: co-applicant / guarantor IDs are masked for super admin, and a masked roster never replaces the stored one', async () => {
    addRoundTripPeople()
    const appRow = await guestApplication()
    const roster = {
      adults: [
        { id: 'main', name: 'Naledi Dlamini', idNumber: DETAILS.idNumberOrPassport, consented: false },
        { id: 'co', name: 'Co Applicant', idNumber: '9202024800081', consented: false },
        { id: 'g', name: 'Guarantor', idNumber: 'A12345678', consented: false },
      ],
    }
    expect(
      await persistAs(TENANT, { ...(appRow as unknown as Record<string, unknown>), ...DETAILS, creditCheckConsents: roster }),
    ).toBe(true)
    const storedRoster = () =>
      (JSON.parse(String([...db.applications.values()][0]!.params[11])) as { creditCheckConsents?: typeof roster })
        .creditCheckConsents
    expect(storedRoster()).toEqual(roster)
    const adultIds = (a: Record<string, unknown> | undefined) =>
      ((a?.creditCheckConsents as typeof roster | undefined)?.adults ?? []).map((x) => x.idNumber)
    expect(adultIds(await bootstrapApp(STAFF))).toEqual(roster.adults.map((x) => x.idNumber))
    const saCopy = await bootstrapApp(SUPER)
    expect(adultIds(saCopy)).toEqual(roster.adults.map((x) => maskIdNumber(x.idNumber)))
    expect(await persistAs(SUPER, { ...(saCopy as Record<string, unknown>), status: 'reviewing' })).toBe(true)
    expect(storedRoster()).toEqual(roster)
  })

  it('pin (A1): a whitespace-only value counts as blank and keeps the stored details', async () => {
    addRoundTripPeople()
    const appRow = await guestApplication()
    expect(await persistAs(TENANT, { ...(appRow as unknown as Record<string, unknown>), ...DETAILS })).toBe(true)
    const ws = { phone: '   ', employerName: ' \t ', jobTitle: '  ', idNumberOrPassport: ' \n ' }
    expect(await persistAs(TENANT, { ...(await bootstrapApp(TENANT))!, ...ws })).toBe(true)
    expect(storedMeta()).toMatchObject(DETAILS)
    expect(await persistAs(STAFF, { ...(await bootstrapApp(STAFF))!, ...ws, status: 'reviewing' })).toBe(true)
    expect(storedMeta()).toMatchObject(DETAILS)
  })

  it('pin (C2): the roster guard checks every adult (a masked ID in the second adult only)', async () => {
    addRoundTripPeople()
    const appRow = await guestApplication()
    const roster = {
      adults: [
        { id: 'main', name: 'Naledi Dlamini', idNumber: DETAILS.idNumberOrPassport, consented: false },
        { id: 'co', name: 'Co Applicant', idNumber: '9202024800081', consented: false },
        { id: 'g', name: 'Guarantor', idNumber: 'A12345678', consented: false },
      ],
    }
    expect(
      await persistAs(TENANT, { ...(appRow as unknown as Record<string, unknown>), ...DETAILS, creditCheckConsents: roster }),
    ).toBe(true)
    const storedRoster = () =>
      (JSON.parse(String([...db.applications.values()][0]!.params[11])) as { creditCheckConsents?: typeof roster })
        .creditCheckConsents
    const echoed = {
      adults: roster.adults.map((a, i) => (i === 1 ? { ...a, idNumber: maskIdNumber(a.idNumber) } : a)),
    }
    const saCopy = await bootstrapApp(SUPER)
    expect(await persistAs(SUPER, { ...(saCopy as Record<string, unknown>), creditCheckConsents: echoed })).toBe(true)
    expect(storedRoster()).toEqual(roster)
  })

  it('T1 C6: a super admin saving the masked row never overwrites the stored ID', async () => {
    addRoundTripPeople()
    const appRow = await guestApplication()
    expect(await persistAs(TENANT, { ...(appRow as unknown as Record<string, unknown>), ...DETAILS })).toBe(true)
    const saCopy = await bootstrapApp(SUPER)
    expect(saCopy?.idNumberOrPassport).toBe(maskIdNumber(DETAILS.idNumberOrPassport))
    expect(await persistAs(SUPER, { ...(saCopy as Record<string, unknown>), status: 'reviewing' })).toBe(true)
    expect(storedMeta().idNumberOrPassport).toBe(DETAILS.idNumberOrPassport)
    expect((await bootstrapApp(STAFF))?.idNumberOrPassport).toBe(DETAILS.idNumberOrPassport)
  })

  it('still answers false when the route refuses an unauthenticated write', async () => {
    const { persistToApi } = await import('./persist')
    const appRow = await guestApplication()
    const { setApiActor } = await import('./actorAuth')
    setApiActor(null)

    const ok = await persistToApi({
      resource: 'application',
      action: 'upsert',
      id: appRow.id,
      data: { ...(appRow as unknown as Record<string, unknown>), id: appRow.id },
    })

    expect(calls).toContain('POST /api/persist')
    expect(ok).toBe(false)
    expect(db.applications.size).toBe(0)
  })
})
