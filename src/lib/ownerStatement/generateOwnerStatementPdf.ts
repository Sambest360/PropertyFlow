/**
 * DQ-M3 Mode A — owner statement PDF via pdf-lib (clone generateLeasePdf pattern).
 * Printable in-app book only — not bank-confirmed / not PayProp settled.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { buildOwnerStatementBook } from './buildOwnerStatementBook'
import {
  OWNER_STATEMENT_TABLE_COLUMNS,
  OWNER_STATEMENT_TOTALS_FOOTER,
  ownerStatementCellText,
  ownerStatementHeaderLabels,
  ownerStatementPaymentsSubtotal,
  ownerStatementRow,
} from './ownerStatementTable'
import type { OwnerStatementLine } from './types'

/** PDF table header: the same labels, in the same order, as the screen and CSV. */
export function ownerStatementPdfHeader(): string[] {
  return ownerStatementHeaderLabels()
}
import {
  OWNER_STATEMENT_MODE_A_COPY,
  type OwnerStatementBook,
  type OwnerStatementBookInput,
  type OwnerStatementPdfResult,
} from './types'

// Landscape so all statement columns fit (CR2).
const PAGE_W = 841.89
const PAGE_H = 595.28
const MARGIN = 48

function zar(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  // Browser / Vite client bundle — btoa only (no Node Buffer types).
  return `data:application/pdf;base64,${btoa(binary)}`
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > width) {
      if (cur) lines.push(cur)
      cur = w
    } else {
      cur = next
    }
  }
  if (cur) lines.push(cur)
  return lines
}

type DrawCtx = {
  doc: PDFDocument
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  y: number
  black: ReturnType<typeof rgb>
  muted: ReturnType<typeof rgb>
  warn: ReturnType<typeof rgb>
}

function ensureSpace(ctx: DrawCtx, need: number) {
  if (ctx.y - need >= 56) return
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H])
  ctx.y = PAGE_H - MARGIN
  ctx.page.drawText('Owner statement (continued) - in-app book', {
    x: MARGIN,
    y: ctx.y,
    size: 8,
    font: ctx.font,
    color: ctx.muted,
  })
  ctx.y -= 18
}

function drawLine(
  ctx: DrawCtx,
  text: string,
  opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> },
) {
  const size = opts?.size ?? 10
  ensureSpace(ctx, size + 8)
  const f = opts?.bold ? ctx.bold : ctx.font
  const color = opts?.color ?? ctx.black
  ctx.page.drawText(text, { x: MARGIN, y: ctx.y, size, font: f, color })
  ctx.y -= size + 5
}

function drawWrapped(
  ctx: DrawCtx,
  text: string,
  opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; width?: number },
) {
  const size = opts?.size ?? 9
  for (const w of wrapText(text, opts?.width ?? 92)) {
    drawLine(ctx, w, { size, bold: opts?.bold, color: opts?.color })
  }
}

function rule(ctx: DrawCtx) {
  ensureSpace(ctx, 14)
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y + 4 },
    end: { x: PAGE_W - MARGIN, y: ctx.y + 4 },
    thickness: 0.5,
    color: rgb(0.75, 0.78, 0.82),
  })
  ctx.y -= 12
}


/** CR2: draw a real table; labels come from the same column list as screen and CSV. */
function drawTable(ctx: DrawCtx, labels: string[], rows: string[][], numeric: boolean[] = []) {
  const size = 7
  const colW = (PAGE_W - 2 * MARGIN) / Math.max(1, labels.length)
  const fit = (font: PDFFont, t: string) => {
    let s = t
    while (s.length > 1 && font.widthOfTextAtSize(s, size) > colW - 4) s = s.slice(0, -2) + '…'
    return s
  }
  const drawRow = (cells: string[], bold: boolean) => {
    const before = ctx.page
    ensureSpace(ctx, size + 6)
    // Repeat the header at the top of each new page.
    if (!bold && ctx.page !== before) drawRow(labels, true)
    const font = bold ? ctx.bold : ctx.font
    cells.forEach((cell, i) => {
      const text = fit(font, cell)
      const w = font.widthOfTextAtSize(text, size)
      const x = MARGIN + i * colW + (numeric[i] && !bold ? colW - 4 - w : 0)
      ctx.page.drawText(text, { x, y: ctx.y, size, font, color: ctx.black })
    })
    ctx.y -= size + 5
  }
  drawRow(labels, true)
  for (const r of rows) drawRow(r, false)
}

