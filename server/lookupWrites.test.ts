import { describe, expect, it, vi } from 'vitest'

const query = vi.fn(async () => [])

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...(args as [])),
  withTransaction: async (fn: (c: unknown) => Promise<unknown>) => fn({}),
  clientQuery: async (_c: unknown, sql: string, params?: unknown[]) => query(...([sql, params] as unknown as [])),
  pool: { query: (...args: unknown[]) => query(...(args as [])) },
}))
vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  resolveUuid: vi.fn(async () => null),
  ensureUuid: vi.fn(async () => '00000000-0000-4000-8000-000000000001'),
  forgetId: vi.fn(),
  isUuid: () => false,
}))
vi.mock('./supabase/registerUser.js', () => ({ linkStaffAuthUser: vi.fn() }))

describe('lookup saves', () => {
  it('refuses built-in (global) rows instead of filing them under a stand-in agency', async () => {
    const { handlePersist } = await import('./writes.js')
    for (const clientId of ['global', '', undefined]) {
      await expect(
        handlePersist({
          resource: 'lookup',
          action: 'upsert',
          id: 'lk-1',
          data: { clientId, configType: 'PROPERTY_TYPE', keyValue: 'House', displayLabel: 'Home' },
        } as never),
      ).rejects.toMatchObject({ status: 400, message: 'Choose an agency to save configuration' })
    }
    expect(query.mock.calls.some((c) => String((c as unknown[])[0]).includes('client_lookup_configs'))).toBe(false)
  })
})
