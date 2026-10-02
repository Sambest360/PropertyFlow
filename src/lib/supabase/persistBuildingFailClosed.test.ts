import { afterEach, describe, expect, it, vi } from 'vitest'

const upsertMock = vi.fn()

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'entity_id_map') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null }),
              }),
            }),
          }),
          upsert: upsertMock,
        }
      }
      if (table === 'buildings') {
        return {
          upsert: upsertMock,
        }
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
            maybeSingle: async () => ({ data: null }),
          }),
        }),
        upsert: upsertMock,
      }
    },
  }),
}))

describe('browser supabase persist — upsertBuilding fail-closed', () => {
  afterEach(() => {
    vi.resetModules()
    upsertMock.mockReset()
  })

  it('returns false when buildings upsert reports an RLS/constraint error', async () => {
    // First call(s): entity_id_map lookup miss + map upsert ok; then buildings fails.
    let mapUpserts = 0
    upsertMock.mockImplementation(async (payload: unknown) => {
      const isMap =
        Array.isArray(payload) ||
        (payload &&
          typeof payload === 'object' &&
          'entity_type' in (payload as Record<string, unknown>))
      if (isMap || (payload && typeof payload === 'object' && !('name' in (payload as object)))) {
        mapUpserts += 1
        return { error: null }
      }
      return { error: { message: 'new row violates row-level security policy' } }
    })

    // More reliable: sequence by call count — map upsert first, then building.
    upsertMock.mockReset()
    upsertMock
      .mockResolvedValueOnce({ error: null }) // entity_id_map
      .mockResolvedValueOnce({
        error: { message: 'new row violates row-level security policy' },
      }) // buildings

    const { persistToSupabase } = await import('./persist')
    const ok = await persistToSupabase({
      resource: 'building',
      action: 'upsert',
      id: 'bld-r14d-fail',
      data: {
        id: 'bld-r14d-fail',
        clientId: 'ag-rhtxlh',
        name: 'Green Point Residences',
        addressLine1: '1 Beach Rd',
        city: 'Cape Town',
        landlordId: null,
      },
    })
    expect(ok).toBe(false)
  })

  it('returns false when entity_id_map upsert fails (map fail-closed)', async () => {
    upsertMock.mockResolvedValueOnce({
      error: { message: 'new row violates row-level security policy' },
    })

    const { persistToSupabase } = await import('./persist')
    const ok = await persistToSupabase({
      resource: 'building',
      action: 'upsert',
      id: 'bld-r14d-map',
      data: {
        id: 'bld-r14d-map',
        clientId: 'ag-rhtxlh',
        name: 'Map Fail Building',
      },
    })
    expect(ok).toBe(false)
  })
})
