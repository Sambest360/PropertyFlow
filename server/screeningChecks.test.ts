import { randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { actorRequiredError, parseDemoActor } from './actor.js'
import { registerScreeningRoutes } from './screeningRoutes.js'
import {
  createProviderRegistry,
  createStubProvider,
  orderedProviders,
  parseScreeningSettings,
  signWebhookBody,
  type ApplicationRow,
  type AuditInsert,
  type ChargeInsert,
  type CheckRow,
  type ConsentRow,
  type PriceRow,
  type ProviderRegistry,
  type ScreeningProvider,
  type ScreeningStore,
  type UsageRow,
} from './screeningChecks.js'
import { openJson, sealJson } from './screeningCrypto.js'
import { SCREENING_CONSENT_VERSION, maskIdNumber, priceWithMarkup } from '../src/lib/screening/consentTerms.js'

const AG_A = 'client-a'
const AG_B = 'client-b'
const WEBHOOK_SECRET = 'e2e-test-webhook-secret'
const CRON = 'e2e-test-cron-secret'
const START = new Date('2026-10-20T08:00:00.000Z')

type Users = Record<string, { clientId: string | null }>
const USERS: Users = {
  'u-tenant': { clientId: null },
  'u-admin': { clientId: AG_A },
  'u-agent': { clientId: AG_A },
  'u-agent-other': { clientId: AG_A },
  'u-landlord': { clientId: null },
  'u-admin-b': { clientId: AG_B },
  'u-super': { clientId: null },
}

const ACTORS = {
  tenant: { 'X-User-Id': 'u-tenant', 'X-Role': 'tenant' },
  admin: { 'X-User-Id': 'u-admin', 'X-Role': 'client_admin', 'X-Agency-Id': AG_A },
  agent: { 'X-User-Id': 'u-agent', 'X-Role': 'ground_agent', 'X-Agency-Id': AG_A },
  otherAgent: { 'X-User-Id': 'u-agent-other', 'X-Role': 'ground_agent', 'X-Agency-Id': AG_A },
  landlord: { 'X-User-Id': 'u-landlord', 'X-Role': 'landlord' },
  adminB: { 'X-User-Id': 'u-admin-b', 'X-Role': 'client_admin', 'X-Agency-Id': AG_B },
  superAdmin: { 'X-User-Id': 'u-super', 'X-Role': 'super_admin' },
} as const

function memoryStore() {
  const apps = new Map<string, ApplicationRow>()
  const settings = new Map<string, unknown>()
  const consents: ConsentRow[] = []
  const checks: CheckRow[] = []
  const audit: Array<AuditInsert & { at: Date }> = []
  const charges: Array<ChargeInsert & { id: string; invoiceId: string | null }> = []
  const prices: PriceRow[] = []
  const leases: Array<{ applicationId: string; endDate: Date | null; ended: boolean }> = []

  const store: ScreeningStore = {
    tx: (fn) => fn(),
    async resolveActor(actor) {
      return { userUuid: actor.userId, clientUuid: actor.agencyId ?? USERS[actor.userId]?.clientId ?? null }
    },
    async resolveClient(ref) {
      return ref === AG_A || ref === AG_B ? ref : null
    },
    async loadApplication(ref) {
      return apps.get(ref) ?? null
    },
    async agencySettings(clientId) {
      return settings.get(clientId) ?? {}
    },
    async saveAgencyScreeningSettings(clientId, next) {
      settings.set(clientId, { screening: next })
      for (const [k, a] of apps) if (a.clientId === clientId) apps.set(k, { ...a, agencySettings: { screening: next } })
    },
    async insertConsent(row) {
      const c = { ...row, id: randomUUID() }
      consents.push(c)
      return c
    },
    async getConsent(id) {
      return consents.find((c) => c.id === id) ?? null
    },
    async listConsents(applicationId) {
      return consents.filter((c) => c.applicationId === applicationId)
    },
    async withdrawConsent(id, at) {
      const c = consents.find((x) => x.id === id && !x.withdrawnAt)
      if (!c) return false
      c.withdrawnAt = at
      return true
    },
    async findValidConsent(applicationId, checkType, now) {
      return (
        consents
          .filter((c) => c.applicationId === applicationId && c.checkTypes.includes(checkType))
          .filter((c) => !c.withdrawnAt && c.expiresAt > now)
          .at(-1) ?? null
      )
    },
    async findRecentCheck(applicationId, checkType, since) {
      return (
        checks
          .filter((c) => c.applicationId === applicationId && c.checkType === checkType && c.requestedAt >= since)
          .filter((c) => c.status !== 'ERROR' && c.status !== 'CANCELLED')
          .at(-1) ?? null
      )
    },
    async insertCheck(row) {
      const c = { ...row, id: row.id ?? randomUUID() } as CheckRow
      checks.push(c)
      return { ...c }
    },
    async updateCheck(id, patch, onlyIfStatus) {
      const c = checks.find((x) => x.id === id)
      if (!c || (onlyIfStatus && !onlyIfStatus.includes(c.status))) return null
      Object.assign(c, patch)
      return { ...c }
    },
    async getCheck(id) {
      const c = checks.find((x) => x.id === id)
      return c ? { ...c } : null
    },
    async listChecks(applicationId) {
      return checks.filter((c) => c.applicationId === applicationId).map((c) => ({ ...c }))
    },
    async findCheckByProviderRef(provider, providerRef) {
      const c = checks.find((x) => x.provider === provider && x.providerRef === providerRef)
      return c ? { ...c } : null
    },
    async insertAudit(row) {
      audit.push({ ...row, at: new Date() })
    },
    async getPrice(provider, checkType) {
      return prices.find((p) => p.provider === provider && p.checkType === checkType) ?? null
    },
    async listPrices() {
      return [...prices]
    },
    async upsertPrice(row) {
      const i = prices.findIndex((p) => p.provider === row.provider && p.checkType === row.checkType)
      if (i >= 0) prices[i] = row
      else prices.push(row)
      return row
    },
    async insertCharge(row) {
      if (charges.some((c) => c.checkId === row.checkId)) return null
      const c = { ...row, id: randomUUID(), invoiceId: null }
      charges.push(c)
      return { id: c.id }
    },
    async usage(month, clientId) {
      const out = new Map<string, UsageRow>()
      for (const c of charges) {
        if (c.billingMonth !== month || (clientId && c.clientId !== clientId)) continue
        const key = [c.clientId, c.provider, c.checkType, c.payer].join('|')
        const row = out.get(key) ?? {
          clientId: c.clientId,
          agencyRef: c.clientId,
          agencyName: `E2E TEST Agency ${c.clientId}`,
          provider: c.provider,
          checkType: c.checkType,
          payer: c.payer,
          count: 0,
          costCents: 0,
          priceCents: 0,
          uninvoicedPriceCents: 0,
        }
        row.count += 1
        row.costCents += c.costCents
        row.priceCents += c.priceCents
        if (!c.invoiceId) row.uninvoicedPriceCents += c.priceCents
        out.set(key, row)
      }
      return [...out.values()]
    },
    async billCharges(clientId, month, invoiceRef) {
      let count = 0
      let priceCents = 0
      for (const c of charges) {
        if (c.clientId !== clientId || c.billingMonth !== month || c.invoiceId || c.payer !== 'AGENCY') continue
        c.invoiceId = invoiceRef
        count += 1
        priceCents += c.priceCents
      }
      return { count, priceCents, lineItemAdded: count > 0 }
    },
    async purgeCandidates(now) {
      return checks.filter((c) => c.resultEncrypted && c.retainUntil && c.retainUntil <= now).map((c) => ({ ...c }))
    },
    async relationshipEnd(applicationId) {
      const mine = leases.filter((l) => l.applicationId === applicationId)
      if (!mine.length) return null
      if (mine.some((l) => !l.endDate && !l.ended)) return 'ongoing'
      return mine.reduce<Date | null>((max, l) => (l.endDate && (!max || l.endDate > max) ? l.endDate : max), null)
    },
  }
  return { store, apps, settings, consents, checks, audit, charges, prices, leases }
}

function app1(idNumber: string, over: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: 'app-1',
    ref: 'app-1',
    clientId: AG_A,
    agencyName: 'E2E TEST Agency A',
    agencySettings: {},
    applicantUserId: 'u-tenant',
    applicantName: 'E2E TEST Applicant',
    agentId: 'u-agent',
    landlordUserId: 'u-landlord',
    idNumber,
    ...over,
  }
}

