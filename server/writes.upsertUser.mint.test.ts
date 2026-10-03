import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const ensureUuid = vi.fn(async () => '55555555-5555-5555-5555-555555555555')
const forgetId = vi.fn(async () => undefined)
const linkStaffAuthUser = vi.fn()

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  ensureUuid: (...args: unknown[]) => ensureUuid(...args),
  resolveUuid: vi.fn(async () => null),
  forgetId: (...args: unknown[]) => forgetId(...args),
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

vi.mock('./supabase/registerUser.js', () => ({
  linkStaffAuthUser: (...args: unknown[]) => linkStaffAuthUser(...args),
}))

vi.mock('./auth.js', () => ({
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
}))

const SUPABASE_AUTH_ENV = [
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
] as const

describe('upsertUser mint residual (Auth-fail rollback)', () => {
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    // These cases cover the Supabase link path. upsertUser only runs it when
    // GoTrue URL + key are set (API-mode Neon leaves them unset).
    for (const key of SUPABASE_AUTH_ENV) savedEnv[key] = process.env[key]
    delete process.env.SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    delete process.env.SUPABASE_PUBLISHABLE_KEY
    delete process.env.SUPABASE_ANON_KEY
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key'
    query.mockReset()
    ensureUuid.mockClear()
    forgetId.mockClear()
    linkStaffAuthUser.mockReset()
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO users')) return []
      if (sql.includes('SELECT auth_user_id')) return [{ auth_user_id: null }]
      if (sql.includes('DELETE FROM public.users')) return []
      return []
    })
  })

  afterEach(() => {
    for (const key of SUPABASE_AUTH_ENV) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
    vi.resetModules()
  })

  it('lowercases email before persist and rolls back orphan when Auth link throws', async () => {
    linkStaffAuthUser.mockRejectedValue(
      Object.assign(new Error('Auth linked but sign-in verification failed (status 400)'), {
        status: 502,
      }),
    )

    const { handlePersist } = await import('./writes.js')
    await expect(
      handlePersist({
        resource: 'user',
        action: 'upsert',
        id: 'u-bvgx5y',
        data: {
          email: 'QA.Agent.RHTXLH.R13D@Gmail.com',
          name: 'QA Agent',
          firstName: 'QA',
          lastName: 'Agent',
          role: 'ground_agent',
          tempPassword: 'mint-fixture-r13d',
          active: true,
        },
      }),
    ).rejects.toMatchObject({ status: 502 })

    expect(linkStaffAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'qa.agent.rhtxlh.r13d@gmail.com',
        profileId: '55555555-5555-5555-5555-555555555555',
        roleFe: 'ground_agent',
        password: 'mint-fixture-r13d',
      }),
    )

    const deleteCall = query.mock.calls.find((c) => String(c[0]).includes('DELETE FROM public.users'))
    expect(deleteCall).toBeTruthy()
    expect(forgetId).toHaveBeenCalledWith('user', 'u-bvgx5y')
  })

  it('refuses ok when Auth returns but profileId auth_user_id still NULL', async () => {
    linkStaffAuthUser.mockResolvedValue({
      authUserId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      email: 'qa.agent@example.com',
      roleFe: 'ground_agent',
      repairedOrphan: true,
    })
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO users')) return []
      if (sql.includes('SELECT auth_user_id')) return [{ auth_user_id: null }]
      if (sql.includes('DELETE FROM public.users')) return []
      return []
    })

    const { handlePersist } = await import('./writes.js')
    await expect(
      handlePersist({
        resource: 'user',
        action: 'upsert',
        id: 'u-null-link',
        data: {
          email: 'qa.null.link@example.com',
          name: 'Null Link',
          role: 'ground_agent',
          tempPassword: 'mint-fixture-null-link',
          active: true,
        },
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/auth_user_id on mint profileId/i),
    })

    expect(query.mock.calls.some((c) => String(c[0]).includes('DELETE FROM public.users'))).toBe(
      true,
    )
  })
})
