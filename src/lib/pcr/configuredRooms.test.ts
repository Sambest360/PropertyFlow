import { describe, expect, it } from 'vitest'
import { PLATFORM_CATALOGUE } from '../../data/platformLookups'
import { createInspection } from './inspections'
import { defaultResidentialTemplate, templateFromConfiguredRooms } from './templates'

describe('configurable PCR rooms', () => {
  it('builds a new inspection from the agency rooms, skipping rooms with no items', () => {
    const rooms = templateFromConfiguredRooms([
      { name: 'Lounge', items: ['Walls', ' Couch '] },
      { name: 'Empty room', items: [] },
      { name: 'Garage', items: ['Door motor'] },
    ])
    const insp = createInspection({ id: 'pcr-x', agencyId: 'a', applicationId: 'A', propertyId: 'P', kind: 'incoming', now: 'n', rooms })
    expect(insp.rooms.map((r) => r.name)).toEqual(['Lounge', 'Garage'])
    expect(insp.rooms[0].items.map((i) => i.label)).toEqual(['Walls', 'Couch'])
    expect(insp.rooms.every((r) => r.items.every((i) => i.condition === 'not_checked'))).toBe(true)
  })

  it('falls back to the built-in template when nothing usable is configured', () => {
    const insp = createInspection({ id: 'pcr-y', agencyId: 'a', applicationId: 'A', propertyId: 'P', kind: 'incoming', now: 'n', rooms: [] })
    expect(insp.rooms.map((r) => r.name)).toEqual(defaultResidentialTemplate().map((r) => r.name))
  })

  it('seeds the Configuration list from the built-in template', () => {
    expect(PLATFORM_CATALOGUE.PCR_ROOM.map((r) => r.label)).toEqual(defaultResidentialTemplate().map((r) => r.name))
    expect(PLATFORM_CATALOGUE.PCR_ROOM[0].meta).toEqual({ items: defaultResidentialTemplate()[0].items.map((i) => i.label) })
  })
})
