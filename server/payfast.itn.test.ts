import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const db = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pingDatabase: vi.fn(),
}))

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  databaseConfigError: undefined,
  databaseConfigWarning: undefined,
  pool: null,
  query: db.query,
  withTransaction: db.withTransaction,
  clientQuery: db.clientQuery,
  pingDatabase: db.pingDatabase,
}))

import { payfastItn } from './payfastRoutes.js'
import { payfastSignature } from './payfast.js'

const MERCHANT_ID = '10000100'
const MERCHANT_KEY = '46f0cd694581a'
const PASSPHRASE = 'jt7NOE43FZPn'
const PAYFAST_IP = '197.97.145.140'
const PAYMENT_ID = 'a1000001-0001-4000-8000-000000000099'

function itnBody(overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    merchant_id: MERCHANT_ID,
    merchant_key: MERCHANT_KEY,
    m_payment_id: PAYMENT_ID,
    payment_status: 'COMPLETE',
    amount_gross: '10.00',
    pf_payment_id: '1089250',
    item_name: 'Order#123',
    ...overrides,
  }
  fields.signature = payfastSignature(fields, PASSPHRASE)
  return fields
}

let paymentStatus = 'DUE'
let credits = 0

function installDb() {
  paymentStatus = 'DUE'
  credits = 0
  db.query.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM payments')) {
      return [
        {
          id: PAYMENT_ID,
          amount: '10.00',
          status: paymentStatus,
          payment_type: 'RENT',
          party_name: 'Test Payer',
          party_user_id: null,
          client_id: 'a1000001-0001-4000-8000-000000000001',
          unit_id: null,
        },
      ]
    }
    return []
  })
  db.withTransaction.mockImplementation(async (fn: (client: { query: typeof db.query }) => Promise<void>) => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('UPDATE payments')) {
          expect(sql).toContain('COALESCE(paid_amount, amount)')
          expect(sql).not.toMatch(/paid_amount\s*\+/)
          if (paymentStatus !== 'DUE' && paymentStatus !== 'OVERDUE') return { rowCount: 0 }
          paymentStatus = 'PAID'
          credits += 1
          return { rowCount: 1 }
        }
        return { rowCount: 1, rows: [] }
      },
    }
    await fn(client)
  })
}

function app() {
  const hono = new Hono()
  hono.post('/api/payfast/itn', (c) => payfastItn(c))
  return hono
}

