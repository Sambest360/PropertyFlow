import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T3 / Jim C3: POST /api/public/listing-enquiry never sends raw server or
 * database text to the public. Real Hono app (server/index.ts) and the real
 * route; only submitPublicListingEnquiry, mail and Postgres are stubbed.
 * Known public codes still come through so the form can show the right copy.
 */
vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
})

const submit = vi.hoisted(() => ({ fn: vi.fn() }))

vi.mock('./publicEnquiry.js', async (orig) => ({
  ...(await orig<typeof import('./publicEnquiry.js')>()),
  submitPublicListingEnquiry: (...args: unknown[]) => submit.fn(...args),
}))

vi.mock('./mailtrap.js', async (orig) => ({
  ...(await orig<typeof import('./mailtrap.js')>()),
  sendListingEnquiryConfirmation: vi.fn(async () => undefined),
  sendListingLeadAlert: vi.fn(async () => undefined),
}))

vi.mock('./db.js', async (orig) => ({
  ...(await orig<typeof import('./db.js')>()),
  databaseConfigured: true,
  query: vi.fn(async () => []),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))

const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => quiet.mockRestore())

let app: { fetch: (req: Request) => Response | Promise<Response> }
beforeAll(async () => {
  app = (await import('./index.js')).default
}, 60_000)

async function post() {
  const res = await app.fetch(
    new Request('http://propertyflow.test/api/public/listing-enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: 'PR-1011', action: 'lead', firstName: 'K', lastName: 'B', email: 'k@example.com' }),
    }),
  )
  const text = await res.text()
  return { status: res.status, text, body: JSON.parse(text) as Record<string, unknown> }
}

const coded = (message: string, extra: Record<string, unknown>) => Object.assign(new Error(message), extra)
/** Throw lazily, at call time (an eager rejected promise trips vitest's unhandled-rejection check). */
const throwing = (err: Error) => async () => {
  throw err
}

// H1: the enquiry route now has a 3 per (email + listing) per hour limit; these
// tests reuse one contact, so reset the in-memory buckets between them.
beforeEach(async () => {
  submit.fn.mockReset()
  ;(await import('./rateLimit.js')).resetRateLimitsForTests()
})

describe('T3 C3: public enquiry route errors', () => {
  it('an unknown error (raw Postgres text) is sent as the generic enquiry_failed, not echoed', async () => {
    submit.fn.mockImplementationOnce(throwing(new Error('relation "leads" does not exist')))
    const r = await post()
    expect(r.status).toBe(500)
    expect(r.text).not.toContain('relation')
    expect(r.text).not.toContain('leads')
    expect(r.body).toMatchObject({ error: 'enquiry_failed', message: 'enquiry_failed' })
  })

  it('an unknown 4xx error with raw text is also generic (status kept)', async () => {
    submit.fn.mockImplementationOnce(throwing(
      coded('duplicate key value violates unique constraint "leads_pkey"', { status: 400, code: '23505' }),
    ))
    const r = await post()
    expect(r.status).toBe(400)
    expect(r.text).not.toMatch(/duplicate key|leads_pkey|23505/)
    expect(r.body).toMatchObject({ error: 'enquiry_failed', message: 'enquiry_failed' })
  })

  it('known public codes still come through: contact_required, property_not_found, slot_unavailable', async () => {
    for (const [msg, status] of [
      ['contact_required', 400],
      ['property_not_found', 404],
      ['slot_unavailable', 409],
    ] as const) {
      submit.fn.mockImplementationOnce(throwing(coded(msg, { status })))
      const r = await post()
      expect(r.status).toBe(status)
      expect(r.body.message).toBe(msg)
    }
  })

  it('an occupied-advert rule sends its code, not its server sentence', async () => {
    submit.fn.mockImplementationOnce(throwing(
      coded("Viewings of an occupied home need at least 48 hours' notice", { status: 400, code: 'NOTICE_TOO_SHORT' }),
    ))
    const r = await post()
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ message: 'NOTICE_TOO_SHORT', code: 'NOTICE_TOO_SHORT' })
    expect(r.text).not.toContain('48 hours')
  })

  it('LISTING_FULL keeps its waitlist flag', async () => {
    submit.fn.mockImplementationOnce(throwing(coded('LISTING_FULL', { status: 409, code: 'LISTING_FULL', waitlist: true })))
    const r = await post()
    expect(r.status).toBe(409)
    expect(r.body).toMatchObject({ error: 'LISTING_FULL', message: 'LISTING_FULL', waitlist: true })
  })
})
