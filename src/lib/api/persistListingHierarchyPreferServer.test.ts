import { afterEach, describe, expect, it, vi } from 'vitest'
import { preferServerPersistForListingHierarchy } from './persist'

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

describe('preferServerPersistForListingHierarchy', () => {
  it('routes building/unit/property upserts through /api/persist', () => {
    expect(preferServerPersistForListingHierarchy('building', 'upsert')).toBe(true)
    expect(preferServerPersistForListingHierarchy('unit', 'upsert')).toBe(true)
    expect(preferServerPersistForListingHierarchy('property', 'upsert')).toBe(true)
  })

  it('does not force deletes or unrelated resources onto the server path', () => {
    expect(preferServerPersistForListingHierarchy('building', 'delete')).toBe(false)
    expect(preferServerPersistForListingHierarchy('room', 'upsert')).toBe(false)
    expect(preferServerPersistForListingHierarchy('application', 'upsert')).toBe(false)
    expect(preferServerPersistForListingHierarchy('lead', 'upsert')).toBe(false)
  })
})

describe('persistToApi listing hierarchy fail-closed (supabase mode)', () => {
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
      resource: 'building',
      action: 'upsert',
      id: 'bld-r14d',
      data: {
        id: 'bld-r14d',
        clientId: 'ag-rhtxlh',
        name: 'Green Point',
        landlordId: 'u-ll-r12',
      },
    })
    expect(ok).toBe(false)
    expect(persistToSupabase).not.toHaveBeenCalled()
  })

  it('returns true only when /api/persist returns JSON { ok: true }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: true, id: 'bld-r14d', uuid: 'uuid-b' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const { persistToApi } = await import('./persist')
    const ok = await persistToApi({
      resource: 'unit',
      action: 'upsert',
      id: 'unt-ezas24',
      data: { id: 'unt-ezas24', buildingId: 'bld-r14d', agentId: 'u-fa-r14' },
    })
    expect(ok).toBe(true)
    expect(persistToSupabase).not.toHaveBeenCalled()
  })
})
