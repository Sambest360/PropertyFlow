/**
 * Portal lead CSV → CRM (Mode A).
 * Maps to existing Lead with source + external_id dedupe — not live partner webhook.
 */

import type { Lead } from '../../types/domain'
import type { PortalCode, PortalLead } from './types'

export const LEAD_CSV_TEMPLATE_HEADER =
  'external_id,portal_code,listing_id,name,email,phone,message,type'

export const LEAD_CSV_HONESTY =
  'Mode A lead CSV import into CRM — not live Property24 / Private Property lead pull.'

export type ParsedLeadCsvRow = PortalLead & {
  lineNumber: number
  listingId: string
}

export type ParseLeadCsvResult = {
  rows: ParsedLeadCsvRow[]
  errors: string[]
  skippedBlank: number
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
  return h.trim().toLowerCase().replace(/\s+/g, '_')
}

function normalizePortalCode(raw: string): PortalCode {
  const v = raw.trim().toLowerCase().replace(/\s+/g, '_')
  if (v === 'property24' || v === 'p24') return 'property24'
  if (v === 'private_property' || v === 'pp' || v === 'privateproperty') return 'private_property'
  if (v === 'propertyflow_marketplace' || v === 'marketplace') return 'propertyflow_marketplace'
  return 'other'
}

function portalChannelLabel(code: PortalCode): string {
  switch (code) {
    case 'property24':
      return 'Property24'
    case 'private_property':
      return 'Private Property'
    case 'propertyflow_marketplace':
      return 'Marketplace'
    default:
      return 'Portal CSV'
  }
}

/**
 * Parse Mode A portal lead CSV. Expected header:
 * external_id,portal_code,listing_id,name,email,phone,message,type
 */
