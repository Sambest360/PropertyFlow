import { afterEach, describe, expect, it, vi } from 'vitest'

const UNIT_UUID = 'f16a0259-aaaa-4bbb-8ccc-ddddeeee0001'

type MapRow = { entity_type: string; frontend_id: string; backend_id: string }

const mapRows: MapRow[] = []
const leasesUpsert = vi.fn()
const entityMapUpsert = vi.fn(async () => ({ error: null }))

function chainMaybeSingle(result: { data: unknown }) {
  const terminal = {
    maybeSingle: async () => result,
    limit: () => ({
      maybeSingle: async () => result,
    }),
    order: () => ({
      limit: () => ({
        maybeSingle: async () => result,
      }),
    }),
    neq: () => ({
      // delete chain
    }),
  }
  const eq2 = () => ({
    ...terminal,
    eq: () => terminal,
    maybeSingle: async () => result,
  })
  return {
    select: () => ({
      eq: (_col: string, val: string) => {
        // First eq is often entity_type or id; second is frontend_id / etc.
        return {
          eq: (_col2: string, val2: string) => {
            const hit = mapRows.find((r) => r.entity_type === val && r.frontend_id === val2)
            return {
              maybeSingle: async () => ({ data: hit ? { backend_id: hit.backend_id } : null }),
            }
          },
          maybeSingle: async () => {
            // users / leases lookups by single eq
            if (_col === 'id' && val === UNIT_UUID) {
              return { data: { buildings: { landlord_id: 'llll1111-aaaa-4bbb-8ccc-ddddeeee0002' } } }
            }
            if (_col === 'application_id') return { data: null }
            return { data: null }
          },
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
          neq: async () => ({ error: null }),
        }
      },
    }),
    upsert: (payload: unknown) => {
      // Distinguish entity_id_map vs leases by shape
      if (
        payload &&
        typeof payload === 'object' &&
        'entity_type' in (payload as object)
      ) {
        return entityMapUpsert(payload)
      }
      if (Array.isArray(payload)) return entityMapUpsert(payload)
      return leasesUpsert(payload)
    },
    delete: () => ({
      eq: () => ({
        eq: () => ({
          neq: async () => ({ error: null }),
        }),
      }),
    }),
  }
}

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'entity_id_map') {
        return {
          select: () => ({
            eq: (_c1: string, entityType: string) => ({
              eq: (_c2: string, frontendId: string) => ({
                maybeSingle: async () => {
                  const hit = mapRows.find(
                    (r) => r.entity_type === entityType && r.frontend_id === frontendId,
                  )
                  return { data: hit ? { backend_id: hit.backend_id } : null }
                },
              }),
            }),
          }),
          upsert: entityMapUpsert,
          delete: () => ({
            eq: () => ({
              eq: () => ({
                neq: async () => ({ error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'leases') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null }),
                }),
              }),
            }),
          }),
          upsert: async (payload: unknown) => {
            leasesUpsert(payload)
            return { error: null }
          },
        }
      }
      if (table === 'units') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { buildings: { landlord_id: 'llll1111-aaaa-4bbb-8ccc-ddddeeee0002' } },
              }),
            }),
          }),
        }
      }
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'llll1111-aaaa-4bbb-8ccc-ddddeeee0002' },
              }),
            }),
          }),
        }
      }
      return chainMaybeSingle({ data: null })
    },
  }),
}))

