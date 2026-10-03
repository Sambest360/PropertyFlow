/**
 * Public PR-1011 is the live Humewood Beach Apartment (Horizon), but
 * resolveUuid / ensureEntityMapTable still point that frontend id at the
 * static Framesby cottage (Bayview). Guest enquiry and guest apply must
 * not pick that seed row.
 */
import { createHash } from 'node:crypto'
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { AGENCY_TO_CLIENT } from './idMap.js'
import { canonicalListingId, listingIdAliases, unitIdForProperty } from '../src/lib/listingIds.js'

/** Bayview Property Group — seed client on the Framesby cottage (seed.sql). */
const BAYVIEW_CLIENT = AGENCY_TO_CLIENT['ag-garden']!
/** Horizon Realty — agency on the live Humewood Beach Apartment (not Beachview Towers). */
const HORIZON_CLIENT = AGENCY_TO_CLIENT['ag-horizon']!
/** seed.sql PR-1011 is the Framesby cottage, not the public Humewood listing. */
const FRAMESBY_UNIT = 'a4000001-0001-4000-8000-000000000008'
/** seed.sql PR-1012 Beachview Towers B14. Not the public Humewood apartment. */
const BEACHVIEW_B14 = 'a4000001-0001-4000-8000-000000000003'
/**
 * Public page listing (infra seed unt-skyline-b14 → PR-1011).
 * Do not import src/data/infraSeed.js here. That file imports ./platformLookups
 * with no extension. Vercel ships api/index as Node ESM and includeFiles is only
 * server/**, src/lib/**, src/types/**, so /var/task/src/data/platformLookups is
 * missing and both saves throw before a unit is written.
 * These fields match the guest page: Humewood Beach Apartment B14, ag-horizon.
 */
const PUBLIC_PROPERTY_ID = 'PR-1011'
const PUBLIC_UNIT_ID = 'unt-skyline-b14'
const PUBLIC_HUMEWOOD = {
  title: 'Humewood Beach Apartment B14',
  agencyId: 'ag-horizon',
  unitNumber: 'B14',
  squareMeters: 92,
  bedrooms: 2,
  bathrooms: 1,
  parking: 1,
  listingType: 'rent',
  price: null as number | null,
  rent: 11_800,
  statusKey: 'VACANT',
  description: 'Same tower, west-facing — ready for corporate rental.',
  amenities: ['Gym', 'Concierge', 'Generator'],
  image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80',
  featured: false,
  lat: -33.9781,
  lng: 25.6452,
  buildingName: 'Beachview Towers',
  addressLine1: 'Beach Road',
  suburb: 'Humewood',
  city: 'Port Elizabeth',
  province: 'Eastern Cape',
  formattedAddress: 'Beach Road, Humewood, Port Elizabeth, South Africa',
}

type ListingCandidate = {
  id: string
  backend_id: string
  unit_client: string | null
  building_client: string | null
}

export type LiveListing = { unitId: string; clientId: string }

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}


function isPublicHumewood(fe: string): boolean {
  if (fe === PUBLIC_PROPERTY_ID || fe === PUBLIC_UNIT_ID) return true
  const aliases = listingIdAliases(fe).map((a) => a.toLowerCase())
  return (
    aliases.includes(PUBLIC_PROPERTY_ID.toLowerCase()) ||
    aliases.includes(PUBLIC_UNIT_ID.toLowerCase())
  )
}

