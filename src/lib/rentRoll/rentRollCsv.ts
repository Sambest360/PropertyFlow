/**
 * §5 Mode A — rent roll CSV + documents inventory CSV.
 */

import { RENT_ROLL_MODE_A_COPY, type RentRollBook } from './types'
import type { PropertyDocument } from '../../types/domain'

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export const RENT_ROLL_CSV_HEADER = [
  'as_at',
  'tenancy_id',
  'property_id',
  'property_title',
  'property_address',
  'landlord_id',
  'landlord_name',
  'tenant_name',
  'tenant_email',
  'status',
  'start_date',
  'end_date',
  'rent_zar',
  'deposit_zar',
  'rent_due_day',
  'arrears_zar_in_app',
  'honesty',
].join(',')

export function rentRollToCsv(book: RentRollBook): string {
  const body = book.rows.map((r) =>
    [
      book.asAt,
      r.tenancyId,
      r.propertyId,
      csvEscape(r.propertyTitle),
      csvEscape(r.propertyAddress),
      r.landlordId,
      csvEscape(r.landlordName),
      csvEscape(r.tenantName),
      csvEscape(r.tenantEmail),
      r.status,
      r.startDate,
      r.endDate ?? '',
      r.rentZar.toFixed(2),
      r.depositZar.toFixed(2),
      String(r.rentDueDay),
      r.arrearsZar.toFixed(2),
      csvEscape(RENT_ROLL_MODE_A_COPY),
    ].join(','),
  )
  const totals = [
    book.asAt,
    '',
    '',
    'TOTALS',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    book.totals.rentPcmZar.toFixed(2),
    book.totals.depositZar.toFixed(2),
    '',
    book.totals.arrearsZar.toFixed(2),
    csvEscape(RENT_ROLL_MODE_A_COPY),
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
