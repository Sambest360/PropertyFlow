import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const resolveUuid = vi.fn()

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', () => ({
  resolveUuid: (...args: unknown[]) => resolveUuid(...args),
  ensureUuid: vi.fn(),
  ensureEntityMapTable: vi.fn(),
  forgetId: vi.fn(),
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

const UNIT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AGENCY_FE = 'ag-horizon'
const OTHER_AGENCY_FE = 'ag-other'
const PROP_FE = 'prop-fe-1'

const existingRow = {
  propertyId: PROP_FE,
  agencyId: AGENCY_FE,
  agentId: 'u-agent',
  landlordId: null,
  statusConfigKey: 'PUBLISHED',
}

describe('property delete gate', () => {
  beforeEach(() => {
    query.mockReset()
    resolveUuid.mockReset()
    resolveUuid.mockImplementation(async (et: string) => {
      if (et === 'property' || et === 'unit') return UNIT_UUID
      return null
    })
    query.mockResolvedValue([])
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('assertHardPropertyDeleteAllowed: staff hard delete → 403', async () => {
    const { assertHardPropertyDeleteAllowed } = await import('./propertyDeletePolicy.js')
    await expect(
      assertHardPropertyDeleteAllowed(
        { userId: 'u-admin', role: 'client_admin', agencyId: AGENCY_FE },
        'property',
        PROP_FE,
      ),
    ).rejects.toMatchObject({ status: 403, code: 'PROPERTY_HARD_DELETE_FORBIDDEN' })
  })

  it('enforcePropertyUnitUpsert: landlord archive → 403', async () => {
    const { enforcePropertyUnitUpsert } = await import('./propertyDeletePolicy.js')
    const body = {
      resource: 'property' as const,
      action: 'upsert' as const,
      id: PROP_FE,
      data: { statusKey: 'DELETED', deletedAt: new Date().toISOString() },
    }
    await expect(
      enforcePropertyUnitUpsert(
        { userId: 'u-landlord', role: 'landlord', agencyId: null },
        body,
        existingRow,
      ),
    ).rejects.toMatchObject({ status: 403, code: 'PROPERTY_DELETE_FORBIDDEN' })
  })

  it('enforcePropertyUnitUpsert: agency admin archives with forged agency in payload → ok', async () => {
    const { enforcePropertyUnitUpsert } = await import('./propertyDeletePolicy.js')
    const body = {
      resource: 'property' as const,
      action: 'upsert' as const,
      id: PROP_FE,
      data: {
        agencyId: OTHER_AGENCY_FE,
        statusKey: 'DELETED',
        deletedAt: new Date().toISOString(),
      },
    }
    const out = await enforcePropertyUnitUpsert(
      { userId: 'u-admin', role: 'client_admin', agencyId: AGENCY_FE },
      body,
      existingRow,
    )
    expect(out?.agencyId).toBe(AGENCY_FE)
  })

  it('enforcePropertyUnitUpsert: agency admin cross-agency stored row → 403', async () => {
    const { enforcePropertyUnitUpsert } = await import('./propertyDeletePolicy.js')
    const body = {
      resource: 'property' as const,
      action: 'upsert' as const,
      id: PROP_FE,
      data: { statusKey: 'DELETED', deletedAt: new Date().toISOString() },
    }
    await expect(
      enforcePropertyUnitUpsert(
        { userId: 'u-admin', role: 'client_admin', agencyId: AGENCY_FE },
        body,
        { ...existingRow, agencyId: OTHER_AGENCY_FE },
      ),
    ).rejects.toMatchObject({ status: 403, code: 'PROPERTY_DELETE_FORBIDDEN' })
  })

  it('enforcePropertyUnitUpsert: assigned agent archive → ok', async () => {
    const { enforcePropertyUnitUpsert } = await import('./propertyDeletePolicy.js')
    const body = {
      resource: 'property' as const,
      action: 'upsert' as const,
      id: PROP_FE,
      data: { statusKey: 'DELETED', deletedAt: new Date().toISOString() },
    }
    const out = await enforcePropertyUnitUpsert(
      { userId: 'u-agent', role: 'agent', agencyId: AGENCY_FE },
      body,
      existingRow,
    )
    expect(out?.property.agentId).toBe('u-agent')
  })

  it('enforcePropertyUnitUpsert: active lease blocks archive → 409', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM leases') && sql.includes('ACTIVE')) return [{ n: '1' }]
      return []
    })
    const { enforcePropertyUnitUpsert } = await import('./propertyDeletePolicy.js')
    const body = {
      resource: 'property' as const,
      action: 'upsert' as const,
      id: PROP_FE,
      data: { statusKey: 'DELETED', deletedAt: new Date().toISOString() },
    }
    await expect(
      enforcePropertyUnitUpsert(
        { userId: 'u-admin', role: 'client_admin', agencyId: AGENCY_FE },
        body,
        existingRow,
      ),
    ).rejects.toMatchObject({ status: 409, code: 'PROPERTY_DELETE_BLOCKED' })
  })

  it('enforcePropertyUnitUpsert: upsert on DELETED without restore → 403', async () => {
    const { enforcePropertyUnitUpsert } = await import('./propertyDeletePolicy.js')
    const body = {
      resource: 'property' as const,
      action: 'upsert' as const,
      id: PROP_FE,
      data: { title: 'Changed' },
    }
    await expect(
      enforcePropertyUnitUpsert(
        { userId: 'u-admin', role: 'client_admin', agencyId: AGENCY_FE },
        body,
        { ...existingRow, statusConfigKey: 'DELETED' },
      ),
    ).rejects.toMatchObject({ status: 403, code: 'PROPERTY_ARCHIVED_IMMUTABLE' })
  })

})
