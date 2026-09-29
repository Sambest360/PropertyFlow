import { randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const db = vi.hoisted(() => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pingDatabase: vi.fn(),
}))

const mail = vi.hoisted(() => ({
  sendPaymentReceipt: vi.fn(async () => ({ ok: true })),
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

vi.mock('./mailtrap.js', () => ({
  sendPaymentReceipt: mail.sendPaymentReceipt,
}))

import { payfastItn } from './payfastRoutes.js'
import { payfastSignature } from './payfast.js'

const MERCHANT_ID = 'fake-merchant-id'
const MERCHANT_KEY = 'fake-merchant-key'
const PASSPHRASE = randomBytes(12).toString('hex')
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

type ItnEvent = {
  id: string
  raw_body: string
  source_ip: string | null
  pf_payment_id: string | null
  payment_status: string | null
  signature_valid: boolean | null
  validate_passed: boolean | null
  outcome: string
}

let paymentStatus = 'DUE'
let credits = 0
let partyUserId: string | null = null
let paidAmount: string | null = null
let itnEvents: ItnEvent[] = []
let eventSeq = 0

function applyItnEvent(sql: string, params: unknown[] = []): { rows: ItnEvent[]; rowCount: number } | null {
  if (sql.includes('INSERT INTO payfast_itn_events')) {
    const row: ItnEvent = {
      id: `evt-${++eventSeq}`,
      raw_body: String(params[1] ?? ''),
      source_ip: params[3] == null ? null : String(params[3]),
      pf_payment_id: null,
      payment_status: null,
      signature_valid: null,
      validate_passed: null,
      outcome: 'received',
    }
    itnEvents.push(row)
    return { rows: [row], rowCount: 1 }
  }
  if (sql.includes('UPDATE payfast_itn_events') && sql.includes('pf_payment_id = $2')) {
    const id = String(params[0])
    const pf = String(params[1])
    const status = String(params[2])
    const clash = itnEvents.some((event) => event.id !== id && event.pf_payment_id === pf && event.payment_status === status)
    if (clash) {
      const err = new Error('duplicate key value violates unique constraint') as Error & { code: string }
      err.code = '23505'
      throw err
    }
    const row = itnEvents.find((event) => event.id === id)
    if (!row) return { rows: [], rowCount: 0 }
    row.pf_payment_id = pf
    row.payment_status = status
    row.signature_valid = true
    row.validate_passed = true
    row.outcome = String(params[3])
    return { rows: [row], rowCount: 1 }
  }
  if (sql.includes('UPDATE payfast_itn_events')) {
    const row = itnEvents.find((event) => event.id === String(params[0]))
    if (!row) return { rows: [], rowCount: 0 }
    if (sql.includes('ignored_already_paid')) {
      row.outcome = 'ignored_already_paid'
    } else if (params.length >= 4) {
      row.outcome = String(params[1])
      row.signature_valid = params[2] as boolean | null
      row.validate_passed = params[3] as boolean | null
    }
    return { rows: [row], rowCount: 1 }
  }
  return null
}

function installDb() {
  paymentStatus = 'DUE'
  credits = 0
  partyUserId = null
  paidAmount = null
  itnEvents = []
  eventSeq = 0
  db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const eventResult = applyItnEvent(sql, params)
    if (eventResult) return eventResult.rows
    if (sql.includes('FROM payments')) {
      return [
        {
          id: PAYMENT_ID,
          amount: '10.00',
          status: paymentStatus,
          payment_type: 'RENT',
          party_name: 'Test Payer',
          party_user_id: partyUserId,
          client_id: 'a1000001-0001-4000-8000-000000000001',
          unit_id: null,
        },
      ]
    }
    if (sql.includes('FROM users')) {
      return [{ email: 'payer@example.com', first_name: 'Pat' }]
    }
    return []
  })
  db.withTransaction.mockImplementation(async (fn: (client: { query: typeof db.query }) => Promise<void>) => {
    const client = {
      query: async (sql: string, params: unknown[] = []) => {
        const eventResult = applyItnEvent(sql, params)
        if (eventResult) return eventResult
        if (sql.includes('UPDATE payments')) {
          expect(sql).toContain('paid_amount = $2::numeric')
          expect(sql).not.toContain('COALESCE(paid_amount, amount)')
          expect(sql).not.toMatch(/paid_amount\s*\+/)
          expect(sql).not.toContain('CANCELLED')
          if (paymentStatus !== 'DUE' && paymentStatus !== 'OVERDUE') return { rowCount: 0, rows: [] }
          paymentStatus = 'PAID'
          paidAmount = String(params[1])
          credits += 1
          return { rowCount: 1, rows: [] }
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
  mail.sendPaymentReceipt.mockReset()
  mail.sendPaymentReceipt.mockResolvedValue({ ok: true })
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

  it('rejects a wrong merchant id without changing the payment', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    db.withTransaction.mockClear()
    const res = await postItn(itnBody({ merchant_id: '10009999' }))
    expect(res.status).toBe(400)
    expect(credits).toBe(0)
    expect(paymentStatus).toBe('DUE')
    expect(error.mock.calls.some((args) => String(args[0]).includes('merchant_id'))).toBe(true)
    expect(db.withTransaction).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('rejects a wrong amount', async () => {
    const res = await postItn(itnBody({ amount_gross: '9999.00' }))
    expect(res.status).toBe(400)
    expect(credits).toBe(0)
  })

  it('rejects an amount that differs by one cent and does not change the payment', async () => {
    db.withTransaction.mockClear()
    const res = await postItn(itnBody({ amount_gross: '10.01' }))
    expect(res.status).toBe(400)
    expect(credits).toBe(0)
    expect(paymentStatus).toBe('DUE')
    expect(db.withTransaction).not.toHaveBeenCalled()
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

  it('sends the receipt after the payment is committed', async () => {
    partyUserId = 'a2000001-0001-4000-8000-000000000010'
    mail.sendPaymentReceipt.mockImplementation(async () => {
      expect(paymentStatus).toBe('PAID')
      expect(credits).toBe(1)
      return { ok: true }
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('VALID', { status: 200 })))
    const res = await postItn(itnBody())
    expect(res.status).toBe(200)
    await vi.waitUntil(() => mail.sendPaymentReceipt.mock.calls.length === 1)
    expect(mail.sendPaymentReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'payer@example.com',
        payerName: 'Pat',
        paymentId: PAYMENT_ID,
      }),
    )
    vi.unstubAllGlobals()
  })

  it('leaves the payment paid when the receipt sender throws', async () => {
    partyUserId = 'a2000001-0001-4000-8000-000000000010'
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mail.sendPaymentReceipt.mockImplementation(async () => {
      expect(paymentStatus).toBe('PAID')
      throw new Error('smtp down')
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('VALID', { status: 200 })))
    const res = await postItn(itnBody())
    expect(res.status).toBe(200)
    await vi.waitUntil(() => mail.sendPaymentReceipt.mock.calls.length === 1)
    await vi.waitUntil(() => error.mock.calls.some((args) => String(args[0]).includes('receipt email failed')))
    expect(paymentStatus).toBe('PAID')
    expect(credits).toBe(1)
    error.mockRestore()
    vi.unstubAllGlobals()
  })

  it('a CANCELLED ITN leaves the payment DUE', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('VALID', { status: 200 })))
    const res = await postItn(itnBody({ payment_status: 'CANCELLED' }))
    expect(res.status).toBe(200)
    expect(paymentStatus).toBe('DUE')
    expect(paidAmount).toBeNull()
    expect(credits).toBe(0)
    expect(itnEvents.some((event) => event.outcome === 'ignored_cancelled' && event.payment_status === 'CANCELLED')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('COMPLETE records paid_amount from amount_gross', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('VALID', { status: 200 })))
    const res = await postItn(itnBody({ amount_gross: '10.00' }))
    expect(res.status).toBe(200)
    expect(paymentStatus).toBe('PAID')
    expect(paidAmount).toBe('10.00')
    expect(credits).toBe(1)
    vi.unstubAllGlobals()
  })

  it('a replayed ITN makes one state change', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('VALID', { status: 200 })))
    const first = await postItn(itnBody())
    const second = await postItn(itnBody())
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(credits).toBe(1)
    expect(paymentStatus).toBe('PAID')
    expect(paidAmount).toBe('10.00')
    expect(itnEvents.filter((event) => event.outcome === 'paid')).toHaveLength(1)
    expect(itnEvents.some((event) => event.outcome === 'replay')).toBe(true)
    vi.unstubAllGlobals()
  })

  it('CANCELLED after PAID changes nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('VALID', { status: 200 })))
    const paid = await postItn(itnBody())
    expect(paid.status).toBe(200)
    const res = await postItn(itnBody({ payment_status: 'CANCELLED' }))
    expect(res.status).toBe(200)
    expect(paymentStatus).toBe('PAID')
    expect(paidAmount).toBe('10.00')
    expect(credits).toBe(1)
    vi.unstubAllGlobals()
  })

  it('stores the raw ITN when processing fails', async () => {
    const raw = '{not json'
    const res = await app().request('/api/payfast/itn', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-real-ip': PAYFAST_IP },
      body: raw,
    })
    expect(res.status).toBe(400)
    expect(paymentStatus).toBe('DUE')
    expect(credits).toBe(0)
    expect(itnEvents).toEqual([
      expect.objectContaining({
        raw_body: raw,
        source_ip: PAYFAST_IP,
        outcome: 'parse_failed',
        signature_valid: false,
        validate_passed: false,
      }),
    ])

    const bad = itnBody()
    bad.signature = 'deadbeefdeadbeefdeadbeefdeadbeef'
    const rejected = await postItn(bad)
    expect(rejected.status).toBe(400)
    expect(paymentStatus).toBe('DUE')
    expect(itnEvents.some((event) => event.raw_body.includes('deadbeefdeadbeefdeadbeefdeadbeef') && event.outcome === 'rejected')).toBe(true)
    vi.unstubAllGlobals()
  })
})
