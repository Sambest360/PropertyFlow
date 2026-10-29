import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const ensureUuid = vi.fn(async () => '55555555-5555-5555-5555-555555555555')
const forgetId = vi.fn(async () => undefined)
const linkStaffAuthUser = vi.fn()

const PROFILE_ID = '55555555-5555-5555-5555-555555555555'
const AGENCY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EMAIL = 'thandi.dlamini@horizonrealty.co.za'
const PASSWORD = 'HorizonTemp1!'

const SUPABASE_AUTH_ENV = [
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY',
] as const

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
  // ensureUuid registered u-thandi -> PROFILE_ID, so the session's FE id round-trips.
  resolveUuid: vi.fn(async (type: string, fe?: string) =>
    type === 'agency' ? AGENCY_ID : type === 'user' && fe === 'u-thandi' ? PROFILE_ID : null,
  ),
  forgetId: (...args: unknown[]) => forgetId(...args),
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))


describe('upsertUser Full Agent create without Supabase Auth', () => {
  const savedEnv: Record<string, string | undefined> = {}
  let storedHash = ''

  beforeEach(() => {
    for (const key of SUPABASE_AUTH_ENV) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    storedHash = ''
    query.mockReset()
    ensureUuid.mockClear()
    forgetId.mockClear()
    linkStaffAuthUser.mockReset()
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO users')) {
        storedHash = String(params?.[9] ?? '')
        return []
      }
      if (sql.includes('lower(u.email)')) {
        return [
          {
            id: PROFILE_ID,
            email: EMAIL,
            password_hash: storedHash,
            first_name: 'Thandi',
            last_name: 'Dlamini',
            phone: null,
            role: 'GROUND_AGENT',
            active: true,
            client_id: AGENCY_ID,
            metadata: { frontend_id: 'u-thandi', frontend_role: 'ground_agent' },
            agency_fe: 'ag-horizon',
          },
        ]
      }
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

  it('persists a bcrypt hash and loginUser accepts that password', async () => {
    const { handlePersist } = await import('./writes.js')
    const { loginUser } = await import('./auth.js')

    const result = await handlePersist({
      resource: 'user',
      action: 'upsert',
      id: 'u-thandi',
      data: {
        email: 'Thandi.Dlamini@HorizonRealty.co.za',
        name: 'Thandi Dlamini',
        role: 'ground_agent',
        agencyId: 'ag-horizon',
        tempPassword: PASSWORD,
        active: true,
      },
    })

    expect(result).toEqual({ ok: true, id: 'u-thandi', uuid: PROFILE_ID })
    expect(linkStaffAuthUser).not.toHaveBeenCalled()
    expect(query.mock.calls.some((c) => String(c[0]).includes('auth_user_id'))).toBe(false)
    expect(forgetId).not.toHaveBeenCalled()

    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO users'))
    expect(insert).toBeTruthy()
    const params = insert?.[1] as unknown[]
    expect(params[1]).toBe(AGENCY_ID)
    expect(params[2]).toBe(EMAIL)
    expect(params[6]).toBe('GROUND_AGENT')
    expect(storedHash).toMatch(/^\$2[aby]\$/)
    expect(storedHash).not.toBe(PASSWORD)

    const session = await loginUser(EMAIL, PASSWORD)
    expect(session.email).toBe(EMAIL)
    expect(session.role).toBe('ground_agent')
    expect(session.active).toBe(true)
    expect(session.frontendId).toBe('u-thandi')
  })
})
