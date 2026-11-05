import { describe, expect, it } from 'vitest'
import { matchesBrowseMode } from './browseMode'
import { sharedRoomsLabel } from './sharedAccommodation'

describe('shared accommodation', () => {
  const shared = { type: 'Shared Accommodation', listingMode: 'rent' as const, price: null, rent: 3500, beds: 5, roomsLet: 2 }
  it('has its own browse section', () => {
    expect(matchesBrowseMode(shared, 'shared')).toBe(true)
    expect(matchesBrowseMode(shared, 'rent')).toBe(false)
    expect(matchesBrowseMode({ ...shared, type: 'House' }, 'shared')).toBe(false)
  })
  it('shows rooms available', () => {
    expect(sharedRoomsLabel(shared)).toBe('3 of 5 rooms available')
    expect(sharedRoomsLabel({ ...shared, roomsLet: 5 })).toBe('All rooms taken')
  })
})