let mem: ReturnType<typeof memoryStore>
let clock: Date
let env: Record<string, string | undefined>
let registry: ProviderRegistry
let app: Hono

function build(reg?: ProviderRegistry) {
  registry = reg ?? createProviderRegistry(env, () => clock)
  app = new Hono()
  registerScreeningRoutes(app, {
    store: mem.store,
    registry,
    env,
    now: () => clock,
    requireActor: async (c) => {
      const actor = parseDemoActor(c)
      if (!actor) throw actorRequiredError({})
      return actor
    },
    cronSecret: () => env.CRON_SECRET,
  })
}

async function call(
  method: string,
  path: string,
  who: Record<string, string> | null,
  body?: unknown,
): Promise<{ status: number; json: Record<string, any> }> {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...who },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, json: (await res.json()) as Record<string, any> }
}

async function consent(checkTypes: string[] = ['ID_VERIFY', 'CREDIT'], over: Record<string, unknown> = {}) {
  return call('POST', '/api/screening/consents', ACTORS.tenant, {
    applicationId: 'app-1',
    checkTypes,
    typedName: 'E2E TEST Applicant',
    accepted: true,
    consentTextVersion: SCREENING_CONSENT_VERSION,
    ...over,
  })
}

function requestCheck(checkType = 'CREDIT', who: Record<string, string> = ACTORS.agent, extra: Record<string, unknown> = {}) {
  return call('POST', '/api/screening/checks', who, { applicationId: 'app-1', checkType, ...extra })
}

