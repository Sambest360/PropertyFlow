/**
 * PR #69: guest full application on /listing/PR-1011 (Postgres-API mode).
 *
 * Production is the Postgres-API build: the live bundle has no
 * VITE_SUPABASE_URL, so persistToApi takes the API branch. That branch ran
 * quickHealth() first, which aborts GET /api/health after 800 ms. Live
 * /api/health pings the database and answered in 1.3-2.3 s, so persistToApi
 * returned false without ever POSTing /api/persist, and createApplication
 * deleted the optimistic APP ("Application could not be saved for agency
 * review").
 *
 * This test drives the client persistToApi into the real Hono app
 * (server/index.ts): the real /api/persist route, requireActorAndGate
 * (enrichActor + assertPersistAllowed), and handlePersist → upsertApplication.
 * Only Postgres is replaced, by a small table store that answers by SQL shape.
 * The guest user and the listing agent u-james are real users rows here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Application } from '../../types/domain'

process.env.PF_SKIP_SERVE = '1'

vi.mock('./config', () => ({ isApiEnabled: true, isSupabaseMode: false }))

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
type UserRow = { id: string; client_id: string | null; email: string; frontend_id: string | null }
type AppRow = { id: string; params: unknown[] }

const db = vi.hoisted(() => ({
  map: [] as MapRow[],
  users: new Map<string, UserRow>(),
  clients: new Set<string>(),
  units: new Map<string, { id: string; client_id: string | null; building_id: string; title: string }>(),
  buildings: new Map<string, { id: string; client_id: string | null }>(),
  applications: new Map<string, AppRow>(),
  sql: [] as string[],
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
    if (sql.includes('INSERT INTO applications')) {
      db.applications.set(String(params[0]), { id: String(params[0]), params })
      return []
    }
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

  beforeEach(async () => {
    calls.length = 0
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
      [HUMEWOOD_UNIT, { id: HUMEWOOD_UNIT, client_id: HORIZON_CLIENT, building_id: HUMEWOOD_BUILDING, title: 'Humewood Beach Apartment B14' }],
      [FRAMESBY_UNIT, { id: FRAMESBY_UNIT, client_id: BAYVIEW_CLIENT, building_id: BAYVIEW_BUILDING, title: 'Framesby cottage — Protea Lane' }],
      [BEACHVIEW_B14, { id: BEACHVIEW_B14, client_id: HORIZON_CLIENT, building_id: 'a3000001-0001-4000-8000-000000000002', title: 'Beachview Towers B14 — 2-bed rental' }],
    ])
    db.buildings = new Map([
      [HUMEWOOD_BUILDING, { id: HUMEWOOD_BUILDING, client_id: HORIZON_CLIENT }],
      [BAYVIEW_BUILDING, { id: BAYVIEW_BUILDING, client_id: BAYVIEW_CLIENT }],
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
        return app.fetch(new Request(`http://propertyflow.test${url}`, init))
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

    // Gate ran: enrichActor looked the guest up by their users row.
    expect(db.sql.some((s) => /SELECT client_id FROM users WHERE id = \$1::uuid/.test(s))).toBe(true)

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
    // The saved id is mapped, so the next load can find APP-guest-pr1011.
    expect(
      db.map.find((r) => r.entity_type === 'application' && r.frontend_id === 'APP-guest-pr1011')?.backend_id,
    ).toBe(saved.id)
  })

  it('still answers false when the gated route refuses the write', async () => {
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
