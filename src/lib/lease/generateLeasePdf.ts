/**
 * Lease PDF via pdf-lib: the full residential lease (leaseContract.ts),
 * signature blocks with each signature, and — once signed — an electronic
 * signature certificate (ECTA 25 of 2002) with who signed, when, how, from
 * which device, the "I agree" statements and the lease fingerprint.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { LeasePdfInput, LeasePdfResult } from './types'
import { buildLeaseContract, leaseContractText, sha256Hex } from './leaseContract'

const A4: [number, number] = [595.28, 841.89]
const M = 50
const INK = rgb(0.06, 0.15, 0.27)
const MUTED = rgb(0.29, 0.4, 0.53)
const BLUE = rgb(0.043, 0.388, 0.784)

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return `data:application/pdf;base64,${btoa(binary)}`
}

/** WinAnsi-safe text (StandardFonts cannot draw every unicode character). */
function safe(t: string): string {
  return t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
}

class Writer {
  page: PDFPage
  y = A4[1] - M
  private doc: PDFDocument
  private font: PDFFont
  private bold: PDFFont
  private footer: string
  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont, footer: string) {
    this.doc = doc
    this.font = font
    this.bold = bold
    this.footer = footer
    this.page = this.newPage()
  }
  newPage(): PDFPage {
    const p = this.doc.addPage(A4)
    p.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: BLUE })
    p.drawText(safe(this.footer), { x: M, y: 24, size: 7.5, font: this.font, color: MUTED })
    this.page = p
    this.y = A4[1] - M
    return p
  }
  need(h: number) {
    if (this.y - h < 50) this.newPage()
  }
  text(t: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 10
    const f = o.bold ? this.bold : this.font
    const maxW = A4[0] - 2 * M - (o.indent ?? 0)
    const words = safe(t).split(/\s+/)
    let line = ''
    const lines: string[] = []
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (f.widthOfTextAtSize(next, size) > maxW && line) {
        lines.push(line)
        line = w
      } else line = next
    }
    if (line) lines.push(line)
    for (const l of lines) {
      this.need(size + 4)
      this.page.drawText(l, { x: M + (o.indent ?? 0), y: this.y, size, font: f, color: o.color ?? INK })
      this.y -= size + 4
    }
    this.y -= o.gap ?? 3
  }
  rule() {
    this.need(10)
    this.page.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: A4[0] - M, y: this.y + 2 }, thickness: 0.5, color: rgb(0.8, 0.86, 0.93) })
    this.y -= 10
  }
}

async function embedSignature(doc: PDFDocument, dataUrl: string | null | undefined) {
  if (!dataUrl) return null
  try {
    const b64 = dataUrl.split(',')[1] ?? ''
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return dataUrl.startsWith('data:image/png') ? await doc.embedPng(bin) : await doc.embedJpg(bin)
  } catch {
    return null
  }
}

