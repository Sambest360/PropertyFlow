import { describe, expect, it } from 'vitest'
import { roomsLookUntouched, shouldReplaceStarterRooms } from './propertyTypeLayout'
import { defaultWizardRooms, draftFromProperty, INITIAL_WIZARD_PROPERTY_TYPE } from './propertyWizardDraft'
import type { WizardRoomDraft } from './propertyWizardDraft'
import type { PropertyAsset } from '../types/domain'

describe('CR-5: first type pick on an inferred listing must keep stored rooms', () => {
  const stored: WizardRoomDraft[] = [
    { id: 'r-1', name: 'Sun room', kind: 'other', beds: 0, baths: 0, areaSqm: '' },
    { id: 'r-2', name: 'Main bedroom', kind: 'bedroom', beds: 1, baths: 0, areaSqm: '' },
    { id: 'r-3', name: 'Family bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: '' },
  ]

  it('edit mode: blank prevType must not replace stored rooms (inferred hydrate)', () => {
    expect(roomsLookUntouched(stored)).toBe(true)
    expect(shouldReplaceStarterRooms('', 'House', stored, { isEdit: true })).toBe(false)
    expect(shouldReplaceStarterRooms('', 'Apartment', stored, { isEdit: true })).toBe(false)
    expect(
      shouldReplaceStarterRooms(INITIAL_WIZARD_PROPERTY_TYPE, 'House', stored, { isEdit: true }),
    ).toBe(false)
  })

  it('create mode: blank → House on empty/defaultWizardRooms still replaces (T5)', () => {
    expect(shouldReplaceStarterRooms('', 'House', defaultWizardRooms(), { isEdit: false })).toBe(true)
    expect(shouldReplaceStarterRooms('', 'House', [], { isEdit: false })).toBe(true)
    expect(shouldReplaceStarterRooms('', 'House', defaultWizardRooms())).toBe(true)
  })

  it('draftFromProperty on an inferred fixture hydrates blank type; picking House keeps room names/count', () => {
    const property = {
      id: 'p-cr5',
      title: '3 Bedroom House to Rent in Pinelands',
      type: 'House',
      typeInferred: true,
      listingMode: 'rent',
      beds: 2,
      baths: 1,
      parking: 0,
      rooms: stored.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        beds: r.beds,
        baths: r.baths,
      })),
      address: '1 Test St',
      suburb: 'Pinelands',
      city: 'Cape Town',
      agencyId: 'ag-1',
      status: 'Draft',
      images: [],
      amenities: [],
    } as unknown as PropertyAsset
    const draft = draftFromProperty(property, undefined, [])
    expect(draft.propertyType).toBe('')
    expect(draft.rooms.map((r) => r.name)).toEqual(['Sun room', 'Main bedroom', 'Family bathroom'])
    // Simulate the PropertyCreatePage type-pick effect in edit mode.
    const prevType = draft.propertyType
    const nextType = 'House'
    const replace = shouldReplaceStarterRooms(prevType, nextType, draft.rooms, { isEdit: true })
    expect(replace).toBe(false)
    const after = replace ? draft.rooms /* would be starters */ : draft.rooms
    expect(after.map((r) => r.name)).toEqual(['Sun room', 'Main bedroom', 'Family bathroom'])
    expect(after).toHaveLength(3)
  })
})