describe('browser persist resolveUuid / unitUuid aliases (P0-r21)', () => {
  afterEach(() => {
    vi.resetModules()
    mapRows.length = 0
    leasesUpsert.mockReset()
    entityMapUpsert.mockReset()
    entityMapUpsert.mockResolvedValue({ error: null })
  })

  it('resolves FE property id 0ezv31 via property map row (no unit/0ezv31)', async () => {
    // Live map shape from Mode A stamp: property/0ezv31 + unit/unt-0ezv31 only.
    mapRows.push(
      { entity_type: 'property', frontend_id: '0ezv31', backend_id: UNIT_UUID },
      { entity_type: 'unit', frontend_id: 'unt-0ezv31', backend_id: UNIT_UUID },
      {
        entity_type: 'agency',
        frontend_id: 'ag-rhtxlh',
        backend_id: 'aaaa1111-aaaa-4bbb-8ccc-ddddeeee0003',
      },
      {
        entity_type: 'user',
        frontend_id: 'u-ll-1',
        backend_id: 'llll1111-aaaa-4bbb-8ccc-ddddeeee0002',
      },
      {
        entity_type: 'user',
        frontend_id: 'u-tenant-1',
        backend_id: 'tttt1111-aaaa-4bbb-8ccc-ddddeeee0004',
      },
      {
        entity_type: 'application',
        frontend_id: 'APP-it4z5k',
        backend_id: 'appp1111-aaaa-4bbb-8ccc-ddddeeee0005',
      },
    )

    const { persistToSupabase } = await import('./persist')
    const ok = await persistToSupabase({
      resource: 'tenancy',
      action: 'upsert',
      id: 'tn-r21test',
      data: {
        id: 'tn-r21test',
        propertyId: '0ezv31',
        agencyId: 'ag-rhtxlh',
        landlordId: 'u-ll-1',
        tenantUserId: 'u-tenant-1',
        applicationId: 'APP-it4z5k',
        startDate: '2026-10-01',
        rent: 12000,
        deposit: 12000,
        status: 'Pending',
      },
    })
    expect(ok).toBe(true)
    expect(leasesUpsert).toHaveBeenCalled()
    const payload = leasesUpsert.mock.calls[0][0] as { unit_id: string | null }
    expect(payload.unit_id).toBe(UNIT_UUID)
  })

  it('resolves via unt-0ezv31 alias when only unit map row exists', async () => {
    mapRows.push(
      { entity_type: 'unit', frontend_id: 'unt-0ezv31', backend_id: UNIT_UUID },
      {
        entity_type: 'agency',
        frontend_id: 'ag-rhtxlh',
        backend_id: 'aaaa1111-aaaa-4bbb-8ccc-ddddeeee0003',
      },
      {
        entity_type: 'user',
        frontend_id: 'u-ll-1',
        backend_id: 'llll1111-aaaa-4bbb-8ccc-ddddeeee0002',
      },
    )

    const { persistToSupabase } = await import('./persist')
    const ok = await persistToSupabase({
      resource: 'tenancy',
      action: 'upsert',
      id: 'tn-r21alias',
      data: {
        id: 'tn-r21alias',
        propertyId: '0ezv31',
        agencyId: 'ag-rhtxlh',
        landlordId: 'u-ll-1',
        startDate: '2026-10-01',
        rent: 1,
        deposit: 1,
        status: 'Pending',
      },
    })
    expect(ok).toBe(true)
    const payload = leasesUpsert.mock.calls[0][0] as { unit_id: string | null }
    expect(payload.unit_id).toBe(UNIT_UUID)
  })

  it('fail-closed: unresolved unit does not upsert leases with unit_id null', async () => {
    // No property/unit map rows — resolve must miss.
    mapRows.push(
      {
        entity_type: 'agency',
        frontend_id: 'ag-rhtxlh',
        backend_id: 'aaaa1111-aaaa-4bbb-8ccc-ddddeeee0003',
      },
      {
        entity_type: 'user',
        frontend_id: 'u-ll-1',
        backend_id: 'llll1111-aaaa-4bbb-8ccc-ddddeeee0002',
      },
    )

    const { persistToSupabase } = await import('./persist')
    const ok = await persistToSupabase({
      resource: 'tenancy',
      action: 'upsert',
      id: 'tn-r21miss',
      data: {
        id: 'tn-r21miss',
        propertyId: '0ezv31',
        agencyId: 'ag-rhtxlh',
        landlordId: 'u-ll-1',
        startDate: '2026-10-01',
        rent: 1,
        deposit: 1,
        status: 'Pending',
      },
    })
    expect(ok).toBe(false)
    expect(leasesUpsert).not.toHaveBeenCalled()
  })
})
