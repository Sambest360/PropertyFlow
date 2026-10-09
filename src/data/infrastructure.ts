import type { Role } from '../types/domain.js'

/** Room kinds used in floor-plan templates */
export type RoomKind =
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'living'
  | 'dining'
  | 'study'
  | 'garage'
  | 'other'

export type AssetCondition = 'Excellent' | 'Good' | 'Fair' | 'Damaged' | 'Needs replacement'

export type UnitListingType = 'rent' | 'sale' | 'both' | 'not_listed'

export type UnitStatusKey =
  | 'VACANT'
  | 'OCCUPIED'
  | 'UNDER_OFFER'
  | 'MAINTENANCE'
  | 'DRAFT'
  | 'PUBLISHED'
  | 'FEATURED'
  | 'DELETED'

export type BuildingGrading = 'P' | 'A' | 'B' | 'C' | null

export type LookupConfig = {
  id: string
  clientId: string
  configType: string
  keyValue: string
  displayLabel: string
  isActive: boolean
  sortOrder: number
  /** Type-specific extras — e.g. LEAD_STAGE rows carry their step requirements here. */
  meta?: Record<string, unknown>
}

export type InternalAsset = {
  id: string
  clientId: string
  unitId: string
  roomId: string | null
  itemName: string
  serialNumber?: string
  assetTypeKey: string
  condition: AssetCondition
  brand?: string
  model?: string
  purchaseValue?: number
  purchaseDate?: string
  notes?: string
  images?: string[]
  /** ISO date — commercial appliance warranty cover when still valid */
  warrantyExpiresAt?: string
  lastInspectedAt?: string
}

export type InfraRoom = {
  id: string
  clientId: string
  unitId: string
  name: string
  kind: RoomKind
  beds: number
  baths: number
  areaSqm?: number
  /** Floor-plan fill color (CSS color / token-friendly hex) */
  color?: string
  /** Floor-plan box in 0–100 coordinate space */
  layout: { x: number; y: number; w: number; h: number }
}

export type Unit = {
  id: string
  clientId: string
  buildingId: string
  agentId: string | null
  unitNumber: string
  title: string
  squareMeters: number
  bedrooms: number
  bathrooms: number
  parking: number
  listingType: UnitListingType
  price: number | null
  rent: number | null
  statusKey: UnitStatusKey
  description: string
  amenities: string[]
  images: string[]
  featured: boolean
  lat?: number
  lng?: number
  createdAt: string
}

export type Building = {
  id: string
  clientId: string
  landlordId: string | null
  name: string
  addressLine1: string
  suburb: string
  city: string
  province: string
  grading: BuildingGrading
  solarCapacityKw: number
  hasBorehole: boolean
  lat: number
  lng: number
  images: string[]
  createdAt: string
}

/** Quick-create templates — reduces repetitive typing */
export type UnitTemplateId =
  | 'studio'
  | 'one_bed'
  | 'two_bed'
  | 'three_bed_house'
  | 'student_room'
  | 'office_suite'
  | 'custom'

export type UnitTemplate = {
  id: UnitTemplateId
  label: string
  blurb: string
  bedrooms: number
  bathrooms: number
  parking: number
  squareMeters: number
  rooms: Array<{
    name: string
    kind: RoomKind
    beds: number
    baths: number
    areaSqm?: number
    layout: { x: number; y: number; w: number; h: number }
  }>
  starterAssets: Array<{
    roomName: string
    itemName: string
    assetTypeKey: string
    brand?: string
    condition: AssetCondition
  }>
}

