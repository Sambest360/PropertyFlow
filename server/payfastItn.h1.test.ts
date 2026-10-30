import { Hono } from 'hono'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * H1 PayFast ITN (spec r5 :45-58, :79-82; Jim C4, Q4, Q5).
 * The route tests drive the real Hono app (server/index.ts) with only
 * Postgres and mail stubbed. The connection peer is the node-server binding
 * a real request carries. All merchant values here are obviously fake.
 */
const FAKE = vi.hoisted(() => ({
  merchantId: 'FAKE-MERCHANT-0001',
  merchantKey: 'fake-merchant-key',
  passphrase: ['fake', 'test', 'passphrase'].join('-'),
}))

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.PAYFAST_MERCHANT_ID = FAKE.merchantId
  process.env.PAYFAST_MERCHANT_KEY = FAKE.merchantKey
  process.env.PAYFAST_PASSPHRASE = FAKE.passphrase
  process.env.PAYFAST_MODE = 'live'
})

const PAYMENT_UUID = '11111111-1111-4111-8111-111111111111'
const CLIENT_UUID = '33333333-3333-4333-8333-333333333333'

const db = vi.hoisted(() => ({ writes: [] as Array<{ sql: string; params: unknown[] }> }))
const query = vi.hoisted(() =>
  vi.fn(async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    if (/^\s*INSERT INTO event_log/.test(sql)) db.writes.push({ sql, params })
    if (sql.includes('FROM payments')) {
      return [
        {
          id: '11111111-1111-4111-8111-111111111111',
          amount: '1850.00',
          status: 'DUE',
          payment_type: 'Rent',
          party_name: 'Test Payer',
          party_user_id: null,
          client_id: '33333333-3333-4333-8333-333333333333',
          unit_id: null,
        },
      ]
    }
    return []
  }),
)
const txQuery = vi.hoisted(() => vi.fn(async () => ({ rowCount: 0, rows: [] })))

vi.mock('./db.js', async (orig) => ({
  ...(await orig<typeof import('./db.js')>()),
  databaseConfigured: true,
  query: (sql: string, params?: unknown[]) => query(sql, params),
  withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn({ query: txQuery }),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))
vi.mock('./entityMap.js', async (orig) => ({
  ...(await orig<typeof import('./entityMap.js')>()),
  resolveUuid: vi.fn(async (type: string, id: string) => (type === 'payment' && id === 'PAY-1' ? PAYMENT_UUID : null)),
}))
vi.mock('./mailtrap.js', async (orig) => ({
  ...(await orig<typeof import('./mailtrap.js')>()),
  sendPaymentReceipt: vi.fn(async () => undefined),
}))

type App = { request: (path: string, init?: RequestInit, env?: unknown) => Response | Promise<Response> }
let app: App
beforeAll(async () => {
  app = (await import('./index.js')).default as unknown as App
}, 60_000)

let errors: ReturnType<typeof vi.spyOn>
beforeEach(async () => {
  db.writes = []
  query.mockClear()
  txQuery.mockClear()
  process.env.PAYFAST_MODE = 'live'
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // Optional call so the tests-first run at base fails on behaviour, not on the missing hook.
  const routes = (await import('./payfastRoutes.js')) as { resetItnRejectLogForTests?: () => void }
  routes.resetItnRejectLogForTests?.()
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => {
  for (const k of ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE', 'PAYFAST_MODE']) delete process.env[k]
})

async function signedItn(over: Record<string, string> = {}): Promise<Record<string, string>> {
  const { payfastSignature } = await import('./payfast.js')
  const fields: Record<string, string> = {
    m_payment_id: 'PAY-1',
    pf_payment_id: '900001',
    payment_status: 'COMPLETE',
    item_name: 'Rent',
    amount_gross: '1850.00',
    amount_fee: '-42.00',
    amount_net: '1808.00',
    merchant_id: FAKE.merchantId,
    ...over,
  }
  return { ...fields, signature: payfastSignature(fields, FAKE.passphrase) }
}

const peer = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress, remotePort: 443, remoteFamily: 'IPv4' } } })
const LOOPBACK = peer('127.0.0.1')

