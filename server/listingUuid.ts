/**
 * One units.id UUID per listing identity — property and unit FE ids are aliases.
 */
import { randomUUID } from 'node:crypto'
import { canonicalListingId, listingIdAliases, unitIdForProperty } from '../src/lib/listingIds.js'
import { query } from './db.js'
import { ensureEntityMapTable, isUuid, resolveUuid } from './entityMap.js'

/** Resolve an existing unit row UUID from any property/unit frontend id or alias. */
export async function resolveListingUnitUuid(feId: string): Promise<string | null> {
  if (isUuid(feId)) return feId
  for (const alias of listingIdAliases(feId)) {
    const hit =
      (await resolveUuid('property', alias)) ?? (await resolveUuid('unit', alias))
    if (hit) return hit
  }
  return null
}

/** Allocate or reuse the single backend UUID for this listing; register canonical map rows. */
export async function ensureListingUnitUuid(
  feId: string,
  preferredUuid?: string,
): Promise<string> {
  const existing = await resolveListingUnitUuid(feId)
  if (existing) return existing

  const uuid = preferredUuid && isUuid(preferredUuid) ? preferredUuid : randomUUID()
  const canon = canonicalListingId(feId)
  const unitFe = unitIdForProperty(canon)

  await ensureEntityMapTable()
  for (const row of [
    { et: 'property', fe: canon },
    { et: 'unit', fe: unitFe },
  ]) {
    await query(
      `INSERT INTO entity_id_map (entity_type, frontend_id, backend_id)
       VALUES ($1, $2, $3::uuid)
       ON CONFLICT (entity_type, frontend_id) DO UPDATE SET backend_id = EXCLUDED.backend_id`,
      [row.et, row.fe, uuid],
    )
  }
  return uuid
}
