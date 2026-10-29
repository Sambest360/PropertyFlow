import { describe, expect, it } from 'vitest'
import { kindLabelFor, propertyTypeLayout, roomsLookUntouched } from './propertyTypeLayout'

describe('propertyTypeLayout', () => {
  it('gives land no rooms, only the erf size', () => {
    const l = propertyTypeLayout('Vacant Land')
    expect(l.landOnly).toBe(true)
    expect(l.stats).toEqual(['area'])
    expect(l.showFurnished).toBe(false)
  })
  it('shows offices as spaces without beds', () => {
    const l = propertyTypeLayout('Office')
    expect(l.showBeds).toBe(false)
    expect(kindLabelFor(l, 'study')).toBe('Office')
    expect(l.starterRooms().some((r) => r.kind === 'bedroom')).toBe(false)
  })
  it('counts beds for student accommodation', () => {
    expect(propertyTypeLayout('Student Accommodation').stats).toContain('beds')
  })
  it('keeps houses on the full room list', () => {
    expect(propertyTypeLayout('House').kinds).toHaveLength(8)
  })
  it('treats starter rooms as replaceable but not edited ones', () => {
    const rooms = propertyTypeLayout('House').starterRooms()
    expect(roomsLookUntouched(rooms)).toBe(true)
    expect(roomsLookUntouched([{ ...rooms[0], areaSqm: '14' }])).toBe(false)
  })
})
