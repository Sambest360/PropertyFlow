import { query as dbQuery } from './db.js'
import { parseSizeSqm } from '../src/lib/listingSizes.js'

/**
 * units.erf_size_sqm (migration 037, T2) may not be applied yet. Same pattern
 * as ticketAccessNotes.ts: checked once per process via information_schema
 * and cached; while it is missing the writer skips the column without error
 * and bootstrap reports unitErfSizeSupported: false so the wizard shows
 * "Not saved yet" instead of silently dropping the value. The bootstrap read
 * is `SELECT * FROM units`, so it needs no check (the key is just absent).
 */
type Q = (sql: string, params: unknown[]) => Promise<unknown[]>

let known: boolean | undefined
let inflight: Promise<boolean> | null = null

const COLUMN_SQL = `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'units' AND column_name = 'erf_size_sqm'
        LIMIT 1`

/**
 * Runs the column check once per process and caches it. Throws 503
 * UNIT_ERF_SIZE_CHECK_FAILED when the lookup itself fails (nothing cached;
 * the next save retries), so a save never reports success with the erf size
 * dropped. upsertProperty calls it before its first write.
 */
export function ensureUnitErfSizeColumn(q: Q = dbQuery as unknown as Q): Promise<boolean> {
  if (known !== undefined) return Promise.resolve(known)
  if (!inflight) {
    inflight = q(COLUMN_SQL, [])
      .then((rows) => {
        known = rows.length > 0
        return known
      })
      .catch((e: unknown) => {
        throw Object.assign(new Error('could not check the erf size column; try again'), {
          status: 503,
          code: 'UNIT_ERF_SIZE_CHECK_FAILED',
          cause: e,
        })
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Bootstrap flag: fail-closed (a failed check reports false). */
export function unitErfSizeColumnExists(q: Q = dbQuery as unknown as Q): Promise<boolean> {
  return ensureUnitErfSizeColumn(q).catch(() => false)
}

/** Tests only. */
export function resetUnitErfSizeCache(): void {
  known = undefined
  inflight = null
}

/** 400 UNIT_ERF_SIZE_INVALID unless erfSizeSqm is absent, null / '', or a number 0 … 9 999 999 999.99. */
export function assertUnitErfSize(d: Record<string, unknown>): void {
  const v = d.erfSizeSqm
  if (v === undefined) return
  if (v !== null && typeof v !== 'number' && typeof v !== 'string') throw invalid()
  if (parseSizeSqm(v as string | number | null) === 'invalid') throw invalid()
}

function invalid() {
  return Object.assign(new Error('erf / stand size must be a number of m² (0 or more), or left blank'), {
    status: 400,
    code: 'UNIT_ERF_SIZE_INVALID',
  })
}

/**
 * Writes units.erf_size_sqm from the payload's erfSizeSqm. Absent (undefined)
 * keeps the stored value; null / '' clears it. Never derived from
 * area / squareMeters. Uses only the cached column check: the caller must
 * await ensureUnitErfSizeColumn() first, else this throws rather than drop
 * the value. No-op while the column is missing.
 */
export async function writeUnitErfSize(
  unitUuid: string,
  d: Record<string, unknown>,
  q: Q = dbQuery as unknown as Q,
): Promise<void> {
  if (d.erfSizeSqm === undefined) return
  assertUnitErfSize(d)
  if (known === undefined) {
    throw Object.assign(new Error('erf size column check not run before the write'), {
      status: 500,
      code: 'UNIT_ERF_SIZE_CHECK_FAILED',
    })
  }
  if (!known) return
  const v = parseSizeSqm(d.erfSizeSqm as string | number | null)
  await q(`UPDATE units SET erf_size_sqm = $2 WHERE id = $1::uuid`, [unitUuid, v])
}

/** Bootstrap read: the row's erf_size_sqm as a number, null when unset or the column is absent. */
export function readUnitErfSize(row: Record<string, unknown>): number | null {
  const v = row.erf_size_sqm
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