beforeEach(() => {
  mem = memoryStore()
  clock = new Date(START)
  env = {
    SCREENING_ENC_KEY: randomBytes(32).toString('base64'),
    SCREENING_MOCK_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CRON_SECRET: CRON,
  }
  mem.apps.set('app-1', app1('9001015800080'))
  build()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('screening crypto', () => {
  it('round-trips and rejects tampering or a missing key', () => {
    const sealed = sealJson({ outcome: 'PASS' }, env)
    expect(sealed.ciphertext.toString('utf8')).not.toContain('PASS')
    expect(openJson(sealed.ciphertext, sealed.keyId, env)).toEqual({ outcome: 'PASS' })
    const bad = Buffer.from(sealed.ciphertext)
    bad[bad.length - 1] ^= 1
    expect(() => openJson(bad, sealed.keyId, env)).toThrow(/authentication/)
    expect(() => sealJson({}, {})).toThrow(/SCREENING_ENC_KEY/)
  })
})

describe('consent', () => {
  it('only the subject can consent, and the typed name must match', async () => {
    expect((await call('POST', '/api/screening/consents', ACTORS.agent, { applicationId: 'app-1' })).status).toBe(403)
    const wrongName = await consent(['CREDIT'], { typedName: 'Someone Else' })
    expect(wrongName.status).toBe(400)
    expect(wrongName.json.code).toBe('TYPED_NAME_MISMATCH')
    const stale = await consent(['CREDIT'], { consentTextVersion: 'old' })
    expect(stale.status).toBe(409)

    const ok = await consent()
    expect(ok.status).toBe(200)
    expect(ok.json.consent.subjectId).toBe('•••• 0080')
    const row = mem.consents[0]
    expect(row.consentTextHash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.subjectIdEncrypted?.toString('utf8') ?? '').not.toContain('9001015800080')
    expect(mem.audit.map((a) => a.action)).toEqual(['CONSENT_GIVEN'])
  })

  it('refuses a check type the agency switched off', async () => {
    mem.apps.set('app-1', app1('9001015800080', { agencySettings: { screening: { enabledChecks: ['CREDIT'] } } }))
    const r = await consent(['ID_VERIFY'])
    expect(r.status).toBe(400)
    expect(r.json.code).toBe('CHECK_TYPE_DISABLED')
  })
})

describe('requesting checks', () => {
  it('returns 409 without consent', async () => {
    const r = await requestCheck('CREDIT')
    expect(r.status).toBe(409)
    expect(r.json.code).toBe('CONSENT_REQUIRED')
  })

  it('returns 409 when the consent does not cover the type, is withdrawn, or expired', async () => {
    await consent(['ID_VERIFY'])
    expect((await requestCheck('CREDIT')).status).toBe(409)

    const c = await consent(['CREDIT'])
    await call('POST', `/api/screening/consents/${c.json.consent.id}/withdraw`, ACTORS.tenant, {})
    expect((await requestCheck('CREDIT')).status).toBe(409)

    await consent(['CREDIT'])
    clock = new Date(START.getTime() + 91 * 86_400_000)
    expect((await requestCheck('CREDIT')).status).toBe(409)
  })

  it('only an agency admin or the assigned agent can request', async () => {
    await consent()
    expect((await requestCheck('CREDIT', ACTORS.otherAgent)).status).toBe(403)
    expect((await requestCheck('CREDIT', ACTORS.adminB)).status).toBe(403)
    expect((await requestCheck('CREDIT', ACTORS.tenant)).status).toBe(403)
    expect((await requestCheck('CREDIT', ACTORS.admin)).status).toBe(200)
  })

  it('mock PASS shows a summary and stores the full result encrypted', async () => {
    await consent()
    const r = await requestCheck('CREDIT')
    expect(r.status).toBe(200)
    expect(r.json.check.status).toBe('PASSED')
    expect(r.json.check.summary).toMatchObject({ outcome: 'PASS', score: 712 })
    expect(r.json.check).not.toHaveProperty('result')

    const row = mem.checks[0]
    expect(Buffer.isBuffer(row.resultEncrypted)).toBe(true)
    const stored = row.resultEncrypted!.toString('utf8')
    expect(stored).not.toContain('PASS')
    expect(stored).not.toContain('"outcome"')
    expect(() => JSON.parse(stored)).toThrow()
    expect(row.retainUntil?.toISOString()).toBe('2027-10-20T08:00:00.000Z')
  })

  it('maps ID endings 1 and 2 to FAIL and REFER', async () => {
    await consent()
    mem.apps.set('app-1', app1('9001015800081'))
    mem.consents.length = 0
    await consent()
    expect((await requestCheck('CREDIT')).json.check.status).toBe('FAILED')
    mem.apps.set('app-1', app1('9001015800082'))
    mem.consents.length = 0
    await consent()
    expect((await requestCheck('ID_VERIFY')).json.check.status).toBe('REFER')
  })

  it('warns and reuses a check from the last 30 days unless confirmed', async () => {
    await consent()
    const first = await requestCheck('CREDIT')
    const again = await requestCheck('CREDIT')
    expect(again.json.reused).toBe(true)
    expect(again.json.warning).toBe('DUPLICATE_WITHIN_30_DAYS')
    expect(again.json.check.id).toBe(first.json.check.id)
    expect(mem.checks).toHaveLength(1)
    expect(mem.audit.some((a) => a.action === 'REUSED')).toBe(true)

    const confirmed = await requestCheck('CREDIT', ACTORS.agent, { confirmDuplicate: true })
    expect(confirmed.json.reused).toBe(false)
    expect(mem.checks).toHaveLength(2)
    expect(mem.charges).toHaveLength(2)

    clock = new Date(START.getTime() + 31 * 86_400_000)
    expect((await requestCheck('CREDIT')).json.reused).toBe(false)
  })

  it('never logs the ID number or the payload', async () => {
    const lines: string[] = []
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '))
      })
    }
    await consent()
    await requestCheck('CREDIT')
    await call('GET', `/api/screening/checks/${mem.checks[0].id}/full`, ACTORS.admin)
    expect(lines.join('\n')).not.toContain('9001015800080')
    expect(lines.join('\n')).not.toContain('E2E TEST mock bureau')
  })
})

