/**
 * Shared photo limits (client + server). One place to raise them.
 *
 * Ticket photos use these now. P3a listing photos (Pete, src/lib/listingPhotos.ts
 * on his branch, not on main yet) has its own 600 KB cap measured on data-URL
 * length; it should import MAX_PHOTO_BYTES / dataUrlDecodedBytes from here.
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

export type TicketPhotoCheck =
  | { ok: true; urls: string[] }
  | { ok: false; reason: string }

/**
 * Validate ticket photos: data:image/(jpeg|png|webp);base64 up to
 * MAX_PHOTO_BYTES decoded each, http(s) URLs, MAX_TICKET_PHOTOS_TOTAL_BYTES
 * total (data URLs). Any other data: URL is invalid (never silently dropped);
 * non-string items and non-URL junk strings are dropped.
 */
export function checkTicketPhotos(input: unknown[]): TicketPhotoCheck {
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
      if (bytes > MAX_PHOTO_BYTES) return { ok: false, reason: 'a photo is larger than 600 KB' }
      total += bytes
      if (total > MAX_TICKET_PHOTOS_TOTAL_BYTES) return { ok: false, reason: 'photos are larger than 3 MB in total' }
      urls.push(u)
      continue
    }
    if (HTTP_URL_RE.test(u)) urls.push(u)
    // anything else: junk, dropped
  }
  return { ok: true, urls }
}
