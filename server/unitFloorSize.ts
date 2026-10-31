import { parseFloorSizeSqm } from '../src/lib/listingSizes.js'

/**
 * T2 (C-2, V2-1): units.square_meters is NUMERIC(10,2). The floor size
 * upsertProperty stores is area, else squareMeters (writes.ts num()). Check
 * that same value with the client's rule before any write: absent, null or ''
 * is not set; otherwise it must be a number or a plain-decimal string, 0 …
 * 99 999 999.99. '0x10', '1e3', '+5', '-1', '12,5', booleans and objects are a
 * 400, instead of being stored as 16 / 1000 / a negative / NULL, or failing
 * the INSERT with a 500.
 */
export function assertUnitFloorSize(d: Record<string, unknown>): void {
  const v = isSet(d.area) ? d.area : d.squareMeters
  if (!isSet(v)) return
  if (typeof v !== 'number' && typeof v !== 'string') throw invalid()
  if (parseFloorSizeSqm(v) === 'invalid') throw invalid()
}

function isSet(v: unknown): boolean {
  return v != null && !(typeof v === 'string' && v.trim() === '')
}

function invalid() {
  return Object.assign(
    new Error('floor size must be a number of m² from 0 to 99 999 999.99, or left blank'),
    { status: 400, code: 'UNIT_FLOOR_SIZE_INVALID' },
  )
}