function drawSectionTable(ctx: DrawCtx, lines: OwnerStatementLine[]) {
  drawTable(
    ctx,
    ownerStatementPdfHeader(),
    lines.map((l) => {
      const row = ownerStatementRow(l)
      return OWNER_STATEMENT_TABLE_COLUMNS.map((c) => ownerStatementCellText(row, c.key))
    }),
    OWNER_STATEMENT_TABLE_COLUMNS.map((c) => Boolean(c.numeric)),
  )
}

function renderBook(ctx: DrawCtx, book: OwnerStatementBook) {
  drawLine(ctx, 'OWNER STATEMENT (IN-APP BOOK)', { size: 16, bold: true })
  drawLine(ctx, 'Lekaya Rentals - printable statement', { size: 9, color: ctx.muted })
  drawWrapped(ctx, book.honesty, { size: 8, color: ctx.warn, width: 95 })
  drawLine(
    ctx,
    `Generated: ${book.generatedAt.slice(0, 19).replace('T', ' ')}`,
    { size: 8, color: ctx.muted },
  )
  rule(ctx)

  drawLine(ctx, '1. Parties & period', { size: 12, bold: true })
  drawLine(ctx, `Landlord: ${book.landlordName}`)
  drawLine(ctx, `Agency: ${book.agencyName}`)
  drawLine(ctx, `Period: ${book.period.start} to ${book.period.end}`)
  drawWrapped(
    ctx,
    `Properties: ${book.propertyTitles.length ? book.propertyTitles.join('; ') : '(none linked)'}`,
    { size: 9 },
  )
  rule(ctx)

  drawLine(ctx, '2. Payment records (landlord-visible)', { size: 12, bold: true })
  if (book.payments.length === 0) {
    drawLine(ctx, 'No landlord-visible payments in this period.', { size: 9, color: ctx.muted })
  } else {
    drawSectionTable(ctx, book.payments)
  }
  drawLine(ctx, `Subtotal payments: ${zar(ownerStatementPaymentsSubtotal(book.payments))}`, {
    size: 9,
    bold: true,
  })
  rule(ctx)

  drawLine(ctx, '3. Trust allocations (optional in-app book)', { size: 12, bold: true })
  if (book.allocations.length === 0) {
    drawLine(ctx, 'No trust allocations in this period.', { size: 9, color: ctx.muted })
  } else {
    drawSectionTable(ctx, book.allocations)
  }
  drawLine(ctx, `Subtotal allocations: ${zar(book.totals.allocationsZar)}`, {
    size: 9,
    bold: true,
  })
  rule(ctx)

  drawLine(ctx, '4. Landlord payout instructions (<= submitted)', { size: 12, bold: true })
  drawWrapped(
    ctx,
    'In-app status only through submitted. Recorded in Lekaya, not yet matched to the bank; partner remittance is not connected.',
    { size: 8, color: ctx.warn, width: 95 },
  )
  if (book.payouts.length === 0) {
    drawLine(ctx, 'No <=submitted landlord payout instructions in this period.', {
      size: 9,
      color: ctx.muted,
    })
  } else {
    drawSectionTable(ctx, book.payouts)
  }
  drawLine(ctx, `Subtotal payouts (<= submitted): ${zar(book.totals.payoutsSubmittedZar)}`, {
    size: 9,
    bold: true,
  })
  rule(ctx)

  drawLine(ctx, '5. Safe claim', { size: 12, bold: true })
  drawWrapped(ctx, OWNER_STATEMENT_MODE_A_COPY, { size: 9, color: ctx.warn, width: 95 })
  drawWrapped(
    ctx,
    'This PDF does not claim bank settlement, live PayProp remittance, or partner payout confirmation.',
    { size: 8, color: ctx.muted, width: 95 },
  )
  drawWrapped(ctx, OWNER_STATEMENT_TOTALS_FOOTER, { size: 8, color: ctx.muted, width: 95 })
}

/** Generate a real PDF owner statement from the in-app book. */
export async function generateOwnerStatementPdf(
  input: OwnerStatementBookInput,
): Promise<OwnerStatementPdfResult> {
  const book = buildOwnerStatementBook(input)
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([PAGE_W, PAGE_H])

  const ctx: DrawCtx = {
    doc,
    page,
    font,
    bold,
    y: PAGE_H - MARGIN,
    black: rgb(0.08, 0.1, 0.14),
    muted: rgb(0.35, 0.4, 0.48),
    warn: rgb(0.55, 0.35, 0.05),
  }

  renderBook(ctx, book)

  const bytes = await doc.save()
  const safeLandlord = book.landlordName.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40)
  const fileName = `owner-statement-${safeLandlord}-${book.period.start}_${book.period.end}.pdf`
  return {
    bytes,
    dataUrl: bytesToDataUrl(bytes),
    fileName,
    book,
  }
}
