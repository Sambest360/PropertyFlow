/**
 * §5 Mode A — as-at rent roll PDF via pdf-lib (clone owner statement pattern).
 * Not trust-audited / not PPRA / not bank-confirmed.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { buildRentRollAsAt } from './buildRentRoll'
import {
  RENT_ROLL_MODE_A_COPY,
  type RentRollAsAtInput,
  type RentRollBook,
  type RentRollPdfResult,
} from './types'

const PAGE_W = 595.28
const PAGE_H = 841.89
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
  ctx.page.drawText('Rent roll (continued) - Mode A as-at in-app book', {
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
  ensureSpace(ctx, size + 4)
  ctx.page.drawText(text.slice(0, 110), {
    x: MARGIN,
    y: ctx.y,
    size,
    font: opts?.bold ? ctx.bold : ctx.font,
    color: opts?.color ?? ctx.black,
  })
  ctx.y -= size + 4
}

function drawWrapped(
  ctx: DrawCtx,
  text: string,
  opts?: { size?: number; color?: ReturnType<typeof rgb>; width?: number },
) {
  const size = opts?.size ?? 9
  const width = opts?.width ?? 95
  for (const line of wrapText(text, width)) {
    drawLine(ctx, line, { size, color: opts?.color })
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

function renderBook(ctx: DrawCtx, book: RentRollBook) {
  drawLine(ctx, 'RENT ROLL (AS-AT)', { size: 16, bold: true })
  drawLine(ctx, 'PropertyFlow - Mode A point-in-time in-app book', { size: 9, color: ctx.muted })
  drawWrapped(ctx, book.honesty, { size: 8, color: ctx.warn, width: 95 })
  drawLine(
    ctx,
    `Generated: ${book.generatedAt.slice(0, 19).replace('T', ' ')}`,
    { size: 8, color: ctx.muted },
  )
  rule(ctx)

  drawLine(ctx, '1. Scope', { size: 12, bold: true })
  drawLine(ctx, `Agency: ${book.agencyName}`)
  drawLine(ctx, `As-at: ${book.asAt}`)
  if (book.landlordUserId) {
    drawLine(ctx, `Landlord scope: ${book.landlordUserId}`, { size: 9, color: ctx.muted })
  }
  drawLine(
    ctx,
    `Units on roll: ${book.totals.units}  |  Rent PCM: ${zar(book.totals.rentPcmZar)}  |  Deposit: ${zar(book.totals.depositZar)}  |  Arrears (in-app): ${zar(book.totals.arrearsZar)}`,
    { size: 9 },
  )
  rule(ctx)

  drawLine(ctx, '2. Occupancies on roll', { size: 12, bold: true })
  if (book.rows.length === 0) {
    drawLine(ctx, 'No tenancies on roll for this as-at date.', { size: 9, color: ctx.muted })
  } else {
    for (const r of book.rows) {
      drawWrapped(
        ctx,
        `${r.propertyTitle} | ${r.tenantName} | ${r.status} | rent ${zar(r.rentZar)} | arrears ${zar(r.arrearsZar)} | ${r.startDate}${r.endDate ? ` -> ${r.endDate}` : ''}`,
        { size: 8, width: 98 },
      )
    }
  }
  rule(ctx)

  drawLine(ctx, '3. Safe claim', { size: 12, bold: true })
  drawWrapped(ctx, RENT_ROLL_MODE_A_COPY, { size: 9, color: ctx.warn, width: 95 })
  drawWrapped(
    ctx,
    'Arrears are from in-app Due/Overdue payment records only. This PDF is not a PPRA opinion, not trust-audited, and not bank-confirmed.',
    { size: 8, color: ctx.muted, width: 95 },
  )
}

export async function generateRentRollPdf(
  input: RentRollAsAtInput,
): Promise<RentRollPdfResult> {
  const book = buildRentRollAsAt(input)
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
  const safeAgency = book.agencyName.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40)
  const fileName = `rent-roll-as-at-${safeAgency}-${book.asAt}.pdf`
  return {
    bytes,
    dataUrl: bytesToDataUrl(bytes),
    fileName,
    book,
  }
}

/** Trigger browser download of PDF bytes. */
export function downloadRentRollPdf(fileName: string, bytes: Uint8Array) {
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
