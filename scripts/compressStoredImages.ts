/**
 * One-time remediation: compress base64 data-URL photos already stored in
 * units.images / buildings.images on the hosted Supabase Postgres.
 *
 * Why: wizard uploads were persisted as raw data URLs (one QA property carried
 * a 1.2 MB photo). The public marketplace bootstrap RPC serialized them into a
 * 4.27 MB / 20.9 s payload, tripped Supabase's statement timeout (HTTP 500 on
 * /rest/v1/rpc/*), and degraded the shared database enough that auth/signup
 * calls returned HTTP 504 — which surfaced to users as failed registrations.
 *
 * Usage:
 *   npx tsx scripts/compressStoredImages.ts          # dry-run report
 *   npx tsx scripts/compressStoredImages.ts --write  # actually update rows
 *
 * The compressor is intentionally tiny (sharp is not a dependency here); it
 * re-encodes JPEG/PNG/WebP via canvas and falls back to keeping the original
 * when the result would be larger.
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
import { config as loadEnv } from 'dotenv'
import { Client } from 'pg'
import sharp from 'sharp'
import { assertLocalDatabaseTargets } from './seed/localOnlyGuard.ts'

loadEnv({ path: '.env.local' })

assertLocalDatabaseTargets([
  { label: 'database URL (DIRECT_URL)', url: process.env.DIRECT_URL },
])

const WRITE = process.argv.includes('--write')
const MAX_EDGE = 1600
const TARGET_BYTES = 300_000

type ImgRow = { id: string; images: unknown[] }

function isDataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/')
}

async function compressDataUrl(dataUrl: string): Promise<string> {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const input = Buffer.from(base64, 'base64')
  let pipeline = sharp(input).rotate()
  const meta = await pipeline.metadata()
  if (Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_EDGE) {
    pipeline = pipeline.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside' })
  }
  let out = await pipeline.jpeg({ quality: 78, mozjpeg: true }).toBuffer()
  for (const q of [64, 52]) {
    if (out.length <= TARGET_BYTES) break
    out = await sharp(input).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside' }).jpeg({ quality: q, mozjpeg: true }).toBuffer()
  }
  const result = `data:image/jpeg;base64,${out.toString('base64')}`
  return result.length < dataUrl.length ? result : dataUrl
}

const db = new Client({
  connectionString: process.env.DIRECT_URL,
  statement_timeout: 30_000,
})
await db.connect()

for (const table of ['units', 'buildings'] as const) {
  const labelCol = table === 'units' ? 'title' : 'name'
  const res = await db.query<ImgRow & { label: string | null }>(
    `SELECT id, images, ${labelCol} AS label FROM ${table}
     WHERE images IS NOT NULL AND EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(images) e WHERE e LIKE 'data:%'
     )`,
  )
  let totalBefore = 0
  let totalAfter = 0
  let changed = 0
  for (const row of res.rows) {
    const before = (row.images as unknown[]).map((v) => (isDataUrl(v) ? v.length : 0)).reduce((a, b) => a + b, 0)
    const next: unknown[] = []
    for (const img of row.images) {
      next.push(isDataUrl(img) ? await compressDataUrl(img) : img)
    }
    const after = next.map((v) => (isDataUrl(v) ? v.length : 0)).reduce((a, b) => a + b, 0)
    totalBefore += before
    totalAfter += after
    if (after < before) {
      changed++
      console.log(`${table} ${row.id} (${row.label ?? ''}): ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`)
      if (WRITE) {
        await db.query(`UPDATE ${table} SET images = $2::jsonb, updated_at = now() WHERE id = $1`, [row.id, JSON.stringify(next)])
      }
    }
  }
  console.log(
    `${table}: ${changed} row(s) ${WRITE ? 'updated' : 'would shrink'}; images ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB`,
  )
}

console.log(WRITE ? 'Done (write mode).' : 'Dry-run only — rerun with --write to apply.')
await db.end()
