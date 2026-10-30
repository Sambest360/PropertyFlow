import type { AssetCondition, Building, InfraRoom, InternalAsset, RoomKind } from '../data/infrastructure'
import type { PropertyAsset, Room } from '../types/domain'
import { uid } from '../data/seed'
import { togglePropertyFeature, type ListingMode } from './propertyFeatures'
import { summarizeRooms } from './roomSummary'
import { MAX_FLOOR_SIZE_SQM, effectiveFloorSizeSqm, parseFloorSizeSqm, parseSizeSqm } from './listingSizes'
import { propertyTypeLayout } from './propertyTypeLayout'

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
  /** T2: explicit floor size m² (units.square_meters); blank = the room sum. */
  floorSizeSqm?: string
  /** T2: erf / stand size m² (units.erf_size_sqm); optional, blank for sectional title. */
  erfSizeSqm?: string
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
  /** Rent: listed as Unfurnished (rooms unchanged). Sale: no-bedroom open-plan preset. */
  listingUnfurnished?: boolean
  requireViewingToApply?: 'inherit' | 'on' | 'off'
  /** Rooms the sale open-plan preset replaced; restored when it is turned off. */
  roomsBeforeUnfurnished?: WizardRoomDraft[]
}

/**
 * units.idempotency_key for a wizard create. The key belongs to one pending
 * property id: a stored key from an earlier listing (or the legacy
 * `create:<storageKey>` form without an id) is replaced, otherwise every new
 * listing reuses it and hits ux_units_idempotency_key.
 */
export function wizardCreateIdempotencyKey(
  storageKey: string,
  propertyId: string,
  existing?: string,
): string {
  return existing && existing.endsWith(`:${propertyId}`) ? existing : `create:${storageKey}:${propertyId}`
}

/** T2 (spec r4): a new listing starts with NO property type; the agent must pick one. */
export const INITIAL_WIZARD_PROPERTY_TYPE = ''

export function wizardTypeError(propertyType: string | null | undefined): string | null {
  return propertyType && propertyType.trim() ? null : 'Select a property type.'
}

/** Types the wizard always offers (T2), unless the agency hid them. */
export const BUILT_IN_WIZARD_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Industrial', label: 'Industrial' },
  { value: 'Commercial', label: 'Commercial' },
  { value: 'Farm', label: 'Farm' },
]

/**
 * The wizard's type list: the agency's lookup options, plus Industrial /
 * Commercial / Farm when its stored list predates them. `knownKeys` is every
 * PROPERTY_TYPE key the agency has, active or hidden; a hidden one stays hidden.
 */
export function wizardTypeOptions(
  lookupOptions: Array<{ value: string; label: string }>,
  knownKeys: ReadonlySet<string>,
): Array<{ value: string; label: string }> {
  const have = new Set([...knownKeys, ...lookupOptions.map((o) => o.value)].map((k) => k.toLowerCase()))
  return [...lookupOptions, ...BUILT_IN_WIZARD_TYPES.filter((t) => !have.has(t.value.toLowerCase()))]
}

/** Rooms step: room names, and sizes ≥ 0. No room is required (beds = 0 is valid); erf is never required. */
export function wizardRoomsStepError(
  d: Pick<PropertyWizardDraft, 'propertyType' | 'rooms' | 'floorSizeSqm' | 'erfSizeSqm'>,
): string | null {
  if (parseSizeSqm(d.erfSizeSqm) === 'invalid') {
    return 'Erf / stand size must be a number of m² (0 to 9 999 999 999.99), or left blank.'
  }
  if (parseFloorSizeSqm(d.floorSizeSqm) === 'invalid') {
    return 'Floor size must be a number of m² (0 to 99 999 999.99), or left blank.'
  }
  // A blank floor size saves the room sum, which has the same column maximum.
  if (effectiveFloorSizeSqm(d.floorSizeSqm, d.rooms) > MAX_FLOOR_SIZE_SQM) {
    return 'The room sizes add up to more than 99 999 999.99 m². Check the room sizes or enter the floor size.'
  }
  if (!propertyTypeLayout(d.propertyType).landOnly && d.rooms.some((room) => !room.name.trim())) {
    return 'Every room needs a name.'
  }
  return null
}

