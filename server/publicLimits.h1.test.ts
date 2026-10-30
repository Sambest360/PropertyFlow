import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * H1 (spec r5 :65-67, :78): the new limits on POST /api/public/listing-enquiry,
 * POST /api/auth/verify-email and POST /api/reviews, through the real Hono app
 * and its real middleware. Only the enquiry service, account e-mails, the
 * review store, actor resolution, mail and Postgres are stubbed. The
 * connection peer is the node-server binding (loopback nginx + X-Real-IP).
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
vi.mock('./accountEmails.js', async (orig) => ({
  ...(await orig<typeof import('./accountEmails.js')>()),
  verifyEmailToken: vi.fn(async () => ({ email: 'v@example.com' })),
}))
vi.mock('./requestActor.js', async (orig) => ({
  ...(await orig<typeof import('./requestActor.js')>()),
  resolveRequestActor: vi.fn(async (c: { req: { header: (n: string) => string | undefined } }) => {
    const user = c.req.header('x-test-user')
    return user ? { userId: user, role: 'tenant', agencyId: null } : null
  }),
}))
vi.mock('./scopeGate.js', async (orig) => ({
  ...(await orig<typeof import('./scopeGate.js')>()),
  enrichActor: vi.fn(async (a: unknown) => a),
}))
vi.mock('./reviews.js', async (orig) => ({
  ...(await orig<typeof import('./reviews.js')>()),
  upsertReview: vi.fn(async () => ({ id: 'rv-1' })),
}))
vi.mock('./db.js', async (orig) => ({
  ...(await orig<typeof import('./db.js')>()),
  databaseConfigured: true,
  query: vi.fn(async () => []),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))

type App = { request: (path: string, init?: RequestInit, env?: unknown) => Response | Promise<Response> }
let app: App
beforeAll(async () => {
  app = (await import('./index.js')).default as unknown as App
}, 60_000)

const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => quiet.mockRestore())

const LOOPBACK = { incoming: { socket: { remoteAddress: '127.0.0.1', remotePort: 51000, remoteFamily: 'IPv4' } } }

beforeEach(async () => {
  // Optional call so the tests-first run at base fails on behaviour, not on the missing hook.
  const rl = (await import('./rateLimit.js')) as { resetRateLimitsForTests?: () => void }
  rl.resetRateLimitsForTests?.()
  submit.fn.mockReset()
  submit.fn.mockImplementation(async () => ({ ok: true, leadId: 'LD-guest-1-abc', stage: 'New Lead', unitId: 'unit-1', availableFrom: null }))
})

let n = 0
async function enquire(realIp: string, email = `buyer${++n}@example.com`, propertyId = 'PR-1011', spoof?: string) {
  const res = await app.request(
    '/api/public/listing-enquiry',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-real-ip': realIp,
        'x-forwarded-for': spoof ? `${spoof}, ${realIp}` : realIp,
      },
      body: JSON.stringify({ propertyId, action: 'lead', firstName: 'K', lastName: 'B', email }),
    },
    LOOPBACK,
  )
  const text = await res.text()
  return { status: res.status, retryAfter: res.headers.get('retry-after'), text, body: JSON.parse(text) as Record<string, unknown> }
}

describe('H1 listing-enquiry limits', () => {
  it('21st enquiry from one IP in 15 min gets 429 with Retry-After; another IP still gets 201', async () => {
    const statuses = []
    for (let i = 0; i < 21; i++) statuses.push((await enquire('198.51.100.30', undefined, undefined, `10.1.1.${i}`)).status)
    expect(statuses.slice(0, 20).every((s) => s === 201)).toBe(true)
    const last = await enquire('198.51.100.30')
    expect(statuses[20]).toBe(429)
    expect(last.status).toBe(429)
    expect(Number(last.retryAfter)).toBeGreaterThan(0)
    expect((await enquire('198.51.100.31')).status).toBe(201)
  })

  it('4th enquiry for one (email + unit) in an hour gets 429 with Retry-After, from any IP; other email or unit is fine', async () => {
    for (let i = 0; i < 3; i++) expect((await enquire(`198.51.100.${40 + i}`, 'same@example.com', 'PR-2001')).status).toBe(201)
    const fourth = await enquire('198.51.100.49', 'Same@Example.com', 'PR-2001')
    expect(fourth.status).toBe(429)
    expect(Number(fourth.retryAfter)).toBeGreaterThan(15 * 60)
    expect((await enquire('198.51.100.49', 'other@example.com', 'PR-2001')).status).toBe(201)
    expect((await enquire('198.51.100.49', 'same@example.com', 'PR-2002')).status).toBe(201)
  })

  it('the public 429 is neutral (Oscar A5): no limit, count or IP wording', async () => {
    for (let i = 0; i < 20; i++) await enquire('198.51.100.32')
    const r = await enquire('198.51.100.32')
    expect(r.status).toBe(429)
    expect(r.body.error).toBe('rate_limited')
    expect(String(r.body.message)).not.toMatch(/\bIP\b|attempt|limit|minute|\d+ min/i)
    expect(r.text).not.toMatch(/\bIP\b|attempt|minute|\d+ min|198\.51/i)
  })

  it('enquiry dedupe still returns duplicate: true under the limit', async () => {
    submit.fn.mockImplementation(async () => ({ ok: true, leadId: null, stage: 'New Lead', unitId: 'unit-1', availableFrom: null, duplicate: true }))
    const r = await enquire('198.51.100.33', 'dup@example.com', 'PR-3001')
    expect(r.status).toBe(201)
    expect(r.body.duplicate).toBe(true)
    expect(r.body.leadId).toBeNull()
  })
})

describe('H1 verify-email limit', () => {
  async function verify(realIp: string) {
    const res = await app.request(
      '/api/auth/verify-email',
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': realIp }, body: JSON.stringify({ token: 'x' }) },
      LOOPBACK,
    )
    return { status: res.status, retryAfter: res.headers.get('retry-after') }
  }
  it('11th verify-email from one IP in 15 min gets 429 with Retry-After; another IP is fine', async () => {
    for (let i = 0; i < 10; i++) expect((await verify('198.51.100.60')).status).toBe(200)
    const r = await verify('198.51.100.60')
    expect(r.status).toBe(429)
    expect(Number(r.retryAfter)).toBeGreaterThan(0)
    expect((await verify('198.51.100.61')).status).toBe(200)
  })
})

describe('H1 reviews limits', () => {
  async function review(realIp: string, user: string) {
    const res = await app.request(
      '/api/reviews',
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': realIp, 'x-test-user': user }, body: JSON.stringify({ listingId: 'PR-1' }) },
      LOOPBACK,
    )
    return { status: res.status, retryAfter: res.headers.get('retry-after') }
  }
  it('6th review by one actor in an hour gets 429 with Retry-After (any IP); another actor gets 201', async () => {
    for (let i = 0; i < 5; i++) expect((await review(`198.51.100.${70 + i}`, 'u-rev')).status).toBe(201)
    const r = await review('198.51.100.79', 'u-rev')
    expect(r.status).toBe(429)
    expect(Number(r.retryAfter)).toBeGreaterThan(15 * 60)
    expect((await review('198.51.100.79', 'u-other')).status).toBe(201)
  })
  it('21st review from one IP in an hour gets 429; another IP gets 201', async () => {
    for (let i = 0; i < 20; i++) expect((await review('198.51.100.80', `u-${i}`)).status).toBe(201)
    expect((await review('198.51.100.80', 'u-21')).status).toBe(429)
    expect((await review('198.51.100.81', 'u-22')).status).toBe(201)
  })
})
