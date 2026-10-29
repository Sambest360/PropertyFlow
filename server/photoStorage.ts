/**
 * Listing photos in Supabase Storage (bucket `listing-photos`, migration 030),
 * uploaded by the server with SUPABASE_SECRET_KEY so it works in API auth
 * mode (production), where browsers have no Supabase session.
 *
 * Inline base64 photos in units.images / buildings.images made every
 * bootstrap ship megabytes; rows should carry public URLs instead.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { query } from './db.js'
import { createAdminClient } from './supabase/admin.js'
import { getSupabaseSecretKey } from './supabase/env.js'

export const LISTING_PHOTOS_BUCKET = 'listing-photos'
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
/** Matches the bucket's file_size_limit. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

function supabaseStorageConfigured(): boolean {
  return Boolean(getSupabaseSecretKey() && (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL))
}

/**
 * Self-hosted server (no Supabase): photos are written to UPLOADS_DIR on the
 * server's disk and served by the API at /api/files/<path>. Off on Vercel,
 * whose disk does not keep files.
 */
export const LOCAL_FILES_PREFIX = '/api/files/'
export function localUploadsDir(): string | null {
  if (process.env.VERCEL) return null
  if (process.env.UPLOADS_DIR === 'off') return null
  return resolve(process.env.UPLOADS_DIR || 'uploads')
}

export function photoStorageConfigured(): boolean {
  return supabaseStorageConfigured() || localUploadsDir() != null
}

/** Absolute path of a stored file, or null when the path tries to leave the uploads folder. */
export function localFilePath(rel: string): string | null {
  const dir = localUploadsDir()
  if (!dir || !rel || rel.includes('\0')) return null
  const full = resolve(dir, rel)
  return full.startsWith(dir + sep) ? full : null
}

/** Every stored file under the uploads folder: relative path and size. */
export async function listLocalFiles(): Promise<Array<{ path: string; size: number }>> {
  const dir = localUploadsDir()
  if (!dir) return []
  const out: Array<{ path: string; size: number }> = []
  const walk = async (d: string) => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) await walk(p)
      else if (e.isFile()) out.push({ path: relative(dir, p).split(sep).join('/'), size: (await stat(p)).size })
    }
  }
  await walk(dir)
  return out
}

function coded(status: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { status, code })
}

/** Upload one data-URL photo; returns its public URL. */
export async function uploadPhotoDataUrl(dataUrl: string, folder: string): Promise<string> {
  if (!photoStorageConfigured()) throw coded(503, 'STORAGE_NOT_CONFIGURED', 'Photo storage is not configured')
  const m = DATA_URL_RE.exec(dataUrl.trim())
  if (!m) throw coded(400, 'BAD_PHOTO', 'Only JPEG, PNG, WebP or GIF photos can be uploaded')
  const mime = m[1].toLowerCase()
  const bytes = Buffer.from(m[2], 'base64')
  if (bytes.length > MAX_PHOTO_BYTES) throw coded(413, 'PHOTO_TOO_LARGE', 'Photo is larger than 5 MB')
  const path = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${EXT[mime]}`
  if (!supabaseStorageConfigured()) {
    const full = localFilePath(path)
    if (!full) throw coded(503, 'STORAGE_NOT_CONFIGURED', 'Photo storage is not configured')
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, bytes)
    return `${LOCAL_FILES_PREFIX}${path}`
  }
  const storage = createAdminClient().storage.from(LISTING_PHOTOS_BUCKET)
  const { error } = await storage.upload(path, bytes, { contentType: mime, cacheControl: '31536000', upsert: false })
  if (error) throw coded(502, 'UPLOAD_FAILED', `Photo upload failed: ${error.message}`)
  return storage.getPublicUrl(path).data.publicUrl
}

const TABLES = ['units', 'buildings'] as const

/** Rows still holding inline photos (for the admin status card). */
export async function inlinePhotoCounts(): Promise<{ units: number; buildings: number }> {
  const out = { units: 0, buildings: 0 }
  for (const table of TABLES) {
    const rows = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM ${table} WHERE images::text LIKE '%data:image%'`,
    )
    out[table] = Number(rows[0]?.n ?? 0)
  }
  return out
}

/**
 * Move inline photos of up to `maxRows` rows to Storage (Vercel functions stop
 * at 30 s, so the admin button calls this repeatedly until nothing is left).
 * Each row is rewritten only after all its photos uploaded.
 */
export async function migrateInlinePhotosBatch(maxRows = 3): Promise<{
  movedRows: number
  movedPhotos: number
  remaining: { units: number; buildings: number }
}> {
  if (!photoStorageConfigured()) throw coded(503, 'STORAGE_NOT_CONFIGURED', 'Photo storage is not configured')
  let movedRows = 0
  let movedPhotos = 0
  for (const table of TABLES) {
    if (movedRows >= maxRows) break
    const rows = await query<{ id: string; images: unknown }>(
      `SELECT id::text AS id, images FROM ${table} WHERE images::text LIKE '%data:image%' ORDER BY id LIMIT $1`,
      [maxRows - movedRows],
    )
    for (const row of rows) {
      const images = Array.isArray(row.images) ? row.images : []
      const next: unknown[] = []
      for (const img of images) {
        if (typeof img === 'string' && img.startsWith('data:image')) {
          next.push(await uploadPhotoDataUrl(img, `migrated/${table}`))
          movedPhotos++
        } else {
          next.push(img)
        }
      }
      await query(`UPDATE ${table} SET images = $2::jsonb WHERE id = $1::uuid`, [row.id, JSON.stringify(next)])
      movedRows++
    }
  }
  return { movedRows, movedPhotos, remaining: await inlinePhotoCounts() }
}