async function postItn(fields: Record<string, string>, opts: { env?: unknown; headers?: Record<string, string> } = {}) {
  const res = await app.request(
    '/api/payfast/itn',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...(opts.headers ?? {}) },
      body: new URLSearchParams(fields).toString(),
    },
    opts.env,
  )
  return { status: res.status, text: await res.text() }
}

const errorText = () => errors.mock.calls.map((c) => c.map(String).join(' ')).join('\n')

describe('H1 PayFast ITN source check (live)', () => {
  it('live mode with no forwarding header and no usable peer IP is rejected (no null bypass)', async () => {
    const r = await postItn(await signedItn())
    expect(r.status).toBe(400)
    expect(txQuery).not.toHaveBeenCalled()
    expect(errorText()).toMatch(/payfast_itn_rejected/)
  })

  it('a documented PayFast IP via nginx (loopback peer + X-Real-IP) is accepted', async () => {
    const r = await postItn(await signedItn(), { env: LOOPBACK, headers: { 'x-real-ip': '197.97.145.150' } })
    expect(r.status).toBe(200)
  })

  it('each documented range is accepted at its edges (docs re-read 30 Oct 2026)', async () => {
    for (const ip of ['197.97.145.144', '197.97.145.159', '41.74.179.192', '41.74.179.223', '102.216.36.0', '102.216.36.15', '102.216.36.128', '102.216.36.143', '144.126.193.139']) {
      expect((await postItn(await signedItn(), { env: peer(ip) })).status, ip).toBe(200)
    }
  })

  it('just outside each range, and the old hard-coded IPs, are rejected', async () => {
    for (const ip of ['197.97.145.143', '197.97.145.160', '41.74.179.224', '102.216.36.16', '102.216.36.144', '144.126.193.140', '197.97.145.140', '41.72.144.4']) {
      expect((await postItn(await signedItn(), { env: peer(ip) })).status, ip).toBe(400)
    }
  })

  it('a spoofed XFF naming a PayFast IP from a non-PayFast client is rejected, with the loud log and an event_log alert', async () => {
    const r = await postItn(await signedItn(), {
      env: LOOPBACK,
      headers: { 'x-real-ip': '203.0.113.66', 'x-forwarded-for': '197.97.145.150, 203.0.113.66' },
    })
    expect(r.status).toBe(400)
    const log = errorText()
    expect(log).toMatch(/payfast_itn_rejected/)
    expect(log).toMatch(/PAY-1/)
    expect(log).toMatch(/900001/)
    expect(log).toMatch(/203\.0\.113\.66/)
    expect(log).toMatch(/1850\.00/)
    expect(log).not.toContain(FAKE.passphrase)
    expect(db.writes).toHaveLength(1)
    const [w] = db.writes
    expect(w?.params).toEqual(expect.arrayContaining([CLIENT_UUID, 'payfast_itn_rejected', 'payment', PAYMENT_UUID]))
    const payload = JSON.parse(String(w?.params.find((p) => typeof p === 'string' && p.startsWith('{'))))
    expect(payload).toMatchObject({ m_payment_id: 'PAY-1', pf_payment_id: '900001', source_ip: '203.0.113.66', amount_gross: '1850.00' })
    expect(String(payload.reason)).toMatch(/source/i)
    expect(JSON.stringify(payload)).not.toMatch(/signature|passphrase/i)
  })

  it('the event_log alert is deduped per (m_payment_id, reason) for 15 min', async () => {
    for (let i = 0; i < 5; i++) await postItn(await signedItn(), { env: peer('203.0.113.67') })
    expect(db.writes).toHaveLength(1)
  })

  it('an unmatched rejection writes no event_log row, and its console.error is capped (~30/min) with a summary', async () => {
    for (let i = 0; i < 60; i++) await postItn(await signedItn({ m_payment_id: `UNKNOWN-${i}` }), { env: peer('203.0.113.68') })
    expect(db.writes).toHaveLength(0)
    const rejectLines = errors.mock.calls.filter((c) => String(c[0]).includes('payfast_itn_rejected'))
    expect(rejectLines.length).toBeGreaterThan(0)
    expect(rejectLines.length).toBeLessThanOrEqual(31)
  })

  it('logged strings are truncated to 200 chars with newlines stripped', async () => {
    await postItn(await signedItn({ pf_payment_id: `x\ny${'z'.repeat(400)}` }), { env: peer('203.0.113.69') })
    const payload = JSON.parse(String(db.writes[0]?.params.find((p) => typeof p === 'string' && p.startsWith('{'))))
    expect(payload.pf_payment_id).not.toMatch(/\n/)
    expect(payload.pf_payment_id.length).toBeLessThanOrEqual(200)
  })
})

