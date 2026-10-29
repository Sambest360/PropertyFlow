/**
 * Listing photos on the server's own disk. Files are written under UPLOADS_DIR
 * (default ./uploads) and served by the API at /api/files/<path>.
 *
 * Rows should carry those short links, not inline base64 photos (which made
 * every bootstrap ship megabytes) or links into the old Supabase bucket.
 * moveOldPhotosToDisk() copies both kinds onto this server, in the background.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { query } from './db.js'

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

/** Photos left in the old Supabase Storage bucket (public object links). */
export const OLD_BUCKET_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\//i

export const LOCAL_FILES_PREFIX = '/api/files/'
export function localUploadsDir(): string | null {
  if (process.env.UPLOADS_DIR === 'off') return null
  return resolve(process.env.UPLOADS_DIR || 'uploads')
}

export function photoStorageConfigured(): boolean {
  return localUploadsDir() != null
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

async function saveBytes(bytes: Buffer, mime: string, folder: string): Promise<string> {
  if (bytes.length > MAX_PHOTO_BYTES) throw coded(413, 'PHOTO_TOO_LARGE', 'Photo is larger than 5 MB')
  const path = `${folder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${EXT[mime] ?? 'jpg'}`
  const full = localFilePath(path)
  if (!full) throw coded(503, 'STORAGE_NOT_CONFIGURED', 'Photo storage is not configured')
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, bytes)
  return `${LOCAL_FILES_PREFIX}${path}`
}

/** Save one data-URL photo; returns its /api/files link. */
export async function uploadPhotoDataUrl(dataUrl: string, folder: string): Promise<string> {
  if (!photoStorageConfigured()) throw coded(503, 'STORAGE_NOT_CONFIGURED', 'Photo storage is not configured')
  const m = DATA_URL_RE.exec(dataUrl.trim())
  if (!m) throw coded(400, 'BAD_PHOTO', 'Only JPEG, PNG, WebP or GIF photos can be uploaded')
  return saveBytes(Buffer.from(m[2], 'base64'), m[1].toLowerCase(), folder)
}

/** Copy one photo from the old Supabase bucket onto this server. */
export async function copyRemotePhoto(url: string, folder: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw coded(502, 'DOWNLOAD_FAILED', `Could not download ${url} (${res.status})`)
  const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase()
  if (!EXT[mime]) throw coded(400, 'BAD_PHOTO', `Not an image: ${mime}`)
  return saveBytes(Buffer.from(await res.arrayBuffer()), mime, folder)
}

const TABLES = ['units', 'buildings'] as const
const OLD_PHOTO_SQL = `images::text LIKE '%data:image%' OR images::text LIKE '%.supabase.co/storage/%'`

/** Rows whose photos are still inline or in the old bucket. */
export async function oldPhotoCounts(): Promise<{ units: number; buildings: number }> {
  const out = { units: 0, buildings: 0 }
  for (const table of TABLES) {
    const rows = await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table} WHERE ${OLD_PHOTO_SQL}`)
    out[table] = Number(rows[0]?.n ?? 0)
  }
  return out
}

/**
 * Move the photos of up to `maxRows` rows onto this server's disk. A row is
 * rewritten only after all its photos were saved, so nothing is lost.
 */
export async function migrateOldPhotosBatch(maxRows = 10): Promise<{
  movedRows: number
  movedPhotos: number
  failedRows: string[]
}> {
  if (!photoStorageConfigured()) throw coded(503, 'STORAGE_NOT_CONFIGURED', 'Photo storage is not configured')
  let movedRows = 0
  let movedPhotos = 0
  const failedRows: string[] = []
  for (const table of TABLES) {
    if (movedRows >= maxRows) break
    const rows = await query<{ id: string; images: unknown }>(
      `SELECT id::text AS id, images FROM ${table} WHERE ${OLD_PHOTO_SQL} ORDER BY id LIMIT $1`,
      [maxRows - movedRows],
    )
    for (const row of rows) {
      const images = Array.isArray(row.images) ? row.images : []
      const next: unknown[] = []
      try {
        for (const img of images) {
          if (typeof img === 'string' && img.startsWith('data:image')) {
            next.push(await uploadPhotoDataUrl(img, `migrated/${table}`))
            movedPhotos++
          } else if (typeof img === 'string' && OLD_BUCKET_URL_RE.test(img)) {
            next.push(await copyRemotePhoto(img, `migrated/${table}`))
            movedPhotos++
          } else {
            next.push(img)
          }
        }
      } catch (err) {
        failedRows.push(`${table}:${row.id}`)
        console.warn('[photos] could not move photos for', table, row.id, err instanceof Error ? err.message : err)
        continue
      }
      await query(`UPDATE ${table} SET images = $2::jsonb WHERE id = $1::uuid`, [row.id, JSON.stringify(next)])
      movedRows++
    }
  }
  return { movedRows, movedPhotos, failedRows }
}

/** Background job at start-up: keep moving batches until none are left (or all left failed). */
export async function moveOldPhotosToDisk(): Promise<void> {
  if (!photoStorageConfigured()) return
  try {
    for (let i = 0; i < 1000; i++) {
      const r = await migrateOldPhotosBatch(10)
      if (r.movedRows === 0) break
      console.info(`[photos] moved ${r.movedPhotos} photo(s) from ${r.movedRows} row(s) onto this server`)
    }
  } catch (err) {
    console.warn('[photos] background move stopped:', err instanceof Error ? err.message : err)
  }
}
