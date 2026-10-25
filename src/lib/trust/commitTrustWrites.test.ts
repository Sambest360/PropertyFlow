import { describe, expect, it, vi } from 'vitest'
import { allocationSaveFailedMessage, csvImportSaveFailedMessage, persistInOrder } from './commitTrustWrites'

describe('persistInOrder', () => {
  it('saves every row in order when the server accepts them', async () => {
    const persist = vi.fn(async () => true)
    expect(await persistInOrder(['a', 'b'], persist)).toEqual({ saved: ['a', 'b'], failed: null })
    expect(persist.mock.calls.map((c) => c[0])).toEqual(['a', 'b'])
  })

  it('stops at the first refused or throwing save and reports what was saved', async () => {
    const refused = vi.fn(async (r: string) => r !== 'b')
    expect(await persistInOrder(['a', 'b', 'c'], refused)).toEqual({ saved: ['a'], failed: 'b' })
    expect(refused).toHaveBeenCalledTimes(2)

    const throws = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await persistInOrder(['a'], throws)).toEqual({ saved: [], failed: 'a' })
  })
})

describe('trust save messages', () => {
  it('says how much was saved', () => {
    expect(allocationSaveFailedMessage(0, 2)).toMatch(/not saved/)
    expect(allocationSaveFailedMessage(1, 2)).toMatch(/Only 1 of 2/)
    expect(csvImportSaveFailedMessage(3, 5)).toBe('Saved 3 of 5 receipts. Import the file again to retry the rest.')
  })
})
