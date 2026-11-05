/**
 * The agency's own lease, written in a rich text editor. Stored as a small,
 * safe subset of HTML with merge fields such as {{tenantName}}. The lease
 * shown on screen, the PDF and the fingerprint each signer agrees to are all
 * built from it (headings become sections, paragraphs and list items become
 * clauses). Pure string code: it runs in the browser and on the server.
 */
import type { LeaseSection } from './leaseContract'

export const LEASE_TEMPLATE_MAX = 200_000

export const LEASE_MERGE_FIELDS = [
  { key: 'tenantName', label: 'Tenant name' },
  { key: 'tenantEmail', label: 'Tenant email' },
  { key: 'tenantIdNumber', label: 'Tenant ID number' },
  { key: 'landlordName', label: 'Landlord name' },
  { key: 'agencyName', label: 'Agency name' },
  { key: 'agencyContact', label: 'Agency contact' },
  { key: 'propertyTitle', label: 'Property name' },
  { key: 'propertyAddress', label: 'Property address' },
  { key: 'startDate', label: 'Start date' },
  { key: 'endDate', label: 'End date' },
  { key: 'rent', label: 'Monthly rent' },
  { key: 'deposit', label: 'Deposit' },
  { key: 'rentDueDay', label: 'Rent due day' },
  { key: 'escalation', label: 'Yearly increase' },
  { key: 'parkingBays', label: 'Parking bays' },
  { key: 'leaseReference', label: 'Lease reference' },
] as const

export type LeaseMergeKey = (typeof LEASE_MERGE_FIELDS)[number]['key']
export type LeaseMergeValues = Partial<Record<LeaseMergeKey, string>>

const ALLOWED = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'ul', 'ol', 'li'])

/** Keep only the editor's tags, with no attributes. Everything else becomes text. */
export function sanitizeLeaseHtml(input: unknown): string {
  if (typeof input !== 'string') return ''
  let html = input.slice(0, LEASE_TEMPLATE_MAX)
  html = html.replace(/<(script|style|iframe|object|embed|template)[\s\S]*?<\/\1\s*>/gi, '')
  html = html.replace(/<!--[\s\S]*?-->/g, '')
  html = html.replace(/<\/?([a-zA-Z0-9]+)(\s[^>]*)?>/g, (tag, name: string) => {
    let n = name.toLowerCase()
    if (n === 'h1') n = 'h2'
    if (n === 'h4' || n === 'h5' || n === 'h6') n = 'h3'
    if (n === 'div') n = 'p'
    if (!ALLOWED.has(n)) return ''
    const closing = tag.startsWith('</')
    if (n === 'br') return '<br>'
    return closing ? `</${n}>` : `<${n}>`
  })
  // Stray angle brackets left over are shown as text.
  html = html.replace(/<(?!\/?(p|br|strong|b|em|i|u|h2|h3|ul|ol|li)>)/g, '&lt;')
  return html.trim()
}

export function leaseTemplateIsEmpty(html: string | null | undefined): boolean {
  return !htmlToText(sanitizeLeaseHtml(html ?? '')).trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function htmlToText(s: string): string {
  return decodeEntities(s.replace(/<br>/g, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim()
}

export function fillMergeFields(text: string, values: LeaseMergeValues): string {
  return text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (all, key: string) => {
    const v = values[key as LeaseMergeKey]
    void all
    return v != null && v !== '' ? v : '________'
  })
}

/**
 * Sections for the lease: each h2 starts a section (h3 too, if there is no h2
 * at all); paragraphs and list items are its clauses. Text before the first
 * heading goes into an untitled opening section.
 */
export function leaseTemplateSections(html: string, values: LeaseMergeValues): LeaseSection[] {
  const clean = sanitizeLeaseHtml(html)
  const headingTag = /<h2>/.test(clean) ? 'h2' : 'h3'
  const blocks: Array<{ kind: 'heading' | 'clause'; text: string }> = []
  const re = /<(h2|h3|p|li)>([\s\S]*?)<\/\1>/g
  let m: RegExpExecArray | null
  let consumed = 0
  while ((m = re.exec(clean))) {
    const loose = htmlToText(clean.slice(consumed, m.index).replace(/<\/?(ul|ol)>/g, ''))
    if (loose) blocks.push({ kind: 'clause', text: loose })
    consumed = m.index + m[0].length
    const tag = m[1]
    const inner = m[2].replace(/<(p|li)>[\s\S]*$/, '')
    const text = htmlToText(inner)
    if (!text) continue
    if (tag === headingTag) blocks.push({ kind: 'heading', text })
    else if (tag === 'h2' || tag === 'h3') blocks.push({ kind: 'clause', text })
    else blocks.push({ kind: 'clause', text })
  }
  const rest = htmlToText(clean.slice(consumed).replace(/<\/?(ul|ol)>/g, ''))
  if (rest) blocks.push({ kind: 'clause', text: rest })

  const sections: LeaseSection[] = []
  for (const b of blocks) {
    const text = fillMergeFields(b.text, values)
    if (b.kind === 'heading') sections.push({ title: text, clauses: [] })
    else {
      if (!sections.length) sections.push({ title: '', clauses: [] })
      sections[sections.length - 1].clauses.push(text)
    }
  }
  return sections.filter((s) => s.title || s.clauses.length)
}

/** A starting point agencies can edit. Their attorney should review it. */
export const STARTER_LEASE_TEMPLATE = sanitizeLeaseHtml(`
<h2>1. Parties</h2>
<p>This lease is between {{landlordName}} (the "Landlord") and {{tenantName}} (the "Tenant"). {{agencyName}} (the "Agent") manages the Premises for the Landlord.</p>
<h2>2. The Premises</h2>
<p>The Landlord lets to the Tenant {{propertyTitle}}, {{propertyAddress}} (the "Premises"), to be used only as a private home.</p>
<h2>3. Term</h2>
<p>This lease starts on {{startDate}} and ends on {{endDate}}.</p>
<h2>4. Rent</h2>
<ul>
<li>The rent is {{rent}} a month, paid in advance by the {{rentDueDay}} day of each month, with the reference {{leaseReference}}.</li>
<li>Rent increases: {{escalation}}.</li>
</ul>
<h2>5. Deposit</h2>
<p>The Tenant pays a deposit of {{deposit}} before moving in. The Agent keeps it in an interest-bearing account as the Rental Housing Act requires, and refunds it with interest, less any amounts lawfully owed, after the lease ends.</p>
<h2>6. Inspections</h2>
<p>The Tenant and the Agent inspect the Premises together before move-in and again when the Tenant moves out, and record any defects.</p>
<h2>7. Ending the lease</h2>
<p>Either party may end this lease as the Consumer Protection Act and the Rental Housing Act allow. Notices are given in writing, including by email.</p>
`)
