import type {
  AssetCondition,
  Building,
  InfraRoom,
  InternalAsset,
  Unit,
} from './infrastructure'
import { buildSeedLookups } from './platformLookups'

const img = {
  house: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
  apt: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80',
  town: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
  office: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  student: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80',
}

/** Platform defaults + per-agency clones for Horizon & Algoa Bay */
export const seedLookups = buildSeedLookups(['ag-horizon', 'ag-cape'])

export const seedBuildings: Building[] = [
  {
    id: 'bld-carlswald',
    clientId: 'ag-horizon',
    landlordId: 'u-owner2',
    name: 'Walmer Estate Home',
    addressLine1: '14 Heugh Road',
    suburb: 'Walmer',
    city: 'Port Elizabeth',
    province: 'Eastern Cape',
    grading: 'A',
    solarCapacityKw: 5.5,
    hasBorehole: true,
    lat: -33.9752,
    lng: 25.5804,
    images: [img.house, img.town],
    createdAt: '2025-11-01',
  },
  {
    id: 'bld-skyline',
    clientId: 'ag-horizon',
    landlordId: 'u-owner1',
    name: 'Beachview Towers',
    addressLine1: 'Beach Road',
    suburb: 'Humewood',
    city: 'Port Elizabeth',
    province: 'Eastern Cape',
    grading: 'P',
    solarCapacityKw: 80,
    hasBorehole: false,
    lat: -33.9781,
    lng: 25.6452,
    images: [img.apt],
    createdAt: '2025-08-12',
  },
  {
    id: 'bld-oxford',
    clientId: 'ag-horizon',
    landlordId: 'u-owner2',
    name: 'Park Lane Mews',
    addressLine1: '7 Park Lane',
    suburb: 'Mill Park',
    city: 'Port Elizabeth',
    province: 'Eastern Cape',
    grading: 'A',
    solarCapacityKw: 12,
    hasBorehole: false,
    lat: -33.9601,
    lng: 25.6002,
    images: [img.town],
    createdAt: '2025-09-20',
  },
  {
    id: 'bld-harbour',
    clientId: 'ag-cape',
    landlordId: 'u-owner1',
    name: 'Cape Road Business Park',
    addressLine1: 'Cape Road',
    suburb: 'Newton Park',
    city: 'Port Elizabeth',
    province: 'Eastern Cape',
    grading: 'P',
    solarCapacityKw: 40,
    hasBorehole: false,
    lat: -33.9451,
    lng: 25.5702,
    images: [img.office],
    createdAt: '2025-06-01',
  },
  {
    id: 'bld-constantia',
    clientId: 'ag-cape',
    landlordId: 'u-owner2',
    name: 'Circular Drive Estate',
    addressLine1: '9 Circular Drive',
    suburb: 'Mount Pleasant',
    city: 'Port Elizabeth',
    province: 'Eastern Cape',
    grading: 'A',
    solarCapacityKw: 8.2,
    hasBorehole: true,
    lat: -33.968,
    lng: 25.55,
    images: [img.house],
    createdAt: '2025-10-05',
  },
]

