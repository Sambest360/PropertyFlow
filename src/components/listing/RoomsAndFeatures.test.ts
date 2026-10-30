import { describe, expect, it } from 'vitest'
import { buildRoomTiles } from './RoomsAndFeatures'

const room = (id: string, name: string, kind?: string, beds = 0, baths = 0) => ({ id, name, kind, beds, baths })

describe('buildRoomTiles', () => {
  it('does not repeat bedrooms/bathrooms from the room configuration', () => {
    const tiles = buildRoomTiles({
      beds: 1,
      baths: 1,
      parking: 1,
      area: 217,
      rooms: [room('1', 'Kitchen', 'kitchen'), room('2', 'Lounge', 'living'), room('3', 'Bedroom', 'bedroom', 1), room('4', 'Bathroom', 'bathroom', 0, 1)],
    })
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ['Bedroom', 1],
      ['Bathroom', 1],
      ['Parking', 1],
      ['Floor area', '217 m²'],
      ['Kitchen', 1],
      ['Lounge', 1],
    ])
  })

  it('falls back to room counts when headline counts are missing', () => {
    const tiles = buildRoomTiles({
      beds: 0,
      baths: 0,
      parking: 0,
      rooms: [room('1', 'Main', 'bedroom', 1), room('2', 'Second', 'bedroom', 1), room('3', 'En-suite', 'bathroom', 0, 1)],
    })
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ['Bedrooms', 2],
      ['Bathroom', 1],
    ])
  })

  it('returns nothing when there is nothing to show', () => {
    expect(buildRoomTiles({ beds: 0, baths: 0, parking: 0, rooms: [] })).toEqual([])
  })
})