describe('reading results', () => {
  beforeEach(async () => {
    await consent()
    await requestCheck('CREDIT')
  })

  it('viewing the full result writes a VIEWED_FULL audit row', async () => {
    const id = mem.checks[0].id
    const r = await call('GET', `/api/screening/checks/${id}/full`, ACTORS.admin)
    expect(r.status).toBe(200)
    expect(r.json.result.outcome).toBe('PASS')
    const viewed = mem.audit.filter((a) => a.action === 'VIEWED_FULL')
    expect(viewed).toHaveLength(1)
    expect(viewed[0]).toMatchObject({ checkId: id, actorUserId: 'u-admin', clientId: AG_A })

    expect((await call('GET', `/api/screening/checks/${id}/full`, ACTORS.agent)).status).toBe(200)
    expect((await call('GET', `/api/screening/checks/${id}/full`, ACTORS.otherAgent)).status).toBe(403)
    expect((await call('GET', `/api/screening/checks/${id}/full`, ACTORS.superAdmin)).status).toBe(403)
    expect((await call('GET', `/api/screening/checks/${id}/full`, ACTORS.tenant)).status).toBe(403)
    expect(mem.audit.filter((a) => a.action === 'VIEWED_FULL')).toHaveLength(2)
  })

  it('another agency cannot read the check', async () => {
    const id = mem.checks[0].id
    expect((await call('GET', `/api/screening/checks/${id}`, ACTORS.adminB)).status).toBe(404)
    expect((await call('GET', `/api/screening/checks/${id}/full`, ACTORS.adminB)).status).toBe(404)
    expect((await call('GET', '/api/screening/checks?applicationId=app-1', ACTORS.adminB)).status).toBe(403)
    expect(mem.audit.some((a) => a.action === 'VIEWED_FULL')).toBe(false)
  })

  it('landlords see pass/fail only; staff see summary and a cost preview', async () => {
    const landlord = await call('GET', '/api/screening/checks?applicationId=app-1', ACTORS.landlord)
    expect(landlord.status).toBe(200)
    expect(landlord.json.checks).toEqual([{ id: mem.checks[0].id, checkType: 'CREDIT', outcome: 'PASS' }])

    const staff = await call('GET', '/api/screening/checks?applicationId=app-1', ACTORS.agent)
    expect(staff.json.view).toBe('staff')
    expect(staff.json.checks[0].summary.score).toBe(712)
    expect(staff.json.quotes.CREDIT).toMatchObject({ provider: 'mock', payer: 'AGENCY' })
    expect(staff.json.consentCovers).toMatchObject({ CREDIT: true, ID_VERIFY: true, BANK_AVS: false })

    const subject = await call('GET', '/api/screening/checks?applicationId=app-1', ACTORS.tenant)
    expect(subject.json.checks[0].summary).toEqual({ outcome: 'PASS' })
  })
})

