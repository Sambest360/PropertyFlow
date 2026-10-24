import { isSupabaseMode } from './api/config'
import { createClient } from '../utils/supabase/client'

/** Public bucket created by migration 028_listing_photos_storage.sql. */
export const LISTING_PHOTOS_BUCKET = 'listing-photos'

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = DATA_URL_RE.exec(dataUrl)
  if (!m) return null
  const mime = m[1].toLowerCase()
  if (!EXT_BY_MIME[mime]) return null
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/**
 * Upload a compressed photo to Supabase Storage and return its public URL.
 * Rows then carry a short URL instead of a ~400 KB base64 string, so
 * bootstrap and marketplace payloads stay small. Returns the data URL
 * unchanged when Storage is unavailable (API mode, signed out, upload error).
 */
export async function storePhotoDataUrl(dataUrl: string): Promise<string> {
  if (!isSupabaseMode) return dataUrl
  const blob = dataUrlToBlob(dataUrl)
  if (!blob) return dataUrl
  try {
    const supabase = createClient()
    const month = new Date().toISOString().slice(0, 7)
    const path = `${month}/${crypto.randomUUID()}.${EXT_BY_MIME[blob.type]}`
    const { error } = await supabase.storage
      .from(LISTING_PHOTOS_BUCKET)
      .upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false })
    if (error) {
      console.warn('[photoStorage] upload failed — keeping inline photo:', error.message)
      return dataUrl
    }
    return supabase.storage.from(LISTING_PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl
  } catch (err) {
    console.warn('[photoStorage] upload failed — keeping inline photo:', err)
    return dataUrl
  }
}
