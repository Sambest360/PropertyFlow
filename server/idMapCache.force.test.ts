import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.hoisted(() => vi.fn())
const resolveUuid = vi.hoisted(() => vi.fn())

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
}))

vi.mock('./entityMap.js', async () => {
  const actual = await vi.importActual<typeof import('./entityMap.js')>('./entityMap.js')
  return { ...actual, ensureEntityMapTable: vi.fn(async () => undefined), resolveUuid: (...a: unknown[]) => resolveUuid(...a) }
})

import { invalidateIdMapCache, loadIdMapCache } from './idMapCache.js'

const NEW_AGENCY_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const NEW_AGENCY_FE = 'ag-fresh-create'

beforeEach(() => {
  invalidateIdMapCache()
  query.mockReset()
  resolveUuid.mockResolvedValue(null)
})

describe('loadIdMapCache force refresh (FW-14 agency create)', () => {
  it('force=true reloads agency rows after invalidate (simulates cross-instance create)', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM entity_id_map')) {
        return [{ entity_type: 'agency', frontend_id: NEW_AGENCY_FE, backend_id: NEW_AGENCY_UUID }]
      }
      if (sql.includes('FROM users')) return []
      return []
    })

    const first = await loadIdMapCache(true)
    expect(first.agencyBackendToFe.get(NEW_AGENCY_UUID)).toBe(NEW_AGENCY_FE)

    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM entity_id_map')) {
        return [
          { entity_type: 'agency', frontend_id: NEW_AGENCY_FE, backend_id: NEW_AGENCY_UUID },
          { entity_type: 'agency', frontend_id: 'ag-second', backend_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
        ]
      }
      if (sql.includes('FROM users')) return []
      return []
    })

    const withinTtl = await loadIdMapCache()
    expect(withinTtl.agencyBackendToFe.size).toBe(1)

    const fresh = await loadIdMapCache(true)
    expect(fresh.agencyBackendToFe.size).toBe(2)
    expect(fresh.agencyBackendToFe.get('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toBe('ag-second')
  })
})
