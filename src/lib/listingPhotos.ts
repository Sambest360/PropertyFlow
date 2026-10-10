/** P3a: listing photo limits (one place to raise them). */
export const MAX_LISTING_PHOTOS = 8
/** Refuse a photo still over this size after downscaling (data URL length). */
export const MAX_LISTING_PHOTO_BYTES = 600 * 1024
export const LISTING_PHOTO_TOO_LARGE =
  'This photo is still larger than 600 KB after resizing. Choose a smaller photo or crop it first.'
export const NO_PHOTOS_YET = 'No photos yet'

export function listingPhotosLabel(count: number): string {
  return `Photos (${Math.min(count, MAX_LISTING_PHOTOS)}/${MAX_LISTING_PHOTOS})`
}

/** Split compressed photos into accepted and refused (over the size cap). */
export function partitionPhotosBySize(urls: string[], maxBytes = MAX_LISTING_PHOTO_BYTES): { ok: string[]; refused: number } {
  const ok = urls.filter((u) => u.length <= maxBytes)
  return { ok, refused: urls.length - ok.length }
}
