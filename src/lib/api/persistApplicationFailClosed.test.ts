import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'


vi.mock('./config', () => ({
  isApiEnabled: true,
}))

vi.mock('./actorAuth', () => ({
  actorHeaders: () => ({}),
}))

vi.mock('./authClient', () => ({
  authHeaders: () => ({}),
  resolveApiAuthorizationHeader: async () => ({}),
}))

vi.mock('../bootstrapMerge', () => ({
  markLocalPersistWrite: vi.fn(),
}))

describe('persistToApi application fail-closed (API)', () => {
  beforeEach(() => {
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not treat it as success when /api/persist is false-ok HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
    )
    const { persistToApi } = await import('./persist')
    const ok = await persistToApi({
      resource: 'application',
      action: 'upsert',
      id: 'APP-test',
      data: { id: 'APP-test', agencyId: 'ag-x' },
    })
    expect(ok).toBe(false)
  })

  it('returns true when /api/persist returns JSON { ok: true }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, id: 'APP-test', uuid: 'u' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    const { persistToApi } = await import('./persist')
    const ok = await persistToApi({
      resource: 'application',
      action: 'upsert',
      id: 'APP-test',
      data: { id: 'APP-test', agencyId: 'ag-x' },
    })
    expect(ok).toBe(true)
  })
})
