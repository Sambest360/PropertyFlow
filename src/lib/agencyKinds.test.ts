import { describe, expect, it } from 'vitest'
import { realAgencies } from './agencyKinds'

describe('realAgencies', () => {
  it('leaves landlord portfolios out', () => {
    const list = [{ id: 'ag-1' }, { id: 'ag-ll-abc' }, { id: 'x', isLandlordPortfolio: true }]
    expect(realAgencies(list).map((a) => a.id)).toEqual(['ag-1'])
  })
})
