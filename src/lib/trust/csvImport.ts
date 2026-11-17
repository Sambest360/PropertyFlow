/**
 * Mode A CSV ingest for trust cashbook: Lekaya template or a bank statement CSV export.
 * Manual file upload only — not a live bank feed, not PayProp, not bank-confirmed.
 */

export const TRUST_CSV_TEMPLATE_HEADER =
  'value_date,direction,amount_zar,description,bank_ref'

export const TRUST_CSV_NON_PRODUCTION_LABEL =
  'CSV import — recorded in Lekaya, not yet matched to the bank'

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
  /** template = Lekaya template (direction column); bank = a bank statement export. */
  layout?: 'template' | 'bank'
  /** Statement balance after the latest row, when the file has a balance column. */
  closingBalance?: { valueDate: string; cents: number } | null
}

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
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/** Header names seen in SA bank CSV exports (FNB, Absa, Nedbank, Capitec, Investec) plus the template. */
const COLUMN_ALIASES = {
  date: ['value_date', 'date', 'transaction_date', 'trans_date', 'posting_date', 'posted_date', 'txn_date'],
  direction: ['direction'],
  amount: ['amount_zar', 'amount', 'amount_r', 'transaction_amount'],
  credit: ['credit', 'credits', 'credit_amount', 'money_in', 'deposit', 'deposits'],
  debit: ['debit', 'debits', 'debit_amount', 'money_out', 'withdrawal', 'withdrawals'],
  description: ['description', 'details', 'transaction_description', 'transaction_details', 'narrative', 'memo', 'description_1'],
  bankRef: ['bank_ref', 'reference', 'ref', 'customer_reference', 'your_reference', 'description_2'],
  balance: ['balance', 'running_balance', 'account_balance'],
} as const

type ColumnKey = keyof typeof COLUMN_ALIASES

function findColumns(cells: string[]): Record<ColumnKey, number> {
  const out = {} as Record<ColumnKey, number>
  for (const key of Object.keys(COLUMN_ALIASES) as ColumnKey[]) {
    out[key] = -1
    for (const alias of COLUMN_ALIASES[key]) {
      const i = cells.indexOf(alias)
      if (i >= 0) {
        out[key] = i
        break
      }
    }
  }
  return out
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function ymd(y: string, m: string, d: string): string | null {
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  const t = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso ? iso : null
}

/** YYYY-MM-DD from the date shapes bank exports use; null when not a real date. */
export function parseStatementDate(raw: string): string | null {
  const s = raw.trim()
  let r = s.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/)
  if (r) return ymd(r[1]!, r[2]!, r[3]!)
  // SA exports are day-first: 03/11/2026 is 3 November.
  r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (r) return ymd(r[3]!, r[2]!, r[1]!)
  r = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{4})$/)
  if (r) {
    const m = MONTHS[r[2]!.toLowerCase()]
    return m ? ymd(r[3]!, m, r[1]!) : null
  }
  return null
}

/** Signed cents from "R 1 234.56", "-1234.56", "(1234.56)", "1234.56Cr", "1 234,56". Null when not a number. */
export function parseSignedCents(raw: string): number | null {
  let s = raw.replace(/\s/g, '')
  let sign = 1
  const suffix = s.match(/(cr|dr)$/i)
  if (suffix) {
    if (suffix[1]!.toLowerCase() === 'dr') sign = -1
    s = s.slice(0, -2)
  }
  s = s.replace(/R/gi, '')
  if (/^\(.*\)$/.test(s)) {
    sign = -sign
    s = s.slice(1, -1)
  }
  if (s.endsWith('-')) {
    sign = -sign
    s = s.slice(0, -1)
  }
  if (s.startsWith('-')) {
    sign = -sign
    s = s.slice(1)
  } else if (s.startsWith('+')) {
    s = s.slice(1)
  }
  s = /^\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  return sign * Math.round(Number(s) * 100)
}

const HEADER_SCAN_LINES = 30

