/**
 * 100 Port Elizabeth listings — 10 per suburb in peAreas.ts (PR-2101…PR-2200).
 */
import type { PropertyAsset } from '../types/domain'
import { PE_AREAS } from './peAreas'

const img = {
  house: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
  house2: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80',
  apt: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80',
  apt2: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80',
  town: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
  office: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  student: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80',
  land: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80',
  floor: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&q=80',
  kitchen: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80',
}

type Template = {
  type: string
  listingMode: PropertyAsset['listingMode']
  status: PropertyAsset['status']
  beds: number
  baths: number
  parking: number
  area: number
  /** Price multiplier vs suburb base sale (null = rent-only). */
  saleMult: number | null
  /** Rent multiplier vs suburb base rent (null = sale-only). */
  rentMult: number | null
  title: (suburb: string, n: number) => string
  street: (suburb: string, n: number) => string
  amenities: string[]
  description: (suburb: string) => string
  images: string[]
  featured?: boolean
}

/** Coastal / inland price bands (ZAR). */
function suburbBands(suburb: string): { sale: number; rent: number } {
  switch (suburb) {
    case 'Summerstrand':
    case 'Humewood':
      return { sale: 2_200_000, rent: 14_000 }
    case 'Walmer':
    case 'Greenacres':
      return { sale: 1_950_000, rent: 12_500 }
    case 'Newton Park':
    case 'Lorraine':
      return { sale: 1_650_000, rent: 11_000 }
    case 'Fairview':
    case 'Sherwood':
      return { sale: 1_450_000, rent: 9_500 }
    case 'Algoa Park':
    case 'Bethelsdorp':
      return { sale: 1_050_000, rent: 7_500 }
    default:
      return { sale: 1_600_000, rent: 10_500 }
  }
}

