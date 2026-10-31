/**
 * The button on a notification email: what it says and where it goes. The
 * link is the notification's own deep link (the exact application, lease,
 * job, payment…), fixed up where an older link would land on a page the
 * recipient cannot open or would lose its target.
 */
import type { CardAudience } from './propertyContext.js'

export type EmailAction = { label: string; href: string }

/** Deep link the recipient can actually open. */
export function deepLinkFor(link: string | null | undefined, audience: CardAudience): string {
  const raw = String(link ?? '').trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/workspace'
  const [path, query = ''] = raw.split('?', 2) as [string, string?]
  const qs = query ? `?${query}` : ''
  // Older lease reminders linked /leases, which is not a page.
  if (path === '/leases') return `/workspace/leases${qs}`
  const lead = /^\/workspace\/sales\/crm\/leads\/([^/]+)$/.exec(path)
  if (lead) return `/workspace/sales/crm/${lead[1]}${qs}`
  // The /workspace/maintenance shortcut redirects without its ?ticket=.
  if (path === '/workspace/maintenance') return `/workspace/operations/maintenance${qs}`
  if (path === '/workspace/people/leases') {
    // Landlords and tenants sign and read leases in their own portals.
    if (audience === 'landlord') return '/workspace/portals/owner'
    if (audience === 'tenant') return '/workspace/portals/tenant/leases'
  }
  return raw
}

/** Button label from where the link goes and what happened. */
export function actionLabelFor(input: {
  link: string
  resource?: string | null
  title?: string | null
  audience: CardAudience
}): string {
  const link = input.link
  const title = String(input.title ?? '')
  const resource = String(input.resource ?? '').toLowerCase()
  const staff = input.audience === 'staff'
  if (/lease/i.test(link) || resource.startsWith('lease') || resource === 'tenancy') {
    return /\bsign/i.test(title) && !/signed by (everyone|all)/i.test(title) ? 'Review and sign the lease' : 'View the lease'
  }
  if (/\/applications\//.test(link)) {
    if (staff) return 'Review the application'
    return /document|upload|missing/i.test(title) ? 'Upload documents' : 'Open my application'
  }
  if (/viewings|booking=/.test(link) || resource.startsWith('viewing') || resource === 'booking') {
    return staff ? 'Open the viewing' : 'See my viewing'
  }
  if (/inspection/.test(link) || resource === 'inspection') return /sign/i.test(title) ? 'Review and sign the inspection' : 'Open the inspection'
  if (/help\?ticket=/.test(link) || resource === 'support') return 'Open the support ticket'
  if (/maintenance|ticket=/.test(link) || resource === 'maintenance') return staff ? 'Open the job' : 'Open my request'
  if (/payments/.test(link) || resource === 'payment') {
    if (!staff && /proof|due|overdue|arrears|outstanding/i.test(title)) return 'Upload proof of payment'
    return /proof/i.test(title) && staff ? 'Review the payment proof' : 'Open the payment record'
  }
  if (/billing|subscription/.test(link) || resource === 'billing') return 'View billing'
  if (/storage/.test(link)) return 'Review storage'
  if (/conduct/.test(link)) return 'Open the conduct case'
  if (/escalations/.test(link) || resource === 'escalation') return 'Open escalations'
  if (/sales\/crm/.test(link) || resource === 'lead') return 'Open the lead'
  if (link.startsWith('/listing/')) return 'View the property'
  if (/\/properties\//.test(link)) return 'Open the property'
  if (/documents/.test(link) || resource === 'document') return 'Open documents'
  return 'Open in Lekaya'
}

export function emailActionFor(input: {
  link: string | null | undefined
  resource?: string | null
  title?: string | null
  audience: CardAudience
}): EmailAction {
  const href = deepLinkFor(input.link, input.audience)
  return { href, label: href === '/workspace' && !input.link ? 'Open my dashboard' : actionLabelFor({ ...input, link: href }) }
}
