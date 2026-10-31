// H2 (spec r5 :87-91, Jim B1-B4): the pf_session cookie carries Secure in
// production (or with COOKIE_SECURE=1), and logout clears it with the same
// attributes. server/auth.ts:334 (setCookie) and :344 (deleteCookie) are the
// only cookie writers in server/; both take their attributes from cookieOptions().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'

vi.mock('./db.js', () => ({ query: vi.fn(async () => []) }))
vi.mock('hono/cookie', async (importOriginal) => {
  const actual = await importOriginal<typeof import('hono/cookie')>()
  return { ...actual, setCookie: vi.fn(actual.setCookie), deleteCookie: vi.fn(actual.deleteCookie) }
})

import * as cookie from 'hono/cookie'
import * as auth from './auth.js'

const USER = {
  id: '00000000-0000-4000-8000-000000000001',
  frontendId: 'u1',
  role: 'agent',
  agencyId: 'a1',
} as unknown as auth.SessionUser

// Login/register/password-change in server/index.ts all call issueSession;
// logout calls clearSession. This app drives the same two functions.
function app() {
  const a = new Hono()
  a.post('/login', (c) => {
    auth.issueSession(c, USER)
    return c.json({ ok: true })
  })
  a.post('/logout', (c) => {
    auth.clearSession(c)
    return c.json({ ok: true })
  })
  return a
}

async function setCookieHeader(path: '/login' | '/logout'): Promise<string> {
  const res = await app().request(path, { method: 'POST' })
  const all = res.headers.getSetCookie()
  expect(all).toHaveLength(1)
  return all[0]
}