/**
 * Parse the Lekaya template CSV or a bank statement CSV export.
 * Template header: value_date,direction,amount_zar,description,bank_ref.
 * Bank exports: preamble lines are skipped until a header with a date column and
 * an amount (signed) or debit/credit columns; dates may be day-first.
 */
export function parseTrustTemplateCsv(text: string): ParseTrustCsvResult {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
  const errors: string[] = []
  const rows: TrustCsvRow[] = []
  let skippedBlank = 0

  if (lines.every((l) => !l.trim())) {
    return { rows, errors: ['CSV is empty'], skippedBlank: 0 }
  }

  let headerAt = -1
  let col: Record<ColumnKey, number> | null = null
  for (let i = 0; i < Math.min(lines.length, HEADER_SCAN_LINES); i++) {
    const found = findColumns(splitCsvLine(lines[i]!).map(normalizeHeader))
    if (found.date >= 0 && (found.amount >= 0 || found.credit >= 0 || found.debit >= 0)) {
      headerAt = i
      col = found
      break
    }
  }
  if (!col) {
    return {
      rows: [],
      errors: [
        `No header row with a date column and an amount (or debit/credit) column. Expected header like: ${TRUST_CSV_TEMPLATE_HEADER}`,
      ],
      skippedBlank: 0,
    }
  }
  const layout = col.direction >= 0 ? ('template' as const) : ('bank' as const)
  const seenKeys = new Map<string, number>()
  const balances: Array<{ valueDate: string; cents: number }> = []

  for (let i = headerAt + 1; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!line) {
      skippedBlank++
      continue
    }
    const cells = splitCsvLine(line)
    const cell = (idx: number) => (idx >= 0 ? (cells[idx] ?? '').trim() : '')
    const n = i + 1

    const dateRaw = cell(col.date)
    const valueDate = parseStatementDate(dateRaw)
    if (!valueDate) {
      errors.push(`Line ${n}: date "${dateRaw}" is not a date (use YYYY-MM-DD or DD/MM/YYYY)`)
      continue
    }

    let direction: 'in' | 'out'
    let amountCents: number
    if (layout === 'template') {
      const d = cell(col.direction).toLowerCase()
      const dir = d === 'in' || d === 'credit' || d === 'cr' ? 'in' : d === 'out' || d === 'debit' || d === 'dr' ? 'out' : null
      if (!dir) {
        errors.push(`Line ${n}: direction must be in or out`)
        continue
      }
      const v = parseSignedCents(cell(col.amount))
      if (v == null || v <= 0) {
        errors.push(`Line ${n}: amount_zar must be a positive number`)
        continue
      }
      direction = dir
      amountCents = v
    } else {
      let signed: number | null
      if (col.amount >= 0) {
        signed = parseSignedCents(cell(col.amount))
      } else {
        const credit = cell(col.credit) ? parseSignedCents(cell(col.credit)) : 0
        const debit = cell(col.debit) ? parseSignedCents(cell(col.debit)) : 0
        signed = credit == null || debit == null ? null : Math.abs(credit) - Math.abs(debit)
      }
      if (signed == null) {
        errors.push(`Line ${n}: amount is not a number`)
        continue
      }
      if (signed === 0) {
        skippedBlank++
        continue
      }
      direction = signed > 0 ? 'in' : 'out'
      amountCents = Math.abs(signed)
    }

    const description = cell(col.description)
    const bankRef = cell(col.bankRef)
    const balance = cell(col.balance) ? parseSignedCents(cell(col.balance)) : null
    if (balance != null) balances.push({ valueDate, cents: balance })

    rows.push(
      bankRow({ valueDate, direction, amountCents, description, bankRef, balance, lineNumber: n }, seenKeys, {
        // Template bank_ref is a unique bank id; a bank export's reference is what the payer typed.
        uniqueId: layout === 'template' && bankRef ? `bank_ref:${bankRef}` : null,
        refInKey: layout === 'bank',
        fallbackDescription: layout === 'bank' ? 'Bank statement import' : 'Template CSV import',
      }),
    )
  }

  return { rows, errors, skippedBlank, layout, closingBalance: closingBalanceOf(balances) }
}