describe('RLS (migration 028)', () => {
  const sql = readFileSync(resolve(process.cwd(), 'database/postgres/migrations/028_screening_checks.sql'), 'utf8')

  it.each(['screening_consents', 'screening_checks', 'screening_check_audit', 'screening_charges'])(
    '%s has RLS scoped to the caller’s client_id',
    (table) => {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
      const policy = sql.slice(sql.indexOf(`CREATE POLICY ${table}_select`))
      const body = policy.slice(0, policy.indexOf(';'))
      expect(body).toContain('client_id = current_app_client_id()')
      expect(body).not.toMatch(/USING \(true\)/)
    },
  )

  it('the audit table is append-only', () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON screening_check_audit FROM PUBLIC/)
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON screening_check_audit/)
    expect(sql).toMatch(/BEFORE TRUNCATE ON screening_check_audit/)
    expect(sql).not.toMatch(/CREATE POLICY screening_check_audit_(insert|update|delete|mutate)/)
  })

  it('schema.sql carries the same tables', () => {
    const schema = readFileSync(resolve(process.cwd(), 'database/postgres/schema.sql'), 'utf8')
    for (const t of ['screening_consents', 'screening_checks', 'screening_check_audit', 'screening_charges']) {
      expect(schema).toContain(`CREATE TABLE ${t} (`)
    }
  })
})