const attrs = (h: string) =>
  h
    .split(';')
    .slice(1)
    .map((s) => s.trim())

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', 'h2-test-secret-not-real')
  vi.stubEnv('COOKIE_SECURE', '')
  vi.mocked(cookie.setCookie).mockClear()
  vi.mocked(cookie.deleteCookie).mockClear()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('H2 session cookie in production', () => {
  beforeEach(() => vi.stubEnv('NODE_ENV', 'production'))

  it('login Set-Cookie has Secure, HttpOnly, SameSite=Lax, Path=/ and the 14-day Max-Age', async () => {
    const h = await setCookieHeader('/login')
    expect(h).toMatch(/^pf_session=[^;]+;/)
    expect(h).toContain('Path=/; HttpOnly; Secure; SameSite=Lax')
    expect(attrs(h)).toEqual(
      expect.arrayContaining(['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${60 * 60 * 24 * 14}`]),
    )
  })

  it('logout Set-Cookie clears it with the same attributes and an immediate expiry', async () => {
    const h = await setCookieHeader('/logout')
    expect(h).toMatch(/^pf_session=;/)
    expect(attrs(h)).toEqual(expect.arrayContaining(['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0']))
  })

  it('set and clear differ only in value and Max-Age', async () => {
    const strip = (h: string) => attrs(h).filter((a) => !a.startsWith('Max-Age=')).sort()
    expect(strip(await setCookieHeader('/logout'))).toEqual(strip(await setCookieHeader('/login')))
  })
})

describe('H2 COOKIE_SECURE cannot turn Secure off in production (Jim J7)', () => {
  // Six cases: COOKIE_SECURE '0', unset and '1', each on login set AND logout clear.
  for (const flag of ['0', undefined, '1'] as const) {
    for (const path of ['/login', '/logout'] as const) {
      it(`NODE_ENV=production, COOKIE_SECURE=${flag ?? '(unset)'}: ${path} Set-Cookie carries Secure`, async () => {
        vi.unstubAllEnvs()
        vi.stubEnv('AUTH_SECRET', 'h2-test-secret-not-real')
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('COOKIE_SECURE', flag) // undefined removes it (restored after each test)
        expect(process.env.COOKIE_SECURE).toBe(flag)
        const h = await setCookieHeader(path)
        expect(h).toMatch(path === '/login' ? /^pf_session=[^;]+;/ : /^pf_session=;/)
        expect(attrs(h)).toContain('Secure')
      })
    }
  }
})

describe('H2 COOKIE_SECURE outside production', () => {
  it('NODE_ENV=development with COOKIE_SECURE=1 gives Secure on set and clear', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('COOKIE_SECURE', '1')
    expect(attrs(await setCookieHeader('/login'))).toContain('Secure')
    expect(attrs(await setCookieHeader('/logout'))).toContain('Secure')
  })

  it('non-production without the flag has no Secure, so http://localhost sign-in still works', async () => {
    for (const env of ['development', 'test']) {
      vi.stubEnv('NODE_ENV', env)
      for (const flag of ['', '0', 'true']) {
        vi.stubEnv('COOKIE_SECURE', flag)
        const set = attrs(await setCookieHeader('/login'))
        const clear = attrs(await setCookieHeader('/logout'))
        expect(set, `${env} COOKIE_SECURE=${flag}`).not.toContain('Secure')
        expect(clear, `${env} COOKIE_SECURE=${flag}`).not.toContain('Secure')
        expect(set).toEqual(expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/']))
        expect(clear).toEqual(expect.arrayContaining(['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=0']))
      }
    }
  })
})

describe('H2 one helper for set and clear (B4)', () => {
  it('cookieOptions() follows NODE_ENV and COOKIE_SECURE', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(auth.cookieOptions()).toEqual({ httpOnly: true, sameSite: 'Lax', path: '/', secure: true })
    vi.stubEnv('NODE_ENV', 'development')
    expect(auth.cookieOptions()).toEqual({ httpOnly: true, sameSite: 'Lax', path: '/', secure: false })
    vi.stubEnv('COOKIE_SECURE', '1')
    expect(auth.cookieOptions().secure).toBe(true)
  })

  it('issueSession and clearSession pass exactly cookieOptions() (plus maxAge on set)', async () => {
    for (const env of ['production', 'development']) {
      vi.stubEnv('NODE_ENV', env)
      vi.mocked(cookie.setCookie).mockClear()
      vi.mocked(cookie.deleteCookie).mockClear()
      await setCookieHeader('/login')
      await setCookieHeader('/logout')
      const setOpts = vi.mocked(cookie.setCookie).mock.calls.find((c) => c[1] === 'pf_session')?.[3]
      const delOpts = vi.mocked(cookie.deleteCookie).mock.calls.find((c) => c[1] === 'pf_session')?.[2]
      expect(setOpts).toEqual({ ...auth.cookieOptions(), maxAge: 60 * 60 * 24 * 14 })
      expect(delOpts).toEqual(auth.cookieOptions())
    }
  })
})

describe('H2 cookie writers (B1)', () => {
  const root = fileURLToPath(new URL('.', import.meta.url))
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) return files(p)
      return /\.(ts|tsx|js|mjs|cjs)$/.test(f) && !/\.(test|spec)\./.test(f) ? [p] : []
    })

  it('server/ has exactly one setCookie and one deleteCookie call, both in auth.ts using cookieOptions()', () => {
    const calls: string[] = []
    for (const f of files(root)) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/\b(setCookie|deleteCookie)\s*\(/g)) calls.push(`${f.slice(root.length)}:${m[1]}`)
      if (/set-cookie/i.test(src)) calls.push(`${f.slice(root.length)}:raw Set-Cookie`)
    }
    expect(calls.sort()).toEqual(['auth.ts:deleteCookie', 'auth.ts:setCookie'])
    const src = readFileSync(join(root, 'auth.ts'), 'utf8')
    expect(src).toMatch(/setCookie\(c, AUTH_COOKIE, token, \{\s*\.\.\.cookieOptions\(\),/)
    expect(src).toMatch(/deleteCookie\(c, AUTH_COOKIE, cookieOptions\(\)\)/)
  })
})
