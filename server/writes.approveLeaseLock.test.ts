import { describe, expect, it, vi } from 'vitest'

const issued: string[] = []
let enveloped = true
vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async () => []),
  afterCommit: vi.fn(),
  withTransaction: async (fn: (c: unknown) => Promise<unknown>) => fn({}),
  clientQuery: async (_c: unknown, sql: string) => {
    issued.push(sql)
    if (sql.includes('FROM applications WHERE id')) {
      return [{ id: 'app-1', client_id: 'c-1', unit_id: 'u-1', applicant_id: 'uuid-t', agent_id: null, status: 'PENDING', monthly_income: null, metadata: {} }]
    }
    if (sql.includes("metadata->'eSign'->>'envelopeId' AS envelope_id FROM leases") && sql.includes('FOR UPDATE')) {
      return enveloped ? [{ envelope_id: 'ENV-1' }] : []
    }
    return []
  },
}))
vi.mock('./entityMap.js', () => ({
  ensureEntityMapTable: async () => undefined,
  ensureUuid: async () => 'lease-1',
  resolveUuid: async (t: string) => (t === 'application' ? 'app-1' : 'uuid-x'),
  forgetId: async () => undefined,
  isUuid: () => true,
}))

describe('CR10 gate blocker 2: approval cannot re-point an enveloped lease', () => {
  it('existing lease with an envelope: locked FOR UPDATE, 403 LEASE_PARTY_LOCKED, no INSERT', async () => {
    const { approveApplicationTx } = await import('./writes.js')
    issued.length = 0
    enveloped = true
    await expect(
      approveApplicationTx({ applicationId: 'APP-1', actorUserId: 'u-staff', tenancy: { id: 'TN-existing', tenantUserId: 'u-staff' } }),
    ).rejects.toMatchObject({ status: 403, code: 'LEASE_PARTY_LOCKED' })
    expect(issued.some((q) => /FROM leases WHERE id = \$1::uuid FOR UPDATE/.test(q))).toBe(true)
    expect(issued.some((q) => q.includes('INSERT INTO leases'))).toBe(false)
  })
  it('no envelope yet: the lease is minted as before', async () => {
    const { approveApplicationTx } = await import('./writes.js')
    issued.length = 0
    enveloped = false
    await approveApplicationTx({ applicationId: 'APP-1', tenancy: { id: 'TN-new' } })
    expect(issued.some((q) => q.includes('INSERT INTO leases'))).toBe(true)
  })
})
