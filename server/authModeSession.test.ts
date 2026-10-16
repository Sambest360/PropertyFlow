/**
 * API mode: a non-JWT bearer gets 401 with no GoTrue fetch and no
 * auth_user_id query, even when SUPABASE_* env is present.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-auth-mode'
  return { sql: [] as string[] }
})

vi.mock('./db.js', () => ({
  query: vi.fn(async (sql: string) => {
    h.sql.push(sql)
    if (/auth_user_id/.test(sql)) throw new Error('column "auth_user_id" does not exist')
    return []
  }),
}))

import { Hono } from 'hono'
import { resolveSessionUser } from './auth'

function app() {
  const a = new Hono()
  a.get('/me', async (c) => {
    const u = await resolveSessionUser(c)
    return u ? c.json({ ok: true }) : c.json({ error: 'unauthorized' }, 401)
  })
  return a
}

describe('server/auth.ts API-mode guard', () => {
  const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ id: 'x' }), { status: 200 }))
  beforeEach(() => {
    h.sql.length = 0
    delete process.env.AUTH_MODE
    process.env.SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co'
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test'
    vi.stubGlobal('fetch', fetchSpy)
    fetchSpy.mockClear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_PUBLISHABLE_KEY
    delete process.env.AUTH_MODE
  })

  it('non-JWT token → 401, no Supabase lookup, no auth_user_id query', async () => {
    const res = await app().request('/me', { headers: { Authorization: 'Bearer not-our-jwt.abc.def' } })
    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(h.sql.some((s) => /auth_user_id/.test(s))).toBe(false)
  })

  it('AUTH_MODE other than exact "supabase" still API mode', async () => {
    process.env.AUTH_MODE = 'Supabase'
    const res = await app().request('/me', { headers: { Authorization: 'Bearer sb-token' } })
    expect(res.status).toBe(401)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
