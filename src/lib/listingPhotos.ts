import { MAX_PHOTO_BYTES } from './photoLimits'

/** P3a: listing photo size limit comes from photoLimits.ts; there is no photo-count cap. */
/** Refuse a photo still over this size after downscaling (data URL length). */
export const MAX_LISTING_PHOTO_BYTES = MAX_PHOTO_BYTES
export const LISTING_PHOTO_TOO_LARGE =
  'This photo is still larger than 600 KB after resizing. Choose a smaller photo or crop it first.'
export const NO_PHOTOS_YET = 'No photos yet'

export function listingPhotosLabel(count: number): string {
  return `Photos (${count})`
}

/** Split compressed photos into accepted and refused (over the size cap). */
export function partitionPhotosBySize(urls: string[], maxBytes = MAX_LISTING_PHOTO_BYTES): { ok: string[]; refused: number } {
  const ok = urls.filter((u) => u.length <= maxBytes)
  return { ok, refused: urls.length - ok.length }
}

/** Gallery display: trim, drop empties, dedupe URLs (first occurrence = cover). */
export function normalizeListingImages(urls: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of urls) {
    if (typeof raw !== 'string') continue
    const u = raw.trim()
    if (!u || seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}
