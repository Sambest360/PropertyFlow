/**
 * Real lease PDF generation via pdf-lib (no external render service).
 * Produces a short SA-style residential lease summary suitable for demo + e-sign.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { LeasePdfInput, LeasePdfResult } from './types'

function zar(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64')
  return `data:application/pdf;base64,${base64}`
}

/** Generate a real PDF lease agreement from tenancy + property context. */
export async function generateLeasePdf(input: LeasePdfInput): Promise<LeasePdfResult> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595.28, 841.89]) // A4
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const margin = 50
  let y = 790
  const black = rgb(0.08, 0.1, 0.14)
  const muted = rgb(0.35, 0.4, 0.48)

  const draw = (text: string, opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> }) => {
    const size = opts?.size ?? 11
    const f = opts?.bold ? bold : font
    const color = opts?.color ?? black
    page.drawText(text, { x: margin, y, size, font: f, color })
    y -= size + 6
  }

  const line = () => {
    page.drawLine({
      start: { x: margin, y: y + 4 },
      end: { x: 595.28 - margin, y: y + 4 },
      thickness: 0.5,
      color: rgb(0.75, 0.78, 0.82),
    })
    y -= 12
  }

  draw('RESIDENTIAL LEASE AGREEMENT', { size: 16, bold: true })
  draw('PropertyFlow — generated lease (South Africa)', { size: 9, color: muted })
  draw(`Reference: ${input.leaseReference}`, { size: 10, color: muted })
  draw(
    `Generated: ${(input.generatedAt ?? new Date().toISOString()).slice(0, 19).replace('T', ' ')}`,
    { size: 9, color: muted },
  )
  line()

  draw('1. Parties', { size: 12, bold: true })
  draw(`Agency / Managing agent: ${input.agencyName}`)
  draw(`Tenant (Lessee): ${input.tenantName} <${input.tenantEmail}>`)
  draw(
    input.landlordName
      ? `Landlord (Lessor): ${input.landlordName}`
      : 'Landlord (Lessor): (to be confirmed — no landlord linked on tenancy)',
  )
  line()

  draw('2. Premises', { size: 12, bold: true })
  draw(`Property: ${input.propertyTitle}`)
  draw(`Address: ${input.propertyAddress}`)
  line()

  draw('3. Term & amounts', { size: 12, bold: true })
  draw(`Commencement: ${input.startDate}`)
  draw(`End date: ${input.endDate ?? 'Open-ended / month-to-month after initial term'}`)
  draw(`Monthly rent: ${zar(input.rent)}`)
  draw(`Deposit: ${zar(input.deposit)}`)
  line()

  draw('4. General terms (summary)', { size: 12, bold: true })
  const clauses = [
    'The Tenant shall pay rent monthly in advance as directed by the Agency.',
    'The deposit is held in trust subject to applicable Provincial Rental Housing Tribunal rules.',
    'The Premises shall be used for residential purposes only unless otherwise agreed in writing.',
    'The Tenant shall not sublet without prior written consent of the Landlord / Agency.',
    'Either party may terminate on notice as required by the Rental Housing Act and the lease term.',
    'This PDF is the agency lease draft generated at application approval (Jim: lease on APPROVE).',
  ]
  for (const c of clauses) {
    const wrapped = wrapText(c, 88)
    for (const w of wrapped) draw(w, { size: 10 })
    y -= 2
  }
  line()

  draw('5. Signatures', { size: 12, bold: true })
  draw('Tenant signature: ___________________________ Date: ________', { size: 10 })
  y -= 8
  draw(
    input.landlordName
      ? 'Landlord signature: _________________________ Date: ________'
      : 'Landlord signature: (not required — no landlordId on tenancy)',
    { size: 10 },
  )
  y -= 16
  draw(
    'E-sign: countersign via PropertyFlow mock / partner adapter. Live SigniFlow/DocuSign needs partner keys.',
    { size: 8, color: muted },
  )

  const bytes = await doc.save()
  const fileName = `lease-${input.leaseReference.replace(/[^a-zA-Z0-9_-]+/g, '-')}.pdf`
  return {
    bytes,
    dataUrl: bytesToDataUrl(bytes),
    fileName,
  }
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