export async function generateLeasePdf(input: LeasePdfInput): Promise<LeasePdfResult> {
  const contract = buildLeaseContract({
    leaseReference: input.leaseReference,
    agencyName: input.agencyName,
    agencyContact: input.agencyContact,
    landlordName: input.landlordName,
    tenantName: input.tenantName,
    tenantEmail: input.tenantEmail,
    propertyTitle: input.propertyTitle,
    propertyAddress: input.propertyAddress,
    startDate: input.startDate,
    endDate: input.endDate,
    rent: input.rent,
    deposit: input.deposit,
    rentDueDay: input.rentDueDay,
    escalationPct: input.escalationPct,
    parkingBays: input.parkingBays,
  })
  const fingerprint = await sha256Hex(leaseContractText(contract)).catch(() => '')
  const doc = await PDFDocument.create()
  doc.setTitle(`Lease ${input.leaseReference}`)
  doc.setAuthor(input.agencyName)
  doc.setSubject(contract.version)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const w = new Writer(doc, font, bold, `${contract.title} - ${input.leaseReference} - ${contract.version} - fingerprint ${fingerprint.slice(0, 16)}`)

  w.text(contract.title.toUpperCase(), { size: 17, bold: true, color: BLUE })
  w.text(`Reference ${input.leaseReference} · prepared ${(input.generatedAt ?? new Date().toISOString()).slice(0, 10)} by ${input.agencyName} on Lekaya Rentals`, { size: 8.5, color: MUTED, gap: 8 })
  for (const [k, v] of contract.summary) w.text(`${k}: ${v}`, { size: 10 })
  w.rule()

  for (const s of contract.sections) {
    w.need(40)
    w.text(s.title, { size: 11.5, bold: true, gap: 2 })
    s.clauses.forEach((c, i) => w.text(`${s.title.split('.')[0]}.${i + 1}  ${c}`, { size: 9.5, indent: 8 }))
    w.y -= 4
  }

  // Signature blocks
  w.need(200)
  w.rule()
  w.text('17. Signatures', { size: 11.5, bold: true })
  const parties: Array<{ role: 'Tenant' | 'Landlord'; name: string }> = [
    { role: 'Tenant', name: input.tenantName },
    ...(input.landlordName ? [{ role: 'Landlord' as const, name: input.landlordName }] : []),
  ]
  for (const p of parties) {
    const sig = input.signatures?.find((s) => s.role === p.role)
    w.need(90)
    w.text(`${p.role}: ${p.name}`, { bold: true, size: 10 })
    const img = await embedSignature(doc, sig?.imageDataUrl)
    if (img) {
      const h = 46
      const scale = h / img.height
      w.need(h + 6)
      w.page.drawImage(img, { x: M + 8, y: w.y - h + 8, width: img.width * scale, height: h })
      w.y -= h + 2
    } else {
      w.text(sig ? (sig.method === 'paper_mark' ? 'Signed on paper (recorded by the agent)' : 'Signed electronically') : 'Signature: ______________________________', { size: 10 })
    }
    w.text(
      sig ? `Signed ${sig.signedAt.replace('T', ' ').slice(0, 19)} UTC${sig.onBehalf && sig.signedBy ? ` by ${sig.signedBy} for ${p.name}` : ''}` : 'Date: ____________________',
      { size: 9, color: MUTED, gap: 8 },
    )
  }

  // ECTA certificate
  const signed = (input.signatures ?? []).filter((s) => s.method !== 'paper_mark')
  if (input.signatures?.length) {
    w.newPage()
    w.text('ELECTRONIC SIGNATURE CERTIFICATE', { size: 15, bold: true, color: BLUE })
    w.text('Electronic Communications and Transactions Act 25 of 2002 (sections 13, 15 and 16)', { size: 9, color: MUTED, gap: 8 })
    w.text(`Lease ${input.leaseReference} · ${contract.version}`, { size: 10 })
    w.text(`Document fingerprint (SHA-256 of the lease text): ${fingerprint}`, { size: 8.5 })
    w.text('Each signer below saw the full lease, ticked the statements shown, typed their name and drew or applied their signature. Times are set by the Lekaya Rentals server, not by the signer’s device.', { size: 9, color: MUTED, gap: 8 })
    for (const s of input.signatures) {
      w.rule()
      w.text(`${s.role}: ${s.name}`, { bold: true, size: 10.5 })
      w.text(`Signed at: ${s.signedAt} (UTC)`, { size: 9 })
      w.text(`Method: ${s.method === 'paper_mark' ? 'Paper lease, marked signed by the agent' : s.method === 'saved_image' ? 'Saved electronic signature applied by the signer' : 'Electronic signature drawn by the signer'}${s.onBehalf ? `, signed by ${s.signedBy ?? 'the agent'} under mandate` : ''}`, { size: 9 })
      if (s.typedName) w.text(`Name typed by the signer: ${s.typedName}`, { size: 9 })
      if (s.ip || s.userAgent) w.text(`Device: ${s.ip ?? 'unknown IP'} · ${s.userAgent ?? 'unknown browser'}`, { size: 8.5, color: MUTED })
      if (s.documentHash) w.text(`Fingerprint agreed to: ${s.documentHash}${fingerprint && s.documentHash !== fingerprint ? ' (differs from this copy - the lease text changed after signing)' : ''}`, { size: 8.5, color: MUTED })
      for (const st of s.statements ?? []) w.text(`[x] ${st}`, { size: 8.5, indent: 8 })
    }
    if (!signed.length) w.text('No electronic signatures yet.', { size: 9 })
  }

  const bytes = await doc.save()
  return { bytes, dataUrl: bytesToDataUrl(bytes), fileName: `lease-${input.leaseReference.replace(/[^a-zA-Z0-9_-]+/g, '-')}.pdf` }
}
