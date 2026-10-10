import { describe, expect, it, vi } from 'vitest'

const calls: Array<{ sql: string; params: unknown[] }> = []
vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    return []
  }),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
}))
vi.mock('./idMapCache.js', () => ({
  loadIdMapCache: async () => ({ userBackendToFe: new Map(), backendToFe: new Map(), feToBackend: new Map() }),
}))

describe('P3a follow-up: ?id= units read uses id = ANY($1::uuid[])', () => {
  it('unitIdsAsUuids keeps only uuids', async () => {
    const { unitIdsAsUuids } = await import('./bootstrap.js')
    expect(unitIdsAsUuids(['c4000001-0001-4000-8000-000000000001', 'junk', "1' OR 1=1"])).toEqual(['c4000001-0001-4000-8000-000000000001'])
  })
  it('buildBootstrap({ unitIds }) reads units by uuid ANY (index on units.id), not id::text', async () => {
    const { buildBootstrap } = await import('./bootstrap.js')
    const U = 'c4000001-0001-4000-8000-000000000001'
    await buildBootstrap({ lite: true, unitIds: [U, 'junk'], limits: { messages: 1, notifications: 1, leads: 1, applications: 1, tickets: 1, payments: 1, documents: 1 } }).catch(() => undefined)
    const unitsQ = calls.find((c) => /FROM units WHERE id/.test(c.sql))
    expect(unitsQ?.sql).toBe('SELECT * FROM units WHERE id = ANY($1::uuid[])')
    expect(unitsQ?.params).toEqual([[U]])
    expect(calls.some((c) => /id::text = ANY/.test(c.sql))).toBe(false)
  })
})
