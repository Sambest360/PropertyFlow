/**
 * Shared photo limits (client + server). One place to raise them.
 *
 * Ticket photos and P3a listing photos (src/lib/listingPhotos.ts) both take
 * their limits from here. Listings still measure the 600 KB cap on data-URL
 * length (unchanged behaviour).
 */
export const MAX_PHOTO_BYTES = 600 * 1024
export const MAX_TICKET_PHOTOS_TOTAL_BYTES = 3 * 1024 * 1024
export const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const

const DATA_URL_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i
const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i

/** Decoded byte size of a base64 data URL (null when it is not one). */
export function dataUrlDecodedBytes(url: string): number | null {
  const m = DATA_URL_RE.exec(url)
  if (!m) return null
  const b64 = m[2]
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - pad
}

export const MAX_TICKET_PHOTOS = 10
/** P3a listing photos per listing. */
export const MAX_LISTING_PHOTOS = 8

export type PhotoCheck =
  | { ok: true; urls: string[] }
  | { ok: false; reason: string }
/** @deprecated alias kept for callers; same shape as PhotoCheck. */
export type TicketPhotoCheck = PhotoCheck

export type PhotoCheckLimits = {
  /** Most photos allowed (after junk is dropped). */
  maxCount: number
  /** Per-photo cap, decoded bytes. */
  maxBytes?: number
  /** Total cap over all data-URL photos, decoded bytes. */
  maxTotalBytes?: number
}

/** True for a URL that is safe to store and render (data:image of an allowed type, or http(s)). */
export function isSafePhotoUrl(u: unknown): u is string {
  if (typeof u !== 'string') return false
  const m = DATA_URL_RE.exec(u)
  if (m) return (ALLOWED_PHOTO_MIME as readonly string[]).includes(m[1].toLowerCase())
  return HTTP_URL_RE.test(u)
}

/**
 * Generic photo check (tickets: 10; P3a listings can pass 8):
 * data:image/(jpeg|png|webp);base64 up to maxBytes decoded each, http(s)
 * URLs, maxTotalBytes over data URLs, at most maxCount. Any other data: URL is
 * invalid (never silently dropped); non-string items and non-URL junk strings
 * (javascript:, blob:, plain text) are dropped.
 */
export function checkPhotos(input: unknown[], limits: PhotoCheckLimits): PhotoCheck {
  const maxBytes = limits.maxBytes ?? MAX_PHOTO_BYTES
  const maxTotal = limits.maxTotalBytes ?? Number.POSITIVE_INFINITY
  const urls: string[] = []
  let total = 0
  for (const item of input) {
    if (typeof item !== 'string') continue
    const u = item.trim()
    if (!u) continue
    if (/^data:/i.test(u)) {
      const m = DATA_URL_RE.exec(u)
      if (!m) return { ok: false, reason: 'not a base64 image data URL' }
      const mime = m[1].toLowerCase()
      if (!(ALLOWED_PHOTO_MIME as readonly string[]).includes(mime)) {
        return { ok: false, reason: `${mime} is not allowed (JPEG, PNG or WebP only)` }
      }
      const bytes = dataUrlDecodedBytes(u) ?? 0
      if (bytes > maxBytes) return { ok: false, reason: `a photo is larger than ${Math.round(maxBytes / 1024)} KB` }
      total += bytes
      if (total > maxTotal) return { ok: false, reason: `photos are larger than ${Math.round(maxTotal / (1024 * 1024))} MB in total` }
      urls.push(u)
      continue
    }
    if (HTTP_URL_RE.test(u)) urls.push(u)
    // anything else: junk, dropped
  }
  if (urls.length > limits.maxCount) return { ok: false, reason: `more than ${limits.maxCount} photos` }
  return { ok: true, urls }
}

/** Ticket photos: 10 photos, 600 KB each, 3 MB total. */
export function checkTicketPhotos(input: unknown[]): PhotoCheck {
  return checkPhotos(input, {
    maxCount: MAX_TICKET_PHOTOS,
    maxBytes: MAX_PHOTO_BYTES,
    maxTotalBytes: MAX_TICKET_PHOTOS_TOTAL_BYTES,
  })
}
