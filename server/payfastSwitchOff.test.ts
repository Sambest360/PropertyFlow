/**
 * Ruling 30 / Jim sign-off C1–C9: PayFast server switch-off gate.
 * Red-first on main e0b5080. Real Hono app; Postgres and outbound stubbed.
 * All PAYFAST_* values here are obvious fakes.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const FAKE = vi.hoisted(() => ({
  merchantId: 'test-not-a-merchant',
  merchantKey: 'test-not-a-key',
  passphrase: 'test-not-a-passphrase',
}))

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.PAYFAST_MERCHANT_ID = FAKE.merchantId
  process.env.PAYFAST_MERCHANT_KEY = FAKE.merchantKey
  process.env.PAYFAST_PASSPHRASE = FAKE.passphrase
  process.env.PAYFAST_MODE = 'live'
  process.env.AUTH_SECRET = 'test-secret-payfast-switchoff'
  process.env.DATABASE_URL = 'postgres://pf:pf@127.0.0.1:5432/pf_test'
  delete process.env.ALLOW_DEMO_ACTOR
})

const query = vi.hoisted(() =>
  vi.fn(async (_sql: string, _params: unknown[] = []): Promise<unknown[]> => []),
)
const txQuery = vi.hoisted(() => vi.fn(async () => ({ rowCount: 0, rows: [] })))
const eventLogWrites = vi.hoisted(() => ({ rows: [] as Array<{ sql: string; params: unknown[] }> }))

vi.mock('./db.js', async (orig) => ({
  ...(await orig<typeof import('./db.js')>()),
  databaseConfigured: true,
  query: (sql: string, params?: unknown[]) => {
    if (/^\s*INSERT INTO event_log/.test(sql)) eventLogWrites.rows.push({ sql, params: params ?? [] })
    return query(sql, params)
  },
  withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({ query: txQuery }),
  pool: { query: vi.fn(async () => ({ rows: [] })), end: vi.fn(async () => undefined) },
}))

vi.mock('./mailtrap.js', async (orig) => ({
  ...(await orig<typeof import('./mailtrap.js')>()),
  sendPaymentReceipt: vi.fn(async () => undefined),
}))

const sessionResolve = vi.hoisted(() => ({
  calls: 0,
  reset() {
    this.calls = 0
  },
}))

vi.mock('./auth.js', async (orig) => {
  const real = await orig<typeof import('./auth.js')>()
  return {
    ...real,
    resolveSessionUser: ((c: Parameters<typeof real.resolveSessionUser>[0]) => {
      sessionResolve.calls += 1
      return real.resolveSessionUser(c)
    }) as typeof real.resolveSessionUser,
  }
})

type App = { request: (path: string, init?: RequestInit, env?: unknown) => Response | Promise<Response> }
let app: App

beforeAll(async () => {
  app = (await import('./index.js')).default as unknown as App
}, 60_000)

let warns: ReturnType<typeof vi.spyOn>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  query.mockClear()
  txQuery.mockClear()
  eventLogWrites.rows = []
  sessionResolve.reset()
  fetchMock = vi.fn(async () => new Response('VALID', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  warns = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const gate = (await import('./onlinePayments.js')) as {
      resetPayfastDisabledLogForTests?: () => void
    }
    gate.resetPayfastDisabledLogForTests?.()
  } catch {
    // Module lands in commit 2; red commit must still load the suite.
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

afterAll(() => {
  for (const k of ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE', 'PAYFAST_MODE']) {
    delete process.env[k]
  }
})

const DISABLED = {
  ok: false,
  error: 'online_payments_disabled',
  message:
    'Online payments are switched off. Pay your agency or landlord directly and they will record it.',
} as const

async function postCreate(init: RequestInit = {}) {
  const res = await app.request('/api/payfast/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) },
    body: JSON.stringify({ paymentId: 'PAY-1' }),
    ...init,
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json, headers: res.headers, text }
}

async function postItn(fields: Record<string, string>, headers: Record<string, string> = {}) {
  const body = new URLSearchParams(fields).toString()
  const res = await app.request('/api/payfast/itn', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': String(Buffer.byteLength(body)),
      ...headers,
    },
    body,
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: res.status, json, text }
}

function assertDisabledBody(json: unknown) {
  expect(json).toMatchObject({ ok: false, error: 'online_payments_disabled' })
  expect((json as { message?: string }).message).toBe(DISABLED.message)
}

describe('T-S1 create with session-looking headers → 410, 0 DB, no Set-Cookie', () => {
  it('POST /api/payfast/create returns 410 before any DB or cookie', async () => {
    const r = await postCreate({
      headers: {
        authorization: 'Bearer fake-staff-token',
        cookie: 'pf_session=fake-staff-cookie',
        'content-type': 'application/json',
      },
    })
    expect(r.status).toBe(410)
    assertDisabledBody(r.json)
    expect(query).not.toHaveBeenCalled()
    expect(txQuery).not.toHaveBeenCalled()
    expect(r.headers.get('set-cookie')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})


describe('T-S1b gate before session: resolveSessionUser never runs for /api/payfast/* (C1)', () => {
  it('create with Authorization + cookie does not call resolveSessionUser', async () => {
    const r = await postCreate({
      headers: {
        authorization: 'Bearer fake-staff-token',
        cookie: 'pf_session=fake-staff-cookie',
        'content-type': 'application/json',
      },
    })
    expect(r.status).toBe(410)
    assertDisabledBody(r.json)
    expect(sessionResolve.calls).toBe(0)
  })

  it('ITN with Authorization + cookie does not call resolveSessionUser', async () => {
    const r = await postItn(
      {
        m_payment_id: 'PAY-1',
        pf_payment_id: '900001',
        payment_status: 'COMPLETE',
        signature: 'deadbeef',
      },
      {
        authorization: 'Bearer fake-staff-token',
        cookie: 'pf_session=fake-staff-cookie',
      },
    )
    expect(r.status).toBe(410)
    assertDisabledBody(r.json)
    expect(sessionResolve.calls).toBe(0)
  })

  it('index.ts source order: payfast gate mounts before /api/* session middleware', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const index = readFileSync(join(here, 'index.ts'), 'utf8')
    const gateBare = index.indexOf("app.use('/api/payfast', onlinePaymentsDisabledGate)")
    const gateWild = index.indexOf("app.use('/api/payfast/*', onlinePaymentsDisabledGate)")
    const session = index.indexOf("app.use('/api/*', async (c, next) => {")
    expect(gateBare).toBeGreaterThan(-1)
    expect(gateWild).toBeGreaterThan(-1)
    expect(session).toBeGreaterThan(-1)
    expect(gateBare).toBeLessThan(session)
    expect(gateWild).toBeLessThan(session)
  })
})

describe('T-S2 create with no auth → 410 (not 401)', () => {
  it('unauthenticated create is 410 online_payments_disabled', async () => {
    const r = await postCreate()
    expect(r.status).toBe(410)
    assertDisabledBody(r.json)
    expect(r.status).not.toBe(401)
    expect(query).not.toHaveBeenCalled()
  })
})

describe('T-S3 ITN → 410, no writes, no outbound, no payfast_itn_rejected', () => {
  it('valid-looking ITN body is refused with 410 and leaves DB untouched', async () => {
    const r = await postItn({
      m_payment_id: 'PAY-1',
      pf_payment_id: '900001',
      payment_status: 'COMPLETE',
      amount_gross: '1850.00',
      amount_fee: '-42.00',
      amount_net: '1808.00',
      merchant_id: FAKE.merchantId,
      signature: 'deadbeefsignature',
      email_address: 'payer@example.test',
      name_first: 'Pat',
    })
    expect(r.status).toBe(410)
    assertDisabledBody(r.json)
    expect(query).not.toHaveBeenCalled()
    expect(txQuery).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(eventLogWrites.rows.filter((w) => w.params.includes('payfast_itn_rejected'))).toHaveLength(0)
  })
})

describe('T-S4 unknown / bare / trailing-slash paths → 410 (C1)', () => {
  it.each([
    ['GET', '/api/payfast/x'],
    ['HEAD', '/api/payfast/x'],
    ['POST', '/api/payfast/x'],
    ['GET', '/api/payfast'],
    ['POST', '/api/payfast'],
    ['GET', '/api/payfast/'],
    ['POST', '/api/payfast/'],
    ['POST', '/api/payfast/create/'],
    ['POST', '/api/payfast/anything/else'],
  ] as const)('%s %s → 410', async (method, path) => {
    const res = await app.request(path, {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: method === 'POST' ? '{}' : undefined,
    })
    expect(res.status).toBe(410)
    if (method !== 'HEAD') {
      const json = await res.json()
      expect(json).toMatchObject({ ok: false, error: 'online_payments_disabled' })
    }
    expect(query).not.toHaveBeenCalled()
  })
})

describe('T-S5 PAYFAST_* stubbed still 410; constant pinned false (C5)', () => {
  it('create and ITN still 410 with obvious fake merchant env', async () => {
    expect(process.env.PAYFAST_MERCHANT_ID).toBe('test-not-a-merchant')
    let enabled: unknown = 'missing-module'
    try {
      enabled = (await import('./onlinePayments.js')).ONLINE_PAYMENTS_ENABLED
    } catch {
      enabled = 'missing-module'
    }
    expect(enabled).toBe(false)
    expect(await postCreate()).toMatchObject({ status: 410 })
    expect(
      await postItn({
        m_payment_id: 'PAY-1',
        pf_payment_id: '1',
        payment_status: 'COMPLETE',
        signature: 'x',
      }),
    ).toMatchObject({ status: 410 })
  })

  it('rg-shaped source pin: one ONLINE_PAYMENTS_ENABLED definition, no env read', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(join(here, 'onlinePayments.ts'), 'utf8')
    expect(src).toMatch(/export const ONLINE_PAYMENTS_ENABLED = false as const/)
    expect(src).not.toMatch(/process\.env/)
    const index = readFileSync(join(here, 'index.ts'), 'utf8')
    const defs = [...src.matchAll(/ONLINE_PAYMENTS_ENABLED/g)].length
    expect(defs).toBeGreaterThanOrEqual(1)
    // boot gate only when constant true (C4)
    expect(index).toMatch(/ONLINE_PAYMENTS_ENABLED[\s\S]{0,80}payfastProductionModeError|if\s*\(\s*ONLINE_PAYMENTS_ENABLED\s*\)[\s\S]{0,200}payfastProductionModeError/)
  })
})

describe('T-S6 ITN log: no signature/amount, ids clipped to 40, 31st silent (C2)', () => {
  it('log has no signature or amount_gross; long ids clipped; 31st hit has no detailed line', async () => {
    const longId = `PAY-${'A'.repeat(80)}_bad!chars`
    const longPf = `PF-${'B'.repeat(80)}@evil`
    for (let i = 0; i < 31; i++) {
      await postItn({
        m_payment_id: i === 0 ? longId : `PAY-${i}`,
        pf_payment_id: i === 0 ? longPf : `PF-${i}`,
        payment_status: 'COMPLETE',
        amount_gross: '1850.00',
        signature: 'SECRET_SIGNATURE_VALUE',
        email_address: 'secret@example.test',
      })
    }
    const lines = warns.mock.calls.map((c) => c.map(String).join(' '))
    const detailed = lines.filter((l) => l.includes('payfast_itn_disabled'))
    expect(detailed.length).toBeGreaterThan(0)
    expect(detailed.length).toBeLessThanOrEqual(30)
    for (const line of detailed) {
      expect(line).not.toMatch(/SECRET_SIGNATURE_VALUE/)
      expect(line).not.toMatch(/signature/i)
      expect(line).not.toMatch(/1850\.00/)
      expect(line).not.toMatch(/amount_gross/)
      expect(line).not.toMatch(/secret@example\.test/)
      expect(line).not.toMatch(/JSON\.stringify/)
    }
    // first hit's ids: only [A-Za-z0-9_-], max 40
    const first = detailed[0] ?? ''
    expect(first).toMatch(/payfast_itn_disabled/)
    const payMatch = first.match(/PAY-[A-Za-z0-9_-]*/)
    if (payMatch) expect(payMatch[0].length).toBeLessThanOrEqual(40)
    expect(first).not.toMatch(/bad!chars/)
    expect(first).not.toMatch(/@evil/)
    // 31st detailed line absent (cap)
    expect(detailed.length).toBe(30)
  })
})
