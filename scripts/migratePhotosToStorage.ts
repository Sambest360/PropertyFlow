/**
 * One-time remediation: move base64 data-URL photos out of units.images /
 * buildings.images into the public `listing-photos` Storage bucket, replacing
 * each with its public URL.
 *
 * Why: 21 units + 23 buildings carried ~10 MB of inline photos. Every signed-in
 * bootstrap, live-sync refresh and marketplace RPC re-read and shipped all of
 * it (0.9–1.2 s per query on Supabase, multi-MB responses to every browser).
 *
 * Needs migration 029_listing_photos_storage.sql applied first.
 *
 * Usage:
 *   npx tsx scripts/migratePhotosToStorage.ts          # dry-run report
 *   npx tsx scripts/migratePhotosToStorage.ts --write  # upload + update rows
 *
 * Env (.env.local): SUPABASE_URL (or VITE_SUPABASE_URL) and
 * SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY). The secret key reads and
 * writes through the Data API, so no database password is needed.
 */
import { randomUUID } from 'node:crypto'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env.local' })
// `vercel env pull` writes "[SENSITIVE]" for secrets it cannot download; treat those as unset.
for (const [k, v] of Object.entries(process.env)) {
  if (v?.includes('[SENSITIVE]')) delete process.env[k]
}

const WRITE = process.argv.includes('--write')
const BUCKET = 'listing-photos'
const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL in .env.local')
if (!secret) {
  throw new Error(
    'Missing SUPABASE_SECRET_KEY in .env.local — copy the secret key from Supabase → Project Settings → API Keys',
  )
}

const supabase = createClient(supabaseUrl, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function upload(dataUrl: string, table: string, rowId: string): Promise<string | null> {
  const m = DATA_URL_RE.exec(dataUrl)
  const mime = m?.[1].toLowerCase()
  if (!m || !mime || !EXT_BY_MIME[mime]) return null
  const path = `migrated/${table}/${rowId}/${randomUUID()}.${EXT_BY_MIME[mime]}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(m[2], 'base64'), { contentType: mime, cacheControl: '31536000', upsert: false })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

for (const table of ['units', 'buildings'] as const) {
  const { data: ids, error: idsError } = await supabase.from(table).select('id')
  if (idsError) throw new Error(`${table}: ${idsError.message}`)
  let rows = 0
  let photos = 0
  let chars = 0
  // One row at a time keeps each response small (a row can carry several MB).
  for (const { id } of ids ?? []) {
    const { data: row, error } = await supabase.from(table).select('images').eq('id', id).single()
    if (error) throw new Error(`${table} ${id}: ${error.message}`)
    const images: unknown[] = Array.isArray(row?.images) ? row.images : []
    if (!images.some((img) => typeof img === 'string' && img.startsWith('data:'))) continue
    rows++
    const next: unknown[] = []
    for (const img of images) {
      if (typeof img === 'string' && img.startsWith('data:')) {
        photos++
        chars += img.length
        next.push(WRITE ? ((await upload(img, table, id)) ?? img) : img)
      } else {
        next.push(img)
      }
    }
    if (WRITE) {
      const { error: updateError } = await supabase.from(table).update({ images: next }).eq('id', id)
      if (updateError) throw new Error(`update ${table} ${id}: ${updateError.message}`)
    }
  }
  console.log(
    `${table}: ${rows} row(s), ${photos} inline photo(s), ${(chars / 1024 / 1024).toFixed(1)} MB` +
      (WRITE ? ' → moved to Storage' : ' (dry run)'),
  )
}
if (!WRITE) console.log('Dry run only — re-run with --write to upload and update rows.')
