/**
 * "Load-shedding free" is an explicit choice on the listing (a checkbox in
 * Add/Edit property), stored as this feature label in the unit's amenities.
 * It is never inferred from solar kW or from amenities like "Solar" or
 * "Inverter / UPS" — those used to add the tag without the lister knowing.
 */
export const LOAD_SHEDDING_FREE_AMENITY = 'Load-shedding free'

export function isLoadSheddingFreeListing(amenities: readonly string[] | null | undefined): boolean {
  if (!amenities) return false
  const target = LOAD_SHEDDING_FREE_AMENITY.toLowerCase()
  return amenities.some((a) => typeof a === 'string' && a.trim().toLowerCase() === target)
}

export function withLoadSheddingFree(amenities: string[], on: boolean): string[] {
  const rest = amenities.filter((a) => a.trim().toLowerCase() !== LOAD_SHEDDING_FREE_AMENITY.toLowerCase())
  return on ? [...rest, LOAD_SHEDDING_FREE_AMENITY] : rest
}
