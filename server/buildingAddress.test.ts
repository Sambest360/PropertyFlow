import { describe, expect, it } from 'vitest'
import { buildingAddressFromListing } from './writes.js'

describe('buildingAddressFromListing', () => {
  it('strips every repeated unit suffix', () => {
    const unit = '3 Bedroom House to Rent in Pinelands'
    const addr = `3a Malherbe Cresent, Pinelands, Gqeberha, 1, ${unit}, ${unit}, ${unit}`
    expect(buildingAddressFromListing(addr, [unit])).toBe('3a Malherbe Cresent, Pinelands, Gqeberha, 1')
  })
  it('leaves a clean address alone', () => {
    expect(buildingAddressFromListing('12 Main Road, Walmer', ['Unit 4'])).toBe('12 Main Road, Walmer')
  })
})
