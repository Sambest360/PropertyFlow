import { describe, expect, it } from 'vitest'
import {
  applyUnfurnishedListingPreset,
  clearUnfurnishedListingPreset,
  defaultUnfurnishedWizardRooms,
  draftAfterAmenitiesChange,
  unfurnishedBedroomCount,
  UNFURNISHED_AMENITY_LABEL,
  wizardCreateIdempotencyKey,
  type PropertyWizardDraft,
} from './propertyWizardDraft'
import { defaultWizardRooms } from './propertyWizardDraft'

function baseDraft(overrides: Partial<PropertyWizardDraft> = {}): PropertyWizardDraft {
  return {
    listingMode: 'rent',
    propertyType: 'Apartment',
    buildingName: '',
    existingBuildingId: '',
    address: '',
    suburb: '',
    city: '',
    province: 'Eastern Cape',
    postalCode: '',
    lat: 0,
    lng: 0,
    placeId: '',
    formattedAddress: '',
    grading: null,
    solarCapacityKw: '0',
    hasBorehole: false,
    buildingImages: [],
    title: '',
    parking: 0,
    rooms: defaultWizardRooms(),
    amenities: ['Fibre'],
    price: '',
    rent: '',
    depositHint: '',
    minStayDays: '30',
    instantBook: false,
    description: '',
    agencyId: 'ag-1',
    landlordId: '',
    linkLandlord: false,
    landlordManualName: '',
    landlordManualEmail: '',
    landlordManualPhone: '',
    landlordEntryMode: 'search',
    agentId: '',
    publishAfterSave: false,
    draftPropertyId: '',
    starterAssets: [{ id: 'wa-1', roomName: 'Bedroom', itemName: 'Couch', assetTypeKey: 'FURNITURE', brand: '', condition: 'Good' }],
    ...overrides,
  }
}

describe('unfurnished listing', () => {
  const beds = (rooms: PropertyWizardDraft['rooms']) => rooms.reduce((n, r) => n + (r.kind === 'bedroom' ? r.beds : 0), 0)

  it('rent: Unfurnished keeps bedrooms and beds, sets the feature, clears starter furniture', () => {
    const draft = baseDraft()
    const next = applyUnfurnishedListingPreset(draft, 'rent')
    expect(next.rooms).toEqual(draft.rooms)
    expect(unfurnishedBedroomCount(next.rooms)).toBe(1)
    expect(beds(next.rooms)).toBe(1)
    expect(next.amenities).toContain(UNFURNISHED_AMENITY_LABEL)
    expect(next.starterAssets).toEqual([])
    expect(next.listingUnfurnished).toBe(true)
    expect(next.roomsBeforeUnfurnished).toBeUndefined()
  })

  it('rent: unticking Unfurnished keeps the rooms and removes the feature', () => {
    const applied = applyUnfurnishedListingPreset(baseDraft(), 'rent')
    const edited = { ...applied, rooms: [...applied.rooms, { ...applied.rooms[0]!, id: 'r-2', name: 'Bedroom 2' }] }
    const cleared = clearUnfurnishedListingPreset(edited)
    expect(cleared.listingUnfurnished).toBe(false)
    expect(cleared.rooms).toEqual(edited.rooms)
    expect(cleared.amenities).not.toContain(UNFURNISHED_AMENITY_LABEL)
  })

  it('choosing Unfurnished on the features step keeps it selected and keeps bedrooms', () => {
    const next = draftAfterAmenitiesChange(baseDraft(), ['Fibre', UNFURNISHED_AMENITY_LABEL])
    expect(next.listingUnfurnished).toBe(true)
    expect(next.amenities).toContain(UNFURNISHED_AMENITY_LABEL)
    expect(unfurnishedBedroomCount(next.rooms)).toBe(1)
  })

  it('sale: "No bedrooms (open plan)" swaps in the open-plan layout and restores it', () => {
    const draft = baseDraft({ listingMode: 'sale' })
    const applied = applyUnfurnishedListingPreset(draft, 'sale')
    expect(unfurnishedBedroomCount(applied.rooms)).toBe(0)
    expect(defaultUnfurnishedWizardRooms().every((r) => r.kind !== 'bedroom')).toBe(true)
    const cleared = clearUnfurnishedListingPreset(applied)
    expect(cleared.rooms).toEqual(draft.rooms)
  })
})

describe('wizardCreateIdempotencyKey', () => {
  const storageKey = 'propertyflow:property-create:ag-14gu4m'

  it('keeps a stored key that belongs to the pending property', () => {
    const key = `create:${storageKey}:unt-new1`
    expect(wizardCreateIdempotencyKey(storageKey, 'unt-new1', key)).toBe(key)
  })

  it('replaces a key left over from an earlier listing', () => {
    expect(wizardCreateIdempotencyKey(storageKey, 'unt-new2', `create:${storageKey}:unt-old`)).toBe(
      `create:${storageKey}:unt-new2`,
    )
  })

  it('replaces the legacy per-agency key that had no property id', () => {
    expect(wizardCreateIdempotencyKey(storageKey, 'unt-new3', `create:${storageKey}`)).toBe(
      `create:${storageKey}:unt-new3`,
    )
  })
})
