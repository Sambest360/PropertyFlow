/**
 * CSV export for list pages (payments, leases): what an agency hands to its
 * bookkeeper or auditor. Opens cleanly in Excel, Google Sheets and Numbers.
 */

export type CsvCell = string | number | boolean | null | undefined

/**
 * One cell. Text that a spreadsheet would run as a formula (it starts with
 * = + - @, a tab or a carriage return) gets a leading apostrophe, so a tenant
 * who types =HYPERLINK(...) as their name cannot plant a formula in the
 * agency's spreadsheet. Real numbers are left alone, so negative amounts stay
 * numbers.
 */
export function csvCell(value: CsvCell): string {
  if (value == null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  let text = String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Header row plus data rows, CRLF line ends (RFC 4180). */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** e.g. payments-2026-11-13.csv */
export function csvFileName(prefix: string, now: Date = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `${prefix}-${day}.csv`
}

/** Save the file from the browser. The BOM makes Excel read it as UTF-8 (names with accents, the en dash). */
export function downloadCsv(fileName: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
