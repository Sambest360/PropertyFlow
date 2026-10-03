/**
 * Public PR-1011 is the live Humewood Beach Apartment (Horizon), but
 * resolveUuid / ensureEntityMapTable still point that frontend id at the
 * static Framesby cottage (Bayview). Guest enquiry and guest apply must
 * not pick that seed row.
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { AGENCY_TO_CLIENT } from './idMap.js'
import { canonicalListingId, listingIdAliases, unitIdForProperty } from '../src/lib/listingIds.js'

/** Bayview Property Group — seed client on the Framesby cottage (seed.sql). */
const BAYVIEW_CLIENT = AGENCY_TO_CLIENT['ag-garden']!
/** Horizon Realty — agency on the live Humewood Beach Apartment (not Beachview Towers). */
const HORIZON_CLIENT = AGENCY_TO_CLIENT['ag-horizon']!

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
  const collision = fe === 'PR-1011'
  const aliases = [
    ...new Set([
      ...listingIdAliases(fe),
      // Infra marketplace id for Humewood B14. The public route is PR-1011
      // because that id was reused; the live row may be mapped under this key.
      ...(collision ? ['unt-skyline-b14', 'skyline-b14'] : []),
    ]),
  ]
  const seedIds = new Set<string>()
  const propSeed = await resolveUuid('property', fe)
  const unitSeed = await resolveUuid('unit', unitIdForProperty(fe))
  if (propSeed) seedIds.add(propSeed)
  if (unitSeed) seedIds.add(unitSeed)

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
    return { unitId: live.id, clientId: clientOf(live, collision) }
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
      return { unitId: found.id, clientId: clientOf(found, true) || HORIZON_CLIENT }
    }
    const liveEmpty = ranked.find((r) => !r.seed)
    if (liveEmpty) {
      return { unitId: liveEmpty.id, clientId: HORIZON_CLIENT }
    }
    // No live Humewood row. Do not stamp Framesby, Bayview, or Beachview PR-1012.
    throw new Error('application requires propertyId')
  }

  const seedWithOwnClient = ranked.find((r) => r.seed && r.unitClient)
  if (seedWithOwnClient) {
    return { unitId: seedWithOwnClient.id, clientId: seedWithOwnClient.unitClient }
  }
  throw new Error('application requires propertyId')
}
