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
        password: ['mint','tok','c'].join('-'),
        firstName: 'A',
        lastName: 'B',
        roleFe: 'applicant',
        profileId: '11111111-1111-1111-1111-111111111111',
      }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/not allowed/i) })
  })

  it('creates Auth + links orphan profile and verifies password grant before OK', async () => {
    // 1) no existing auth.users
    let profilePolls = 0
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
      // profileId-scoped: WHERE id = $1 AND auth_user_id = $2
      if (
        sql.includes('FROM public.users') &&
        sql.includes('auth_user_id = $2') &&
        sql.includes('id = $1')
      ) {
        profilePolls += 1
        // first poll miss, then linked after force UPDATE
        return { rows: [{ n: profilePolls < 2 ? '0' : '1' }] }
      }
      if (sql.includes('UPDATE public.users')) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const { linkStaffAuthUser } = await import('./registerUser.js')
    const result = await linkStaffAuthUser({
      email: 'qa.agent.rhtxlh.r13c@gmail.com',
      password: ['mint','tok','r13c'].join('-'),
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
      if (
        sql.includes('FROM public.users') &&
        sql.includes('auth_user_id = $2') &&
        sql.includes('id = $1')
      ) {
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
        password: ['mint','tok','r13c'].join('-'),
        firstName: 'QA',
        lastName: 'Fail',
        roleFe: 'agent',
        profileId: '33333333-3333-3333-3333-333333333333',
      }),
    ).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/verification failed/i) })
  })

  it('does not treat another row with auth_user_id as linked for this profileId', async () => {
    // Simulates the r13d false-OK: some other public.users row has the auth id,
    // but THIS mint profileId still has auth_user_id NULL.
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM auth.users WHERE lower(email)')) return { rows: [] }
      if (sql.includes('INSERT INTO auth.users') || sql.includes('INSERT INTO auth.identities')) {
        return { rows: [] }
      }
      if (
        sql.includes('FROM public.users') &&
        sql.includes('auth_user_id = $2') &&
        sql.includes('id = $1')
      ) {
        return { rows: [{ n: '0' }] }
      }
      if (sql.includes('UPDATE public.users')) return { rows: [] }
      if (sql.includes('sync_auth_user_profile')) return { rows: [] }
      return { rows: [] }
    })

    const { linkStaffAuthUser } = await import('./registerUser.js')
    await expect(
      linkStaffAuthUser({
        email: 'qa.agent.orphan@gmail.com',
        password: ['mint','tok','r13d'].join('-'),
        firstName: 'QA',
        lastName: 'Orphan',
        roleFe: 'ground_agent',
        profileId: '44444444-4444-4444-4444-444444444444',
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: expect.stringMatching(/profile link failed for mint profileId/i),
    })
  })

})
