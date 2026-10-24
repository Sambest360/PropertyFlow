import { describe, expect, it } from 'vitest'
import { LOAD_SHEDDING_FREE_AMENITY, isLoadSheddingFreeListing, withLoadSheddingFree } from './loadShedding'

describe('isLoadSheddingFreeListing', () => {
  it('is true only when the lister ticked Load-shedding free', () => {
    expect(isLoadSheddingFreeListing([LOAD_SHEDDING_FREE_AMENITY])).toBe(true)
    expect(isLoadSheddingFreeListing(['load-shedding free '])).toBe(true)
  })

  it('no longer infers the tag from solar, inverter or similar amenities', () => {
    expect(isLoadSheddingFreeListing(['Solar', 'Inverter / UPS', 'Solar geyser', 'Generator', 'Groups'])).toBe(false)
    expect(isLoadSheddingFreeListing(null)).toBe(false)
  })
})

describe('withLoadSheddingFree', () => {
  it('adds once and removes cleanly', () => {
    const on = withLoadSheddingFree(['Fibre'], true)
    expect(on).toEqual(['Fibre', LOAD_SHEDDING_FREE_AMENITY])
    expect(withLoadSheddingFree(on, true)).toEqual(on)
    expect(withLoadSheddingFree(on, false)).toEqual(['Fibre'])
  })
})
