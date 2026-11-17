import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
vi.mock('./db.js', () => ({ query: (...a: unknown[]) => query(...a) }))
const can = vi.fn(async () => true)
vi.mock('./scopeGate.js', () => ({ actorStoredCan: () => can() }))
vi.mock('./entityMap.js', () => ({
  isUuid: (v: string) => /^[0-9a-f-]{36}$/.test(v),
  resolveUuid: async (_k: string, fe: string) => ({ 'ag-a': AG_A, 'ag-b': AG_B, 'u-1': USER })[fe] ?? null,
}))

const AG_A = '00000000-0000-4000-8000-00000000000a'
const AG_B = '00000000-0000-4000-8000-00000000000b'
const USER = '00000000-0000-4000-8000-000000000001'
const staffA = { userId: 'u-1', role: 'agent_admin' as const, agencyId: 'ag-a' }

beforeEach(() => {
  query.mockReset()
  can.mockReset()
  can.mockResolvedValue(true)
  query.mockImplementation(async (sql: string) =>
    sql.includes('FROM trust_transactions') && sql.includes('SUM(')
      ? [{ balance: '2025000', unallocated_count: '1', unallocated_cents: '125000' }]
      : [],
  )
})

describe('trust reconciliation', () => {
  it('pins staff to their own agency even when the body names another', async () => {
    const { recordTrustReconciliation } = await import('./trustBankRoutes.js')
    const r = await recordTrustReconciliation(staffA, { agencyId: 'ag-b', asOf: '2026-11-03', bankBalanceCents: 2_000_000 })
    expect(r.reconciliation).toMatchObject({ ledgerBalanceCents: 2_025_000, differenceCents: -25_000 })
    for (const [sql, params] of query.mock.calls) {
      if (String(sql).startsWith('SELECT')) expect((params as unknown[])[0]).toBe(AG_A)
    }
    const insert = query.mock.calls.find((c) => String(c[0]).includes('INSERT INTO event_log'))!
    expect(insert[1]).toEqual(expect.arrayContaining([AG_A, USER]))
  })

  it('refuses without trust permission, a bad date or a fractional balance', async () => {
    const { getTrustReconciliation, recordTrustReconciliation } = await import('./trustBankRoutes.js')
    can.mockResolvedValueOnce(false)
    await expect(getTrustReconciliation(staffA, '2026-11-03', null)).rejects.toThrow(/lacks trust.view/)
    await expect(getTrustReconciliation(staffA, '03/11/2026', null)).rejects.toMatchObject({ status: 400 })
    await expect(recordTrustReconciliation(staffA, { asOf: '2026-11-03', bankBalanceCents: 10.5 })).rejects.toMatchObject({ status: 400 })
    expect(query.mock.calls.some((c) => String(c[0]).includes('INSERT'))).toBe(false)
  })

  it('makes a super admin name the agency', async () => {
    const { getTrustReconciliation } = await import('./trustBankRoutes.js')
    const sa = { userId: 'u-1', role: 'super_admin' as const, agencyId: null }
    await expect(getTrustReconciliation(sa, '2026-11-03', null)).rejects.toMatchObject({ status: 400 })
    expect((await getTrustReconciliation(sa, '2026-11-03', 'ag-b')).ledgerBalanceCents).toBe(2_025_000)
  })

  it('looks up import keys only inside the actor agency', async () => {
    const { existingPartnerTxnIds } = await import('./trustBankRoutes.js')
    query.mockResolvedValueOnce([{ partner_txn_id: 'tpl-csv:x' }])
    expect(await existingPartnerTxnIds(staffA, { partnerTxnIds: ['tpl-csv:x', 'tpl-csv:y'] })).toEqual({ existing: ['tpl-csv:x'] })
    expect(query.mock.calls[0]![1]).toEqual([AG_A, ['tpl-csv:x', 'tpl-csv:y']])
    await expect(existingPartnerTxnIds(staffA, { partnerTxnIds: [1] })).rejects.toMatchObject({ status: 400 })
  })
})