describe('H1 PayFast merchant_id', () => {
  it('a correctly signed ITN with a different merchant_id gives 400 and a rejected-ITN log', async () => {
    const r = await postItn(await signedItn({ merchant_id: 'FAKE-MERCHANT-9999' }), { env: peer('197.97.145.150') })
    expect(r.status).toBe(400)
    expect(errorText()).toMatch(/payfast_itn_rejected[\s\S]*merchant/i)
    expect(db.writes).toHaveLength(1)
    expect(txQuery).not.toHaveBeenCalled()
  })

  it('a correctly signed ITN with no merchant_id is rejected too', async () => {
    const fields = await signedItn()
    const { payfastSignature } = await import('./payfast.js')
    const { merchant_id: _m, signature: _s, ...rest } = fields
    const r = await postItn({ ...rest, signature: payfastSignature(rest, FAKE.passphrase) }, { env: peer('197.97.145.150') })
    expect(r.status).toBe(400)
  })
})

describe('H1 PayFast ITN has no per-IP cap', () => {
  it('100 valid ITNs from one documented PayFast IP within a minute are all processed (no 429)', async () => {
    const statuses = new Set<number>()
    for (let i = 0; i < 100; i++) {
      statuses.add((await postItn(await signedItn(), { env: LOOPBACK, headers: { 'x-real-ip': '41.74.179.200' } })).status)
    }
    expect([...statuses]).toEqual([200])
  })
})

describe('H1 PayFast DNS: sandbox only, cached, fail closed (test-only resolver parameter)', () => {
  async function harness(lookup: () => Promise<string[]>) {
    const { payfastItn, createSandboxSourceCache } = await import('./payfastRoutes.js')
    const sandboxSources = createSandboxSourceCache(lookup, 5 * 60_000)
    const h = new Hono()
    h.post('/itn', (c) => payfastItn(c, { sandboxSources }))
    return async (ip: string) => {
      const res = await h.request(
        '/itn',
        { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(await signedItn()).toString() },
        peer(ip) as never,
      )
      return res.status
    }
  }

  it('production (live) mode makes no DNS lookup, and a sandbox-resolved IP is rejected', async () => {
    const lookup = vi.fn(async () => ['198.18.0.10'])
    const post = await harness(lookup)
    expect(await post('198.18.0.10')).toBe(400)
    expect(await post('197.97.145.150')).toBe(200)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('sandbox mode: a resolved sandbox address is accepted; a second ITN within the TTL reuses the cache', async () => {
    process.env.PAYFAST_MODE = 'sandbox'
    const lookup = vi.fn(async () => ['198.18.0.10'])
    const post = await harness(lookup)
    expect(await post('198.18.0.10')).toBe(200)
    expect(await post('198.18.0.10')).toBe(200)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(await post('203.0.113.70')).toBe(400)
  })

  it('sandbox mode: a resolver failure rejects the ITN (fails closed, never falls back to allow)', async () => {
    process.env.PAYFAST_MODE = 'sandbox'
    const lookup = vi.fn(async () => {
      throw new Error('ENOTFOUND sandbox.payfast.co.za')
    })
    const post = await harness(lookup)
    expect(await post('198.18.0.10')).toBe(400)
    expect(await post('197.97.145.150')).toBe(400)
    expect(errorText()).toMatch(/payfast_itn_rejected/)
  })
})