describe('charges', () => {
  it('price = cost × (1 + markup), set by SUPER_ADMIN only', async () => {
    expect(priceWithMarkup(5000, 2500)).toBe(6250)
    expect(priceWithMarkup(333, 1500)).toBe(383)
    expect(priceWithMarkup(0, 5000)).toBe(0)

    const put = { provider: 'mock', checkType: 'CREDIT', costCents: 5000, markupBps: 2500 }
    expect((await call('PUT', '/api/admin/screening/pricing', ACTORS.admin, put)).status).toBe(403)
    const ok = await call('PUT', '/api/admin/screening/pricing', ACTORS.superAdmin, put)
    expect(ok.json.price.priceCents).toBe(6250)

    await consent()
    await requestCheck('CREDIT')
    expect(mem.charges).toHaveLength(1)
    expect(mem.charges[0]).toMatchObject({ costCents: 5000, markupBps: 2500, priceCents: 6250, payer: 'AGENCY', billingMonth: '2026-10-01' })

    const usage = await call('GET', '/api/admin/screening/usage?month=2026-10', ACTORS.superAdmin)
    expect(usage.json.totals).toMatchObject({ count: 1, costCents: 5000, priceCents: 6250, uninvoicedPriceCents: 6250 })
    const agencyView = await call('GET', '/api/admin/screening/usage?month=2026-10', ACTORS.admin)
    expect(agencyView.json.totals.priceCents).toBe(6250)
    expect(agencyView.json.totals.costCents).toBeUndefined()
    expect((await call('GET', '/api/admin/screening/usage?month=2026-10', ACTORS.agent)).status).toBe(403)

    const bill = await call('POST', '/api/admin/screening/usage/bill', ACTORS.superAdmin, {
      agencyId: AG_A,
      month: '2026-10',
      invoiceId: 'inv-e2e-1',
    })
    expect(bill.json).toMatchObject({ count: 1, priceCents: 6250 })
    const after = await call('GET', '/api/admin/screening/usage?month=2026-10', ACTORS.superAdmin)
    expect(after.json.totals.uninvoicedPriceCents).toBe(0)
  })

  it('uses the agency payer setting', async () => {
    mem.apps.set('app-1', app1('9001015800080', { agencySettings: { screening: { payer: 'APPLICANT' } } }))
    await consent()
    await requestCheck('CREDIT')
    expect(mem.charges[0].payer).toBe('APPLICANT')
  })

  it('an ERROR result creates no charge', async () => {
    mem.apps.set('app-1', app1('9001015800089'))
    await consent()
    const r = await requestCheck('CREDIT')
    expect(r.json.ok).toBe(false)
    expect(r.json.error).toBe('ALL_PROVIDERS_FAILED')
    expect(mem.checks.map((c) => c.status)).toEqual(['ERROR'])
    expect(mem.charges).toHaveLength(0)
  })

  it('an ERROR retries the fallback provider and charges only the one that worked', async () => {
    const base = createProviderRegistry(env, () => clock)
    const brokenTpn: ScreeningProvider = {
      ...createStubProvider('tpn', ['CREDIT'], [], env),
      configured: true,
      async request() {
        throw Object.assign(new Error('upstream 500'), { code: 'UPSTREAM' })
      },
    }
    build(new Map([...base, ['tpn', brokenTpn]]))
    await consent()
    const r = await requestCheck('CREDIT')
    expect(r.json.check).toMatchObject({ provider: 'mock', status: 'PASSED', attempt: 2 })
    expect(mem.checks.map((c) => [c.provider, c.status])).toEqual([
      ['tpn', 'ERROR'],
      ['mock', 'PASSED'],
    ])
    expect(mem.checks[1].previousCheckId).toBe(mem.checks[0].id)
    expect(mem.charges).toHaveLength(1)
    expect(mem.charges[0].provider).toBe('mock')
  })
})

