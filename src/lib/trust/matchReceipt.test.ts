import { describe, expect, it } from 'vitest'
import { suggestReceiptMatches } from './matchReceipt'

const tenancies = [
  { id: 'o1', tenantName: 'Thandi Nkosi', rent: 9000 },
  { id: 'o2', tenantName: 'Pieter Botha', rent: 9000 },
  { id: 'o3', tenantName: 'Ayesha Khan', rent: 12500 },
]

describe('suggestReceiptMatches', () => {
  it('ranks name + amount owed above amount alone', () => {
    const owed = new Map([['o1', 900_000], ['o2', 900_000]])
    const m = suggestReceiptMatches({ amountCents: 900_000, description: 'FNB OB PMT', bankRef: 'NKOSI FLAT 4' }, tenancies, owed)
    expect(m.map((x) => x.occupancyId)).toEqual(['o1', 'o2'])
    expect(m[0]!.reasons).toEqual(['Name in reference', 'Equals amount owed'])
    expect(m[0]!.suggestedCents).toBe(900_000)
  })

  it('caps the prefill at the receipt and ignores the import label', () => {
    const m = suggestReceiptMatches(
      { amountCents: 500_000, description: 'KHAN part [CSV import — recorded in Lekaya, not yet matched to the bank]' },
      tenancies,
      new Map(),
    )
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ occupancyId: 'o3', suggestedCents: 500_000 })
  })

  it('suggests nothing on a weak signal', () => {
    expect(suggestReceiptMatches({ amountCents: 123, description: 'RENT FLAT' }, tenancies, new Map())).toEqual([])
  })
})
