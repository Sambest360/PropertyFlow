/**
 * §5 Mode A — rent roll CSV + documents inventory CSV.
 */

import { RENT_ROLL_MODE_A_COPY, type RentRollBook } from './types'
import type { PropertyDocument } from '../../types/domain'

import { RENT_ROLL_TABLE_COLUMNS, rentRollCellText } from './rentRollTable'
import { csvEscape } from '../csvEscape'

/**
 * Audit-pack rent roll CSV: the shared columns first (same names and order as
 * the screen and the PDF), then the audit-only extras. Every row keeps the
 * as-at date and the note, as before.
 */
export const RENT_ROLL_AUDIT_EXTRA_COLUMNS = [
  'Tenancy ID',
  'Property ID',
  'Owner ID',
  'Tenant email',
  'Address',
  'Deposit',
  'Rent due day',
  'As at',
  'Note',
] as const

export const RENT_ROLL_CSV_HEADER = [...RENT_ROLL_TABLE_COLUMNS.map((c) => c.label), ...RENT_ROLL_AUDIT_EXTRA_COLUMNS]
  .map(csvEscape)
  .join(',')

export function rentRollToCsv(book: RentRollBook): string {
  const cols = RENT_ROLL_TABLE_COLUMNS
  const note = csvEscape(RENT_ROLL_MODE_A_COPY)
  const body = book.rows.map((r) =>
    [
      ...cols.map((c) => csvEscape(rentRollCellText(r, c.key))),
      csvEscape(r.tenancyId),
      csvEscape(r.propertyId),
      csvEscape(r.landlordId),
      csvEscape(r.tenantEmail),
      csvEscape(r.propertyAddress),
      r.depositZar.toFixed(2),
      String(r.rentDueDay),
      book.asAt,
      note,
    ].join(','),
  )
  const totals = [
    ...cols.map((c, i) => {
      if (c.key === 'charged') return book.totals.rentPcmZar.toFixed(2)
      if (c.key === 'outstanding') return book.totals.arrearsZar.toFixed(2)
      return i === 0 ? 'Total' : ''
    }),
    '',
    '',
    '',
    '',
    '',
    book.totals.depositZar.toFixed(2),
    '',
    book.asAt,
    note,
  ].join(',')
  return [RENT_ROLL_CSV_HEADER, ...body, totals].join('\n')
}

export const DOCUMENTS_INDEX_CSV_HEADER = [
  'document_id',
  'property_id',
  'name',
  'category',
  'status',
  'uploaded_at',
  'note',
].join(',')

/** Inventory of existing PropertyDocuments — not an audit opinion. */
export function documentsIndexToCsv(docs: PropertyDocument[]): string {
  const body = docs.map((d) =>
    [
      d.id,
      d.propertyId,
      csvEscape(d.name),
      d.category,
      d.status,
      d.uploadedAt ?? '',
      csvEscape(d.note ?? ''),
    ].join(','),
  )
  return [DOCUMENTS_INDEX_CSV_HEADER, ...body].join('\n')
}
