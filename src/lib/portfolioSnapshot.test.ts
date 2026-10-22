import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PORTFOLIO_SNAPSHOT_KEY,
  clearPortfolioSnapshot,
  hasPortfolioSnapshotForUser,
  readPortfolioSnapshot,
  writePortfolioSnapshot,
} from './portfolioSnapshot'

function fakeSessionStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: () => null,
    length: map.size,
    clear: () => map.clear(),
  }
}

const slice = {
  properties: [{ id: 'p-1', title: 'Flat' } as never],
  units: [],
  buildings: [],
  viewingSlots: [],
  leads: [],
  tickets: [],
}

describe('portfolioSnapshot', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', fakeSessionStorage())
    clearPortfolioSnapshot()
  })

  it('round-trips for the same owner', () => {
    writePortfolioSnapshot('u-a', slice)
    expect(readPortfolioSnapshot('u-a')).toEqual(slice)
    expect(hasPortfolioSnapshotForUser('u-a')).toBe(true)
  })

  it('returns null for a different owner', () => {
    writePortfolioSnapshot('u-a', slice)
    expect(readPortfolioSnapshot('u-b')).toBeNull()
    expect(hasPortfolioSnapshotForUser('u-b')).toBe(false)
  })

  it('clear removes the envelope', () => {
    writePortfolioSnapshot('u-a', slice)
    clearPortfolioSnapshot()
    expect(sessionStorage.getItem(PORTFOLIO_SNAPSHOT_KEY)).toBeNull()
  })

  it('filters snapshot read for field agents to their property book', () => {
    const wide = {
      ...slice,
      properties: [
        { id: 'p-mine', agencyId: 'ag-a', agentId: 'u-fa', landlordId: 'u-ll' } as never,
        { id: 'p-other', agencyId: 'ag-a', agentId: 'u-x', landlordId: 'u-ll' } as never,
      ],
      leads: [
        { id: 'l1', propertyId: 'p-mine', agencyId: 'ag-a', agentId: 'u-fa' } as never,
        { id: 'l2', propertyId: 'p-other', agencyId: 'ag-a', agentId: 'u-x' } as never,
      ],
    }
    writePortfolioSnapshot('u-fa', wide)
    const actor = { userId: 'u-fa', role: 'ground_agent' as const, agencyId: 'ag-a' }
    const read = readPortfolioSnapshot('u-fa', actor)
    expect(read?.properties.map((p) => p.id)).toEqual(['p-mine'])
    expect(read?.leads.map((l) => l.propertyId)).toEqual(['p-mine'])
  })
})
