import type { Building, InfraRoom, RoomKind } from '../data/infrastructure'
import type { PropertyAsset, Room } from '../types/domain'
import { uid } from '../data/seed'

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
}

export function defaultWizardRooms(): WizardRoomDraft[] {
  return [
    { id: uid('r'), name: 'Bedroom', kind: 'bedroom', beds: 1, baths: 0, areaSqm: '' },
    { id: uid('r'), name: 'Bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: '' },
    { id: uid('r'), name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: '' },
    { id: uid('r'), name: 'Lounge', kind: 'living', beds: 0, baths: 0, areaSqm: '' },
  ]
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
  }
}