describe('providers', () => {
  it('stubs throw "not configured" without env keys and are skipped', async () => {
    const reg = createProviderRegistry({}, () => clock)
    for (const id of ['tpn', 'verifynow', 'verifyid', 'deis']) {
      const p = reg.get(id)!
      expect(p.configured).toBe(false)
      await expect(p.request({ checkType: p.supports[0], reference: 'x', subject: { name: 'E2E TEST', idNumber: null } })).rejects.toThrow(
        /not configured/,
      )
    }
    expect(orderedProviders(reg, parseScreeningSettings({}), 'CREDIT').map((p) => p.id)).toEqual(['mock'])
  })

  it('picks the agency provider first, then the fallback order', () => {
    const reg = createProviderRegistry({ SCREENING_TPN_API_KEY: 'test', SCREENING_TPN_API_URL: 'http://localhost' })
    const s = parseScreeningSettings({ screening: { providers: { CREDIT: ['mock'] } } })
    expect(orderedProviders(reg, s, 'CREDIT').map((p) => p.id)).toEqual(['mock', 'tpn'])
    expect(orderedProviders(reg, parseScreeningSettings({}), 'CREDIT').map((p) => p.id)).toEqual(['tpn', 'mock'])
  })

  it('mock is off in production unless allowed', () => {
    expect(createProviderRegistry({ NODE_ENV: 'production' }).get('mock')!.configured).toBe(false)
    expect(createProviderRegistry({ NODE_ENV: 'production', SCREENING_ALLOW_MOCK: '1' }).get('mock')!.configured).toBe(true)
  })
})

describe('webhook', () => {
  async function asyncCheck() {
    mem.apps.set('app-1', app1('9001015800083'))
    await consent()
    const r = await requestCheck('CREDIT')
    expect(r.json.check.status).toBe('IN_PROGRESS')
    return mem.checks[0]
  }

  async function post(raw: string, signature: string | null) {
    const res = await app.request('/api/screening/webhook/mock', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(signature ? { 'x-screening-signature': signature } : {}) },
      body: raw,
    })
    return { status: res.status, json: (await res.json()) as Record<string, any> }
  }

  it('rejects a bad signature with 401', async () => {
    const check = await asyncCheck()
    const raw = JSON.stringify({ providerRef: check.providerRef, status: 'PASSED', checkType: 'CREDIT' })
    expect((await post(raw, null)).status).toBe(401)
    expect((await post(raw, 'deadbeef')).status).toBe(401)
    expect((await post(raw, signWebhookBody(raw, 'wrong-secret'))).status).toBe(401)
    expect(mem.checks[0].status).toBe('IN_PROGRESS')
  })

  it('applies once; a replay does not update twice', async () => {
    const check = await asyncCheck()
    const raw = JSON.stringify({ providerRef: check.providerRef, status: 'PASSED', checkType: 'CREDIT' })
    const sig = `sha256=${signWebhookBody(raw, WEBHOOK_SECRET)}`
    const first = await post(raw, sig)
    expect(first.status).toBe(202)
    expect(mem.checks[0].status).toBe('PASSED')
    expect(mem.charges).toHaveLength(1)
    const completedAt = mem.checks[0].completedAt

    clock = new Date(START.getTime() + 60_000)
    const replay = await post(raw, sig)
    expect(replay.status).toBe(200)
    expect(replay.json.duplicate).toBe(true)
    expect(mem.checks[0].completedAt).toEqual(completedAt)
    expect(mem.charges).toHaveLength(1)
    expect(mem.audit.filter((a) => a.action === 'WEBHOOK')).toHaveLength(1)
  })

  it('returns 404 for an unknown provider and keeps the legacy path separate', async () => {
    const res = await app.request('/api/screening/webhook/nope', { method: 'POST', body: '{}' })
    expect(res.status).toBe(404)
  })
})

