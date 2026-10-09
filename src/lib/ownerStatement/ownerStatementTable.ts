/**
 * Owner statement as an on-screen table (Reports tab) + CSV that keeps the
 * on-screen column names and order. Read-only over OwnerStatementBook.
 */

import type { OwnerStatementBook, OwnerStatementLine } from './types'

export type OwnerStatementColumnKey =
  | 'date'
  | 'property'
  | 'description'
  | 'rent'
  | 'commission'
  | 'otherAllocations'
  | 'netPaid'

export const OWNER_STATEMENT_TABLE_COLUMNS: ReadonlyArray<{
  key: OwnerStatementColumnKey
  label: string
  numeric?: boolean
}> = [
  { key: 'date', label: 'Date' },
  { key: 'property', label: 'Property' },
  { key: 'description', label: 'Description' },
  { key: 'rent', label: 'Rent', numeric: true },
  { key: 'commission', label: 'Commission', numeric: true },
  { key: 'otherAllocations', label: 'Other allocations', numeric: true },
  { key: 'netPaid', label: 'Net paid', numeric: true },
]

export const OWNER_STATEMENT_TABLE_FOOTER =
  'Figures come from the in-app book (payments, allocations, and payouts submitted or earlier).'

export type OwnerStatementTableRow = {
  id: string
  date: string
  property: string
  description: string
  rent: number | null
  commission: number | null
  otherAllocations: number | null
  netPaid: number | null
}

export type OwnerStatementTableTotals = {
  rent: number
  commission: number
  otherAllocations: number
  netPaid: number
}

function isCommissionBucket(bucketCode: string): boolean {
  return /commission/i.test(bucketCode)
}

const RENT_PAYMENT_TYPES = new Set(['Rent', 'First Month Rent'])

function isRentPaymentType(type: string | undefined): boolean {
  return type != null && RENT_PAYMENT_TYPES.has(type)
}

/** Place each in-app book line in at most one money column. */
export function ownerStatementRow(line: OwnerStatementLine): OwnerStatementTableRow {
  const base = {
    id: `${line.kind}-${line.id}`,
    date: line.date,
    property: line.propertyTitle,
    description: line.description,
    rent: null,
    commission: null,
    otherAllocations: null,
    netPaid: null,
  }
  if (line.kind === 'payment') {
    // Only money actually received counts. Rent = Rent / First Month Rent with status Paid;
    // Commission = Commission with status Paid. Every other payment (deposits, refunds, Other,
    // or anything not Paid) is listed but stays out of the money columns and totals — Other
    // allocations is for trust allocations only, not payments.
    if (line.status !== 'Paid') return base
    if (isRentPaymentType(line.paymentType)) return { ...base, rent: line.amountZar }
    if (line.paymentType === 'Commission') return { ...base, commission: line.amountZar }
    return base
  }
  if (line.kind === 'allocation') {
    return isCommissionBucket(line.bucketCode)
      ? { ...base, commission: line.amountZar }
      : { ...base, otherAllocations: line.amountZar }
  }
  return { ...base, netPaid: line.amountZar }
}

export function buildOwnerStatementTable(
  book: OwnerStatementBook,
  filter?: { propertyTitle?: string | null },
): { rows: OwnerStatementTableRow[]; totals: OwnerStatementTableTotals } {
  const lines = filter?.propertyTitle
    ? book.lines.filter((l) => l.propertyTitle === filter.propertyTitle)
    : book.lines
  const rows = lines.map(ownerStatementRow)
  const sum = (k: keyof OwnerStatementTableTotals) => rows.reduce((n, r) => n + (r[k] ?? 0), 0)
  return {
    rows,
    totals: {
      rent: sum('rent'),
      commission: sum('commission'),
      otherAllocations: sum('otherAllocations'),
      netPaid: sum('netPaid'),
    },
  }
}

export function ownerStatementCellText(
  row: OwnerStatementTableRow,
  key: OwnerStatementColumnKey,
): string {
  const v = row[key]
  if (v == null) return ''
  return typeof v === 'number' ? v.toFixed(2) : v
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

/** CSV of the visible columns (same names and order as on screen) plus totals and footer. */
export function ownerStatementTableToCsv(
  rows: OwnerStatementTableRow[],
  totals: OwnerStatementTableTotals,
  visible: ReadonlyArray<OwnerStatementColumnKey> = OWNER_STATEMENT_TABLE_COLUMNS.map((c) => c.key),
): string {
  const cols = OWNER_STATEMENT_TABLE_COLUMNS.filter((c) => visible.includes(c.key))
  const header = cols.map((c) => csvEscape(c.label)).join(',')
  const body = rows.map((r) => cols.map((c) => csvEscape(ownerStatementCellText(r, c.key))).join(','))
  const firstTextCol = cols.findIndex((c) => !c.numeric)
  const totalsRow = cols
    .map((c, i) => {
      if (c.numeric) return totals[c.key as keyof OwnerStatementTableTotals].toFixed(2)
      return i === firstTextCol ? 'Total' : ''
    })
    .join(',')
  return [header, ...body, totalsRow, csvEscape(OWNER_STATEMENT_TABLE_FOOTER)].join('\n')
}
