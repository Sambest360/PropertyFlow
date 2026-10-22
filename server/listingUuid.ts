/**
 * One units.id UUID per listing identity — property and unit FE ids are aliases.
 */
import { randomUUID } from 'node:crypto'
import { canonicalListingId, listingIdAliases, unitIdForProperty } from '../src/lib/listingIds.js'
import { ensureEntityMapTable, isUuid, resolveUuid, upsertEntityMapFrontendId } from './entityMap.js'

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
  let winner = uuid
  for (const row of [
    { et: 'property' as const, fe: canon },
    { et: 'unit' as const, fe: unitFe },
  ]) {
    winner = await upsertEntityMapFrontendId(row.et, row.fe, winner)
  }
  return winner
}
