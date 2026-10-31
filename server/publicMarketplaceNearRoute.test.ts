/**
 * Nearest-first browse: drives the real Hono route GET /api/public/marketplace
 * with and without the X-Browse-Near header. Only the pg driver, the
 * bootstrap builder and the nearest-unit picker are faked.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  process.env.DATABASE_URL = 'postgres://pf:pf@127.0.0.1:5432/pf_test'
  process.env.AUTH_SECRET = 'test-secret-public-marketplace-near'
})

const calls = vi.hoisted(() => ({
  build: [] as Array<Record<string, unknown>>,
  near: [] as Array<Record<string, unknown>>,
}))

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

vi.mock('./marketplaceNear', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./marketplaceNear')>()),
  nearestPublicUnitIds: async (point: Record<string, unknown>) => {
    calls.near.push(point)
    return ['uuid-near-1', 'uuid-near-2']
  },
}))

vi.mock('./bootstrap', () => ({
  buildBootstrap: async (opts: Record<string, unknown>) => {
    calls.build.push(opts)
    return {
      source: 'postgres',
      users: [{ id: 'u-ag', role: 'agent', name: 'Agent A', email: 'agent@example.com' }],
      agencies: [{ id: 'ag-1', name: 'Agency' }],
      buildings: [],
      units: [],
      properties: [
        { id: 'p-pub', status: 'Published', agencyId: 'ag-1', agentId: 'u-ag', lat: -33.98765, lng: 25.58765, images: ['a', 'b'] },
        { id: 'p-draft', status: 'Draft', agencyId: 'ag-1', agentId: 'u-ag', images: [] },
      ],
    }
  },
}))

type App = { request: (path: string, init?: RequestInit) => Promise<Response> }
let app: App
beforeAll(async () => {
  app = (await import('./index')).default as unknown as App
})
beforeEach(() => {
  calls.build.length = 0
  calls.near.length = 0
})

describe('GET /api/public/marketplace with a near point', () => {
  it('loads the nearest public units (rounded point + mode) through the same guest filter, uncached', async () => {
    const res = await app.request('/api/public/marketplace', {
      headers: { 'X-Browse-Near': '-33.98456,25.58321,rent' },
    })
    expect(res.status).toBe(200)
    expect(calls.near).toEqual([{ lat: -33.98, lng: 25.58, mode: 'rent' }])
    expect(calls.build).toHaveLength(1)
    expect(calls.build[0].unitIds).toEqual(['uuid-near-1', 'uuid-near-2'])
    expect(calls.build[0].lite).toBe(true)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Vary')).toContain('X-Browse-Near')
    const body = (await res.json()) as Record<string, unknown>
    const props = body.properties as Array<Record<string, unknown>>
    // filterBootstrapForGuest unchanged: drafts out, agent id out, coords rounded, one photo.
    expect(props.map((p) => p.id)).toEqual(['p-pub'])
    expect(props[0].agentId ?? null).toBeNull()
    expect(props[0].lat).toBe(-33.99)
    expect(props[0].images).toEqual(['a'])
    expect(body.users ?? []).toEqual([])
  })

  it('the full (?lite=0) read keeps its full payload around the point', async () => {
    const res = await app.request('/api/public/marketplace?lite=0', { headers: { 'X-Browse-Near': '-33.98,25.58' } })
    expect(res.status).toBe(200)
    expect(calls.near).toEqual([{ lat: -33.98, lng: 25.58, mode: null }])
    expect(calls.build[0].lite).toBe(false)
    expect(calls.build[0].unitIds).toEqual(['uuid-near-1', 'uuid-near-2'])
  })

  it('no point: the newest-60 window as before (no unit ids, no near lookup)', async () => {
    const res = await app.request('/api/public/marketplace')
    expect(res.status).toBe(200)
    expect(calls.near).toEqual([])
    expect(calls.build).toHaveLength(1)
    expect(calls.build[0].unitIds).toBeUndefined()
    expect(calls.build[0].lite).toBe(true)
    expect((calls.build[0].limits as Record<string, number>).units).toBe(60)
    expect(res.headers.get('Cache-Control')).not.toBe('private, no-store')
  })

  it('a malformed point falls back to the newest window', async () => {
    const res = await app.request('/api/public/marketplace', { headers: { 'X-Browse-Near': 'nowhere' } })
    expect(res.status).toBe(200)
    expect(calls.near).toEqual([])
    expect(calls.build[0].unitIds).toBeUndefined()
  })

  it('never logs the point', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m))
    await app.request('/api/public/marketplace', { headers: { 'X-Browse-Near': '-33.98456,25.58321' } })
    const logged = spies.flatMap((s) => s.mock.calls.flat().map(String)).join('\n')
    spies.forEach((s) => s.mockRestore())
    expect(logged).not.toMatch(/-33\.98|25\.58/)
  })
})
