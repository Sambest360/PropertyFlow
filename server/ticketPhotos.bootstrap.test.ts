import { describe, expect, it, vi } from 'vitest'

/**
 * Angela's reload gap: bootstrap sends the stored photo URLs on tickets, and
 * the tenant filter keeps them (plus access notes when present) on the
 * tenant's own reports only — so the tenant view rule holds after a reload.
 */
const T = '00000000-0000-4000-8000-000000000020'
const AG = '00000000-0000-4000-8000-000000000026'
const CA = '00000000-0000-4000-8000-000000000001'
const UN1 = '00000000-0000-4000-8000-000000000010'
const TK_OWN = '00000000-0000-4000-8000-000000000050'
const TK_STAFF = '00000000-0000-4000-8000-000000000051'
const JPEG = 'data:image/jpeg;base64,/9j/4AAQ'

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async (sql: string) => {
    if (/FROM maintenance_tickets/.test(sql)) {
      return [
        { id: TK_OWN, client_id: CA, unit_id: UN1, reported_by: T, title: 'Leak', description: 'Tap drips', priority: 'MEDIUM', status: 'OPEN', photos: [JPEG, 'https://cdn.example/p.jpg'], created_at: new Date('2026-10-01') },
        { id: TK_STAFF, client_id: CA, unit_id: UN1, reported_by: AG, title: 'Inspection', description: 'Staff', priority: 'MEDIUM', status: 'OPEN', photos: [JPEG], created_at: new Date('2026-10-02') },
      ]
    }
    if (/FROM users ORDER BY email/.test(sql)) {
      return [
        { id: T, email: 'tess@x.test', name: 'Tess', role: 'END_USER', client_id: null, metadata: { frontend_id: 'u-t' } },
        { id: AG, email: 'annie@x.test', name: 'Annie', role: 'GROUND_AGENT', client_id: CA, metadata: { frontend_id: 'u-agent' } },
      ]
    }
    return []
  }),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))

describe('bootstrap ticket photos after reload', () => {
  it('sends photoUrls from the stored photos', async () => {
    const { buildBootstrap } = await import('./bootstrap.js')
    const data = (await buildBootstrap()) as { tickets: Array<Record<string, unknown>> }
    const own = data.tickets.find((t) => t.description === 'Tap drips')!
    expect(own.photoUrls).toEqual([JPEG, 'https://cdn.example/p.jpg'])
    expect(own.photos).toBe(2)
  })

  it("after a reload the tenant keeps photos on their own report, not on staff's", async () => {
    const { buildBootstrap } = await import('./bootstrap.js')
    const { filterBootstrapForActor } = await import('./scopeGate.js')
    const { buildPropertyScope } = await import('../src/lib/scope.js')
    const data = await buildBootstrap()
    // A staff ticket linked to the tenant's Active tenancy.
    const raw = {
      ...data,
      tenancies: [{ id: 'L-t', tenantUserId: 'u-t', propertyId: 'p-1', status: 'Active', leaseStatus: 'active' }],
      tickets: (data.tickets as Array<Record<string, unknown>>).map((t) =>
        t.description === 'Staff' ? { ...t, tenancyId: 'L-t' } : t,
      ),
    }
    const actor = { userId: 'u-t', role: 'tenant', agencyId: null }
    const scope = buildPropertyScope({ role: 'tenant', userId: 'u-t', agencyId: null, agencySuspended: false }, { properties: [] } as never)
    const out = filterBootstrapForActor(raw as never, actor as never, scope, new Set(['u-t', T]))
    const own = (out.tickets as Array<Record<string, unknown>>).find((t) => t.description === 'Tap drips')!
    const staff = (out.tickets as Array<Record<string, unknown>>).find((t) => t.description === 'Staff')!
    expect(own.reportedByUserId).toBe('u-t')
    expect(own.photoUrls).toEqual([JPEG, 'https://cdn.example/p.jpg'])
    expect(staff).not.toHaveProperty('photoUrls')
    expect(staff).not.toHaveProperty('photos')
  })
})
