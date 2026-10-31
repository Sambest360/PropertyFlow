/**
 * GET /api/email/photo/<unit uuid>.jpg — a listing's cover photo for emails,
 * resized to 1072×600 (the property card shows it at 536×300) as a JPEG.
 *
 * Read-only. A publicly listed property's photo is served to anyone (the
 * marketplace shows it already); any other property's photo only with the
 * signature server/email/propertyContext.ts puts in the link when it builds
 * an email for someone who is party to that property. Photos stored as data:
 * URLs, as files on this server, or in the old Supabase bucket all work;
 * other remote links are never fetched.
 */
import { readFile } from 'node:fs/promises'
import { coverImageRef, isPublicListing, loadUnit, photoSignatureValid } from './propertyContext.js'

export const EMAIL_PHOTO_W = 1072
export const EMAIL_PHOTO_H = 600

const DATA_URL_RE = /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/i
const MAX_SOURCE_BYTES = 12 * 1024 * 1024

/** Small in-process cache: mail apps fetch each photo once per recipient. */
const cache = new Map<string, { at: number; body: Buffer }>()
const CACHE_MAX = 60
const CACHE_MS = 30 * 60_000

async function sourceBytes(ref: string): Promise<Buffer | null> {
  const data = DATA_URL_RE.exec(ref)
  if (data) return Buffer.from(data[1]!.replace(/\s/g, ''), 'base64')
  const { LOCAL_FILES_PREFIX, OLD_BUCKET_URL_RE, localFilePath } = await import('../photoStorage.js')
  const local = ref.replace(/^https?:\/\/[^/]+/i, '')
  if (local.startsWith(LOCAL_FILES_PREFIX)) {
    const full = localFilePath(decodeURIComponent(local.slice(LOCAL_FILES_PREFIX.length).split('?')[0]!))
    return full ? readFile(full).catch(() => null) : null
  }
  if (OLD_BUCKET_URL_RE.test(ref)) {
    const res = await fetch(ref, { signal: AbortSignal.timeout(8000) }).catch(() => null)
    if (!res?.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.length <= MAX_SOURCE_BYTES ? buf : null
  }
  return null
}

export async function resize(input: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return sharp(input, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize(EMAIL_PHOTO_W, EMAIL_PHOTO_H, { fit: 'cover', position: 'attention' })
    .flatten({ background: '#f0f6fc' })
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toBuffer()
}

export type PhotoResult = { status: 200; body: Buffer } | { status: 404 }

/** The resized photo for `file` ("<uuid>.jpg"), or 404 when not found or not allowed. */
export async function emailPhoto(file: string, sig: string | null | undefined): Promise<PhotoResult> {
  const unitUuid = file.replace(/\.jpe?g$/i, '').toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(unitUuid)) return { status: 404 }
  const unit = await loadUnit(unitUuid)
  if (!unit) return { status: 404 }
  if (!isPublicListing(unit) && !photoSignatureValid(unitUuid, sig)) return { status: 404 }
  const ref = coverImageRef(unit)
  if (!ref) return { status: 404 }
  const key = `${unitUuid}:${ref.length}:${ref.slice(-48)}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return { status: 200, body: hit.body }
  const src = await sourceBytes(ref)
  if (!src || src.length > MAX_SOURCE_BYTES) return { status: 404 }
  const body = await resize(src).catch(() => null)
  if (!body) return { status: 404 }
  cache.set(key, { at: Date.now(), body })
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  return { status: 200, body }
}
