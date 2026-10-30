import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * H1 (spec r5 :74-77): auth limits through the real Hono app
 * (server/index.ts) and its real middleware. Only the credential check,
 * session issuing, account e-mails and Postgres are stubbed. The connection
 * peer is the node-server binding a real request carries
 * (env.incoming.socket), so clientIp() runs exactly as in production behind
 * nginx (loopback peer + X-Real-IP) or exposed directly.
 */
vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  for (const k of Object.keys(process.env)) if (k.startsWith('AUTH_RATE_LIMIT')) delete process.env[k]
})

/** Test-only fixtures, built at runtime (not credentials). */
const GOOD = ['fixture', 'good', 'pw'].join('-')
const NEW_PW = ['fixture', 'new', 'pw'].join('-')

const pw = vi.hoisted(() => ({ current: new Map<string, string>() }))
const mail = vi.hoisted(() => ({ resets: [] as string[] }))

vi.mock('./auth.js', async (orig) => ({
  ...(await orig<typeof import('./auth.js')>()),
  loginUser: vi.fn(async (email: string, password: string) => {
    const want = pw.current.get(email.trim().toLowerCase())
    if (!want || want !== password) throw Object.assign(new Error('Invalid email or password'), { status: 401 })
    return { id: 'u-uuid', frontendId: 'u-1', email, name: 'U', role: 'agent', agencyId: 'a-1' }
  }),
  issueSession: vi.fn(() => 'session-token-fixture'),
  sessionToPublic: vi.fn((u: { email: string }) => ({ email: u.email })),
}))

