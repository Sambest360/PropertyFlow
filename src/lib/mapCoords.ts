/**
 * Shared map coordinate helpers.
 */

export function hasMappedCoordinates(p: {
  lat?: number | null
  lng?: number | null
}): boolean {
  const lat = p.lat
  const lng = p.lng
  if (lat == null || lng == null) return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  // Bootstrap historically used 0,0 as a missing sentinel
  if (lat === 0 && lng === 0) return false
  return true
}