const TEMPLATES: Template[] = [
  {
    type: 'House',
    listingMode: 'sale',
    status: 'Published',
    beds: 3,
    baths: 2,
    parking: 2,
    area: 185,
    saleMult: 1.05,
    rentMult: null,
    title: (s, n) => `${s} family home #${n}`,
    street: (s, n) => `${10 + n * 3} Main Road, ${s}`,
    amenities: ['Garden', 'Fibre', 'Security', 'Bondable'],
    description: (s) => `Spacious 3-bed home in ${s}, Port Elizabeth — ready for family living.`,
    images: [img.house, img.house2, img.kitchen],
    featured: true,
  },
  {
    type: 'Apartment',
    listingMode: 'both',
    status: 'Featured',
    beds: 2,
    baths: 1,
    parking: 1,
    area: 78,
    saleMult: 0.72,
    rentMult: 0.85,
    title: (s, n) => `${s} 2-bed apartment #${n}`,
    street: (s, n) => `Unit ${n}A, Horizon Court, ${s}`,
    amenities: ['Balcony', 'Fibre', 'Secure parking'],
    description: (s) => `Bright 2-bed apartment in ${s} with covered parking.`,
    images: [img.apt, img.apt2],
  },
  {
    type: 'Townhouse',
    listingMode: 'sale',
    status: 'Published',
    beds: 3,
    baths: 2.5,
    parking: 2,
    area: 142,
    saleMult: 0.88,
    rentMult: null,
    title: (s, n) => `${s} townhouse complex #${n}`,
    street: (s, n) => `${n} Cluster Close, ${s}`,
    amenities: ['Complex security', 'Garden', 'Pet Friendly'],
    description: (s) => `Secure townhouse in ${s} with private courtyard.`,
    images: [img.town],
  },
  {
    type: 'Apartment',
    listingMode: 'rent',
    status: 'Published',
    beds: 1,
    baths: 1,
    parking: 1,
    area: 48,
    saleMult: null,
    rentMult: 0.65,
    title: (s, n) => `${s} bachelor flat #${n}`,
    street: (s, n) => `Flat ${n}, Palm Lodge, ${s}`,
    amenities: ['Fibre', 'Prepaid electricity'],
    description: (s) => `Compact rental flat in ${s} — ideal for singles or students.`,
    images: [img.student, img.apt],
  },
  {
    type: 'House',
    listingMode: 'both',
    status: 'Published',
    beds: 4,
    baths: 3,
    parking: 3,
    area: 240,
    saleMult: 1.35,
    rentMult: 1.4,
    title: (s, n) => `${s} executive residence #${n}`,
    street: (s, n) => `${20 + n * 2} Ridge Avenue, ${s}`,
    amenities: ['Pool', 'Garden', 'Study', 'Fibre', 'Alarm'],
    description: (s) => `Executive 4-bed residence in ${s} with pool and study.`,
    images: [img.house2, img.house, img.kitchen],
    featured: true,
  },
  {
    type: 'Townhouse',
    listingMode: 'rent',
    status: 'Published',
    beds: 2,
    baths: 2,
    parking: 1,
    area: 95,
    saleMult: null,
    rentMult: 0.95,
    title: (s, n) => `${s} duplex rental #${n}`,
    street: (s, n) => `${n}B Meadow Lane, ${s}`,
    amenities: ['Duplex', 'Fibre', 'Carport'],
    description: (s) => `Well-kept duplex to let in ${s}.`,
    images: [img.town, img.apt],
  },
  {
    type: 'Office',
    listingMode: 'rent',
    status: 'Published',
    beds: 0,
    baths: 1,
    parking: 4,
    area: 110,
    saleMult: null,
    rentMult: 1.8,
    title: (s, n) => `${s} office suite #${n}`,
    street: (s, n) => `Suite ${100 + n}, Business Hub, ${s}`,
    amenities: ['Fibre', 'Boardroom', 'Parking'],
    description: (s) => `Fitted office suite in ${s} with on-site parking.`,
    images: [img.office],
  },
  {
    type: 'House',
    listingMode: 'sale',
    status: 'Under Offer',
    beds: 2,
    baths: 1,
    parking: 1,
    area: 110,
    saleMult: 0.62,
    rentMult: null,
    title: (s, n) => `${s} starter home #${n}`,
    street: (s, n) => `${5 + n} Willow Street, ${s}`,
    amenities: ['Freehold', 'Bondable', 'Garden'],
    description: (s) => `Affordable starter home in ${s} — under offer.`,
    images: [img.house],
  },
  {
    type: 'Vacant Land',
    listingMode: 'sale',
    status: 'Published',
    beds: 0,
    baths: 0,
    parking: 0,
    area: 800,
    saleMult: 0.35,
    rentMult: null,
    title: (s, n) => `${s} vacant stand #${n}`,
    street: (s, n) => `Erf ${2000 + n}, ${s}`,
    amenities: ['Corner stand', 'Services nearby'],
    description: (s) => `Development-ready stand in ${s}, Port Elizabeth.`,
    images: [img.land],
  },
  {
    type: 'Apartment',
    listingMode: 'both',
    status: 'Published',
    beds: 3,
    baths: 2,
    parking: 2,
    area: 115,
    saleMult: 0.95,
    rentMult: 1.1,
    title: (s, n) => `${s} penthouse-style 3-bed #${n}`,
    street: (s, n) => `Penthouse ${n}, Vista Towers, ${s}`,
    amenities: ['Views', 'Generator', 'Gym access', 'Fibre'],
    description: (s) => `Top-floor 3-bed apartment in ${s} with open-plan living.`,
    images: [img.apt2, img.apt, img.kitchen],
    featured: true,
  },
]

const AGENCIES = ['ag-horizon', 'ag-cape', 'ag-garden'] as const
const AGENTS_BY_AGENCY: Record<(typeof AGENCIES)[number], string[]> = {
  'ag-horizon': ['u-james', 'u-priya', 'u-lerato'],
  'ag-cape': ['u-zane', 'u-theo', 'u-sipho'],
  'ag-garden': ['u-leigh', 'u-gita'],
}
const LANDLORDS_BY_AGENCY: Record<(typeof AGENCIES)[number], string[]> = {
  'ag-horizon': ['u-owner1', 'u-owner2'],
  'ag-cape': ['u-cape-owner'],
  'ag-garden': ['u-garden-owner'],
}

function jitter(seed: number, span = 0.0035): number {
  // Deterministic pseudo-random in [-span, span]
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x) - 0.5) * 2 * span
}

function roundMoney(n: number): number {
  return Math.round(n / 1000) * 1000
}

export type PeBulkMeta = {
  propertyId: string
  buildingUuid: string
  unitUuid: string
  buildingFeId: string
  clientUuid: string
  agentUuid: string | null
  landlordUuid: string
}

const CLIENT_UUID: Record<string, string> = {
  'ag-horizon': 'a1000001-0001-4000-8000-000000000001',
  'ag-cape': 'a1000001-0001-4000-8000-000000000002',
  'ag-garden': 'a1000001-0001-4000-8000-000000000003',
}