vi.mock('./accountEmails.js', async (orig) => ({
  ...(await orig<typeof import('./accountEmails.js')>()),
  requestPasswordReset: vi.fn(async (email: string) => {
    mail.resets.push(email)
  }),
  setPasswordWithToken: vi.fn(async (token: string, password: string) => {
    const email = token.replace(/^tok:/, '')
    pw.current.set(email, password)
    return { email }
  }),
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

const quietWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
afterAll(() => quietWarn.mockRestore())

const T0 = new Date('2026-10-30T10:00:00+02:00')
beforeEach(async () => {
  // Optional call so the tests-first run at base fails on behaviour, not on the missing hook.
  const rl = (await import('./rateLimit.js')) as { resetRateLimitsForTests?: () => void }
  rl.resetRateLimitsForTests?.()
  pw.current = new Map([['victim@example.com', GOOD]])
  mail.resets = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})
afterEach(() => vi.useRealTimers())

/** nginx in front: loopback peer, X-Real-IP = the real client, XFF = client-sent + appended peer. */
const viaNginx = (realIp: string) => ({
  env: { incoming: { socket: { remoteAddress: '127.0.0.1', remotePort: 51000, remoteFamily: 'IPv4' } } },
  headers: (spoof?: string) => ({
    'x-real-ip': realIp,
    'x-forwarded-for': spoof ? `${spoof}, ${realIp}` : realIp,
  }),
})
const randomIp = () => `${1 + Math.floor(Math.random() * 222)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${1 + Math.floor(Math.random() * 250)}`

async function login(realIp: string, password: string, spoof?: string, email = 'victim@example.com') {
  const n = viaNginx(realIp)
  const res = await app.request(
    '/api/auth/login',
    { method: 'POST', headers: { 'content-type': 'application/json', ...n.headers(spoof) }, body: JSON.stringify({ email, password }) },
    n.env,
  )
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body: (await res.json()) as Record<string, unknown> }
}

describe('H1 auth: no XFF bypass', () => {
  it('31 logins with a fresh random XFF each: the 31st gets 429 (per-IP cap 30)', async () => {
    const results = []
    for (let i = 0; i < 31; i++) results.push(await login('198.51.100.10', 'wrong', randomIp(), `user${i}@example.com`))
    expect(results.slice(0, 30).every((r) => r.status === 401)).toBe(true)
    expect(results[30]?.status).toBe(429)
    expect(Number(results[30]?.retryAfter)).toBeGreaterThan(0)
  })

  it('a non-loopback peer (no nginx) is keyed on the peer, whatever X-Real-IP / XFF say', async () => {
    const env = { incoming: { socket: { remoteAddress: '198.51.100.11', remotePort: 1, remoteFamily: 'IPv4' } } }
    const statuses = []
    for (let i = 0; i < 31; i++) {
      const res = await app.request(
        '/api/auth/login',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-real-ip': randomIp(), 'x-forwarded-for': randomIp() },
          body: JSON.stringify({ email: `p${i}@example.com`, password: 'wrong' }),
        },
        env,
      )
      statuses.push(res.status)
    }
    expect(statuses[30]).toBe(429)
  })

  it('the lockout (9th attempt for one email) survives an XFF change', async () => {
    for (let i = 0; i < 8; i++) expect((await login('198.51.100.12', 'wrong', '10.0.0.1')).status).toBe(401)
    const ninth = await login('198.51.100.12', GOOD, '10.99.99.99')
    expect(ninth.status).toBe(429)
  })
})

describe('H1 auth: lockout length and copy', () => {
  it('after 8 failures the 9th gets 429, Retry-After <= 900, "Try again in N min or reset your password"; at +15 min login works', async () => {
    for (let i = 0; i < 8; i++) await login('198.51.100.13', 'wrong')
    const locked = await login('198.51.100.13', GOOD)
    expect(locked.status).toBe(429)
    expect(Number(locked.retryAfter)).toBeGreaterThan(0)
    expect(Number(locked.retryAfter)).toBeLessThanOrEqual(900)
    expect(String(locked.body.message)).toMatch(/^Too many attempts\. Try again in \d+ min or reset your password\.$/)
    vi.setSystemTime(new Date(T0.getTime() + 15 * 60_000))
    expect((await login('198.51.100.13', GOOD)).status).toBe(200)
  })
})

describe('H1 auth: forgot / set password while locked', () => {
  async function postJson(path: string, realIp: string, body: unknown) {
    const n = viaNginx(realIp)
    const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...n.headers() }, body: JSON.stringify(body) }, n.env)
    return { status: res.status, body: (await res.json()) as Record<string, unknown> }
  }

  it('with the (IP+email) lockout active AND the per-IP login cap hit, forgot-password still returns 200 and sends the mail; set-password succeeds', async () => {
    const ip = '198.51.100.14'
    for (let i = 0; i < 8; i++) await login(ip, 'wrong')
    for (let i = 0; i < 22; i++) await login(ip, 'wrong', undefined, `filler${i}@example.com`)
    expect((await login(ip, GOOD)).status).toBe(429)
    const forgot = await postJson('/api/auth/forgot-password', ip, { email: 'victim@example.com' })
    expect(forgot.status).toBe(200)
    expect(mail.resets).toEqual(['victim@example.com'])
    const set = await postJson('/api/auth/set-password', ip, { token: 'tok:victim@example.com', password: NEW_PW })
    expect(set.status).toBe(200)
  })

  it('a successful set-password clears the lockout: the next login with the new password succeeds at once', async () => {
    const ip = '198.51.100.15'
    for (let i = 0; i < 8; i++) await login(ip, 'wrong')
    expect((await login(ip, GOOD)).status).toBe(429)
    expect((await postJson('/api/auth/set-password', ip, { token: 'tok:victim@example.com', password: NEW_PW })).status).toBe(200)
    expect((await login(ip, NEW_PW)).status).toBe(200)
  })

  it('a failed set-password does not clear the lockout', async () => {
    const ip = '198.51.100.16'
    for (let i = 0; i < 8; i++) await login(ip, 'wrong')
    const { setPasswordWithToken } = await import('./accountEmails.js')
    vi.mocked(setPasswordWithToken).mockImplementationOnce(async () => {
      throw Object.assign(new Error('invalid token'), { status: 400, code: 'token_invalid' })
    })
    expect((await postJson('/api/auth/set-password', ip, { token: 'bad', password: NEW_PW })).status).toBe(400)
    expect((await login(ip, GOOD)).status).toBe(429)
  })
})