export const seedUnits: Unit[] = [
  {
    id: 'unt-carlswald-1',
    clientId: 'ag-horizon',
    buildingId: 'bld-carlswald',
    agentId: 'u-lerato',
    unitNumber: 'House',
    title: 'Modern 3-Bed House in Walmer',
    squareMeters: 210,
    bedrooms: 3,
    bathrooms: 2,
    parking: 2,
    listingType: 'sale',
    price: 2_350_000,
    rent: null,
    statusKey: 'PUBLISHED',
    description: 'Family home in Walmer with garden, fibre, solar, and borehole.',
    amenities: ['Garden', 'Security Estate', 'Pool', 'Fibre', 'Solar', 'Borehole'],
    images: [img.house, img.town],
    featured: true,
    lat: -33.9752,
    lng: 25.5804,
    createdAt: '2026-06-01',
  },
  {
    id: 'unt-skyline-b12',
    clientId: 'ag-horizon',
    buildingId: 'bld-skyline',
    agentId: 'u-james',
    unitNumber: 'B12',
    title: 'Humewood Beach Apartment B12',
    squareMeters: 98,
    bedrooms: 2,
    bathrooms: 2,
    parking: 1,
    listingType: 'both',
    price: 1_850_000,
    rent: 12_500,
    statusKey: 'FEATURED',
    description: 'Coastal Humewood apartment with sea glimpses and full appliance pack.',
    amenities: ['Gym', 'Concierge', 'Balcony', 'Generator', 'Solar'],
    images: [img.apt, img.house],
    featured: true,
    lat: -33.9781,
    lng: 25.6452,
    createdAt: '2026-05-12',
  },
  {
    id: 'unt-skyline-b14',
    clientId: 'ag-horizon',
    buildingId: 'bld-skyline',
    agentId: 'u-james',
    unitNumber: 'B14',
    title: 'Humewood Beach Apartment B14',
    squareMeters: 92,
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    listingType: 'rent',
    price: null,
    rent: 11_800,
    statusKey: 'VACANT',
    description: 'Same tower, west-facing — ready for corporate rental.',
    amenities: ['Gym', 'Concierge', 'Generator'],
    images: [img.apt],
    featured: false,
    lat: -33.9781,
    lng: 25.6452,
    createdAt: '2026-05-20',
  },
  {
    id: 'unt-oxford-7',
    clientId: 'ag-horizon',
    buildingId: 'bld-oxford',
    agentId: 'u-priya',
    unitNumber: '7',
    title: 'Mill Park Townhouse Unit 7',
    squareMeters: 145,
    bedrooms: 3,
    bathrooms: 2.5,
    parking: 2,
    listingType: 'sale',
    price: 1_750_000,
    rent: null,
    statusKey: 'UNDER_OFFER',
    description: 'Secure Mill Park townhouse near schools and the PE CBD.',
    amenities: ['Pet Friendly', 'Clubhouse', '24h Security'],
    images: [img.town],
    featured: false,
    lat: -33.9601,
    lng: 25.6002,
    createdAt: '2026-04-20',
  },
  {
    id: 'unt-harbour-4',
    clientId: 'ag-cape',
    buildingId: 'bld-harbour',
    agentId: 'u-sipho',
    unitNumber: 'Suite 4',
    title: 'Newton Park Office Suite',
    squareMeters: 420,
    bedrooms: 0,
    bathrooms: 2,
    parking: 6,
    listingType: 'both',
    price: 3_850_000,
    rent: 32_000,
    statusKey: 'PUBLISHED',
    description: 'Commercial suite on Cape Road, Newton Park.',
    amenities: ['Boardroom', 'Fibre', 'Parking Bay', 'Generator'],
    images: [img.office],
    featured: false,
    lat: -33.9451,
    lng: 25.5702,
    createdAt: '2026-03-01',
  },
  {
    id: 'unt-constantia-1',
    clientId: 'ag-cape',
    buildingId: 'bld-constantia',
    agentId: 'u-sipho',
    unitNumber: 'Main house',
    title: 'Mount Pleasant Family Home',
    squareMeters: 320,
    bedrooms: 5,
    bathrooms: 4,
    parking: 4,
    listingType: 'sale',
    price: 2_850_000,
    rent: null,
    statusKey: 'PUBLISHED',
    description: 'Spacious Mount Pleasant home with pool, solar, and borehole.',
    amenities: ['Pool', 'Garden', 'Security Estate', 'Pet Friendly', 'Solar', 'Borehole'],
    images: [img.house, img.town],
    featured: true,
    lat: -33.968,
    lng: 25.55,
    createdAt: '2026-05-28',
  },
]

function roomsFor(
  unitId: string,
  clientId: string,
  defs: Array<{
    id: string
    name: string
    kind: InfraRoom['kind']
    beds: number
    baths: number
    areaSqm?: number
    layout: InfraRoom['layout']
  }>,
): InfraRoom[] {
  return defs.map((d) => ({ ...d, unitId, clientId }))
}

