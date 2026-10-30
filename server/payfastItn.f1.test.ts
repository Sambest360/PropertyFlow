import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * F1 route wiring: the ITN handler confirms the ITN with PayFast's
 * /eng/query/validate BEFORE any payment write, and fails closed.
 * Mocked: Postgres, the mailer, the entity map, and verifyItn (always ok,
 * so these tests isolate F1 from the source/signature checks that H1 owns).
 * The network edge is the global fetch, stubbed per test. Fake values only.
 */
const PAYMENT_UUID = '11111111-1111-4111-8111-111111111111'
const PASSPHRASE = ['fake', 'f1', 'pass'].join('-')
const SIGNATURE = 'abcdefabcdefabcdefabcdefabcdef12'

const events = vi.hoisted(() => [] as string[])
const mode = vi.hoisted(() => ({ live: true }))

const sendPaymentReceipt = vi.hoisted(() => vi.fn(async (_input: unknown) => undefined))
vi.mock('./mailtrap.js', () => ({ sendPaymentReceipt: (input: unknown) => sendPaymentReceipt(input) }))

const query = vi.hoisted(() =>
  vi.fn(async (text: string, _params?: unknown[]): Promise<unknown[]> => {
    if (text.includes('FROM payments')) {
      return [
        {
          id: '11111111-1111-4111-8111-111111111111',
          amount: '1850.00',
          status: 'DUE',
          payment_type: 'Rent',
          party_name: 'Test Payer',
          party_user_id: '22222222-2222-4222-8222-222222222222',
          client_id: null,
          unit_id: null,
        },
      ]
    }
    if (text.includes('FROM users')) return [{ email: 'payer@example.com', first_name: 'Test' }]
    return []
  }),
)
const clientQuery = vi.hoisted(() =>
  vi.fn(async (text: string) => {
    events.push(`write:${text.trim().split(/\s+/).slice(0, 2).join(' ')}`)
    return { rowCount: 1, rows: [] }
  }),
)
vi.mock('./db.js', () => ({
  query: (text: string, params?: unknown[]) => query(text, params),
  withTransaction: async (fn: (client: unknown) => Promise<unknown>) => {
    events.push('tx')
    return fn({ query: clientQuery })
  },
}))
vi.mock('./entityMap.js', () => ({
  resolveUuid: vi.fn(async (_t: string, id: string) => (id === 'PAY-1' ? PAYMENT_UUID : null)),
}))
vi.mock('./payfast.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./payfast.js')>()
  return {
    ...actual,
    payfastConfigFromEnv: () => ({
      merchantId: 'FAKE-1',
      merchantKey: 'fake-key',
      passphrase: PASSPHRASE,
      processUrl: mode.live ? actual.PAYFAST_LIVE_PROCESS_URL : actual.PAYFAST_PROCESS_URL,
    }),
    verifyItn: (body: Record<string, string>) => ({
      ok: true,
      paymentId: body.m_payment_id,
      amountCents: 185000,
      status: body.payment_status,
      raw: body,
    }),
  }
})

const { payfastItn } = await import('./payfastRoutes.js')

function app() {
  const a = new Hono()
  a.post('/api/payfast/itn', (c) => payfastItn(c))
  return a
}

/** Posted in this exact order; item_description is empty on purpose. */
const FORM: Array<[string, string]> = [
  ['m_payment_id', 'PAY-1'],
  ['pf_payment_id', '900001'],
  ['payment_status', 'COMPLETE'],
  ['item_name', 'Rent May'],
  ['item_description', ''],
  ['amount_gross', '1850.00'],
  ['amount_fee', '-42.00'],
  ['merchant_id', 'FAKE-1'],
  ['signature', SIGNATURE],
]
const EXPECTED_VALIDATE_BODY =
  'm_payment_id=PAY-1&pf_payment_id=900001&payment_status=COMPLETE&item_name=Rent+May&item_description=&amount_gross=1850.00&amount_fee=-42.00&merchant_id=FAKE-1'

function post(form: Array<[string, string]> = FORM) {
  return app().request('/api/payfast/itn', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  })
}
const withStatus = (s: string) => FORM.map(([k, v]) => [k, k === 'payment_status' ? s : v] as [string, string])

let fetchCalls: Array<{ url: string; init: RequestInit }>
function stubFetch(impl: () => Promise<Response>) {
  fetchCalls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} })
      events.push('validate')
      return impl()
    }),
  )
}
let errors: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  events.length = 0
  mode.live = true
  sendPaymentReceipt.mockClear()
  query.mockClear()
  clientQuery.mockClear()
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function expectNothingWritten() {
  expect(events.filter((e) => e !== 'validate')).toEqual([])
  expect(clientQuery).not.toHaveBeenCalled()
  expect(sendPaymentReceipt).not.toHaveBeenCalled()
}

