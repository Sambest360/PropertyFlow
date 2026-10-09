export {
  OWNER_STATEMENT_MODE_A_COPY,
  OWNER_STATEMENT_PAYOUT_STATUSES,
  type OwnerStatementAllocationLine,
  type OwnerStatementBook,
  type OwnerStatementBookInput,
  type OwnerStatementDocumentDraft,
  type OwnerStatementLine,
  type OwnerStatementPaymentLine,
  type OwnerStatementPeriod,
  type OwnerStatementPdfResult,
  type OwnerStatementPayoutLine,
  type OwnerStatementPayoutStatus,
} from './types'

export {
  buildOwnerStatementBook,
  defaultOwnerStatementPeriod,
  isModeAStatementPayout,
  ownerStatementDocumentDraft,
} from './buildOwnerStatementBook'

export { generateOwnerStatementPdf } from './generateOwnerStatementPdf'

export {
  OWNER_STATEMENT_TABLE_COLUMNS,
  OWNER_STATEMENT_TABLE_FOOTER,
  buildOwnerStatementTable,
  ownerStatementCellText,
  ownerStatementRow,
  ownerStatementTableToCsv,
  type OwnerStatementColumnKey,
  type OwnerStatementTableRow,
  type OwnerStatementTableTotals,
} from './ownerStatementTable'

/** Trigger browser download of PDF bytes. */
export function downloadOwnerStatementPdf(fileName: string, bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