/** Frontend agent id → seed UUID (matches postgres seed / idMap). */
const AGENT_UUID: Record<string, string> = {
  'u-lerato': 'a2000001-0001-4000-8000-000000000003',
  'u-james': 'a2000001-0001-4000-8000-000000000004',
  'u-priya': 'a2000001-0001-4000-8000-000000000005',
  'u-owner2': 'a2000001-0001-4000-8000-000000000006',
  'u-owner1': 'a2000001-0001-4000-8000-000000000007',
  'u-sipho': 'a2000001-0001-4000-8000-000000000011',
  'u-cape-owner': 'a2000001-0001-4000-8000-000000000013',
  'u-zane': 'a2000001-0001-4000-8000-000000000016',
  'u-theo': 'a2000001-0001-4000-8000-000000000017',
  'u-gita': 'a2000001-0001-4000-8000-000000000021',
  'u-leigh': 'a2000001-0001-4000-8000-000000000022',
  'u-garden-owner': 'a2000001-0001-4000-8000-000000000023',
}

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

export function buildPeBulkCatalog(): {
  properties: PropertyAsset[]
  meta: PeBulkMeta[]
} {
  const properties: PropertyAsset[] = []
  const meta: PeBulkMeta[] = []
  let seq = 0

  for (let ai = 0; ai < PE_AREAS.length; ai++) {
    const area = PE_AREAS[ai]!
    for (let ti = 0; ti < TEMPLATES.length; ti++) {
      const t = TEMPLATES[ti]!
      seq += 1
      const idNum = 2100 + seq // 2101…2200
      const propertyId = `PR-${idNum}`
      const n = ti + 1
      const agencyId = AGENCIES[seq % AGENCIES.length]!
      const agents = AGENTS_BY_AGENCY[agencyId]
      const landlords = LANDLORDS_BY_AGENCY[agencyId]
      const agentId = agents[seq % agents.length]!
      const landlordId = landlords[seq % landlords.length]!
      const bands = suburbBands(area.suburb)
      const price = t.saleMult == null ? null : roundMoney(bands.sale * t.saleMult)
      const rent = t.rentMult == null ? null : roundMoney(bands.rent * t.rentMult)
      const lat = area.lat + jitter(seq * 17 + ai)
      const lng = area.lng + jitter(seq * 31 + ti + 3)
      const address = t.street(area.suburb, n)
      const uuidSuffix = pad3(100 + seq) // 101…200
      const buildingUuid = `a3000001-0001-4000-8000-000000000${uuidSuffix}`
      const unitUuid = `a4000001-0001-4000-8000-000000000${uuidSuffix}`
      const buildingFeId = `bld-pe-${idNum}`

      properties.push({
        id: propertyId,
        agencyId,
        landlordId,
        agentId,
        buildingId: buildingFeId,
        unitId: `unt-${propertyId}`,
        title: t.title(area.suburb, n),
        type: t.type,
        status: t.status,
        listingMode: t.listingMode,
        price,
        rent,
        beds: t.beds,
        baths: t.baths,
        parking: t.parking,
        area: t.area,
        city: 'Port Elizabeth',
        suburb: area.suburb,
        address,
        lat,
        lng,
        placeId: `seed-${propertyId.toLowerCase()}`,
        formattedAddress: `${address}, Port Elizabeth, South Africa`,
        geocodedAt: '2026-07-01T10:00:00.000Z',
        images: t.images,
        floorPlan: img.floor,
        rooms:
          t.beds > 0
            ? Array.from({ length: Math.max(1, t.beds) }, (_, i) => ({
                id: `r${i + 1}`,
                name: i === 0 ? 'Master' : `Bedroom ${i + 1}`,
                beds: 1,
                baths: i === 0 ? 1 : 0,
                area: 12 + i * 2,
              }))
            : [],
        amenities: t.amenities,
        description: t.description(area.suburb),
        featured: Boolean(t.featured),
        createdAt: `2026-${String((seq % 6) + 1).padStart(2, '0')}-${String((seq % 27) + 1).padStart(2, '0')}`,
      })

      meta.push({
        propertyId,
        buildingUuid,
        unitUuid,
        buildingFeId,
        clientUuid: CLIENT_UUID[agencyId]!,
        agentUuid: AGENT_UUID[agentId] ?? null,
        landlordUuid: AGENT_UUID[landlordId]!,
      })
    }
  }

  return { properties, meta }
}

export const peBulkCatalog = buildPeBulkCatalog()
export const peBulkProperties: PropertyAsset[] = peBulkCatalog.properties
export const peBulkMeta: PeBulkMeta[] = peBulkCatalog.meta
