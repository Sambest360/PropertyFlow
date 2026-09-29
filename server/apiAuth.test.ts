import { createServer } from 'node:http'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTH_COOKIE, signLegacySessionToken } from './auth.js'
import { signHs256AccessToken } from './test/signAccessToken.js'
import { resetJwtKeyCacheForTests } from './supabaseJwt.js'

const query = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  query,
  pool: null,
  databaseConfigured: true,
  databaseConfigError: undefined,
  databaseConfigWarning: undefined,
  pingDatabase: vi.fn(async () => undefined),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
}))

process.env.PF_SKIP_SERVE = '1'
process.env.AUTH_SECRET = 'legacy-auth-secret-for-tests'
process.env.SUPABASE_JWT_SECRET = 'supabase-jwt-secret-for-tests'
process.env.SUPABASE_JWT_ISS = 'http://127.0.0.1:54321/auth/v1'
process.env.SUPABASE_JWT_AUD = 'authenticated'
delete process.env.SUPABASE_JWKS_URL
delete process.env.PF_LOCAL_API_AUTH
delete process.env.SUPABASE_URL

const ISS = process.env.SUPABASE_JWT_ISS
const SECRET = process.env.SUPABASE_JWT_SECRET
const AUTH_USER = '22222222-2222-4222-8222-222222222222'
const PUBLIC_USER = '11111111-1111-4111-8111-111111111111'

function userRow(active = true) {
  return {
    id: PUBLIC_USER,
    email: 'ada@example.com',
    password_hash: 'x',
    first_name: 'Ada',
    last_name: 'Staff',
    phone: null,
    role: 'AGENCY_ADMIN',
    active,
    client_id: '33333333-3333-4333-8333-333333333333',
    metadata: { frontend_id: 'u-ada', frontend_role: 'client_admin' },
    agency_fe: 'ag-ada',
  }
}

function forbidDb() {
  query.mockImplementation(async () => {
    throw new Error('database read on an unauthenticated request')
  })
}

let app: { request: (input: string, init?: RequestInit) => Promise<Response> }

beforeAll(async () => {
  const mod = await import('./index.js')
  app = mod.default
})

beforeEach(() => {
  query.mockReset()
  forbidDb()
  delete process.env.PF_LOCAL_API_AUTH
  process.env.SUPABASE_JWT_SECRET = SECRET
  process.env.SUPABASE_JWT_ISS = ISS
  process.env.SUPABASE_JWT_AUD = 'authenticated'
  delete process.env.SUPABASE_JWKS_URL
  resetJwtKeyCacheForTests()
})

async function token(expOffsetSec: number, audience = 'authenticated', issuer = ISS) {
  const exp = Math.floor(Date.now() / 1000) + expOffsetSec
  return signHs256AccessToken({
    sub: AUTH_USER,
    secret: SECRET,
    issuer,
    audience,
    exp,
  })
}

