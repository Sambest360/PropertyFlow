import type { AssetCondition, Building, InfraRoom, InternalAsset, RoomKind } from '../data/infrastructure'
import type { PropertyAsset, Room } from '../types/domain'
import { uid } from '../data/seed'
import { togglePropertyFeature, type ListingMode } from './propertyFeatures'
import { summarizeRooms } from './roomSummary'

export const UNFURNISHED_AMENITY_LABEL = 'Unfurnished'

export type WizardRoomDraft = {
  id: string
  name: string
  kind: RoomKind
  beds: number
  baths: number
  areaSqm: string
}

export type PropertyWizardDraft = {
  listingMode: 'rent' | 'sale' | 'both'
  propertyType: string
  buildingName: string
  existingBuildingId: string
  address: string
  suburb: string
  city: string
  province: string
  postalCode: string
  lat: number
  lng: number
  placeId: string
  formattedAddress: string
  grading: import('../data/infrastructure').BuildingGrading
  solarCapacityKw: string
  hasBorehole: boolean
  buildingImages: string[]
  title: string
  parking: number
  rooms: WizardRoomDraft[]
  amenities: string[]
  price: string
  rent: string
  depositHint: string
  minStayDays: string
  instantBook: boolean
  description: string
  agencyId: string
  landlordId: string
  linkLandlord: boolean
  landlordManualName: string
  landlordManualEmail: string
  landlordManualPhone: string
  landlordEntryMode: 'search' | 'manual'
  agentId: string
  publishAfterSave: boolean
  draftPropertyId: string
  /** Set when user explicitly saves mid-wizard (save & continue / assets later). */
  resumeDraftPropertyId?: string
  /** Stable FE ids for idempotent create retries (sessionStorage). */
  pendingCreateIds?: { propertyId: string; buildingId?: string; roomIds: string[] }
  /** Server units.idempotency_key (wizard session). */
  createIdempotencyKey?: string
  /** In-unit inventory captured at the Assets step (P1-2); matched to rooms on save. */
  starterAssets: WizardAssetDraft[]
  /** When true, rooms use the no-bedroom open-plan preset (0 beds on listings). */
  listingUnfurnished?: boolean
  requireViewingToApply?: 'inherit' | 'on' | 'off'
  /** Restored when turning off unfurnished / no-bedroom mode. */
  roomsBeforeUnfurnished?: WizardRoomDraft[]
}

export function defaultWizardRooms(): WizardRoomDraft[] {
  return [
    { id: uid('r'), name: 'Bedroom', kind: 'bedroom', beds: 1, baths: 0, areaSqm: '' },
    { id: uid('r'), name: 'Bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: '' },
    { id: uid('r'), name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: '' },
    { id: uid('r'), name: 'Lounge', kind: 'living', beds: 0, baths: 0, areaSqm: '' },
  ]
}

/** Open-plan layout with no bedroom rooms — 0 bedrooms on marketplace cards. */
export function defaultUnfurnishedWizardRooms(): WizardRoomDraft[] {
  return [
    { id: uid('r'), name: 'Open plan living', kind: 'living', beds: 0, baths: 0, areaSqm: '' },
    { id: uid('r'), name: 'Bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: '' },
    { id: uid('r'), name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: '' },
  ]
}

export function unfurnishedBedroomCount(rooms: WizardRoomDraft[]): number {
  return summarizeRooms(rooms.map((r) => ({ kind: r.kind, beds: r.beds, baths: r.baths }))).bedrooms
}

export function applyUnfurnishedListingPreset(
  draft: PropertyWizardDraft,
  listingMode: ListingMode | PropertyWizardDraft['listingMode'],
): PropertyWizardDraft {
  const snapshot = draft.roomsBeforeUnfurnished ?? draft.rooms
  let amenities = draft.amenities
  if (listingMode === 'rent' || listingMode === 'both') {
    amenities = togglePropertyFeature(amenities, UNFURNISHED_AMENITY_LABEL, listingMode)
  }
  return {
    ...draft,
    listingUnfurnished: true,
    roomsBeforeUnfurnished: snapshot,
    rooms: defaultUnfurnishedWizardRooms(),
    amenities,
    starterAssets: [],
  }
}

export function clearUnfurnishedListingPreset(draft: PropertyWizardDraft): PropertyWizardDraft {
  const furnishingLabels = new Set(['Furnished', 'Semi-furnished', UNFURNISHED_AMENITY_LABEL])
  return {
    ...draft,
    listingUnfurnished: false,
    rooms: draft.roomsBeforeUnfurnished?.length ? draft.roomsBeforeUnfurnished : defaultWizardRooms(),
    roomsBeforeUnfurnished: undefined,
    amenities: draft.amenities.filter((a) => !furnishingLabels.has(a)),
  }
}

/** Amenities step: selecting Unfurnished applies the room preset; clearing it restores bedrooms. */
export function draftAfterAmenitiesChange(
  draft: PropertyWizardDraft,
  amenities: string[],
): PropertyWizardDraft {
  const had = draft.amenities.includes(UNFURNISHED_AMENITY_LABEL)
  const has = amenities.includes(UNFURNISHED_AMENITY_LABEL)
  if (has && !had && (draft.listingMode === 'rent' || draft.listingMode === 'both')) {
    return applyUnfurnishedListingPreset({ ...draft, amenities }, draft.listingMode)
  }
  if (!has && (had || draft.listingUnfurnished)) {
    return { ...clearUnfurnishedListingPreset({ ...draft, amenities }), amenities }
  }
  return { ...draft, amenities }
}

function roomsFromProperty(infraRooms: InfraRoom[], propertyRooms: Room[]): WizardRoomDraft[] {
  if (infraRooms.length > 0) {
    return infraRooms.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      beds: r.beds,
      baths: r.baths,
      areaSqm: r.areaSqm != null ? String(r.areaSqm) : '',
    }))
  }
  if (propertyRooms.length > 0) {
    return propertyRooms.map((r) => ({
      id: r.id,
      name: r.name,
      kind: (r.kind as RoomKind) ?? 'other',
      beds: r.beds,
      baths: r.baths,
      areaSqm: r.area != null ? String(r.area) : '',
    }))
  }
  return defaultWizardRooms()
}

