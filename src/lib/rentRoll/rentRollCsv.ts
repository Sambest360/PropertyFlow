/**
 * §5 Mode A — rent roll CSV + documents inventory CSV.
 */

import { RENT_ROLL_MODE_A_COPY, type RentRollBook } from './types'
import type { PropertyDocument } from '../../types/domain'

import { RENT_ROLL_TABLE_COLUMNS, csvEscape, rentRollCellText } from './rentRollTable'

/** Audit-pack rent roll CSV: same columns and order as the screen and the PDF (CR2). */
export const RENT_ROLL_CSV_HEADER = RENT_ROLL_TABLE_COLUMNS.map((c) => csvEscape(c.label)).join(',')

export function rentRollToCsv(book: RentRollBook): string {
  const cols = RENT_ROLL_TABLE_COLUMNS
  const body = book.rows.map((r) => cols.map((c) => csvEscape(rentRollCellText(r, c.key))).join(','))
  const totals = cols
    .map((c, i) => {
      if (c.key === 'charged') return book.totals.rentPcmZar.toFixed(2)
      if (c.key === 'outstanding') return book.totals.arrearsZar.toFixed(2)
      return i === 0 ? 'Total' : ''
    })
    .join(',')
  return [
    RENT_ROLL_CSV_HEADER,
    ...body,
    totals,
    csvEscape(`As at ${book.asAt}. ${RENT_ROLL_MODE_A_COPY}`),
  ].join('\n')
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
