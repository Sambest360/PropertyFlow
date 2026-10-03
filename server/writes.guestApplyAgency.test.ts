import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPropertyScope, dealInScope } from '../src/lib/scope.js'

const query = vi.fn()
const ensureUuid = vi.fn(async () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
const resolveUuid = vi.fn()
const ensureEntityMapTable = vi.fn(async () => undefined)
const forgetId = vi.fn(async () => undefined)

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: (...args: unknown[]) => ensureEntityMapTable(...args),
  ensureUuid: (...args: unknown[]) => ensureUuid(...args),
  resolveUuid: (...args: unknown[]) => resolveUuid(...args),
  forgetId: (...args: unknown[]) => forgetId(...args),
  isUuid: (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

/** Seed static map for PR-1011 points at a unit row that is not the live listing. */
const STALE_UNIT = 'a4000001-0001-4000-8000-000000000008'
/** Live Humewood B14 / PR-1011 row — agency lives on this unit, not the public payload. */
const LIVE_UNIT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const HORIZON_CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const APP_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

describe('guest public apply inherits listing agency (PR-1011)', () => {
  beforeEach(() => {
    query.mockReset()
    resolveUuid.mockReset()
    ensureUuid.mockClear()
    ensureEntityMapTable.mockClear()
    forgetId.mockClear()
    ensureUuid.mockImplementation(async (et: string) =>
      et === 'application' ? APP_UUID : 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    )
    // Static alias wins in resolveUuid today and is NOT the live unit.
    resolveUuid.mockImplementation(async (et: string, fe: string) => {
      if ((et === 'property' || et === 'unit') && (fe === 'PR-1011' || fe === 'unt-PR-1011')) {
        return STALE_UNIT
      }
      return null
    })
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('entity_id_map') && sql.includes('JOIN units')) {
        return [{ id: LIVE_UNIT }]
      }
      if (sql.includes('JOIN buildings')) {
        expect(params?.[0]).toBe(LIVE_UNIT)
        return [{ client_id: HORIZON_CLIENT }]
      }
      if (sql.includes('FROM units WHERE id')) {
        return []
      }
      if (sql.includes('FROM clients')) return []
      if (sql.includes('FROM users')) return []
      if (sql.includes('INSERT INTO applications')) return []
      return []
    })
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('saves a guest application on the listing agency when the public payload has no agency id', async () => {
    const { handlePersist } = await import('./writes.js')
    const result = await handlePersist({
      resource: 'application',
      action: 'upsert',
      id: 'APP-thandiwe',
      data: {
        // Public listing payload: property id only — no agencyId.
        propertyId: 'PR-1011',
        applicantUserId: 'u-thandiwe',
        applicantName: 'Thandiwe Ndlovu',
        email: 'thandiwe.ndlovu.d03@gmail.com',
        phone: '0820000000',
        type: 'Rental',
        stage: 'Application submitted',
        income: 25000,
      },
    })

    expect(result.ok).toBe(true)
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO applications'))
    expect(insert).toBeTruthy()
    const params = insert![1] as unknown[]
    expect(params[1]).toBe(HORIZON_CLIENT)
    expect(params[2]).toBe(LIVE_UNIT)

    const horizonAdmin = buildPropertyScope(
      { role: 'client_admin', userId: 'u-amelia', agencyId: 'ag-horizon', agencySuspended: false },
      {
        properties: [
          { id: 'PR-1011', agencyId: 'ag-horizon', agentId: null, landlordId: 'u-ll' },
        ],
      },
    )
    expect(
      dealInScope(horizonAdmin, {
        propertyId: 'PR-1011',
        agentId: null,
        agencyId: 'ag-horizon',
      }),
    ).toBe(true)

    const otherAgency = buildPropertyScope(
      { role: 'client_admin', userId: 'u-other', agencyId: 'ag-cape', agencySuspended: false },
      { properties: [] },
    )
    expect(
      dealInScope(otherAgency, {
        propertyId: 'PR-1011',
        agentId: null,
        agencyId: 'ag-horizon',
      }),
    ).toBe(false)
  })
})
