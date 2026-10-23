/**
 * Shared rules for advertising a rental while the current tenant stays.
 * Imported by the server (public listing gates) and the agent / tenant cards.
 */

/** POPIA: adverts must not show the sitting tenant or their belongings. */
export const POPIA_PHOTO_WARNING =
  'Do not use photos that show the tenant, their family, or their belongings. Prefer photos taken before they moved in.'

/** Floor on notice for a viewing of an occupied home (RHA s4 privacy; confirm with counsel). */
export const MIN_OCCUPIED_VIEWING_NOTICE_HOURS = 24

/** TS mirror of the occupied-advert predicate in get_public_marketplace_bootstrap (migration 027). */
export function isOccupiedAdvert(row: {
  statusKey: string | null
  listingType: string | null
  advertiseWhileOccupied: boolean | null
  availableFrom: string | null
}): boolean {
  const listing = String(row.listingType ?? 'rent').toLowerCase()
  return (
    Boolean(row.advertiseWhileOccupied) &&
    Boolean(row.availableFrom) &&
    String(row.statusKey ?? '').toUpperCase() === 'OCCUPIED' &&
    (listing === 'rent' || listing === 'both')
  )
}