export function parsePortalLeadCsv(text: string): ParseLeadCsvResult {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
  const errors: string[] = []
  const rows: ParsedLeadCsvRow[] = []
  let skippedBlank = 0

  if (lines.length === 0 || (lines.length === 1 && !lines[0]?.trim())) {
    return { rows, errors: ['CSV is empty'], skippedBlank: 0 }
  }

  const headerCells = splitCsvLine(lines[0]!).map(normalizeHeader)
  const idx = {
    external_id: headerCells.indexOf('external_id'),
    portal_code: headerCells.indexOf('portal_code'),
    listing_id: headerCells.indexOf('listing_id'),
    name: headerCells.indexOf('name'),
    email: headerCells.indexOf('email'),
    phone: headerCells.indexOf('phone'),
    message: headerCells.indexOf('message'),
    type: headerCells.indexOf('type'),
  }
  if (idx.external_id < 0 || idx.name < 0) {
    return {
      rows: [],
      errors: [`Missing required columns. Expected header: ${LEAD_CSV_TEMPLATE_HEADER}`],
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
    const externalId = (cells[idx.external_id] ?? '').trim()
    const name = (cells[idx.name] ?? '').trim()
    const email = idx.email >= 0 ? (cells[idx.email] ?? '').trim() : ''
    const phone = idx.phone >= 0 ? (cells[idx.phone] ?? '').trim() : ''
    const listingId = idx.listing_id >= 0 ? (cells[idx.listing_id] ?? '').trim() : ''
    const portalRaw = idx.portal_code >= 0 ? (cells[idx.portal_code] ?? '').trim() : 'other'
    const message = idx.message >= 0 ? (cells[idx.message] ?? '').trim() : ''
    const typeRaw = idx.type >= 0 ? (cells[idx.type] ?? '').trim().toLowerCase() : ''

    if (!externalId) {
      errors.push(`Line ${i + 1}: external_id is required`)
      continue
    }
    if (!name) {
      errors.push(`Line ${i + 1}: name is required`)
      continue
    }
    if (!email && !phone) {
      errors.push(`Line ${i + 1}: email or phone is required`)
      continue
    }

    const type: 'Buy' | 'Rent' | undefined =
      typeRaw === 'buy' || typeRaw === 'sale' || typeRaw === 'purchase'
        ? 'Buy'
        : typeRaw === 'rent' || typeRaw === 'rental'
          ? 'Rent'
          : undefined

    rows.push({
      externalId,
      portalCode: normalizePortalCode(portalRaw),
      propertyId: listingId || null,
      listingReference: listingId || null,
      listingId,
      name,
      email,
      phone,
      message: message || undefined,
      type,
      lineNumber: i + 1,
    })
  }

  return { rows, errors, skippedBlank }
}

function normalizeContact(v: string): string {
  return v.trim().toLowerCase().replace(/[\s()-]/g, '')
}

const DEDUPE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function leadCreatedMs(lead: Pick<Lead, 'createdAt'>): number {
  const t = Date.parse(lead.createdAt)
  return Number.isFinite(t) ? t : 0
}

/**
 * Dedupe: same external_id (any age) OR same (email|phone) + listing within 7 days.
 * Matches attach note / skip duplicate — Mode A returns duplicates separately.
 */
export function filterNewPortalLeads(
  rows: ParsedLeadCsvRow[],
  existing: Array<
    Pick<Lead, 'email' | 'phone' | 'propertyId' | 'createdAt'> & {
      externalId?: string | null
      source?: string | null
      channel?: string
    }
  >,
  nowMs = Date.now(),
): { fresh: ParsedLeadCsvRow[]; duplicates: ParsedLeadCsvRow[] } {
  const byExternal = new Set<string>()
  for (const l of existing) {
    if (l.externalId?.trim()) byExternal.add(l.externalId.trim().toLowerCase())
  }

  const fresh: ParsedLeadCsvRow[] = []
  const duplicates: ParsedLeadCsvRow[] = []
  const seenInBatch = new Set<string>()

  for (const row of rows) {
    const extKey = row.externalId.trim().toLowerCase()
    if (byExternal.has(extKey) || seenInBatch.has(`ext:${extKey}`)) {
      duplicates.push(row)
      continue
    }

    const emailN = normalizeContact(row.email)
    const phoneN = normalizeContact(row.phone)
    const listing = (row.listingId || row.propertyId || '').trim().toLowerCase()
    let contactDup = false
    for (const l of existing) {
      const sameListing =
        listing &&
        (l.propertyId ?? '').trim().toLowerCase() === listing
      if (!sameListing) continue
      const age = nowMs - leadCreatedMs(l)
      if (age > DEDUPE_WINDOW_MS) continue
      const le = normalizeContact(l.email)
      const lp = normalizeContact(l.phone)
      if ((emailN && le && emailN === le) || (phoneN && lp && phoneN === lp)) {
        contactDup = true
        break
      }
    }
    if (contactDup) {
      duplicates.push(row)
      continue
    }

    seenInBatch.add(`ext:${extKey}`)
    byExternal.add(extKey)
    fresh.push(row)
  }

  return { fresh, duplicates }
}

export type LeadDraftFromPortalCsv = {
  agencyId: string
  propertyId: string
  agentId: string | null
  name: string
  email: string
  phone: string
  channel: string
  source: string
  externalId: string
  type: 'Buy' | 'Rent'
  value: number
  notes: string
  stage: string
}

/** Map a parsed portal CSV row into createLead input fields. */
export function portalLeadToLeadDraft(
  row: ParsedLeadCsvRow,
  ctx: {
    agencyId: string
    propertyId: string
    agentId?: string | null
    value?: number
    defaultType?: 'Buy' | 'Rent'
  },
): LeadDraftFromPortalCsv {
  const source = row.portalCode
  return {
    agencyId: ctx.agencyId,
    propertyId: ctx.propertyId || row.listingId || '',
    agentId: ctx.agentId ?? null,
    name: row.name,
    email: row.email,
    phone: row.phone,
    channel: portalChannelLabel(row.portalCode),
    source,
    externalId: row.externalId,
    type: row.type ?? ctx.defaultType ?? 'Rent',
    value: ctx.value ?? 0,
    notes: row.message
      ? `[Portal CSV ${row.portalCode}] ${row.message}`
      : `[Portal CSV ${row.portalCode}] Imported lead ${row.externalId}`,
    stage: 'New Lead',
  }
}

export function portalLeadCsvTemplateSample(): string {
  return [
    LEAD_CSV_TEMPLATE_HEADER,
    'P24-1001,property24,PR-DEMO-001,Thabo Molefe,thabo@example.com,+27 82 000 1111,Interested in viewing,Rent',
    'PP-2002,private_property,PR-DEMO-001,Sara Naidoo,sara@example.com,+27 83 000 2222,Please send brochure,Rent',
  ].join('\n')
}
