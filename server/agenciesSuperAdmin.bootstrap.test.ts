import { describe, expect, it, vi } from 'vitest'

/**
 * The super admin (client_id NULL) sees every clients row as an agency —
 * century 21 and a landlord portfolio, both aliased in entity_id_map — and
 * bootstrap reads entity_id_map once and notifications per actor.
 */

const C21 = 'f2a29694-8440-4dab-93a7-ed1bb917b2c5'
const PORT = '918c7b2f-d24c-4372-aee6-28fdeb969dfe'
const SA = 'cf53490a-e29f-402a-a85b-7d0d78253855'

const sqlLog: Array<{ sql: string; params?: unknown[] }> = []

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async (sql: string, params?: unknown[]) => {
    sqlLog.push({ sql, params })
    if (/FROM clients/.test(sql)) {
      return [
        { id: PORT, company_name: 'Amos Miller Portfolio', subdomain: 'll-1e4f2b11', status: 'active', city: '', created_at: new Date('2026-10-25'), settings: { portfolio: true, frontend_id: 'ag-ll-1e4f2b11' } },
        { id: C21, company_name: 'century 21', subdomain: 'century-21', status: 'active', city: 'Port Elizabeth', created_at: new Date('2026-10-15'), settings: { frontend_id: 'ag-14gu4m' } },
      ]
    }
    if (/FROM entity_id_map/.test(sql)) {
      return [
        { entity_type: 'agency', frontend_id: 'ag-14gu4m', backend_id: C21 },
        { entity_type: 'agency', frontend_id: 'ag-ll-1e4f2b11', backend_id: PORT },
        { entity_type: 'user', frontend_id: 'u-acce2ada', backend_id: SA },
      ]
    }
    if (/FROM users/.test(sql)) {
      return [{ id: SA, email: 'sa@x.test', first_name: 'S', last_name: 'A', role: 'SUPER_ADMIN', client_id: null, active: true, metadata: { frontend_id: 'u-acce2ada', frontend_role: 'super_admin' } }]
    }
    return []
  }),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))

describe('super admin sees every agency', () => {
  it('bootstrap + actor filter keep both clients rows', async () => {
    const { buildBootstrap } = await import('./bootstrap.js')
    const { filterBootstrapForActor, buildActorPropertyScope } = await import('./scopeGate.js')
    for (const lite of [true, false]) {
      const data = await buildBootstrap({ lite })
      const actor = { userId: 'u-acce2ada', role: 'super_admin', agencyId: null }
      const scope = await buildActorPropertyScope(actor as never)
      const out = filterBootstrapForActor(data as never, actor as never, scope, new Set(['u-acce2ada', SA]))
      expect((out.agencies as Array<{ id: string }>).map((a) => a.id).sort()).toEqual(['ag-14gu4m', 'ag-ll-1e4f2b11'])
    }
  })

  it('reads entity_id_map once per bootstrap (no second alias pass)', async () => {
    const { buildBootstrap } = await import('./bootstrap.js')
    sqlLog.length = 0
    await buildBootstrap({ lite: true })
    const reads = sqlLog.filter((q) => /^\s*SELECT[\s\S]*FROM entity_id_map/.test(q.sql))
    expect(reads).toHaveLength(1)
  })

  it('scopes the notifications read to the actor when asked', async () => {
    const { buildBootstrap } = await import('./bootstrap.js')
    sqlLog.length = 0
    await buildBootstrap({ lite: true, limits: { notifications: 60 }, notificationsFor: { userUuids: ['u-agent', SA], clientUuid: C21 } })
    const notes = sqlLog.find((q) => /FROM notifications/.test(q.sql))!
    expect(notes.sql).toMatch(/WHERE user_id = ANY\(\$2::uuid\[\]\)/)
    // Front-end ids never reach a uuid[] parameter.
    expect(notes.params).toEqual([60, [SA], C21])

    sqlLog.length = 0
    await buildBootstrap({ lite: true })
    const all = sqlLog.find((q) => /FROM notifications/.test(q.sql))!
    expect(all.sql).not.toMatch(/WHERE/)
  })
})