describe('purge cron', () => {
  it('needs the cron secret', async () => {
    expect((await call('GET', '/api/cron/screening-purge', null)).status).toBe(401)
    env.CRON_SECRET = undefined
    expect((await call('GET', '/api/cron/screening-purge', null)).status).toBe(503)
  })

  it('clears the full result after retain_until and keeps summary and audit', async () => {
    await consent()
    await requestCheck('CREDIT')
    const id = mem.checks[0].id
    const auditBefore = mem.audit.length

    clock = new Date('2027-10-21T00:00:00.000Z')
    const run = await call('GET', '/api/cron/screening-purge', { authorization: `Bearer ${CRON}` })
    expect(run.status).toBe(200)
    expect(run.json).toMatchObject({ purged: 1 })

    const row = mem.checks[0]
    expect(row.resultEncrypted).toBeNull()
    expect(row.resultKeyId).toBeNull()
    expect(row.purgedAt).toEqual(clock)
    expect(row.resultSummary).toMatchObject({ outcome: 'PASS' })
    expect(mem.audit).toHaveLength(auditBefore + 1)
    expect(mem.audit.at(-1)).toMatchObject({ action: 'PURGED', checkId: id })

    const full = await call('GET', `/api/screening/checks/${id}/full`, ACTORS.admin)
    expect(full.status).toBe(410)
    const summary = await call('GET', `/api/screening/checks/${id}`, ACTORS.admin)
    expect(summary.json.check).toMatchObject({ purged: true, summary: { outcome: 'PASS' } })
  })

  it('keeps ID checks for 5 years after the tenancy ends', async () => {
    await consent()
    await requestCheck('ID_VERIFY')
    expect(mem.checks[0].retainUntil?.toISOString()).toBe('2031-10-20T08:00:00.000Z')

    mem.leases.push({ applicationId: 'app-1', endDate: null, ended: false })
    clock = new Date('2031-10-21T00:00:00.000Z')
    const run = await call('GET', '/api/cron/screening-purge', { authorization: `Bearer ${CRON}` })
    expect(run.json).toMatchObject({ purged: 0, extended: 1 })
    expect(mem.checks[0].resultEncrypted).not.toBeNull()

    mem.leases[0] = { applicationId: 'app-1', endDate: new Date('2030-01-31T00:00:00.000Z'), ended: true }
    clock = new Date('2036-10-21T00:00:00.000Z')
    const later = await call('GET', '/api/cron/screening-purge', { authorization: `Bearer ${CRON}` })
    expect(later.json).toMatchObject({ purged: 1 })
  })
})

describe('agency settings', () => {
  it('admins save enabled checks, providers and payer; agents and other agencies cannot', async () => {
    const body = { settings: { enabledChecks: ['CREDIT'], providers: { CREDIT: ['mock'] }, payer: 'APPLICANT', creditRetentionMonths: 6 } }
    expect((await call('PUT', '/api/screening/settings', ACTORS.agent, body)).status).toBe(403)
    expect((await call('PUT', '/api/screening/settings', ACTORS.admin, { settings: { providers: { CREDIT: ['deis'] } } })).status).toBe(400)
    const saved = await call('PUT', '/api/screening/settings', ACTORS.admin, body)
    expect(saved.json.settings).toEqual({ enabledChecks: ['CREDIT'], providers: { CREDIT: ['mock'] }, payer: 'APPLICANT', creditRetentionMonths: 6 })
    expect((await call('GET', `/api/screening/settings?agencyId=${AG_A}`, ACTORS.adminB)).status).toBe(403)
    const read = await call('GET', '/api/screening/settings', ACTORS.agent)
    expect(read.json.settings.payer).toBe('APPLICANT')

    expect((await consent(['ID_VERIFY'])).json.code).toBe('CHECK_TYPE_DISABLED')
    await consent(['CREDIT'])
    await requestCheck('CREDIT')
    expect(mem.checks[0].retainUntil?.toISOString()).toBe('2027-04-20T08:00:00.000Z')
    expect(mem.charges[0].payer).toBe('APPLICANT')
  })
})

describe('masking', () => {
  it('shows only the last 4 digits', () => {
    expect(maskIdNumber('9001015800080')).toBe('•••••••••0080')
    expect(maskIdNumber('')).toBe('')
  })
})