async function postItn(
  body: Record<string, string>,
  headers: Record<string, string> = { 'x-real-ip': PAYFAST_IP },
) {
  return app().request('/api/payfast/itn', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const CALLER_FORWARDING = {
  'x-forwarded-for': PAYFAST_IP,
  forwarded: `for=${PAYFAST_IP}`,
  'x-client-ip': PAYFAST_IP,
  'true-client-ip': PAYFAST_IP,
  'cf-connecting-ip': PAYFAST_IP,
  'x-original-forwarded-for': PAYFAST_IP,
}

beforeEach(() => {
  process.env.PAYFAST_MERCHANT_ID = MERCHANT_ID
  process.env.PAYFAST_MERCHANT_KEY = MERCHANT_KEY
  process.env.PAYFAST_PASSPHRASE = PASSPHRASE
  process.env.PAYFAST_MODE = 'sandbox'
  delete process.env.PAYFAST_CLIENT_IP_HEADER
  delete process.env.PAYFAST_TRUSTED_PROXY_HOPS
  delete process.env.PAYFAST_VALIDATE_URL
  delete process.env.PAYFAST_VALIDATE_STUB
  delete process.env.PAYFAST_ITN_LOCAL
  delete process.env.PAYFAST_ITN_PLATFORM_SECRET
  delete process.env.PAYFAST_ITN_PLATFORM_IP
  delete process.env.PAYFAST_ITN_PLATFORM_IP_HEADER
  delete process.env.PAYFAST_ITN_PLATFORM_SECRET_HEADER
  installDb()
})

describe('PayFast ITN route', () => {
  it('rejects a spoofed X-Forwarded-For and does not mark the payment paid', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const res = await postItn(itnBody(), {
      'x-forwarded-for': PAYFAST_IP,
      'x-real-ip': '203.0.113.50',
    })
    expect(res.status).toBe(400)
    expect(credits).toBe(0)
    expect(paymentStatus).toBe('DUE')
    expect(fetchImpl).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('rejects spoofed forwarding headers when the platform address is not a PayFast IP', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const res = await postItn(itnBody(), {
      ...CALLER_FORWARDING,
      'x-real-ip': '203.0.113.50',
    })
    expect(res.status).toBe(400)
    expect(await res.text()).toMatch(/rejected/i)
    expect(credits).toBe(0)
    expect(paymentStatus).toBe('DUE')
    expect(fetchImpl).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('rejects caller forwarding headers when no platform address is set', async () => {
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)
    const res = await postItn(itnBody(), CALLER_FORWARDING)
    expect(res.status).toBe(400)
    expect(credits).toBe(0)
    expect(fetchImpl).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('local harness uses only the secret-gated platform address and the validate stub', async () => {
    process.env.PAYFAST_ITN_LOCAL = '1'
    process.env.PAYFAST_ITN_PLATFORM_SECRET = 'qa-secret'
    process.env.PAYFAST_VALIDATE_STUB = '1'
    const fetchImpl = vi.fn()
    vi.stubGlobal('fetch', fetchImpl)

    const spoofed = await postItn(itnBody(), {
      ...CALLER_FORWARDING,
      'x-real-ip': PAYFAST_IP,
      'x-pf-platform-ip': '203.0.113.50',
      'x-pf-platform-secret': 'qa-secret',
      'x-pf-validate-stub': 'VALID',
    })
    expect(spoofed.status).toBe(400)
    expect(credits).toBe(0)
    expect(paymentStatus).toBe('DUE')

    const unsigned = await postItn(itnBody(), {
      ...CALLER_FORWARDING,
      'x-real-ip': PAYFAST_IP,
      'x-pf-platform-ip': PAYFAST_IP,
      'x-pf-validate-stub': 'VALID',
    })
    expect(unsigned.status).toBe(400)
    expect(credits).toBe(0)

    const invalid = await postItn(itnBody(), {
      ...CALLER_FORWARDING,
      'x-pf-platform-ip': PAYFAST_IP,
      'x-pf-platform-secret': 'qa-secret',
      'x-pf-validate-stub': 'INVALID',
    })
    expect(invalid.status).toBe(400)
    expect(credits).toBe(0)
    expect(paymentStatus).toBe('DUE')

    const paid = await postItn(itnBody(), {
      ...CALLER_FORWARDING,
      'x-real-ip': '203.0.113.50',
      'x-pf-platform-ip': PAYFAST_IP,
      'x-pf-platform-secret': 'qa-secret',
      'x-pf-validate-stub': 'VALID',
    })
    expect(paid.status).toBe(200)
    expect(credits).toBe(1)
    expect(paymentStatus).toBe('PAID')

    const duplicate = await postItn(itnBody(), {
      ...CALLER_FORWARDING,
      'x-pf-platform-ip': PAYFAST_IP,
      'x-pf-platform-secret': 'qa-secret',
      'x-pf-validate-stub': 'VALID',
    })
    expect(duplicate.status).toBe(200)
    expect(credits).toBe(1)
    expect(fetchImpl).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('rejects a bad sandbox signature', async () => {
    const body = itnBody()
    body.signature = 'deadbeefdeadbeefdeadbeefdeadbeef'
    const res = await postItn(body)
    expect(res.status).toBe(400)
    expect(credits).toBe(0)
  })

  it('rejects a wrong merchant id', async () => {
    const res = await postItn(itnBody({ merchant_id: '10009999' }))
    expect(res.status).toBe(400)
    expect(credits).toBe(0)
  })

  it('rejects a wrong amount', async () => {
    const res = await postItn(itnBody({ amount_gross: '9999.00' }))
    expect(res.status).toBe(400)
    expect(credits).toBe(0)
  })

  it('does not mark paid when the validate postback is INVALID or fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(String(url)).toBe('https://sandbox.payfast.co.za/eng/query/validate')
        return new Response('INVALID', { status: 200 })
      }),
    )
    const invalid = await postItn(itnBody())
    expect(invalid.status).toBe(400)
    expect(credits).toBe(0)
    expect(paymentStatus).toBe('DUE')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('validate unreachable')
      }),
    )
    const failed = await postItn(itnBody())
    expect(failed.status).toBe(400)
    expect(credits).toBe(0)
    vi.unstubAllGlobals()
  })

  it('marks a valid ITN paid once and ignores a duplicate', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toBe('https://sandbox.payfast.co.za/eng/query/validate')
      expect(String(url)).not.toMatch(/\/eng\/process/)
      return new Response('VALID', { status: 200 })
    })
    vi.stubGlobal('fetch', fetchImpl)
    const first = await postItn(itnBody())
    expect(first.status).toBe(200)
    expect(await first.text()).toMatch(/accepted/i)
    expect(credits).toBe(1)
    expect(paymentStatus).toBe('PAID')

    const second = await postItn(itnBody())
    expect(second.status).toBe(200)
    expect(credits).toBe(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })
})
