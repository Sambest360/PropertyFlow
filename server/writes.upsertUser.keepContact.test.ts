import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A redacted bootstrap user (no email / phone) written back through
 * /api/persist must not wipe the stored contact details.
 */
const query = vi.fn()
const PROFILE_ID = '66666666-6666-4666-8666-666666666666'
const AGENCY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  ensureUuid: vi.fn(async () => PROFILE_ID),
  resolveUuid: vi.fn(async (type: string) => (type === 'agency' ? AGENCY_ID : null)),
  forgetId: vi.fn(async () => undefined),
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

vi.mock('./supabase/registerUser.js', () => ({ linkStaffAuthUser: vi.fn() }))

/** Tiny model of the users row so the ON CONFLICT branch can be checked. */
type Stored = { email: string; phone: string | null }

function applyUpsert(sql: string, params: unknown[], stored: Stored): Stored {
  const pick = (col: 'email' | 'phone', excluded: unknown): unknown => {
    const m = sql.match(new RegExp(`${col} = CASE WHEN \\$(\\d+)::boolean THEN EXCLUDED\\.${col} ELSE users\\.${col} END`))
    if (!m) {
      // Unconditional overwrite (old behaviour).
      return sql.includes(`${col} = EXCLUDED.${col}`) ? excluded : stored[col]
    }
    return params[Number(m[1]) - 1] ? excluded : stored[col]
  }
  return {
    email: String(pick('email', params[2])),
    phone: (pick('phone', params[5]) as string | null) ?? null,
  }
}

describe('upsertUser keeps stored email and phone when the payload omits them', () => {
  let stored: Stored
  beforeEach(() => {
    stored = { email: 'thandi@horizon.test', phone: '+27 82 000 0000' }
    query.mockReset()
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO users')) stored = applyUpsert(sql, params ?? [], stored)
      return []
    })
  })
  afterEach(() => {
    vi.resetModules()
  })

  it('a redacted write-back (no email, no phone) leaves both unchanged', async () => {
    const { handlePersist } = await import('./writes.js')
    await handlePersist({
      resource: 'user',
      action: 'upsert',
      id: 'u-thandi',
      data: { name: 'Thandi Dlamini', role: 'ground_agent', agencyId: 'ag-horizon', active: true },
    })
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT INTO users'))).toBe(true)
    expect(stored).toEqual({ email: 'thandi@horizon.test', phone: '+27 82 000 0000' })
  })

  it('blank email and phone also count as missing', async () => {
    const { handlePersist } = await import('./writes.js')
    await handlePersist({
      resource: 'user',
      action: 'upsert',
      id: 'u-thandi',
      data: { name: 'Thandi Dlamini', role: 'ground_agent', agencyId: 'ag-horizon', email: '', phone: '' },
    })
    expect(stored).toEqual({ email: 'thandi@horizon.test', phone: '+27 82 000 0000' })
  })

  it('a payload that carries email and phone still updates them', async () => {
    const { handlePersist } = await import('./writes.js')
    await handlePersist({
      resource: 'user',
      action: 'upsert',
      id: 'u-thandi',
      data: {
        name: 'Thandi Dlamini',
        role: 'ground_agent',
        agencyId: 'ag-horizon',
        email: 'New@Horizon.test',
        phone: '+27 83 111 1111',
      },
    })
    expect(stored).toEqual({ email: 'new@horizon.test', phone: '+27 83 111 1111' })
  })

  it('keeps contact details on the password branch too', async () => {
    const { handlePersist } = await import('./writes.js')
    await handlePersist({
      resource: 'user',
      action: 'upsert',
      id: 'u-thandi',
      data: { name: 'Thandi Dlamini', role: 'ground_agent', agencyId: 'ag-horizon', passwordHash: '$2b$10$abc' },
    })
    expect(stored).toEqual({ email: 'thandi@horizon.test', phone: '+27 82 000 0000' })
  })
})
