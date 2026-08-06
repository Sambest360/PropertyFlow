import { describe, expect, it } from 'vitest'
import { sanitizeRoomCounts, summarizeRooms } from './roomSummary'

describe('summarizeRooms', () => {
  it('counts bedroom and bathroom rooms separately from other kinds', () => {
    expect(
      summarizeRooms([
        { kind: 'bedroom', beds: 1, baths: 0 },
        { kind: 'bedroom', beds: 2, baths: 0 },
        { kind: 'bathroom', beds: 0, baths: 1 },
        { kind: 'kitchen', beds: 0, baths: 0 },
        { kind: 'garage', beds: 0, baths: 0 },
      ]),
    ).toEqual({
      bedrooms: 2,
      beds: 3,
      bathrooms: 1,
      baths: 1,
      garages: 1,
    })
  })

  it('defaults at least one bed or bath per applicable room', () => {
    expect(summarizeRooms([{ kind: 'bedroom', beds: 0, baths: 0 }])).toMatchObject({
      bedrooms: 1,
      beds: 1,
    })
  })
})

describe('sanitizeRoomCounts', () => {
  it('clears beds and baths on non-applicable room kinds', () => {
    expect(sanitizeRoomCounts({ kind: 'kitchen', beds: 1, baths: 1 })).toEqual({
      kind: 'kitchen',
      beds: 0,
      baths: 0,
    })
  })
})