type RawBankRow = {
  valueDate: string
  direction: 'in' | 'out'
  amountCents: number
  description: string
  bankRef: string
  balance: number | null
  lineNumber: number
}

/**
 * Idempotency key: the bank's unique id when there is one, else the whole row plus running
 * balance. A payer reference repeats every month, so it never stands alone as the key.
 */
function bankRow(
  r: RawBankRow,
  seenKeys: Map<string, number>,
  opts: { uniqueId?: string | null; refInKey?: boolean; fallbackDescription?: string } = {},
): TrustCsvRow {
  let idempotencyKey = opts.uniqueId ?? ''
  if (!idempotencyKey) {
    idempotencyKey = `row:${r.valueDate}:${r.direction}:${r.amountCents}:${r.description}`
    if (opts.refInKey ?? true) idempotencyKey += `:${r.bankRef}`
    if (r.balance != null) idempotencyKey += `:bal:${r.balance}`
    // Two identical lines in one file are two payments, not a duplicate.
    const seen = (seenKeys.get(idempotencyKey) ?? 0) + 1
    seenKeys.set(idempotencyKey, seen)
    if (seen > 1) idempotencyKey += `#${seen}`
  }
  return {
    valueDate: r.valueDate,
    direction: r.direction,
    amountCents: r.amountCents,
    description: r.description || r.bankRef || opts.fallbackDescription || 'Bank statement import',
    bankRef: r.bankRef,
    idempotencyKey,
    lineNumber: r.lineNumber,
  }
}

/**
 * Standard Bank's own CSV: header-less, one record type per line. Only HIST lines are
 * transactions: HIST,YYYYMMDD,,signed amount,description,description 2,code,0.
 * Account / opening / closing lines are skipped, so no closing balance is read.
 */
function parseStandardBankHist(lines: string[]): ParseTrustCsvResult {
  const rows: TrustCsvRow[] = []
  const errors: string[] = []
  const seenKeys = new Map<string, number>()
  let skippedBlank = 0
  lines.forEach((line, i) => {
    const c = splitCsvLine(line)
    if (c[0]?.toUpperCase() !== 'HIST') return
    const valueDate = parseStatementDate(c[1] ?? '')
    const signed = parseSignedCents(c[3] ?? '')
    if (!valueDate || signed == null) {
      errors.push(`Line ${i + 1}: HIST line has no valid date or amount`)
      return
    }
    if (signed === 0) {
      skippedBlank++
      return
    }
    rows.push(
      bankRow(
        {
          valueDate,
          direction: signed > 0 ? 'in' : 'out',
          amountCents: Math.abs(signed),
          description: c[4] ?? '',
          bankRef: c[5] ?? '',
          balance: null,
          lineNumber: i + 1,
        },
        seenKeys,
      ),
    )
  })
  if (rows.length === 0 && errors.length === 0) errors.push('No HIST transaction lines found')
  return { rows, errors, skippedBlank, layout: 'bank', closingBalance: null }
}