/** Rooms to save: exactly what was entered. No default bedroom (an empty set means 0 beds). */
export function wizardRoomRowsForSave<T>(rooms: T[]): T[] {
  return rooms
}

/**
 * Sizes for the save payload: area = floor (explicit wins over the room sum),
 * erfSizeSqm separate and never summed. Without the erf column (037 not
 * applied) erfSizeSqm is left out so the stored value is not touched.
 */
export function wizardSizesForSave(
  d: Pick<PropertyWizardDraft, 'propertyType' | 'rooms' | 'floorSizeSqm' | 'erfSizeSqm'>,
  opts: { erfSupported: boolean },
): { area: number; erfSizeSqm?: number | null } {
  const area = effectiveFloorSizeSqm(d.floorSizeSqm, d.rooms)
  if (!opts.erfSupported) return { area }
  const erf = parseSizeSqm(d.erfSizeSqm)
  return { area, erfSizeSqm: erf === 'invalid' ? null : erf }
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

/**
 * Rent listings: Unfurnished means no furniture, not no bedrooms — set the
 * Unfurnished feature and drop the starter (furniture) inventory, but keep the
 * rooms, bedrooms and beds exactly as entered. Sale listings have no furnishing
 * feature; there the same switch is "No bedrooms (open plan)" and swaps in the
 * open-plan room layout.
 */
export function applyUnfurnishedListingPreset(
  draft: PropertyWizardDraft,
  listingMode: ListingMode | PropertyWizardDraft['listingMode'],
): PropertyWizardDraft {
  if (listingMode === 'rent' || listingMode === 'both') {
    return {
      ...draft,
      listingUnfurnished: true,
      amenities: draft.amenities.includes(UNFURNISHED_AMENITY_LABEL)
        ? draft.amenities
        : togglePropertyFeature(draft.amenities, UNFURNISHED_AMENITY_LABEL, listingMode),
      starterAssets: [],
    }
  }
  return {
    ...draft,
    listingUnfurnished: true,
    roomsBeforeUnfurnished: draft.roomsBeforeUnfurnished ?? draft.rooms,
    rooms: defaultUnfurnishedWizardRooms(),
    starterAssets: [],
  }
}

export function clearUnfurnishedListingPreset(draft: PropertyWizardDraft): PropertyWizardDraft {
  const furnishingLabels = new Set(['Furnished', 'Semi-furnished', UNFURNISHED_AMENITY_LABEL])
  return {
    ...draft,
    listingUnfurnished: false,
    // Only the sale open-plan preset swapped the rooms out; put those back.
    // Otherwise the rooms were never touched, so keep them.
    rooms: draft.roomsBeforeUnfurnished?.length ? draft.roomsBeforeUnfurnished : draft.rooms,
    roomsBeforeUnfurnished: undefined,
    amenities: draft.amenities.filter((a) => !furnishingLabels.has(a)),
  }
}

/** Amenities step: selecting Unfurnished marks the listing unfurnished; clearing it unmarks it. */
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

function roomsFromProperty(infraRooms: InfraRoom[], propertyRooms: Room[], beds: number): WizardRoomDraft[] {
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
  // T2: a 0-bed listing with no rooms stays at 0 beds (no invented bedroom).
  return beds > 0 ? defaultWizardRooms() : []
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
  const rooms = roomsFromProperty(infraRooms, property.rooms ?? [], Number(property.beds) || 0)
  const roomSum = effectiveFloorSizeSqm('', rooms)
  return {
    listingMode: property.listingMode,
    propertyType: property.type,
    buildingName: building?.name ?? '',
    existingBuildingId: property.buildingId ?? '',
    // The listing address carries a ", <unit>" suffix; edit the building's own address.
    address: building?.addressLine1 || property.address,
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
    rooms,
    // Only an area that differs from the room sum was an explicit floor entry.
    floorSizeSqm: property.area > 0 && property.area !== roomSum ? String(property.area) : '',
    // Erf only from its own column, never from the floor size.
    erfSizeSqm: property.erfSizeSqm != null ? String(property.erfSizeSqm) : '',
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
