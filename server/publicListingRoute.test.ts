/**
 * P3a: drives the real Hono route GET /api/public/marketplace?id=. Only the
 * pg driver, the bootstrap builder and the listing resolver are faked.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.DATABASE_URL = 'postgres://pf:pf@127.0.0.1:5432/pf_test'
  process.env.AUTH_SECRET = 'test-secret-public-listing'
  delete process.env.VERCEL
})

const calls = vi.hoisted(() => ({ build: [] as Array<Record<string, unknown>> }))

vi.mock('pg', () => {
  class Pool {
    on() {}
    async query() {
      return { rows: [], rowCount: 0 }
    }
    async connect() {
      return { query: async () => ({ rows: [], rowCount: 0 }), release() {} }
    }
    async end() {}
  }
  return { default: { Pool, types: { setTypeParser() {} } }, Pool, types: { setTypeParser() {} } }
})

// Listing fixtures keyed by unit uuid.
const LISTINGS: Record<string, { id: string; status: string; landlordId: string }> = {
  'uuid-pub': { id: 'p-pub', status: 'Published', landlordId: 'u-ok' },
  'uuid-draft': { id: 'p-draft', status: 'Draft', landlordId: 'u-ok' },
  'uuid-unverified': { id: 'p-unverified', status: 'Published', landlordId: 'u-pending' },
}

vi.mock('./listingResolve', () => ({
  resolveLiveListing: async (id: string) => {
    const hit = Object.entries(LISTINGS).find(([, v]) => v.id === id)
    if (!hit) throw new Error('unknown listing')
    return { unitId: hit[0], clientId: 'c-1' }
  },
}))

vi.mock('./bootstrap', () => ({
  buildBootstrap: async (opts: { unitIds?: string[] }) => {
    calls.build.push(opts as Record<string, unknown>)
    const ids = opts.unitIds ?? Object.keys(LISTINGS)
    return {
      source: 'postgres',
      users: [
        { id: 'u-ok', role: 'landlord', email: 'ok@example.com', verification: { status: 'approved' } },
        { id: 'u-pending', role: 'landlord', email: 'p@example.com', verification: { status: 'pending' } },
        { id: 'u-ag', role: 'agent', name: 'Agent A', email: 'agent@example.com' },
      ],
      agencies: [{ id: 'ag-1', name: 'Agency' }],
      buildings: [],
      units: [],
      properties: ids
        .map((u) => LISTINGS[u])
        .filter(Boolean)
        .map((l) => ({ ...l, agencyId: 'ag-1', agentId: 'u-ag', images: ['a', 'b', 'c'] })),
    }
  },
}))

type App = { request: (path: string) => Promise<Response> }
let app: App
beforeAll(async () => {
  app = (await import('./index')).default as unknown as App
})

describe('GET /api/public/marketplace?id= (route)', () => {
  it('published listing: 200, all photos, no landlordId, agentId, emails or users', async () => {
    calls.build.length = 0
    const res = await app.request('/api/public/marketplace?id=p-pub')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    const props = body.properties as Array<Record<string, unknown>>
    expect(props).toHaveLength(1)
    expect(props[0].images).toEqual(['a', 'b', 'c'])
    expect(props[0].landlordId).toBe('')
    expect(props[0].agentId).toBeNull()
    expect(JSON.stringify(body)).not.toMatch(/@example\.com/)
    expect(body.users ?? []).toEqual([])
    // Units query limited to the one listing, lite mode.
    expect(calls.build).toEqual([expect.objectContaining({ lite: true, unitIds: ['uuid-pub'] })])
  })
  it('draft listing: 404', async () => {
    expect((await app.request('/api/public/marketplace?id=p-draft')).status).toBe(404)
  })
  it('unverified landlord: 404', async () => {
    expect((await app.request('/api/public/marketplace?id=p-unverified')).status).toBe(404)
  })
  it('unknown id: 404', async () => {
    expect((await app.request('/api/public/marketplace?id=p-nope')).status).toBe(404)
  })
  it('malformed id: 404 without a lookup', async () => {
    calls.build.length = 0
    expect((await app.request('/api/public/marketplace?id=' + encodeURIComponent("p'; drop"))).status).toBe(404)
    expect(calls.build).toEqual([])
  })
})
