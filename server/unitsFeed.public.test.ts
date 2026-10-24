import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: Array<{ sql: string; params: unknown[] }> = []
vi.mock('./db.js', () => ({
  query: vi.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params })
    return []
  }),
}))

import { fetchUnitsPage } from './unitsFeed.js'

describe('GET /api/v1/units (no auth) only reads publicly listed units', () => {
  beforeEach(() => { calls.length = 0 })

  it('filters status, not_listed and pending/rejected landlords, with and without client/cursor', async () => {
    await fetchUnitsPage({})
    await fetchUnitsPage({ clientId: '00000000-0000-0000-0000-000000000001', limit: 5 })
    for (const { sql } of calls) {
      expect(sql).toMatch(/u\.status_config_key IN \('PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE'\)/)
      expect(sql).toMatch(/<> 'not_listed'/)
      expect(sql).toMatch(/NOT IN \('pending', 'rejected'\)/)
      expect(sql).not.toMatch(/WHERE 1=1/)
      // card columns only: no contact, metadata or owner columns
      const select = sql.slice(0, sql.indexOf('FROM units'))
      expect(select).not.toMatch(/email|phone|metadata|landlord|agent_id|ll\./)
    }
    expect(calls[1].params).toEqual(['00000000-0000-0000-0000-000000000001', 6])
    expect(calls[1].sql).toMatch(/AND u\.client_id = \$1::uuid/)
    expect(calls[1].sql).toMatch(/LIMIT \$2/)
  })
})