describe('F1: VALID is the only way to a payment write', () => {
  it('VALID → 200 ITN accepted, the validate call comes before the payment UPDATE', async () => {
    stubFetch(async () => new Response('VALID', { status: 200 }))
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ITN accepted')
    expect(events[0]).toBe('validate')
    expect(events).toContain('write:UPDATE payments')
    expect(events.indexOf('validate')).toBeLessThan(events.indexOf('tx'))
    await vi.waitFor(() => expect(sendPaymentReceipt).toHaveBeenCalledTimes(1))
  })

  it('posts the received fields, in received order, minus signature, to the live host', async () => {
    stubFetch(async () => new Response('VALID'))
    await post()
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0]!.url).toBe('https://www.payfast.co.za/eng/query/validate')
    expect(fetchCalls[0]!.init.method).toBe('POST')
    expect(fetchCalls[0]!.init.body).toBe(EXPECTED_VALIDATE_BODY)
  })

  it('sandbox mode posts to the sandbox host', async () => {
    mode.live = false
    stubFetch(async () => new Response('VALID'))
    await post()
    expect(fetchCalls[0]!.url).toBe('https://sandbox.payfast.co.za/eng/query/validate')
  })

  it('a CANCELLED ITN is validated before it cancels the payment too', async () => {
    stubFetch(async () => new Response('INVALID'))
    const res = await post(withStatus('CANCELLED'))
    expect(res.status).toBe(400)
    expectNothingWritten()
  })

  it('an ITN naming no known payment makes no validate call (nothing would be written anyway)', async () => {
    stubFetch(async () => new Response('VALID'))
    const res = await post(FORM.map(([k, v]) => [k, k === 'm_payment_id' ? 'PAY-UNKNOWN' : v] as [string, string]))
    expect(res.status).toBe(200)
    expect(fetchCalls).toHaveLength(0)
    expect(clientQuery).not.toHaveBeenCalled()
  })
})

describe('F1: every non-VALID outcome marks nothing paid', () => {
  it('INVALID → 400 ITN rejected, nothing written', async () => {
    stubFetch(async () => new Response('INVALID'))
    const res = await post()
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('ITN rejected')
    expectNothingWritten()
  })

  it('network error → 503 so PayFast retries, nothing written', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed')
    })
    const res = await post()
    expect(res.status).toBe(503)
    expect(await res.text()).toBe('ITN validation unavailable')
    expectNothingWritten()
  })

  it('timeout (default, short) → 503, nothing written', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stubFetch(() => new Promise<Response>(() => {}))
    const pending = post()
    await vi.advanceTimersByTimeAsync(10_000)
    const res = await pending
    expect(res.status).toBe(503)
    expectNothingWritten()
  })

  it.each([500, 404])('HTTP %i from validate → 503, nothing written', async (status) => {
    stubFetch(async () => new Response('VALID', { status }))
    const res = await post()
    expect(res.status).toBe(503)
    expectNothingWritten()
  })

  it('malformed validate reply → 503, nothing written', async () => {
    stubFetch(async () => new Response('<html>maintenance</html>'))
    const res = await post()
    expect(res.status).toBe(503)
    expectNothingWritten()
  })
})

describe('F1 logging: ids and the reason only', () => {
  it('a failed validate logs one line with m_payment_id, pf_payment_id and the reason, and no secrets or body', async () => {
    stubFetch(async () => new Response('INVALID'))
    await post()
    const lines = errors.mock.calls.map((a) => a.map(String).join(' '))
    const line = lines.find((l) => l.includes('payfast_itn_validate_failed'))
    expect(line).toBeDefined()
    expect(line).toContain('PayFast validate replied INVALID')
    expect(line).toContain('m_payment_id=PAY-1')
    expect(line).toContain('pf_payment_id=900001')
    const all = lines.join('\n')
    for (const bad of [SIGNATURE, PASSPHRASE, 'fake-key', 'Rent May', '1850.00', 'amount_gross', EXPECTED_VALIDATE_BODY]) {
      expect(all).not.toContain(bad)
    }
  })
  it('log values are clipped to one line of at most 200 chars', async () => {
    stubFetch(async () => new Response('INVALID'))
    await post(FORM.map(([k, v]) => [k, k === 'pf_payment_id' ? 'x\n'.repeat(300) : v] as [string, string]))
    const line = errors.mock.calls.map((a) => a.map(String).join(' ')).find((l) => l.includes('payfast_itn_validate_failed'))!
    expect(line).not.toContain('\n')
    expect(line.length).toBeLessThan(500)
  })
})
