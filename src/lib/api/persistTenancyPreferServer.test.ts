import { afterEach, describe, expect, it, vi } from 'vitest'
import { preferServerPersistForTenancy } from './persist'

const persistToSupabase = vi.fn(async () => true)

vi.mock('./config', () => ({
  isApiEnabled: false,
  isSupabaseMode: true,
}))

vi.mock('../supabase/persist', () => ({
  persistToSupabase: (...args: unknown[]) => persistToSupabase(...args),
  persistBatchToSupabase: vi.fn(async () => true),
  supabaseMarkNotificationsRead: vi.fn(async () => true),
}))

vi.mock('./actorAuth', () => ({
  actorHeaders: () => ({}),
}))

vi.mock('./authClient', () => ({
  authHeaders: () => ({}),
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

describe('persistToApi tenancy fail-closed (supabase mode)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    persistToSupabase.mockClear()
  })

  it('does not soft-true via browser supabase when /api/persist is false-ok HTML', async () => {
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
    expect(persistToSupabase).not.toHaveBeenCalled()
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
    expect(persistToSupabase).not.toHaveBeenCalled()
  })
})
