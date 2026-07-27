import { describe, expect, it } from 'vitest'
import { hasMappedCoordinates } from './mapCoords'

describe('hasMappedCoordinates', () => {
  it('accepts real Gqeberha coordinates', () => {
    expect(hasMappedCoordinates({ lat: -33.96, lng: 25.6 })).toBe(true)
  })

  it('rejects missing, non-finite, and 0,0 sentinel values', () => {
    expect(hasMappedCoordinates({ lat: null, lng: 25 })).toBe(false)
    expect(hasMappedCoordinates({ lat: NaN, lng: 25 })).toBe(false)
    expect(hasMappedCoordinates({ lat: 0, lng: 0 })).toBe(false)
  })
})
