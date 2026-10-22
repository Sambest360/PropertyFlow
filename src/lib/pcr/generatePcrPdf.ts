/**
 * Mode A PCR pack PDF via pdf-lib (clone lease / owner-statement pattern).
 * Branded soft pack — not RHA certified / not PropertyInspect export parity.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { PCR_MODE_A_COPY, countCheckedItems, inspectionStatusLabel } from './inspections.js'
import type { PcrPdfInput, PcrPdfResult, PropertyConditionInspection } from './types'

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 48

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
  ctx.page.drawText('PCR pack (continued) — in-app', {
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
  // pdf-lib winAnsi — strip unsupported chars
  const safe = text.replace(/[^\x20-\x7E]/g, '?')
  ctx.page.drawText(safe.slice(0, 110), {
    x: MARGIN,
    y: ctx.y,
    size,
    font: f,
    color,
  })
  ctx.y -= size + 6
}

function drawWrapped(ctx: DrawCtx, text: string, opts?: { size?: number; color?: ReturnType<typeof rgb> }) {
  const size = opts?.size ?? 9
  for (const line of wrapText(text, 95)) {
    drawLine(ctx, line, { size, color: opts?.color })
  }
}

function summarizeInspection(inspection: PropertyConditionInspection): string[] {
  const lines: string[] = []
  for (const room of inspection.rooms) {
    lines.push(`Room: ${room.name}`)
    for (const item of room.items) {
      if (item.condition === 'not_checked' && !item.notes && !item.photos.length) continue
      const photoN = item.photos.length ? ` [${item.photos.length} photo(s)]` : ''
      const note = item.notes ? ` — ${item.notes.slice(0, 80)}` : ''
      lines.push(`  · ${item.label}: ${item.condition}${photoN}${note}`)
    }
  }
  return lines
}

/** Generate a downloadable Mode A PCR pack PDF. */
export async function generatePcrPdf(input: PcrPdfInput): Promise<PcrPdfResult> {
  const { inspection } = input
  const brand = input.brandName ?? 'Lekaya Rentals'
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
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

  const counts = countCheckedItems(inspection)
  const kindLabel = inspection.kind === 'incoming' ? 'Incoming (ingoing)' : 'Outgoing (move-out)'

  drawLine(ctx, `${brand.toUpperCase()} — PROPERTY CONDITION REPORT`, { size: 14, bold: true })
  drawLine(ctx, 'In-app PCR pack (joint-style) — not RHA certified', {
    size: 9,
    color: ctx.warn,
  })
  drawWrapped(ctx, PCR_MODE_A_COPY, { size: 8, color: ctx.muted })
  ctx.y -= 4

  drawLine(ctx, '1. Header', { size: 12, bold: true })
  drawLine(ctx, `Agency: ${input.agencyName}`)
  drawLine(ctx, `Property: ${input.propertyTitle}`)
  drawLine(ctx, `Address: ${input.propertyAddress}`)
  drawLine(ctx, `Tenant: ${input.tenantName}`)
  drawLine(ctx, `Kind: ${kindLabel}  |  Status: ${inspectionStatusLabel(inspection.status)}`)
  drawLine(ctx, `Inspection id: ${inspection.id}`)
  if (inspection.scheduledOn) drawLine(ctx, `Scheduled: ${inspection.scheduledOn}`)
  if (inspection.completedAt) drawLine(ctx, `Completed: ${inspection.completedAt.slice(0, 19).replace('T', ' ')}`)
  drawLine(
    ctx,
    `Items checked: ${counts.checked}/${counts.total}  |  Photos: ${counts.withPhotos}  |  Maint flags: ${counts.needsMaintenance}`,
  )
  if (inspection.kind === 'incoming') {
    drawLine(
      ctx,
      `ingoing_pcr_signed: ${inspection.ingoingPcrSigned ? 'YES' : 'NO'}`,
      { bold: true, color: inspection.ingoingPcrSigned ? ctx.black : ctx.warn },
    )
  }
  ctx.y -= 6

  drawLine(ctx, '2. Soft signatures / override', { size: 12, bold: true })
  if (inspection.staffSignature) {
    drawLine(
      ctx,
      `Staff: ${inspection.staffSignature.signedByName} @ ${inspection.staffSignature.signedAt.slice(0, 19).replace('T', ' ')} (${inspection.staffSignature.method})`,
    )
  } else {
    drawLine(ctx, 'Staff: (not soft-signed)', { color: ctx.muted })
  }
  if (inspection.tenantSignature) {
    drawLine(
      ctx,
      `Tenant: ${inspection.tenantSignature.signedByName} @ ${inspection.tenantSignature.signedAt.slice(0, 19).replace('T', ' ')} (${inspection.tenantSignature.method})`,
    )
  } else {
    drawLine(ctx, 'Tenant: (not soft-acked)', { color: ctx.muted })
  }
  if (inspection.noShowOverride) {
    drawWrapped(
      ctx,
      `Override (${inspection.noShowOverride.kind}): ${inspection.noShowOverride.byName} — ${inspection.noShowOverride.reason}`,
      { color: ctx.warn },
    )
  }
  ctx.y -= 6

  drawLine(ctx, '3. Rooms & items', { size: 12, bold: true })
  const summary = summarizeInspection(inspection)
  if (!summary.length) {
    drawLine(ctx, '(No item notes yet — template present for staff fill.)', { color: ctx.muted })
  } else {
    for (const line of summary) {
      drawLine(ctx, line, { size: 9 })
    }
  }
  ctx.y -= 6

  if (inspection.generalNotes.trim()) {
    drawLine(ctx, '4. General notes', { size: 12, bold: true })
    drawWrapped(ctx, inspection.generalNotes, { size: 9 })
  }

  ctx.y -= 10
  drawWrapped(
    ctx,
    'This PDF does not claim RHA certification, PropertyInspect / RedRabbit parity, GPS verification, or statutory PCR legal advice.',
    { size: 8, color: ctx.warn },
  )
  drawLine(
    ctx,
    `Generated: ${(input.generatedAt ?? new Date().toISOString()).slice(0, 19).replace('T', ' ')}`,
    { size: 8, color: ctx.muted },
  )

  const bytes = await doc.save()
  const safeProp = input.propertyTitle.replace(/[^a-zA-Z0-9-_]+/g, '-').slice(0, 40)
  const fileName = `pcr-${inspection.kind}-${safeProp}-${inspection.id}.pdf`
  return {
    bytes,
    dataUrl: bytesToDataUrl(bytes),
    fileName,
    honesty: PCR_MODE_A_COPY,
  }
}

/** Trigger browser download of PCR PDF bytes. */
export function downloadPcrPdf(result: PcrPdfResult) {
  const copy = result.bytes.slice()
  const blob = new Blob([copy], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = result.fileName
  a.click()
  URL.revokeObjectURL(url)
}
