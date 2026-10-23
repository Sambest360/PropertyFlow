import { beforeEach, describe, expect, it, vi } from 'vitest'

const issued: Array<{ sql: string; params: unknown[] }> = []
let insertError: unknown = null
vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async () => []),
  afterCommit: vi.fn(),
  withTransaction: async (fn: (c: unknown) => Promise<unknown>) => fn({}),
  clientQuery: async (_c: unknown, sql: string, params: unknown[] = []) => {
    issued.push({ sql, params })
    if (sql.includes('FROM applications WHERE id')) {
      return [{ id: 'app-1', client_id: 'c-1', unit_id: 'u-1', applicant_id: 'uuid-t', agent_id: null, status: 'SUBMITTED', monthly_income: null, metadata: {} }]
    }
    if (sql.includes('SELECT available_from::text AS available_from FROM units')) return [{ available_from: '2027-02-01' }]
    if (sql.includes("status IN ('PENDING', 'ACTIVE', 'NOTICE')") && sql.includes('FROM leases')) {
      return [{ id: 'lease-current', start_date: '2026-02-01', end_date: '2027-01-31' }]
    }
    if (sql.includes('INSERT INTO leases') && insertError) throw insertError
    return []
  },
}))
vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: async () => undefined,
  ensureUuid: async () => 'lease-new',
  resolveUuid: async (t: string) => (t === 'application' ? 'app-1' : 'uuid-x'),
  forgetId: async () => undefined,
  isUuid: () => true,
}))

const tenancy = (startDate: string, endDate: string) => ({
  id: 'TN-e2e-successor',
  tenantUserId: 'U-e2e-applicant',
  tenantName: 'E2E TEST Successor',
  tenantEmail: 'e2e-successor@example.com',
  startDate,
  endDate,
  rent: 12000,
})

describe('approving a successor on an occupied advert', () => {
  beforeEach(() => {
    issued.length = 0
    insertError = null
  })

  it('move-in 15 Jan is 409 LEASE_OVERLAP and no lease is written', async () => {
    const { approveApplicationTx } = await import('./writes.js')
    await expect(
      approveApplicationTx({ applicationId: 'APP-e2e', tenancy: tenancy('2027-01-15', '2028-01-14') }),
    ).rejects.toMatchObject({ status: 409, code: 'LEASE_OVERLAP' })
    expect(issued.some((q) => q.sql.includes('INSERT INTO leases'))).toBe(false)
  })

  it('move-in 1 Feb creates a PENDING lease and takes the advert down', async () => {
    const { approveApplicationTx } = await import('./writes.js')
    const result = await approveApplicationTx({ applicationId: 'APP-e2e', tenancy: tenancy('2027-02-01', '2028-01-31') })
    expect(result.leaseUuid).toBe('lease-new')
    const insert = issued.find((q) => q.sql.includes('INSERT INTO leases'))
    expect(insert?.sql).toContain("'PENDING'")
    expect(insert?.params[8]).toBe('2027-02-01')
    expect(issued.some((q) => q.sql.includes('SET advertise_while_occupied = false'))).toBe(true)
  })

  it('a race that trips leases_no_date_overlap is still 409 LEASE_OVERLAP', async () => {
    const { approveApplicationTx } = await import('./writes.js')
    insertError = Object.assign(new Error('conflicting key value violates exclusion constraint'), {
      code: '23P01',
      constraint: 'leases_no_date_overlap',
    })
    await expect(
      approveApplicationTx({ applicationId: 'APP-e2e', tenancy: tenancy('2027-02-01', '2028-01-31') }),
    ).rejects.toMatchObject({ status: 409, code: 'LEASE_OVERLAP' })
  })
})
