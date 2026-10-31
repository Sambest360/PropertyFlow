/**
 * fetchPostgresBootstrap no longer waits on GET /api/health (same as #74 for
 * persist), and it sends the session: Bearer token from login plus the
 * same-origin pf_session cookie (credentials: 'include'). Guests read the
 * published-listings slice from /api/public/marketplace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./config', () => ({ isApiEnabled: true }))
vi.mock('./authClient', () => ({ authHeaders: () => ({ Authorization: 'Bearer session-token' }) }))

const calls: Array<{ url: string; init?: RequestInit }> = []

describe('postgres bootstrap client', () => {
  beforeEach(() => {
    calls.length = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        calls.push({ url, init })
        if (url.includes('/api/health')) {
          // Never answers: a bootstrap that waited on it would hang / return null.
          return new Promise<Response>(() => undefined)
        }
        return Response.json({ source: 'postgres', properties: [{ id: 'PR-1' }], users: [] })
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not call /api/health before /api/bootstrap', async () => {
    const { fetchPostgresBootstrap } = await import('./postgresClient')
    const boot = await fetchPostgresBootstrap(2500, { userId: 'u-tenant', role: 'tenant', agencyId: null })
    expect(boot).not.toBeNull()
    expect(calls.map((c) => c.url)).toEqual(['/api/bootstrap?lite=1'])
  })

  it('sends the session bearer token and cookie credentials on /api/bootstrap', async () => {
    const { fetchPostgresBootstrap } = await import('./postgresClient')
    await fetchPostgresBootstrap(2500, { userId: 'u-tenant', role: 'tenant', agencyId: null })
    const init = calls[0]!.init!
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token')
    expect(init.credentials).toBe('include')
  })

  it('guest marketplace reads /api/public/marketplace without identity headers', async () => {
    const { fetchPublicMarketplaceFromApi } = await import('./postgresClient')
    const boot = await fetchPublicMarketplaceFromApi()
    expect(boot?.properties).toHaveLength(1)
    expect(calls.map((c) => c.url)).toEqual(['/api/public/marketplace'])
    expect(calls[0]!.init?.headers).toBeUndefined()
  })

  it('nearest-first browse: only the rounded point, in a header (never the URL), until cleared', async () => {
    const { fetchPublicMarketplaceFromApi, setMarketplaceNearPoint } = await import('./postgresClient')
    expect(setMarketplaceNearPoint({ lat: -33.98456, lng: 25.58321, mode: 'rent' })).toBe(true)
    expect(setMarketplaceNearPoint({ lat: -33.9849, lng: 25.5801, mode: 'rent' })).toBe(false)
    calls.length = 0
    await fetchPublicMarketplaceFromApi()
    expect(calls.map((c) => c.url)).toEqual(['/api/public/marketplace'])
    expect(calls[0]!.init?.headers).toEqual({ 'X-Browse-Near': '-33.98,25.58,rent' })
    expect(setMarketplaceNearPoint(null)).toBe(true)
    calls.length = 0
    await fetchPublicMarketplaceFromApi()
    expect(calls[0]!.init?.headers).toBeUndefined()
  })
})
