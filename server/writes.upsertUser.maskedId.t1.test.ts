import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T1 ruling (a): super admin holds other users' IDs masked. A user row saved
 * back with a masked ID (or a verification profile with one) must never
 * overwrite the stored ID.
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

const FULL = '7505055009081'
const MASKED = '•••••••••9081'

describe('upsertUser never writes a masked ID number', () => {
  let written: Record<string, unknown> | null
  beforeEach(() => {
    written = null
    query.mockReset()
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT 1 AS ok FROM users WHERE id =')) return [{ ok: 1 }]
      if (sql.includes('INSERT INTO users')) written = JSON.parse(String((params ?? [])[8]))
      return []
    })
  })
  afterEach(() => {
    vi.resetModules()
  })

  async function save(data: Record<string, unknown>) {
    const { handlePersist } = await import('./writes.js')
    await handlePersist({ resource: 'user', action: 'upsert', id: 'u-ll', data: { name: 'Lerato', role: 'landlord', ...data } })
    expect(written).toBeTruthy()
    return written!
  }

  it('pin (SA write-back): a masked users[] ID and a masked verification profile keep the stored values', async () => {
    const meta = await save({
      idNumberOrPassport: MASKED,
      verification: { status: 'approved', profile: { company: 'LL Pty', idNumberOrPassport: MASKED } },
    })
    expect(meta).not.toHaveProperty('idNumberOrPassport')
    expect(meta.verification).toEqual({ status: 'approved' })
    expect(JSON.stringify(meta)).not.toContain('\u2022')
  })

  it('a full ID and a full verification profile are still written', async () => {
    const meta = await save({
      idNumberOrPassport: FULL,
      verification: { status: 'pending', profile: { idNumberOrPassport: FULL } },
    })
    expect(meta.idNumberOrPassport).toBe(FULL)
    expect(meta.verification).toEqual({ status: 'pending', profile: { idNumberOrPassport: FULL } })
  })
})
