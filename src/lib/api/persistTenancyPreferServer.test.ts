import { afterEach, describe, expect, it, vi } from 'vitest'
import { preferServerPersistForTenancy } from './persist'


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

describe('preferServerPersistForTenancy', () => {
  it('routes tenancy upserts through /api/persist', () => {
    expect(preferServerPersistForTenancy('tenancy', 'upsert')).toBe(true)
  })

  it('does not force deletes or unrelated resources onto the server path', () => {
    expect(preferServerPersistForTenancy('tenancy', 'delete')).toBe(false)
    expect(preferServerPersistForTenancy('application', 'upsert')).toBe(false)
    expect(preferServerPersistForTenancy('payment', 'upsert')).toBe(false)
  })
})

describe('persistToApi tenancy fail-closed (API)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not report success when /api/persist is false-ok HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<!doctype html><html></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
      ),
    )
    const { persistToApi } = await import('./persist')
    const ok = await persistToApi({
      resource: 'tenancy',
      action: 'upsert',
      id: 'tn-r21',
      data: { id: 'tn-r21', propertyId: '0ezv31' },
    })
    expect(ok).toBe(false)
  })

  it('returns true only when /api/persist returns JSON { ok: true }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, id: 'tn-r21', uuid: 'uuid-t' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const { persistToApi } = await import('./persist')
    const ok = await persistToApi({
      resource: 'tenancy',
      action: 'upsert',
      id: 'tn-r21',
      data: { id: 'tn-r21', propertyId: '0ezv31' },
    })
    expect(ok).toBe(true)
  })
})