/** OFX / QFX (SGML v1 or XML v2). FITID is the bank's unique id per transaction. */
function parseOfx(text: string): ParseTrustCsvResult {
  const tag = (block: string, name: string) =>
    block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? ''
  const rows: TrustCsvRow[] = []
  const errors: string[] = []
  const seenKeys = new Map<string, number>()
  let skippedBlank = 0
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? []
  blocks.forEach((b, i) => {
    const valueDate = parseStatementDate(tag(b, 'DTPOSTED').slice(0, 8))
    const signed = parseSignedCents(tag(b, 'TRNAMT'))
    if (!valueDate || signed == null) {
      errors.push(`Transaction ${i + 1}: no valid DTPOSTED or TRNAMT`)
      return
    }
    if (signed === 0) {
      skippedBlank++
      return
    }
    const fitId = tag(b, 'FITID')
    const name = tag(b, 'NAME')
    const memo = tag(b, 'MEMO')
    rows.push(
      bankRow(
        {
          valueDate,
          direction: signed > 0 ? 'in' : 'out',
          amountCents: Math.abs(signed),
          description: [name, memo].filter(Boolean).join(' ') || tag(b, 'TRNTYPE'),
          bankRef: memo && name ? memo : tag(b, 'CHECKNUM') || tag(b, 'REFNUM'),
          balance: null,
          lineNumber: i + 1,
        },
        seenKeys,
        { uniqueId: fitId ? `fitid:${fitId}` : null },
      ),
    )
  })
  if (blocks.length === 0) errors.push('No <STMTTRN> transactions found in the OFX file')
  const ledger = text.match(/<LEDGERBAL>[\s\S]*?(?:<\/LEDGERBAL>|$)/i)?.[0] ?? ''
  const balCents = ledger ? parseSignedCents(tag(ledger, 'BALAMT')) : null
  const balDate = ledger ? parseStatementDate(tag(ledger, 'DTASOF').slice(0, 8)) : null
  return {
    rows,
    errors,
    skippedBlank,
    layout: 'bank',
    closingBalance: balCents != null && balDate ? { valueDate: balDate, cents: balCents } : null,
  }
}

/** QIF bank file: records end with ^; D date (day-first), T amount, P payee, M memo, N number. */
function parseQif(text: string): ParseTrustCsvResult {
  const rows: TrustCsvRow[] = []
  const errors: string[] = []
  const seenKeys = new Map<string, number>()
  let skippedBlank = 0
  let rec: Record<string, string> = {}
  let n = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('!')) continue
    if (line !== '^') {
      const k = line[0]!.toUpperCase()
      rec[k] ??= line.slice(1).trim()
      continue
    }
    n++
    // 1/11'26 -> 1/11/2026
    const d = (rec.D ?? '').replace(/'\s*(\d{2})$/, '/20$1')
    const valueDate = parseStatementDate(d)
    const signed = parseSignedCents(rec.T ?? rec.U ?? '')
    if (!valueDate || signed == null) {
      errors.push(`Record ${n}: no valid D (date) or T (amount)`)
    } else if (signed === 0) {
      skippedBlank++
    } else {
      rows.push(
        bankRow(
          {
            valueDate,
            direction: signed > 0 ? 'in' : 'out',
            amountCents: Math.abs(signed),
            description: rec.P ?? rec.M ?? '',
            bankRef: rec.P && rec.M ? rec.M : rec.N ?? '',
            balance: null,
            lineNumber: n,
          },
          seenKeys,
        ),
      )
    }
    rec = {}
  }
  if (n === 0) errors.push('No QIF records found')
  return { rows, errors, skippedBlank, layout: 'bank', closingBalance: null }
}

/**
 * Any statement file a South African bank exports: OFX/QFX, QIF, Standard Bank's
 * HIST CSV, a CSV with a header row, or the Lekaya template.
 */
export function parseStatementFile(text: string): ParseTrustCsvResult {
  const clean = text.replace(/^\uFEFF/, '')
  if (/<OFX>|OFXHEADER/i.test(clean)) return parseOfx(clean)
  if (/^\s*!Type:/im.test(clean)) return parseQif(clean)
  const lines = clean.split(/\r?\n/).map((l) => l.trim())
  if (lines.some((l) => /^HIST,\d{8},/i.test(l))) return parseStandardBankHist(lines)
  return parseTrustTemplateCsv(clean)
}

/** Balance after the latest-dated row; ties follow file order (ascending or descending export). */
function closingBalanceOf(
  balances: Array<{ valueDate: string; cents: number }>,
): { valueDate: string; cents: number } | null {
  if (balances.length === 0) return null
  const ascending = balances[0]!.valueDate <= balances[balances.length - 1]!.valueDate
  return ascending ? balances[balances.length - 1]! : balances[0]!
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