export const UNIT_TEMPLATES: UnitTemplate[] = [
  {
    id: 'studio',
    label: 'Studio apartment',
    blurb: 'Open plan + bathroom — ideal for city rentals',
    bedrooms: 0,
    bathrooms: 1,
    parking: 1,
    squareMeters: 38,
    rooms: [
      { name: 'Studio living', kind: 'living', beds: 1, baths: 0, areaSqm: 28, layout: { x: 8, y: 12, w: 55, h: 70 } },
      { name: 'Bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: 6, layout: { x: 68, y: 12, w: 24, h: 32 } },
      { name: 'Kitchenette', kind: 'kitchen', beds: 0, baths: 0, areaSqm: 4, layout: { x: 68, y: 50, w: 24, h: 32 } },
    ],
    starterAssets: [
      { roomName: 'Kitchenette', itemName: 'Microwave', assetTypeKey: 'APPLIANCE', brand: 'Samsung', condition: 'Good' },
      { roomName: 'Studio living', itemName: 'Sofa bed', assetTypeKey: 'FURNITURE', brand: 'Coricraft', condition: 'Good' },
      { roomName: 'Studio living', itemName: '32\" TV', assetTypeKey: 'ELECTRONICS', brand: 'Hisense', condition: 'Excellent' },
    ],
  },
  {
    id: 'one_bed',
    label: '1-bedroom flat',
    blurb: 'Bedroom, bathroom, kitchen, lounge',
    bedrooms: 1,
    bathrooms: 1,
    parking: 1,
    squareMeters: 58,
    rooms: [
      { name: 'Bedroom', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 14, layout: { x: 6, y: 10, w: 40, h: 42 } },
      { name: 'Bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: 5, layout: { x: 50, y: 10, w: 20, h: 28 } },
      { name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: 8, layout: { x: 74, y: 10, w: 20, h: 42 } },
      { name: 'Lounge', kind: 'living', beds: 0, baths: 0, areaSqm: 18, layout: { x: 6, y: 58, w: 88, h: 32 } },
    ],
    starterAssets: [
      { roomName: 'Kitchen', itemName: 'Fridge-freezer', assetTypeKey: 'APPLIANCE', brand: 'Defy', condition: 'Good' },
      { roomName: 'Kitchen', itemName: 'Microwave', assetTypeKey: 'APPLIANCE', brand: 'Samsung', condition: 'Excellent' },
      { roomName: 'Bedroom', itemName: 'Double bed', assetTypeKey: 'FURNITURE', condition: 'Good' },
      { roomName: 'Lounge', itemName: '3-seater couch', assetTypeKey: 'FURNITURE', brand: 'Coricraft', condition: 'Good' },
      { roomName: 'Lounge', itemName: '43\" Smart TV', assetTypeKey: 'ELECTRONICS', brand: 'Hisense', condition: 'Excellent' },
    ],
  },
  {
    id: 'two_bed',
    label: '2-bedroom apartment',
    blurb: 'Two beds, bathroom, kitchen, lounge',
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    squareMeters: 85,
    rooms: [
      { name: 'Master bedroom', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 16, layout: { x: 5, y: 8, w: 36, h: 38 } },
      { name: 'Bedroom 2', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 12, layout: { x: 45, y: 8, w: 28, h: 38 } },
      { name: 'Bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: 6, layout: { x: 77, y: 8, w: 18, h: 28 } },
      { name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: 10, layout: { x: 77, y: 40, w: 18, h: 28 } },
      { name: 'Lounge', kind: 'living', beds: 0, baths: 0, areaSqm: 22, layout: { x: 5, y: 52, w: 68, h: 40 } },
    ],
    starterAssets: [
      { roomName: 'Kitchen', itemName: 'Fridge-freezer', assetTypeKey: 'APPLIANCE', brand: 'LG', condition: 'Excellent' },
      { roomName: 'Kitchen', itemName: 'Washing machine', assetTypeKey: 'APPLIANCE', brand: 'Defy', condition: 'Good' },
      { roomName: 'Kitchen', itemName: 'Microwave', assetTypeKey: 'APPLIANCE', brand: 'Samsung', condition: 'Good' },
      { roomName: 'Master bedroom', itemName: 'Queen bed', assetTypeKey: 'FURNITURE', condition: 'Excellent' },
      { roomName: 'Bedroom 2', itemName: 'Single bed', assetTypeKey: 'FURNITURE', condition: 'Good' },
      { roomName: 'Lounge', itemName: 'L-shaped couch', assetTypeKey: 'FURNITURE', brand: 'Coricraft', condition: 'Good' },
      { roomName: 'Lounge', itemName: '55\" Smart TV', assetTypeKey: 'ELECTRONICS', brand: 'Samsung', condition: 'Excellent' },
    ],
  },
  {
    id: 'three_bed_house',
    label: '3-bed family house',
    blurb: 'Full house layout with garden parking',
    bedrooms: 3,
    bathrooms: 2,
    parking: 2,
    squareMeters: 210,
    rooms: [
      { name: 'Master bedroom', kind: 'bedroom', beds: 1, baths: 1, areaSqm: 22, layout: { x: 4, y: 6, w: 32, h: 34 } },
      { name: 'Bedroom 2', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 14, layout: { x: 40, y: 6, w: 26, h: 28 } },
      { name: 'Bedroom 3', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 12, layout: { x: 70, y: 6, w: 26, h: 28 } },
      { name: 'Family bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: 7, layout: { x: 40, y: 38, w: 26, h: 20 } },
      { name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: 14, layout: { x: 70, y: 38, w: 26, h: 28 } },
      { name: 'Lounge', kind: 'living', beds: 0, baths: 0, areaSqm: 32, layout: { x: 4, y: 48, w: 62, h: 44 } },
      { name: 'Garage', kind: 'garage', beds: 0, baths: 0, areaSqm: 24, layout: { x: 70, y: 72, w: 26, h: 20 } },
    ],
    starterAssets: [
      { roomName: 'Kitchen', itemName: 'Fridge-freezer', assetTypeKey: 'APPLIANCE', brand: 'Samsung', condition: 'Excellent' },
      { roomName: 'Kitchen', itemName: 'Dishwasher', assetTypeKey: 'APPLIANCE', brand: 'Bosch', condition: 'Good' },
      { roomName: 'Kitchen', itemName: 'Microwave', assetTypeKey: 'APPLIANCE', brand: 'LG', condition: 'Good' },
      { roomName: 'Kitchen', itemName: 'Washing machine', assetTypeKey: 'APPLIANCE', brand: 'Defy', condition: 'Good' },
      { roomName: 'Master bedroom', itemName: 'King bed', assetTypeKey: 'FURNITURE', condition: 'Excellent' },
      { roomName: 'Bedroom 2', itemName: 'Double bed', assetTypeKey: 'FURNITURE', condition: 'Good' },
      { roomName: 'Bedroom 3', itemName: 'Single bed ×2', assetTypeKey: 'FURNITURE', condition: 'Fair' },
      { roomName: 'Lounge', itemName: 'Modular couch', assetTypeKey: 'FURNITURE', brand: 'Coricraft', condition: 'Excellent' },
      { roomName: 'Lounge', itemName: '65\" Smart TV', assetTypeKey: 'ELECTRONICS', brand: 'Hisense', condition: 'Excellent' },
    ],
  },
  {
    id: 'student_room',
    label: 'Student room',
    blurb: 'Furnished loft with laundry access',
    bedrooms: 1,
    bathrooms: 1,
    parking: 0,
    squareMeters: 28,
    rooms: [
      { name: 'Studio', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 18, layout: { x: 10, y: 15, w: 50, h: 65 } },
      { name: 'Bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: 5, layout: { x: 66, y: 15, w: 24, h: 30 } },
      { name: 'Kitchenette', kind: 'kitchen', beds: 0, baths: 0, areaSqm: 5, layout: { x: 66, y: 52, w: 24, h: 28 } },
    ],
    starterAssets: [
      { roomName: 'Studio', itemName: 'Single bed', assetTypeKey: 'FURNITURE', condition: 'Good' },
      { roomName: 'Studio', itemName: 'Study desk', assetTypeKey: 'FURNITURE', condition: 'Good' },
      { roomName: 'Kitchenette', itemName: 'Bar fridge', assetTypeKey: 'APPLIANCE', brand: 'Defy', condition: 'Good' },
      { roomName: 'Kitchenette', itemName: 'Microwave', assetTypeKey: 'APPLIANCE', brand: 'Samsung', condition: 'Excellent' },
    ],
  },
  {
    id: 'office_suite',
    label: 'Office suite',
    blurb: 'Open plan + boardroom for commercial',
    bedrooms: 0,
    bathrooms: 2,
    parking: 4,
    squareMeters: 180,
    rooms: [
      { name: 'Open plan', kind: 'other', beds: 0, baths: 0, areaSqm: 120, layout: { x: 5, y: 10, w: 60, h: 75 } },
      { name: 'Boardroom', kind: 'other', beds: 0, baths: 0, areaSqm: 35, layout: { x: 70, y: 10, w: 25, h: 40 } },
      { name: 'Ablutions', kind: 'bathroom', beds: 0, baths: 2, areaSqm: 12, layout: { x: 70, y: 56, w: 25, h: 29 } },
    ],
    starterAssets: [
      { roomName: 'Open plan', itemName: 'Workstations ×8', assetTypeKey: 'FURNITURE', condition: 'Good' },
      { roomName: 'Boardroom', itemName: 'Conference table', assetTypeKey: 'FURNITURE', condition: 'Excellent' },
      { roomName: 'Boardroom', itemName: '75\" Display', assetTypeKey: 'ELECTRONICS', brand: 'Samsung', condition: 'Excellent' },
    ],
  },
]

export function roomKindLabel(kind: RoomKind) {
  const map: Record<RoomKind, string> = {
    bedroom: 'Bedroom',
    bathroom: 'Bathroom',
    kitchen: 'Kitchen',
    living: 'Living',
    dining: 'Dining',
    study: 'Study',
    garage: 'Garage',
    other: 'Other',
  }
  return map[kind]
}

export function agentRoles(): Role[] {
  return ['agent_admin', 'ground_agent']
}