export const seedInfraRooms: InfraRoom[] = [
  ...roomsFor('unt-carlswald-1', 'ag-horizon', [
    { id: 'rm-c-master', name: 'Master bedroom', kind: 'bedroom', beds: 1, baths: 1, areaSqm: 28, layout: { x: 4, y: 6, w: 32, h: 34 } },
    { id: 'rm-c-b2', name: 'Bedroom 2', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 16, layout: { x: 40, y: 6, w: 26, h: 28 } },
    { id: 'rm-c-b3', name: 'Bedroom 3', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 14, layout: { x: 70, y: 6, w: 26, h: 28 } },
    { id: 'rm-c-bath', name: 'Family bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: 8, layout: { x: 40, y: 38, w: 26, h: 20 } },
    { id: 'rm-c-kit', name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: 16, layout: { x: 70, y: 38, w: 26, h: 28 } },
    { id: 'rm-c-lounge', name: 'Open lounge', kind: 'living', beds: 0, baths: 0, areaSqm: 42, layout: { x: 4, y: 48, w: 62, h: 44 } },
    { id: 'rm-c-garage', name: 'Double garage', kind: 'garage', beds: 0, baths: 0, areaSqm: 36, layout: { x: 70, y: 72, w: 26, h: 20 } },
  ]),
  ...roomsFor('unt-skyline-b12', 'ag-horizon', [
    { id: 'rm-s12-b1', name: 'Bedroom 1', kind: 'bedroom', beds: 1, baths: 1, areaSqm: 18, layout: { x: 5, y: 8, w: 36, h: 38 } },
    { id: 'rm-s12-b2', name: 'Bedroom 2', kind: 'bedroom', beds: 1, baths: 1, areaSqm: 14, layout: { x: 45, y: 8, w: 28, h: 38 } },
    { id: 'rm-s12-kit', name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: 10, layout: { x: 77, y: 8, w: 18, h: 38 } },
    { id: 'rm-s12-liv', name: 'Living area', kind: 'living', beds: 0, baths: 0, areaSqm: 32, layout: { x: 5, y: 52, w: 90, h: 40 } },
  ]),
  ...roomsFor('unt-skyline-b14', 'ag-horizon', [
    { id: 'rm-s14-b1', name: 'Bedroom 1', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 16, layout: { x: 6, y: 10, w: 40, h: 42 } },
    { id: 'rm-s14-b2', name: 'Bedroom 2', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 12, layout: { x: 50, y: 10, w: 28, h: 42 } },
    { id: 'rm-s14-bath', name: 'Bathroom', kind: 'bathroom', beds: 0, baths: 1, areaSqm: 6, layout: { x: 82, y: 10, w: 14, h: 28 } },
    { id: 'rm-s14-kit', name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: 9, layout: { x: 82, y: 42, w: 14, h: 28 } },
    { id: 'rm-s14-liv', name: 'Lounge', kind: 'living', beds: 0, baths: 0, areaSqm: 24, layout: { x: 6, y: 58, w: 72, h: 34 } },
  ]),
  ...roomsFor('unt-oxford-7', 'ag-horizon', [
    { id: 'rm-ox-m', name: 'Master', kind: 'bedroom', beds: 1, baths: 1, areaSqm: 22, layout: { x: 5, y: 8, w: 40, h: 40 } },
    { id: 'rm-ox-2', name: 'Bedroom 2', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 14, layout: { x: 50, y: 8, w: 24, h: 32 } },
    { id: 'rm-ox-3', name: 'Bedroom 3', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 12, layout: { x: 78, y: 8, w: 18, h: 32 } },
    { id: 'rm-ox-k', name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: 12, layout: { x: 50, y: 46, w: 46, h: 24 } },
    { id: 'rm-ox-l', name: 'Lounge', kind: 'living', beds: 0, baths: 0, areaSqm: 28, layout: { x: 5, y: 54, w: 40, h: 38 } },
  ]),
  ...roomsFor('unt-harbour-4', 'ag-cape', [
    { id: 'rm-hb-open', name: 'Open plan', kind: 'other', beds: 0, baths: 0, areaSqm: 280, layout: { x: 5, y: 10, w: 60, h: 75 } },
    { id: 'rm-hb-board', name: 'Boardroom', kind: 'other', beds: 0, baths: 0, areaSqm: 40, layout: { x: 70, y: 10, w: 25, h: 40 } },
    { id: 'rm-hb-abl', name: 'Ablutions', kind: 'bathroom', beds: 0, baths: 2, areaSqm: 18, layout: { x: 70, y: 56, w: 25, h: 29 } },
  ]),
  ...roomsFor('unt-constantia-1', 'ag-cape', [
    { id: 'rm-co-m', name: 'Master suite', kind: 'bedroom', beds: 1, baths: 1, areaSqm: 36, layout: { x: 4, y: 6, w: 30, h: 36 } },
    { id: 'rm-co-g', name: 'Guest suite', kind: 'bedroom', beds: 1, baths: 1, areaSqm: 24, layout: { x: 38, y: 6, w: 28, h: 30 } },
    { id: 'rm-co-3', name: 'Bedroom 3', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 16, layout: { x: 70, y: 6, w: 26, h: 28 } },
    { id: 'rm-co-4', name: 'Bedroom 4', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 15, layout: { x: 70, y: 38, w: 26, h: 24 } },
    { id: 'rm-co-5', name: 'Bedroom 5', kind: 'bedroom', beds: 1, baths: 0, areaSqm: 14, layout: { x: 38, y: 40, w: 28, h: 22 } },
    { id: 'rm-co-k', name: 'Kitchen', kind: 'kitchen', beds: 0, baths: 0, areaSqm: 22, layout: { x: 4, y: 48, w: 30, h: 24 } },
    { id: 'rm-co-l', name: 'Lounge', kind: 'living', beds: 0, baths: 0, areaSqm: 48, layout: { x: 4, y: 76, w: 92, h: 20 } },
  ]),
]

function asset(
  partial: Omit<InternalAsset, 'condition'> & { condition?: AssetCondition },
): InternalAsset {
  return { condition: 'Good', ...partial }
}

export const seedInternalAssets: InternalAsset[] = [
  // Carlswald kitchen + living + beds (Walmer display name)
  asset({ id: 'ia-c-fridge', clientId: 'ag-horizon', unitId: 'unt-carlswald-1', roomId: 'rm-c-kit', itemName: 'Fridge-freezer', serialNumber: 'DFY-88421', assetTypeKey: 'APPLIANCE', brand: 'Samsung', purchaseValue: 12_500, condition: 'Excellent', lastInspectedAt: '2026-06-15' }),
  asset({ id: 'ia-c-wash', clientId: 'ag-horizon', unitId: 'unt-carlswald-1', roomId: 'rm-c-kit', itemName: 'Washing machine', serialNumber: 'DFY-11209', assetTypeKey: 'APPLIANCE', brand: 'Defy', purchaseValue: 7_800, condition: 'Good', lastInspectedAt: '2026-06-15' }),
  asset({ id: 'ia-c-micro', clientId: 'ag-horizon', unitId: 'unt-carlswald-1', roomId: 'rm-c-kit', itemName: 'Microwave', serialNumber: 'SM-4401', assetTypeKey: 'APPLIANCE', brand: 'Samsung', purchaseValue: 2_200, condition: 'Good' }),
  asset({ id: 'ia-c-tv', clientId: 'ag-horizon', unitId: 'unt-carlswald-1', roomId: 'rm-c-lounge', itemName: '65\" Smart TV', serialNumber: 'HS-9912', assetTypeKey: 'ELECTRONICS', brand: 'Hisense', purchaseValue: 14_000, condition: 'Excellent' }),
  asset({ id: 'ia-c-couch', clientId: 'ag-horizon', unitId: 'unt-carlswald-1', roomId: 'rm-c-lounge', itemName: 'Modular couch', assetTypeKey: 'FURNITURE', brand: 'Coricraft', purchaseValue: 18_500, condition: 'Excellent' }),
  asset({ id: 'ia-c-bed1', clientId: 'ag-horizon', unitId: 'unt-carlswald-1', roomId: 'rm-c-master', itemName: 'King bed', assetTypeKey: 'FURNITURE', condition: 'Excellent' }),
  asset({ id: 'ia-c-bed2', clientId: 'ag-horizon', unitId: 'unt-carlswald-1', roomId: 'rm-c-b2', itemName: 'Double bed', assetTypeKey: 'FURNITURE', condition: 'Good' }),
  asset({ id: 'ia-c-bed3', clientId: 'ag-horizon', unitId: 'unt-carlswald-1', roomId: 'rm-c-b3', itemName: 'Single bed ×2', assetTypeKey: 'FURNITURE', condition: 'Fair' }),
  // Skyline B12
  asset({ id: 'ia-s12-fridge', clientId: 'ag-horizon', unitId: 'unt-skyline-b12', roomId: 'rm-s12-kit', itemName: 'Fridge-freezer', serialNumber: 'LG-2201', assetTypeKey: 'APPLIANCE', brand: 'LG', condition: 'Excellent' }),
  asset({ id: 'ia-s12-micro', clientId: 'ag-horizon', unitId: 'unt-skyline-b12', roomId: 'rm-s12-kit', itemName: 'Microwave', serialNumber: 'SM-8811', assetTypeKey: 'APPLIANCE', brand: 'Samsung', condition: 'Damaged', lastInspectedAt: '2026-07-10', warrantyExpiresAt: '2027-12-31', model: 'MS23K', images: ['https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=400&q=80'], notes: 'Sparking reported by tenant' }),
  asset({ id: 'ia-s12-wash', clientId: 'ag-horizon', unitId: 'unt-skyline-b12', roomId: 'rm-s12-kit', itemName: 'Washing machine', assetTypeKey: 'APPLIANCE', brand: 'Defy', condition: 'Good' }),
  asset({ id: 'ia-s12-tv', clientId: 'ag-horizon', unitId: 'unt-skyline-b12', roomId: 'rm-s12-liv', itemName: '55\" Smart TV', assetTypeKey: 'ELECTRONICS', brand: 'Samsung', condition: 'Excellent' }),
  asset({ id: 'ia-s12-couch', clientId: 'ag-horizon', unitId: 'unt-skyline-b12', roomId: 'rm-s12-liv', itemName: 'L-shaped couch', assetTypeKey: 'FURNITURE', brand: 'Coricraft', condition: 'Good' }),
  asset({ id: 'ia-s12-bed1', clientId: 'ag-horizon', unitId: 'unt-skyline-b12', roomId: 'rm-s12-b1', itemName: 'Queen bed', assetTypeKey: 'FURNITURE', condition: 'Excellent' }),
  asset({ id: 'ia-s12-bed2', clientId: 'ag-horizon', unitId: 'unt-skyline-b12', roomId: 'rm-s12-b2', itemName: 'Double bed', assetTypeKey: 'FURNITURE', condition: 'Good' }),
  // Skyline B14
  asset({ id: 'ia-s14-fridge', clientId: 'ag-horizon', unitId: 'unt-skyline-b14', roomId: 'rm-s14-kit', itemName: 'Fridge-freezer', assetTypeKey: 'APPLIANCE', brand: 'Defy', condition: 'Good' }),
  asset({ id: 'ia-s14-micro', clientId: 'ag-horizon', unitId: 'unt-skyline-b14', roomId: 'rm-s14-kit', itemName: 'Microwave', assetTypeKey: 'APPLIANCE', brand: 'LG', condition: 'Excellent' }),
  asset({ id: 'ia-s14-bed1', clientId: 'ag-horizon', unitId: 'unt-skyline-b14', roomId: 'rm-s14-b1', itemName: 'Queen bed', assetTypeKey: 'FURNITURE', condition: 'Good' }),
  asset({ id: 'ia-s14-couch', clientId: 'ag-horizon', unitId: 'unt-skyline-b14', roomId: 'rm-s14-liv', itemName: '3-seater couch', assetTypeKey: 'FURNITURE', condition: 'Good' }),
  // Oxford
  asset({ id: 'ia-ox-fridge', clientId: 'ag-horizon', unitId: 'unt-oxford-7', roomId: 'rm-ox-k', itemName: 'Fridge-freezer', assetTypeKey: 'APPLIANCE', brand: 'Samsung', condition: 'Good' }),
  asset({ id: 'ia-ox-bed', clientId: 'ag-horizon', unitId: 'unt-oxford-7', roomId: 'rm-ox-m', itemName: 'King bed', assetTypeKey: 'FURNITURE', condition: 'Excellent' }),
  // Harbour
  asset({ id: 'ia-hb-desk', clientId: 'ag-cape', unitId: 'unt-harbour-4', roomId: 'rm-hb-open', itemName: 'Workstations ×12', assetTypeKey: 'FURNITURE', condition: 'Good' }),
  asset({ id: 'ia-hb-board', clientId: 'ag-cape', unitId: 'unt-harbour-4', roomId: 'rm-hb-board', itemName: 'Conference table', assetTypeKey: 'FURNITURE', condition: 'Excellent' }),
  asset({ id: 'ia-hb-tv', clientId: 'ag-cape', unitId: 'unt-harbour-4', roomId: 'rm-hb-board', itemName: '75\" Display', assetTypeKey: 'ELECTRONICS', brand: 'Samsung', condition: 'Excellent' }),
  // Mount Pleasant (bld-constantia id retained)
  asset({ id: 'ia-co-fridge', clientId: 'ag-cape', unitId: 'unt-constantia-1', roomId: 'rm-co-k', itemName: 'American fridge', assetTypeKey: 'APPLIANCE', brand: 'Samsung', condition: 'Excellent' }),
  asset({ id: 'ia-co-wash', clientId: 'ag-cape', unitId: 'unt-constantia-1', roomId: 'rm-co-k', itemName: 'Washer-dryer', assetTypeKey: 'APPLIANCE', brand: 'Bosch', condition: 'Good' }),
  asset({ id: 'ia-co-tv', clientId: 'ag-cape', unitId: 'unt-constantia-1', roomId: 'rm-co-l', itemName: '75\" Cinema TV', assetTypeKey: 'ELECTRONICS', brand: 'LG', condition: 'Excellent' }),
  asset({ id: 'ia-co-bed', clientId: 'ag-cape', unitId: 'unt-constantia-1', roomId: 'rm-co-m', itemName: 'King bed', assetTypeKey: 'FURNITURE', condition: 'Excellent' }),
]

/** Project units → marketplace / workspace PropertyAsset rows (stable IDs for existing demos) */
const UNIT_TO_PROPERTY: Record<string, string> = {
  'unt-carlswald-1': 'PR-1001',
  'unt-skyline-b12': 'PR-1002',
  'unt-oxford-7': 'PR-1003',
  'unt-harbour-4': 'PR-1004',
  'unt-constantia-1': 'PR-1010',
  'unt-skyline-b14': 'PR-1011',
}

export function propertiesFromInfrastructure() {
  return seedUnits.map((u) => {
    const b = seedBuildings.find((x) => x.id === u.buildingId)!
    const rooms = seedInfraRooms.filter((r) => r.unitId === u.id)
    const assets = seedInternalAssets.filter((a) => a.unitId === u.id)
    const status =
      u.statusKey === 'FEATURED'
        ? 'Featured'
        : u.statusKey === 'UNDER_OFFER'
          ? 'Under Offer'
          : u.statusKey === 'OCCUPIED'
            ? 'Rented'
            : u.statusKey === 'MAINTENANCE'
              ? 'Maintenance'
              : 'Published'

    const type =
      u.bedrooms === 0 && u.title.toLowerCase().includes('office')
        ? 'Office'
        : u.bedrooms >= 3 && u.unitNumber.toLowerCase().includes('house')
          ? 'House'
          : u.buildingId === 'bld-oxford'
            ? 'Townhouse'
            : u.bedrooms <= 2
              ? 'Apartment'
              : 'House'

    return {
      id: UNIT_TO_PROPERTY[u.id] ?? u.id,
      agencyId: u.clientId,
      landlordId: b.landlordId ?? 'u-owner1',
      agentId: u.agentId,
      buildingId: u.buildingId,
      unitId: u.id,
      title: u.title,
      type,
      status: status as 'Published' | 'Featured' | 'Under Offer' | 'Rented' | 'Maintenance',
      listingMode: (u.listingType === 'not_listed'
        ? 'rent'
        : u.listingType === 'both'
          ? 'both'
          : u.listingType) as 'sale' | 'rent' | 'both',
      price: u.price,
      rent: u.rent,
      beds: u.bedrooms,
      baths: u.bathrooms,
      parking: u.parking,
      area: u.squareMeters,
      city: b.city,
      suburb: b.suburb,
      address: `${b.addressLine1}${u.unitNumber !== 'House' && u.unitNumber !== 'Main house' ? `, ${u.unitNumber}` : ''}`,
      lat: u.lat ?? b.lat,
      lng: u.lng ?? b.lng,
      formattedAddress: `${b.addressLine1}, ${b.suburb}, ${b.city}, South Africa`,
      geocodedAt: '2026-06-01T10:00:00.000Z',
      images: u.images.length ? u.images : b.images,
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        beds: r.beds,
        baths: r.baths,
        area: r.areaSqm,
        kind: r.kind,
        layout: r.layout,
      })),
      internalAssets: assets.map((a) => ({
        id: a.id,
        roomId: a.roomId,
        itemName: a.itemName,
        serialNumber: a.serialNumber,
        assetTypeKey: a.assetTypeKey,
        condition: a.condition,
        brand: a.brand,
      })),
      amenities: u.amenities,
      description: u.description,
      featured: u.featured,
      createdAt: u.createdAt,
      solarCapacityKw: b.solarCapacityKw,
      hasBorehole: b.hasBorehole,
      grading: b.grading,
    }
  })
}
