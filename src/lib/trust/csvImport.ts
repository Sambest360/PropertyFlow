/**
 * Mode A template CSV ingest for trust cashbook.
 * Manual/template only — not live bank feed, not PayProp, not bank-confirmed.
 */

export const TRUST_CSV_TEMPLATE_HEADER =
  'value_date,direction,amount_zar,description,bank_ref'

export const TRUST_CSV_NON_PRODUCTION_LABEL =
  'Template CSV import — recorded in PropertyFlow, not yet matched to the bank'

export type TrustCsvRow = {
  valueDate: string
  direction: 'in' | 'out'
  amountCents: number
  description: string
  bankRef: string
  /** Stable idempotency key within an agency (bank_ref preferred). */
  idempotencyKey: string
  lineNumber: number
}

export type ParseTrustCsvResult = {
  rows: TrustCsvRow[]
  errors: string[]
  skippedBlank: number
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur.trim())
  return out
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, '_')
}

function parseAmountZarToCents(raw: string): number | null {
  const cleaned = raw.replace(/R/gi, '').replace(/\s/g, '').replace(/,/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

/**
 * Parse Mode A template CSV. Expected header:
 * value_date,direction,amount_zar,description,bank_ref
 */
export function parseTrustTemplateCsv(text: string): ParseTrustCsvResult {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
  const errors: string[] = []
  const rows: TrustCsvRow[] = []
  let skippedBlank = 0

  if (lines.length === 0 || (lines.length === 1 && !lines[0]?.trim())) {
    return { rows, errors: ['CSV is empty'], skippedBlank: 0 }
  }

  const headerCells = splitCsvLine(lines[0]!).map(normalizeHeader)
  const idx = {
    value_date: headerCells.indexOf('value_date'),
    direction: headerCells.indexOf('direction'),
    amount_zar: headerCells.indexOf('amount_zar'),
    description: headerCells.indexOf('description'),
    bank_ref: headerCells.indexOf('bank_ref'),
  }
  if (idx.value_date < 0 || idx.direction < 0 || idx.amount_zar < 0) {
    return {
      rows: [],
      errors: [
        `Missing required columns. Expected header: ${TRUST_CSV_TEMPLATE_HEADER}`,
      ],
      skippedBlank: 0,
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!line) {
      skippedBlank++
      continue
    }
    const cells = splitCsvLine(line)
    const valueDate = (cells[idx.value_date] ?? '').trim()
    const directionRaw = (cells[idx.direction] ?? '').trim().toLowerCase()
    const amountRaw = (cells[idx.amount_zar] ?? '').trim()
    const description =
      idx.description >= 0 ? (cells[idx.description] ?? '').trim() : ''
    const bankRef = idx.bank_ref >= 0 ? (cells[idx.bank_ref] ?? '').trim() : ''

    if (!DATE_RE.test(valueDate)) {
      errors.push(`Line ${i + 1}: value_date must be YYYY-MM-DD`)
      continue
    }
    if (directionRaw !== 'in' && directionRaw !== 'out') {
      errors.push(`Line ${i + 1}: direction must be in or out`)
      continue
    }
    const amountCents = parseAmountZarToCents(amountRaw)
    if (amountCents == null || amountCents <= 0) {
      errors.push(`Line ${i + 1}: amount_zar must be a positive number`)
      continue
    }

    const idempotencyKey = bankRef
      ? `bank_ref:${bankRef}`
      : `row:${valueDate}:${directionRaw}:${amountCents}:${description}`

    rows.push({
      valueDate,
      direction: directionRaw,
      amountCents,
      description: description || 'Template CSV import',
      bankRef,
      idempotencyKey,
      lineNumber: i + 1,
    })
  }

  return { rows, errors, skippedBlank }
}

/** Dedupe against existing agency transactions by bank_ref or partner_txn_id. */
export function filterNewTrustCsvRows(
  rows: TrustCsvRow[],
  existing: Array<{
    bankRef?: string | null
    partnerTxnId?: string | null
  }>,
): { fresh: TrustCsvRow[]; duplicateCount: number } {
  const seen = new Set<string>()
  for (const t of existing) {
    if (t.bankRef) seen.add(`bank_ref:${t.bankRef}`)
    if (t.partnerTxnId) seen.add(`partner:${t.partnerTxnId}`)
  }
  const fresh: TrustCsvRow[] = []
  let duplicateCount = 0
  for (const row of rows) {
    const partnerKey = `partner:tpl-csv:${row.idempotencyKey}`
    if (seen.has(row.idempotencyKey) || seen.has(partnerKey)) {
      duplicateCount++
      continue
    }
    seen.add(row.idempotencyKey)
    seen.add(partnerKey)
    fresh.push(row)
  }
  return { fresh, duplicateCount }
}

export function buildTrustCsvPartnerTxnId(idempotencyKey: string): string {
  return `tpl-csv:${idempotencyKey}`
}

/** Download helper for current cashbook (export). */
export function trustTransactionsToCsv(
  txns: Array<{
    valueDate: string
    direction: string
    amountCents: number
    description: string
    bankRef?: string | null
    status?: string
  }>,
): string {
  const header = `${TRUST_CSV_TEMPLATE_HEADER},status`
  const body = txns.map((t) => {
    const zar = (t.amountCents / 100).toFixed(2)
    const cells = [
      t.valueDate,
      t.direction,
      zar,
      csvEscape(t.description ?? ''),
      csvEscape(t.bankRef ?? ''),
      t.status ?? '',
    ]
    return cells.join(',')
  })
  return [header, ...body].join('\n')
}

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function trustCsvTemplateSample(): string {
  return [
    TRUST_CSV_TEMPLATE_HEADER,
    '2026-09-01,in,12500.00,Rent - Demo Tenant (template),TPL-001',
    '2026-09-02,in,2500.00,Deposit top-up (template),TPL-002',
  ].join('\n')
}
