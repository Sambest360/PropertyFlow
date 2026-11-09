import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Administrators (platform staff below a super admin): what the user write
 * policy lets them do, and what it pins. Drives the real enforceUserWritePolicy
 * over a tiny in-memory users table.
 */
const query = vi.fn()
vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))
const UUIDS: Record<string, string> = {
  'u-full': '00000000-0000-4000-8000-000000000001',
  'u-adm': '00000000-0000-4000-8000-000000000002',
  'u-adm2': '00000000-0000-4000-8000-000000000003',
  'u-ll': '00000000-0000-4000-8000-000000000004',
}
vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  resolveUuid: vi.fn(async (_t: string, fe: string) => UUIDS[fe] ?? null),
  ensureUuid: vi.fn(async (_t: string, fe: string) => UUIDS[fe] ?? '00000000-0000-4000-8000-00000000ffff'),
  forgetId: vi.fn(),
  isUuid: (v: string) => /^[0-9a-f-]{36}$/i.test(v),
}))

const ROWS: Record<string, { role: string; metadata: Record<string, unknown>; email: string }> = {
  [UUIDS['u-full']]: { role: 'SUPER_ADMIN', metadata: {}, email: 'full@example.com' },
  [UUIDS['u-adm']]: { role: 'SUPER_ADMIN', metadata: { platform_tier: 'administrator' }, email: 'adm@example.com' },
  [UUIDS['u-adm2']]: { role: 'SUPER_ADMIN', metadata: { platform_tier: 'administrator' }, email: 'adm2@example.com' },
  [UUIDS['u-ll']]: { role: 'LANDLORD', metadata: {}, email: 'll@example.com' },
}

beforeEach(() => {
  query.mockReset()
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/FROM users WHERE id = \$1::uuid/.test(sql)) {
      const r = ROWS[String(params[0])]
      return r ? [r] : []
    }
    return []
  })
})

const { enforceUserWritePolicy } = await import('./scopeGate.js')

const full = { userId: 'u-full', role: 'super_admin' as const, agencyId: null }
const adm = { userId: 'u-adm', role: 'super_admin' as const, agencyId: null, platformTier: 'administrator' as const }
const existing = { agencyId: null } as never

function body(id: string, action: 'create' | 'update' | 'delete', data: Record<string, unknown> = {}) {
  return { resource: 'user', id, action, data } as never as Parameters<typeof enforceUserWritePolicy>[1]
}

describe('Administrator tier: user writes', () => {
  it('an Administrator creating platform staff always makes an Administrator', async () => {
    const b = body('u-new', 'create', { role: 'super_admin', platformTier: null, email: 'n@example.com', tempPassword: 'x'.repeat(12) })
    await enforceUserWritePolicy(adm, b, null)
    expect((b as { data: Record<string, unknown> }).data.platformTier).toBe('administrator')
  })

  it('an Administrator cannot change, demote or delete a full super admin', async () => {
    await expect(enforceUserWritePolicy(adm, body('u-full', 'update', { name: 'X' }), existing)).rejects.toThrow(/super admin/)
    await expect(enforceUserWritePolicy(adm, body('u-full', 'delete'), existing)).rejects.toThrow(/delete/)
  })

  it('an Administrator may edit another Administrator, but cannot lift them to super admin', async () => {
    const b = body('u-adm2', 'update', { role: 'super_admin', platformTier: null })
    await enforceUserWritePolicy(adm, b, existing)
    expect((b as { data: Record<string, unknown> }).data.platformTier).toBe('administrator')
  })

  it('an Administrator cannot change their own role or tier', async () => {
    const b = body('u-adm', 'update', { name: 'Me', role: 'super_admin', platformTier: null })
    await enforceUserWritePolicy(adm, b, existing)
    const d = (b as { data: Record<string, unknown> }).data
    expect(d.platformTier).toBeUndefined()
    expect(d.role).toBeUndefined()
    expect(d.name).toBe('Me')
  })

  it('a super admin chooses either tier for someone else, but not for themselves', async () => {
    const make = body('u-adm2', 'update', { role: 'super_admin', platformTier: null })
    await enforceUserWritePolicy(full, make, existing)
    expect((make as { data: Record<string, unknown> }).data.platformTier).toBeNull()
    const down = body('u-ll', 'update', { role: 'super_admin', platformTier: 'administrator' })
    await enforceUserWritePolicy(full, down, existing)
    expect((down as { data: Record<string, unknown> }).data.platformTier).toBe('administrator')
    const self = body('u-full', 'update', { platformTier: 'administrator' })
    await enforceUserWritePolicy(full, self, existing)
    expect((self as { data: Record<string, unknown> }).data.platformTier).toBeUndefined()
  })
})

describe('ADM-4: Administrators and a peer Administrator\'s sign-in email and role', () => {
  const dataOf = (b: unknown) => (b as { data: Record<string, unknown> }).data

  it("an Administrator cannot change another Administrator's email", async () => {
    await expect(enforceUserWritePolicy(adm, body('u-adm2', 'update', { name: 'X', email: 'new@example.com' }), existing)).rejects.toThrow(/sign-in email/)
  })

  it('a peer edit resending the same email passes', async () => {
    const b = body('u-adm2', 'update', { name: 'X', email: ' ADM2@Example.com ', phone: '+27 1', active: false })
    await enforceUserWritePolicy(adm, b, existing)
    expect(dataOf(b)).toMatchObject({ name: 'X', phone: '+27 1', active: false })
  })

  it("an Administrator cannot change another Administrator's role", async () => {
    await expect(enforceUserWritePolicy(adm, body('u-adm2', 'update', { role: 'tenant' }), existing)).rejects.toThrow(/role/)
  })

  it('credential fields on a peer are dropped', async () => {
    const b = body('u-adm2', 'update', { name: 'X', password: 'p'.repeat(12), tempPassword: 't'.repeat(12), passwordHash: 'h' })
    await enforceUserWritePolicy(adm, b, existing)
    const d = dataOf(b)
    expect(['password', 'tempPassword', 'passwordHash'].filter((k) => k in d)).toEqual([])
  })

  it("the owner can still change an Administrator's email and role", async () => {
    const b = body('u-adm2', 'update', { email: 'new@example.com', role: 'tenant' })
    await enforceUserWritePolicy(full, b, existing)
    expect(dataOf(b).email).toBe('new@example.com')
  })

  it('an Administrator can change their own email', async () => {
    await expect(enforceUserWritePolicy(adm, body('u-adm', 'update', { email: 'me2@example.com' }), existing)).resolves.toBeUndefined()
  })
})
