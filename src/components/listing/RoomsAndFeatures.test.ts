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

describe('T3 / T4 / A16: buildRoomTiles hides non-residential bed/bath counts', () => {
  const apartmentStarters = [
    room('1', 'Bedroom', 'bedroom', 1),
    room('2', 'Bathroom', 'bathroom', 0, 1),
    room('3', 'Kitchen', 'kitchen'),
    room('4', 'Lounge', 'living'),
  ]
  it('T3: Industrial with leftover 1 bed / 1 bath and apartment starters emits no Bedroom/Bathroom count tiles', () => {
    const tiles = buildRoomTiles({
      type: 'Industrial',
      beds: 1,
      baths: 1,
      parking: 1,
      area: 217,
      rooms: apartmentStarters,
    })
    expect(tiles.some((t) => t.key === 'beds' || t.key === 'baths')).toBe(false)
    expect(tiles.map((t) => t.label)).not.toContain('Bedroom')
    expect(tiles.map((t) => t.label)).not.toContain('Bathroom')
    expect(tiles.map((t) => t.label)).toContain('Kitchen')
    expect(tiles.map((t) => t.label)).toContain('Lounge')
  })
  it('T4: a bedroom room with beds: 0 does not become 1', () => {
    const tiles = buildRoomTiles({
      type: 'House',
      beds: 0,
      baths: 0,
      parking: 0,
      rooms: [room('1', 'Spare', 'bedroom', 0), room('2', 'Bath', 'bathroom', 0, 0)],
    })
    expect(tiles.some((t) => t.key === 'beds' || t.label === 'Bedroom' || t.label === 'Bedrooms')).toBe(false)
  })
  it('A16: Farm with 4 beds shows a bedroom count tile', () => {
    const tiles = buildRoomTiles({ type: 'Farm', beds: 4, baths: 2, parking: 0, rooms: [] })
    expect(tiles.find((t) => t.key === 'beds')?.value).toBe(4)
    expect(tiles.find((t) => t.key === 'baths')?.value).toBe(2)
  })
  it('A16: Farm with 0 beds/baths hides the count tiles', () => {
    const tiles = buildRoomTiles({
      type: 'Farm',
      beds: 0,
      baths: 0,
      parking: 0,
      rooms: apartmentStarters,
    })
    expect(tiles.some((t) => t.key === 'beds' || t.key === 'baths')).toBe(false)
  })
  it('A16: Vacant Land with a stray 2 beds still emits no Bedroom/Bathroom tiles', () => {
    const tiles = buildRoomTiles({ type: 'Vacant Land', beds: 2, baths: 1, parking: 0, rooms: apartmentStarters })
    expect(tiles.some((t) => t.key === 'beds' || t.key === 'baths')).toBe(false)
  })
})
