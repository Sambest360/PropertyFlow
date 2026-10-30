import { MAX_FLOOR_SIZE_SQM } from '../src/lib/listingSizes.js'

/**
 * T2 (C-2): units.square_meters is NUMERIC(10,2), so a floor size above
 * 99 999 999.99 m² (after rounding to 2 decimals) would fail the INSERT with
 * a numeric overflow (a 500). Reject it first with a 400, before any write.
 * The value checked is the one upsertProperty stores: area, else squareMeters,
 * read the same way as writes.ts num() (blank / non-numeric → not set).
 */
export function assertUnitFloorSize(d: Record<string, unknown>): void {
  const n = storedNumber(d.area) ?? storedNumber(d.squareMeters)
  if (n == null) return
  if (Math.round(n * 100) / 100 > MAX_FLOOR_SIZE_SQM) {
    throw Object.assign(new Error('floor size must be at most 99 999 999.99 m²'), {
      status: 400,
      code: 'UNIT_FLOOR_SIZE_INVALID',
    })
  }
}

function storedNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
