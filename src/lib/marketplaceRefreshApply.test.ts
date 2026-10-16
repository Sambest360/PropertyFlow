import { describe, expect, it } from 'vitest'
import { marketplaceRefreshPreservesOnMiss } from './refreshCoordination'

describe('marketplace refresh apply', () => {
  it('does not clear collections when refresh fetch returns null', () => {
    const prev = {
      properties: [{ id: 'p1', title: 'Stay' }],
      viewings: [{ id: 'v1' }],
    }
    const next = marketplaceRefreshPreservesOnMiss(prev, null)
    expect(next).toBe(prev)
    expect(next.properties).toHaveLength(1)
    expect(next.viewings).toHaveLength(1)
  })
})
