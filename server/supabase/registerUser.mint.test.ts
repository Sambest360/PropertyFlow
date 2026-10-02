import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = { rows: Record<string, unknown>[] }

const query = vi.fn<(sql: string, params?: unknown[]) => Promise<QueryResult>>()

vi.mock('../db.js', () => ({
  databaseConfigured: true,
  pool: {
    query: (...args: unknown[]) => query(...(args as [string, unknown[]?])),
  },
}))

describe('linkStaffAuthUser', () => {
  beforeEach(() => {
    query.mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ user: { id: 'auth-1' }, access_token: 't' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('rejects guest-public-only roles outside the staff mint allow-list', async () => {
    const { linkStaffAuthUser } = await import('./registerUser.js')
    await expect(
      linkStaffAuthUser({
        email: 'x@example.com',
        password: 'mint-fixture-c',
        firstName: 'A',
        lastName: 'B',
        roleFe: 'applicant',
        profileId: '11111111-1111-1111-1111-111111111111',
      }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not allowed/i) })
  })

  it('creates Auth + links orphan profile and verifies password grant before OK', async () => {
    // 1) no existing auth.users
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM auth.users WHERE lower(email)')) {
        return { rows: [] }
      }
      if (sql.includes('INSERT INTO auth.users')) {
        return { rows: [] }
      }
      if (sql.includes('INSERT INTO auth.identities')) {
        return { rows: [] }
      }
      if (sql.includes('FROM public.users') && sql.includes('auth_user_id')) {
        // first poll miss, then linked after UPDATE
        if (query.mock.calls.filter((c) => String(c[0]).includes('FROM public.users')).length < 2) {
          return { rows: [{ n: '0' }] }
        }
        return { rows: [{ n: '1' }] }
      }
      if (sql.includes('UPDATE public.users')) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const { linkStaffAuthUser } = await import('./registerUser.js')
    const result = await linkStaffAuthUser({
      email: 'qa.agent.rhtxlh.r13c@gmail.com',
      password: 'mint-fixture-r13c',
      firstName: 'QA',
      lastName: 'Agent',
      roleFe: 'ground_agent',
      profileId: '22222222-2222-2222-2222-222222222222',
    })

    expect(result.email).toBe('qa.agent.rhtxlh.r13c@gmail.com')
    expect(result.roleFe).toBe('ground_agent')
    expect(result.repairedOrphan).toBe(true)
    expect(result.authUserId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/v1/token?grant_type=password'),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('throws and does not report success when password grant returns 400', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM auth.users WHERE lower(email)')) return { rows: [] }
      if (sql.includes('FROM public.users') && sql.includes('auth_user_id')) {
        return { rows: [{ n: '1' }] }
      }
      return { rows: [] }
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'invalid_grant' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )

    const { linkStaffAuthUser } = await import('./registerUser.js')
    await expect(
      linkStaffAuthUser({
        email: 'qa.agent.fail@gmail.com',
        password: 'mint-fixture-r13c',
        firstName: 'QA',
        lastName: 'Fail',
        roleFe: 'agent',
        profileId: '33333333-3333-3333-3333-333333333333',
      }),
    ).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/verification failed/i) })
  })
})
