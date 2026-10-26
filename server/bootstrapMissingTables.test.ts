import { describe, expect, it, vi } from 'vitest'

/**
 * A self-hosted database without migration 007 (no trust & banking tables)
 * used to fail every bootstrap: signed-in users saw no agencies or data and
 * the public marketplace answered 500. Those tables now read as empty; any
 * other database error still fails the bootstrap.
 */
const C21 = 'f2a29694-8440-4dab-93a7-ed1bb917b2c5'
let failUsers = false

const undefinedTable = (table: string) =>
  Object.assign(new Error(`relation "${table}" does not exist`), { code: '42P01' })

vi.mock('./db.js', () => ({
  databaseConfigured: true,
  query: vi.fn(async (sql: string) => {
    const trust = /FROM (trust_transactions|trust_allocations|payout_instructions|deposit_holdings|arrears_snapshots|csv_import_batches)\b/.exec(sql)
    if (trust) throw undefinedTable(trust[1]!)
    if (/FROM users ORDER BY email/.test(sql) && failUsers) {
      throw Object.assign(new Error('connection reset'), { code: '08006' })
    }
    if (/FROM clients/.test(sql)) {
      return [{ id: C21, company_name: 'century 21', subdomain: 'century-21', status: 'active', city: 'Port Elizabeth', created_at: new Date('2026-10-15'), settings: {} }]
    }
    if (/FROM entity_id_map/.test(sql)) return [{ entity_type: 'agency', frontend_id: 'ag-14gu4m', backend_id: C21 }]
    return []
  }),
  withTransaction: vi.fn(),
  clientQuery: vi.fn(),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}))

describe('bootstrap on a database without the trust & banking tables', () => {
  it('still loads agencies, with empty trust books', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { buildBootstrap } = await import('./bootstrap.js')
    for (const lite of [true, false]) {
      const data = (await buildBootstrap({ lite })) as Record<string, unknown>
      expect((data.agencies as Array<{ id: string }>).map((a) => a.id)).toEqual(['ag-14gu4m'])
      for (const k of ['trustTransactions', 'trustAllocations', 'payoutInstructions', 'depositHoldings', 'arrearsSnapshots', 'csvImportBatches']) {
        expect(data[k]).toEqual([])
      }
    }
    // One warning per missing table, not one per request.
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('trust_transactions'))).toHaveLength(1)
    warn.mockRestore()
  })

  it('still fails on any other database error', async () => {
    const { buildBootstrap } = await import('./bootstrap.js')
    failUsers = true
    await expect(buildBootstrap({ lite: true })).rejects.toThrow('connection reset')
    failUsers = false
  })
})