/** Stable uuid for the materialized public row. Not a seed.sql stamp. */
function stableUuid(key: string): string {
  const hex = createHash('sha256').update(`propertyflow-public-listing:${key}`).digest('hex')
  const chars = hex.slice(0, 32).split('')
  chars[12] = '4'
  const variant = Number.parseInt(chars[16] ?? '0', 16)
  chars[16] = ((variant & 0x3) | 0x8).toString(16)
  const h = chars.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function dbListingType(mode: string): string {
  const m = mode.toLowerCase()
  if (m === 'sale') return 'SALE'
  if (m === 'both') return 'BOTH'
  if (m === 'not_listed') return 'NOT_LISTED'
  return 'RENT'
}

/** Refuse Framesby, Bayview, and Beachview PR-1012. */
function acceptLive(unitId: string, clientId: string): LiveListing | null {
  if (!unitId || !clientId) return null
  if (unitId === FRAMESBY_UNIT || unitId === BEACHVIEW_B14) return null
  if (clientId === BAYVIEW_CLIENT) return null
  return { unitId, clientId }
}

/**
 * The public listing page reads propertiesFromInfrastructure (unt-skyline-b14
 * → PR-1011, title Humewood Beach Apartment B14, agency ag-horizon). seed.sql
 * has no such units row. Insert that same listing so enquiry and apply have
 * a units.id to save. Do not update the Framesby cottage or its Bayview client.
 */
async function materializePublicHumewoodUnit(): Promise<LiveListing | null> {
  const page = PUBLIC_HUMEWOOD
  if (page.title !== 'Humewood Beach Apartment B14') return null
  const clientId = AGENCY_TO_CLIENT[page.agencyId]
  if (!clientId || clientId !== HORIZON_CLIENT) return null

  const buildingId = stableUuid(`building:${PUBLIC_UNIT_ID}`)
  const unitId = stableUuid(`unit:${PUBLIC_UNIT_ID}`)
  const accepted = acceptLive(unitId, clientId)
  if (!accepted) return null

  const images = JSON.stringify([page.image])
  await query(
    `INSERT INTO buildings (
       id, client_id, name, address, city, province, suburb, lat, lng, formatted_address, images, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW()
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      buildingId,
      clientId,
      page.buildingName,
      page.addressLine1,
      page.city,
      page.province,
      page.suburb,
      page.lat,
      page.lng,
      page.formattedAddress,
      images,
    ],
  )

  await query(
    `INSERT INTO units (
       id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
       listing_type, price, rent, status_config_key, title, description, amenities, images,
       featured, lat, lng, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb,
       $17, $18, $19, NOW()
     )
     ON CONFLICT (id) DO NOTHING`,
    [
      unitId,
      buildingId,
      clientId,
      page.unitNumber,
      page.squareMeters,
      page.bedrooms,
      page.bathrooms,
      page.parking,
      dbListingType(page.listingType),
      page.price,
      page.rent,
      page.statusKey,
      page.title,
      page.description,
      JSON.stringify(page.amenities),
      images,
      page.featured,
      page.lat,
      page.lng,
    ],
  )

  return accepted
}

function clientOf(row: { unitClient: string; buildingClient: string }, blockBayview: boolean): string {
  const client = row.unitClient || row.buildingClient
  if (!client) return ''
  if (blockBayview && client === BAYVIEW_CLIENT) return ''
  return client
}

/**
 * Resolve the unit + agency for a public listing id.
 * Never LIMIT 1 on entity_id_map (the Framesby seed row sorts first).
 * For PR-1011, never return the static seed uuid and never stamp Bayview.
 */
export async function resolveLiveListing(propertyId: unknown): Promise<LiveListing> {
  if (propertyId == null || str(propertyId) === '') {
    throw new Error('application requires propertyId')
  }
  const fe = canonicalListingId(str(propertyId))
  const collision = isPublicHumewood(fe)
  const aliases = [
    ...new Set([
      ...listingIdAliases(fe),
      // Public page ids. PR-1011 was reused for the Framesby seed row; the
      // listing the guest sees is unt-skyline-b14.
      ...(collision ? [PUBLIC_UNIT_ID, 'skyline-b14', PUBLIC_PROPERTY_ID, 'unt-PR-1011'] : []),
    ]),
  ]
  const seedIds = new Set<string>()
  const propSeed = await resolveUuid('property', fe)
  const unitSeed = await resolveUuid('unit', unitIdForProperty(fe))
  if (propSeed) seedIds.add(propSeed)
  if (unitSeed) seedIds.add(unitSeed)
  if (collision) {
    // Static map always points PR-1011 at Framesby, even when the caller
    // passed unt-skyline-b14. Never treat that uuid, or Beachview B14, as live.
    const framesbyProp = await resolveUuid('property', PUBLIC_PROPERTY_ID)
    const framesbyUnit = await resolveUuid('unit', unitIdForProperty(PUBLIC_PROPERTY_ID))
    if (framesbyProp) seedIds.add(framesbyProp)
    if (framesbyUnit) seedIds.add(framesbyUnit)
    seedIds.add(FRAMESBY_UNIT)
    seedIds.add(BEACHVIEW_B14)
  }

  const rows = aliases.length
    ? await query<ListingCandidate>(
        `SELECT u.id::text AS id,
                m.backend_id::text AS backend_id,
                NULLIF(BTRIM(u.client_id::text), '') AS unit_client,
                NULLIF(BTRIM(b.client_id::text), '') AS building_client
         FROM entity_id_map m
         JOIN units u ON u.id = m.backend_id
         LEFT JOIN buildings b ON b.id = u.building_id
         WHERE m.entity_type = ANY($1::text[])
           AND m.frontend_id = ANY($2::text[])`,
        [['property', 'unit'], aliases],
      )
    : []

  const ranked = rows.map((r) => {
    const seed = seedIds.has(r.id) || seedIds.has(r.backend_id)
    return {
      id: r.id,
      seed,
      unitClient: (r.unit_client ?? '').trim(),
      buildingClient: (r.building_client ?? '').trim(),
    }
  })

  const live = ranked.find((r) => !r.seed && clientOf(r, collision))
  if (live) {
    const picked = collision
      ? acceptLive(live.id, clientOf(live, collision))
      : { unitId: live.id, clientId: clientOf(live, collision) }
    if (picked) return picked
  }

  if (collision) {
    // Map hit missing, or the live row and its building have no usable client.
    // Do not fall through to the Framesby seed (that stamps Bayview, or throws).
    const seedList = [...seedIds]
    // Units row for this listing when entity_id_map only has the Framesby seed.
    // Match the live title only. Beachview Towers B14 is PR-1012 (…0003), not PR-1011.
    const fallback = seedList.length
      ? await query<ListingCandidate>(
          `SELECT u.id::text AS id,
                  u.id::text AS backend_id,
                  NULLIF(BTRIM(u.client_id::text), '') AS unit_client,
                  NULLIF(BTRIM(b.client_id::text), '') AS building_client
           FROM units u
           LEFT JOIN buildings b ON b.id = u.building_id
           WHERE NOT (u.id = ANY($1::uuid[]))
             AND u.title ILIKE '%Humewood Beach Apartment B14%'
             AND u.title NOT ILIKE '%Beachview%'`,
          [seedList],
        )
      : []
    const fallbackRanked = fallback.map((r) => ({
      id: r.id,
      seed: false,
      unitClient: (r.unit_client ?? '').trim(),
      buildingClient: (r.building_client ?? '').trim(),
    }))
    const found = fallbackRanked.find((r) => clientOf(r, true)) ?? fallbackRanked[0]
    if (found) {
      const picked = acceptLive(found.id, clientOf(found, true) || HORIZON_CLIENT)
      if (picked) return picked
    }
    const liveEmpty = ranked.find((r) => !r.seed)
    if (liveEmpty) {
      const picked = acceptLive(liveEmpty.id, HORIZON_CLIENT)
      if (picked) return picked
    }
    // seed.sql has no Humewood Beach Apartment B14 row. Write the same listing
    // the public page shows instead of throwing property_not_found.
    const made = await materializePublicHumewoodUnit()
    if (made) return made
    // No live Humewood row. Do not stamp Framesby, Bayview, or Beachview PR-1012.
    throw new Error('application requires propertyId')
  }

  const seedWithOwnClient = ranked.find((r) => r.seed && r.unitClient)
  if (seedWithOwnClient) {
    return { unitId: seedWithOwnClient.id, clientId: seedWithOwnClient.unitClient }
  }
  throw new Error('application requires propertyId')
}
