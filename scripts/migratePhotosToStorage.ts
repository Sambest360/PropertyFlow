/**
 * One-time remediation: move base64 data-URL photos out of units.images /
 * buildings.images into the public `listing-photos` Storage bucket, replacing
 * each with its public URL.
 *
 * Why: 21 units + 23 buildings carried ~10 MB of inline photos. Every signed-in
 * bootstrap, live-sync refresh and marketplace RPC re-read and shipped all of
 * it (0.9–1.2 s per query on Supabase, multi-MB responses to every browser).
 *
 * Needs migration 028_listing_photos_storage.sql applied first.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npx tsx scripts/migratePhotosToStorage.ts          # dry-run report
 *   npx tsx scripts/migratePhotosToStorage.ts --write  # upload + update rows
 *
 * Env: DIRECT_URL (or DATABASE_URL), SUPABASE_URL (or VITE_SUPABASE_URL),
 * SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 */
import { randomUUID } from 'node:crypto'
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'
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

// POSTGRES_URL_NON_POOLING is what the Vercel–Supabase integration provides (`vercel env pull`).
const directUrl =
  process.env.DIRECT_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!directUrl) throw new Error('Missing DIRECT_URL or DATABASE_URL')
if (WRITE && (!supabaseUrl || !secret)) {
  throw new Error('--write needs SUPABASE_URL and SUPABASE_SECRET_KEY (service role) to upload')
}

const storage = WRITE
  ? createClient(supabaseUrl!, secret!, { auth: { autoRefreshToken: false, persistSession: false } }).storage
  : null

async function upload(dataUrl: string, table: string, rowId: string): Promise<string | null> {
  const m = DATA_URL_RE.exec(dataUrl)
  const mime = m?.[1].toLowerCase()
  if (!m || !mime || !EXT_BY_MIME[mime]) return null
  const path = `migrated/${table}/${rowId}/${randomUUID()}.${EXT_BY_MIME[mime]}`
  const { error } = await storage!
    .from(BUCKET)
    .upload(path, Buffer.from(m[2], 'base64'), { contentType: mime, cacheControl: '31536000', upsert: false })
  if (error) throw new Error(`upload ${path}: ${error.message}`)
  return storage!.from(BUCKET).getPublicUrl(path).data.publicUrl
}

const db = new Client({
  connectionString: directUrl,
  ssl: /localhost|127\.0\.0\.1/.test(directUrl) ? undefined : { rejectUnauthorized: false },
  statement_timeout: 30_000,
})
await db.connect()

try {
  for (const table of ['units', 'buildings'] as const) {
    const res = await db.query<{ id: string; images: unknown[] }>(
      `SELECT id, images FROM ${table}
        WHERE jsonb_typeof(images) = 'array' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(images) e WHERE e LIKE 'data:%'
        )`,
    )
    let photos = 0
    let chars = 0
    for (const row of res.rows) {
      const next: unknown[] = []
      for (const img of row.images) {
        if (typeof img === 'string' && img.startsWith('data:')) {
          photos++
          chars += img.length
          next.push(WRITE ? ((await upload(img, table, row.id)) ?? img) : img)
        } else {
          next.push(img)
        }
      }
      // Only touch images; leave updated_at etc. to existing triggers.
      if (WRITE) await db.query(`UPDATE ${table} SET images = $2::jsonb WHERE id = $1`, [row.id, JSON.stringify(next)])
    }
    console.log(
      `${table}: ${res.rows.length} row(s), ${photos} inline photo(s), ${(chars / 1024 / 1024).toFixed(1)} MB` +
        (WRITE ? ' → moved to Storage' : ' (dry run)'),
    )
  }
  if (WRITE) {
    // Reclaim the TOAST space the base64 strings held.
    await db.query('VACUUM (ANALYZE) units')
    await db.query('VACUUM (ANALYZE) buildings')
  } else {
    console.log('Dry run only — re-run with --write to upload and update rows.')
  }
} finally {
  await db.end()
}