describe('API session middleware', () => {
  it('leaves public health open and does not read the database', async () => {
    const res = await app.request('/api/health?db=0')
    expect(res.status).toBe(200)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns 401 when the bearer token is missing', async () => {
    const res = await app.request('/api/auth/me')
    expect(res.status).toBe(401)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns 401 for a malformed Authorization header without a database read', async () => {
    const res = await app.request('/api/auth/me', {
      headers: { Authorization: 'Basic abc' },
    })
    expect(res.status).toBe(401)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns 401 for a tampered token without a database read', async () => {
    const signed = await token(600)
    const [header, payload, signature] = signed.split('.')
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string }
    body.sub = '99999999-9999-4999-8999-999999999999'
    const tampered = `${header}.${Buffer.from(JSON.stringify(body)).toString('base64url')}.${signature}`
    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${tampered}` },
    })
    expect(res.status).toBe(401)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns 401 for an expired token without a database read', async () => {
    const signed = await token(-120)
    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${signed}` },
    })
    expect(res.status).toBe(401)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns 401 when aud or iss does not match', async () => {
    const badAud = await token(600, 'anon')
    const badIss = await token(600, 'authenticated', 'https://evil.example/auth/v1')
    const audRes = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${badAud}` },
    })
    const issRes = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${badIss}` },
    })
    expect(audRes.status).toBe(401)
    expect(issRes.status).toBe(401)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns 401 for an unsigned alg=none token', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({
        sub: AUTH_USER,
        exp,
        aud: 'authenticated',
        iss: ISS,
      }),
    ).toString('base64url')
    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${header}.${payload}.` },
    })
    expect(res.status).toBe(401)
    expect(query).not.toHaveBeenCalled()
  })

  it('loads public.users by auth_user_id only after the token verifies', async () => {
    query.mockResolvedValue([userRow()])
    const signed = await token(600)
    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${signed}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { email: string; role: string; agencyId: string } }
    expect(body.user.email).toBe('ada@example.com')
    expect(body.user.role).toBe('client_admin')
    expect(body.user.agencyId).toBe('ag-ada')
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/auth_user_id/)
    expect(params).toEqual([AUTH_USER])
  })

  it('ignores a legacy HMAC cookie unless local API mode is explicit', async () => {
    const legacy = signLegacySessionToken({
      id: PUBLIC_USER,
      frontendId: 'u-ada',
      role: 'client_admin',
      agencyId: 'ag-ada',
    })
    const hidden = await app.request('/api/auth/me', {
      headers: { cookie: `${AUTH_COOKIE}=${legacy}` },
    })
    expect(hidden.status).toBe(401)
    expect(query).not.toHaveBeenCalled()

    process.env.PF_LOCAL_API_AUTH = '1'
    query.mockResolvedValue([userRow()])
    const allowed = await app.request('/api/auth/me', {
      headers: { cookie: `${AUTH_COOKIE}=${legacy}` },
    })
    expect(allowed.status).toBe(200)
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/u\.id = \$1/)
    expect(sql).not.toMatch(/auth_user_id/)
    expect(params).toEqual([PUBLIC_USER])
  })

  it('does not fall back to a cookie when the bearer token is invalid', async () => {
    process.env.PF_LOCAL_API_AUTH = '1'
    const legacy = signLegacySessionToken({
      id: PUBLIC_USER,
      frontendId: 'u-ada',
      role: 'client_admin',
      agencyId: 'ag-ada',
    })
    const res = await app.request('/api/auth/me', {
      headers: {
        Authorization: 'Bearer not-a-jwt',
        cookie: `${AUTH_COOKIE}=${legacy}`,
      },
    })
    expect(res.status).toBe(401)
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects a legacy HMAC bearer when local API mode is off', async () => {
    const legacy = signLegacySessionToken({
      id: PUBLIC_USER,
      frontendId: 'u-ada',
      role: 'client_admin',
      agencyId: 'ag-ada',
    })
    const res = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${legacy}` },
    })
    expect(res.status).toBe(401)
    expect(query).not.toHaveBeenCalled()
  })

  it('verifies an ES256 token against a local JWKS', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
    const jwk = await exportJWK(publicKey)
    jwk.alg = 'ES256'
    jwk.kid = 'test-key'
    jwk.use = 'sig'
    const jwks = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ keys: [jwk] }))
    })
    await new Promise<void>((resolve) => jwks.listen(0, '127.0.0.1', () => resolve()))
    const address = jwks.address()
    const port = typeof address === 'object' && address ? address.port : 0
    process.env.SUPABASE_JWKS_URL = `http://127.0.0.1:${port}/auth/v1/.well-known/jwks.json`
    delete process.env.SUPABASE_JWT_SECRET
    resetJwtKeyCacheForTests()
    try {
      const exp = Math.floor(Date.now() / 1000) + 600
      const signed = await new SignJWT({ role: 'authenticated' })
        .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'test-key' })
        .setSubject(AUTH_USER)
        .setIssuer(ISS)
        .setAudience('authenticated')
        .setIssuedAt(Math.floor(Date.now() / 1000))
        .setExpirationTime(exp)
        .sign(privateKey)
      query.mockResolvedValue([userRow()])
      const ok = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${signed}` },
      })
      expect(ok.status).toBe(200)
      expect(query).toHaveBeenCalledTimes(1)

      query.mockReset()
      forbidDb()
      const [header, payload, signature] = signed.split('.')
      const flipped = signature.slice(0, -2) + (signature.endsWith('a') ? 'b' : 'a')
      const bad = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${header}.${payload}.${flipped}` },
      })
      expect(bad.status).toBe(401)
      expect(query).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve) => jwks.close(() => resolve()))
    }
  })
})
