/**
 * Rent roll as an on-screen table (Reports tab) + CSV that keeps the
 * on-screen column names and order. Read-only over RentRollRow.
 */

import type { RentRollRow } from './types'

export type RentRollColumnKey =
  | 'tenant'
  | 'unit'
  | 'owner'
  | 'charged'
  | 'outstanding'
  | 'leaseExpiry'
  | 'increaseDate'

/** Column order is fixed: tenant, unit, owner, charged, outstanding, lease expiry, increase date. */
export const RENT_ROLL_TABLE_COLUMNS: ReadonlyArray<{
  key: RentRollColumnKey
  label: string
  numeric?: boolean
}> = [
  { key: 'tenant', label: 'Tenant' },
  { key: 'unit', label: 'Unit' },
  { key: 'owner', label: 'Owner' },
  { key: 'charged', label: 'Charged', numeric: true },
  { key: 'outstanding', label: 'Outstanding', numeric: true },
  { key: 'leaseExpiry', label: 'Lease expiry' },
  { key: 'increaseDate', label: 'Increase date' },
]

function increaseLabel(row: RentRollRow): string {
  if (!row.increaseDate) return ''
  return row.escalationPct != null ? `${row.increaseDate} (+${row.escalationPct}%)` : row.increaseDate
}

/** Plain cell text for a rent roll column (blank when unknown, never invented). */
export function rentRollCellText(row: RentRollRow, key: RentRollColumnKey): string {
  switch (key) {
    case 'tenant':
      return row.tenantName
    case 'unit':
      return row.propertyTitle
    case 'owner':
      return row.landlordName
    case 'charged':
      return row.rentZar.toFixed(2)
    case 'outstanding':
      return row.arrearsZar.toFixed(2)
    case 'leaseExpiry':
      return row.endDate ?? ''
    case 'increaseDate':
      return increaseLabel(row)
  }
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/** CSV of the visible columns, same names and order as on screen. */
export function rentRollTableToCsv(
  rows: RentRollRow[],
  visible: ReadonlyArray<RentRollColumnKey> = RENT_ROLL_TABLE_COLUMNS.map((c) => c.key),
): string {
  const cols = RENT_ROLL_TABLE_COLUMNS.filter((c) => visible.includes(c.key))
  const header = cols.map((c) => csvEscape(c.label)).join(',')
  const body = rows.map((r) => cols.map((c) => csvEscape(rentRollCellText(r, c.key))).join(','))
  return [header, ...body].join('\n')
}
