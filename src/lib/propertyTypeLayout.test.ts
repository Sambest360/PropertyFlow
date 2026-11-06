import { describe, expect, it } from 'vitest'
import { propertyTypeLayout, roomsLookUntouched } from './propertyTypeLayout'
import { defaultWizardRooms, INITIAL_WIZARD_PROPERTY_TYPE } from './propertyWizardDraft'

describe('T5: shouldReplaceStarterRooms', () => {
  it('replaces untouched rooms when picking House from a blank type (same residential family)', async () => {
    const mod = await import('./propertyTypeLayout')
    expect(mod).toHaveProperty('shouldReplaceStarterRooms')
    const shouldReplace = (
      mod as {
        shouldReplaceStarterRooms: (
          prevType: string,
          nextType: string,
          rooms: ReturnType<typeof defaultWizardRooms>,
        ) => boolean
      }
    ).shouldReplaceStarterRooms
    const untouched = defaultWizardRooms()
    expect(roomsLookUntouched(untouched)).toBe(true)
    expect(shouldReplace(INITIAL_WIZARD_PROPERTY_TYPE, 'House', untouched)).toBe(true)
    expect(shouldReplace('', 'House', untouched)).toBe(true)
    const house = propertyTypeLayout('House')
    expect(house.showBeds).toBe(true)
    expect(house.starterRooms().filter((r) => r.kind === 'bedroom').length).toBeGreaterThanOrEqual(2)
    // A later House → Townhouse (same family, rooms still untouched) still does not swap.
    expect(shouldReplace('House', 'Townhouse', house.starterRooms())).toBe(false)
    // Blank → Industrial does swap (different family).
    expect(shouldReplace('', 'Industrial', untouched)).toBe(true)
  })
})

describe('A16: Farm wizard lets you enter bedrooms and bathrooms; Vacant Land stays land-only', () => {
  it('Farm shows bed and bath fields and is not land-only', () => {
    const farm = propertyTypeLayout('Farm')
    expect(farm.showBeds).toBe(true)
    expect(farm.showBaths).toBe(true)
    expect(farm.landOnly).toBe(false)
  })
  it('Vacant Land stays land-only with no bed/bath fields', () => {
    const land = propertyTypeLayout('Vacant Land')
    expect(land.landOnly).toBe(true)
    expect(land.showBeds).toBe(false)
    expect(land.showBaths).toBe(false)
  })
})