/** A single in-unit inventory item captured in the create wizard (Assets step). */
export type WizardAssetDraft = {
  id: string
  /** Room name from the wizard's room drafts — matched to a room id on save. */
  roomName: string
  itemName: string
  assetTypeKey: string
  brand: string
  condition: AssetCondition
}

export function emptyWizardAsset(roomName = ''): WizardAssetDraft {
  return {
    id: uid('wa'),
    roomName,
    itemName: '',
    assetTypeKey: 'APPLIANCE',
    brand: '',
    condition: 'Good',
  }
}

/** Seed the Assets step from an existing property's inventory (edit mode). */
export function wizardAssetDraftsFromProperty(assets: InternalAsset[]): WizardAssetDraft[] {
  return assets.map((a) => ({
    id: uid('wa'),
    roomName: '',
    itemName: a.itemName,
    assetTypeKey: a.assetTypeKey,
    brand: a.brand ?? '',
    condition: a.condition,
  }))
}

export function draftFromProperty(
  property: PropertyAsset,
  building: Building | undefined,
  infraRooms: InfraRoom[],
): PropertyWizardDraft {
  return {
    listingMode: property.listingMode,
    propertyType: property.type,
    buildingName: building?.name ?? '',
    existingBuildingId: property.buildingId ?? '',
    address: property.address,
    suburb: property.suburb,
    city: property.city,
    province: building?.province ?? 'Eastern Cape',
    postalCode: '',
    lat: property.lat ?? building?.lat ?? -33.96,
    lng: property.lng ?? building?.lng ?? 25.6,
    placeId: property.placeId ?? '',
    formattedAddress: property.formattedAddress ?? '',
    grading: (property.grading ?? building?.grading ?? null) as PropertyWizardDraft['grading'],
    solarCapacityKw: String(property.solarCapacityKw ?? building?.solarCapacityKw ?? 0),
    hasBorehole: property.hasBorehole ?? building?.hasBorehole ?? false,
    buildingImages: building?.images?.length ? building.images : property.images,
    title: property.title,
    parking: property.parking,
    rooms: roomsFromProperty(infraRooms, property.rooms ?? []),
    amenities: property.amenities ?? [],
    price: property.price != null ? String(property.price) : '',
    rent: property.rent != null ? String(property.rent) : '',
    depositHint: '',
    minStayDays: '30',
    instantBook: false,
    description: property.description,
    agencyId: property.agencyId,
    landlordId: property.landlordId ?? '',
    linkLandlord: Boolean(property.landlordId),
    landlordManualName: '',
    landlordManualEmail: '',
    landlordManualPhone: '',
    landlordEntryMode: 'search',
    agentId: property.agentId ?? '',
    publishAfterSave: false,
    draftPropertyId: property.id,
    // Edit mode manages existing inventory on the detail page's inventory tab;
    // the wizard's starter list stays empty so nothing is duplicated on save.
    starterAssets: [],
    listingUnfurnished: property.amenities?.includes(UNFURNISHED_AMENITY_LABEL) ?? false,
    requireViewingToApply:
      property.requireViewingToApply === true
        ? 'on'
        : property.requireViewingToApply === false
          ? 'off'
          : 'inherit',
  }
}
