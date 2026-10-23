import { afterEach, describe, expect, it, vi } from 'vitest'

// #110 condition 5: when leases_no_date_overlap fires on the staff lease
// upsert (no pre-check on this path), the API answers 409 LEASE_OVERLAP, not 500.

const query = vi.fn()

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: (...args: unknown[]) => query(...args),
  withTransaction: vi.fn(async (fn: () => unknown) => fn()),
  clientQuery: vi.fn(),
  pool: { query: (...args: unknown[]) => query(...args) },
}))

const AGENCY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UNIT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TENANT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const LEASE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: vi.fn(async () => undefined),
  ensureUuid: vi.fn(async () => LEASE),
  resolveUuid: vi.fn(async (type: string) => {
    if (type === 'agency') return AGENCY
    if (type === 'property' || type === 'unit') return UNIT
    if (type === 'user') return TENANT
    return null
  }),
  forgetId: vi.fn(async () => undefined),
  upsertEntityMapFrontendId: vi.fn(async (_et: string, _fe: string, uuid: string) => uuid),
  isUuid: (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}))

/** Users exist; everything else is an empty read until the lease INSERT. */
function db(insertError: Error) {
  return async (sql: string) => {
    if (/INSERT INTO leases/.test(sql)) throw insertError
    if (/FROM users WHERE id = \$1::uuid/.test(sql)) return [{ id: TENANT }]
    return []
  }
}

function overlapError(): Error {
  // Shape of the pg error the exclusion constraint raises.
  return Object.assign(new Error('conflicting key value violates exclusion constraint "leases_no_date_overlap"'), {
    code: '23P01',
    constraint: 'leases_no_date_overlap',
  })
}

const body = {
  resource: 'tenancy' as const,
  action: 'upsert' as const,
  id: 'T-overlap-1',
  data: {
    agencyId: 'AG-1',
    propertyId: 'P-1',
    tenantUserId: 'U-tenant',
    status: 'Active',
    startDate: '2027-01-15',
    endDate: '2028-01-14',
    rent: 9000,
  },
}

describe('staff lease upsert: leases_no_date_overlap is 409 LEASE_OVERLAP, not 500', () => {
  afterEach(() => {
    query.mockReset()
  })

  it('maps the 23P01 from the lease INSERT to 409 LEASE_OVERLAP, and the route status follows', async () => {
    query.mockImplementation(db(overlapError()))
    const { handlePersist } = await import('./writes.js')
    const { errStatus } = await import('./errStatus.js')
    const err = await handlePersist(body as never).then(
      () => null,
      (e: unknown) => e,
    )
    expect(query.mock.calls.some(([sql]) => /INSERT INTO leases/.test(String(sql)))).toBe(true)
    expect(err).toMatchObject({ status: 409, code: 'LEASE_OVERLAP' })
    expect(errStatus(err)).toBe(409)
  })

  it('leaves other DB errors alone (still a 500)', async () => {
    query.mockImplementation(db(Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'leases_pkey' })))
    const { handlePersist } = await import('./writes.js')
    const { errStatus } = await import('./errStatus.js')
    const err = await handlePersist(body as never).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toMatchObject({ code: '23505' })
    expect(errStatus(err)).toBe(500)
  })
})
