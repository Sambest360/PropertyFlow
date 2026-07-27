import { describe, expect, it } from 'vitest'
import { mapPool } from './mapPool'

describe('mapPool', () => {
  it('preserves order while capping concurrency', async () => {
    let inFlight = 0
    let peak = 0
    const out = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return n * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50])
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('treats concurrency below 1 as 1', async () => {
    const out = await mapPool(['a', 'b'], 0, async (s) => s.toUpperCase())
    expect(out).toEqual(['A', 'B'])
  })
})
