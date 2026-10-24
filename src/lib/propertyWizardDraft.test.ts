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

describe('unfurnished listing preset', () => {
  it('applyUnfurnishedListingPreset sets 0 bedrooms and Unfurnished amenity', () => {
    const next = applyUnfurnishedListingPreset(baseDraft(), 'rent')
    expect(unfurnishedBedroomCount(next.rooms)).toBe(0)
    expect(next.amenities).toContain(UNFURNISHED_AMENITY_LABEL)
    expect(next.starterAssets).toEqual([])
    expect(next.listingUnfurnished).toBe(true)
    expect(next.roomsBeforeUnfurnished?.length).toBeGreaterThan(0)
  })

  it('defaultUnfurnishedWizardRooms has no bedroom kind', () => {
    expect(defaultUnfurnishedWizardRooms().every((r) => r.kind !== 'bedroom')).toBe(true)
  })

  it('clearUnfurnishedListingPreset restores prior rooms', () => {
    const applied = applyUnfurnishedListingPreset(baseDraft(), 'rent')
    const cleared = clearUnfurnishedListingPreset(applied)
    expect(cleared.listingUnfurnished).toBe(false)
    expect(unfurnishedBedroomCount(cleared.rooms)).toBeGreaterThan(0)
    expect(cleared.amenities).not.toContain(UNFURNISHED_AMENITY_LABEL)
  })

  it('draftAfterAmenitiesChange applies preset when Unfurnished selected', () => {
    const next = draftAfterAmenitiesChange(baseDraft(), ['Fibre', UNFURNISHED_AMENITY_LABEL])
    expect(next.listingUnfurnished).toBe(true)
    expect(unfurnishedBedroomCount(next.rooms)).toBe(0)
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
