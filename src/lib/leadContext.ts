import type {
  Activity,
  Application,
  Lead,
  PaymentRecord,
  PropertyAsset,
  Viewing,
} from '../types/domain'
import { leadViewingDeskHref } from './leadViewing'

export type LeadStageLink = {
  id: string
  title: string
  description: string
  href: string
  meta?: string
}

export type LeadStageContext = {
  stageKey: string
  headline: string
  summary?: string
  links: LeadStageLink[]
  facts: Array<{ label: string; value: string }>
  emptyMessage?: string
  emptyAction?: LeadStageLink
}

function normContact(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Match lead to applicant/viewing contact by email or full name. */
export function leadContactMatches(
  lead: Pick<Lead, 'email' | 'name'>,
  contact: { email?: string | null; name?: string | null },
): boolean {
  const leadEmail = lead.email.trim().toLowerCase()
  const contactEmail = contact.email?.trim().toLowerCase()
  if (leadEmail && contactEmail && leadEmail === contactEmail) return true

  const leadName = normContact(lead.name)
  const contactName = contact.name ? normContact(contact.name) : ''
  return Boolean(leadName && contactName && leadName === contactName)
}

export function findLeadApplications(lead: Lead, applications: Application[]): Application[] {
  return applications.filter(
    (a) =>
      a.propertyId === lead.propertyId &&
      a.agencyId === lead.agencyId &&
      leadContactMatches(lead, { email: a.email, name: a.applicantName }),
  )
}

export function findLeadViewings(lead: Lead, viewings: Viewing[]): Viewing[] {
  return viewings.filter(
    (v) =>
      v.propertyId === lead.propertyId &&
      v.agencyId === lead.agencyId &&
      leadContactMatches(lead, { email: v.applicantEmail, name: v.applicantName }),
  )
}

export function findLeadPayments(
  lead: Lead,
  payments: PaymentRecord[],
  applications: Application[],
): PaymentRecord[] {
  const appIds = new Set(applications.map((a) => a.id))
  return payments.filter((p) => {
    if (p.propertyId !== lead.propertyId || p.agencyId !== lead.agencyId) return false
    if (p.applicationId && appIds.has(p.applicationId)) return true
    return leadContactMatches(lead, { name: p.partyName })
  })
}

export function normalizeLeadStageKey(stage: string): string {
  const s = stage.trim().toLowerCase()
  if (s.includes('new')) return 'new'
  if (s.includes('contact')) return 'contacted'
  if (s.includes('viewing') && s.includes('sched')) return 'viewing_scheduled'
  if (s.includes('viewing') && (s.includes('complete') || s.includes('done'))) return 'viewing_completed'
  if (s.includes('credit')) return 'credit_check'
  if (s.includes('application') || s === 'submitted') return 'application_submitted'
  if (s.includes('offer')) return 'offer_sent'
  if (s.includes('deposit')) return 'deposit_paid'
  if (s.includes('lease')) return 'lease_signed'
  if (s.includes('sale') && s.includes('complete')) return 'sale_completed'
  if (s.includes('qualified')) return 'contacted'
  if (s.includes('negotiat')) return 'offer_sent'
  return s.replace(/\s+/g, '_')
}

function appLink(app: Application): LeadStageLink {
  return {
    id: `app-${app.id}`,
    title: `${app.applicantName} — ${app.stage}`,
    description: 'Open the full application file, documents, and workflow actions.',
    href: `/workspace/sales/applications/${encodeURIComponent(app.id)}`,
    meta: app.submittedAt ? `Submitted ${app.submittedAt}` : undefined,
  }
}

function propertyApplicantsLink(property: PropertyAsset): LeadStageLink {
  return {
    id: 'property-applicants',
    title: 'Property applications',
    description: 'See every applicant linked to this listing.',
    href: `/workspace/properties/${encodeURIComponent(property.id)}?tab=applicants`,
  }
}

function propertyViewingsLink(property: PropertyAsset): LeadStageLink {
  return {
    id: 'property-viewings',
    title: 'Viewing desk',
    description: 'Manage slots, bookings, and attendance for this property.',
    href: `/workspace/sales/viewings/property/${encodeURIComponent(property.id)}`,
  }
}

export function buildLeadStageContext(
  lead: Lead,
  deps: {
    property: PropertyAsset | null
    applications: Application[]
    viewings: Viewing[]
    payments: PaymentRecord[]
    activities?: Activity[]
  },
): LeadStageContext {
  const stageKey = normalizeLeadStageKey(lead.stage)
  const apps = findLeadApplications(lead, deps.applications)
  const viewings = findLeadViewings(lead, deps.viewings)
  const payments = findLeadPayments(lead, deps.payments, apps)
  const property = deps.property

  const facts: LeadStageContext['facts'] = []

  if (property) {
    facts.push({ label: 'Listing', value: property.title })
  }
  facts.push({ label: 'Enquiry channel', value: lead.channel || '—' })
  facts.push({ label: 'Last updated', value: lead.updatedAt })

  const upcomingViewing = viewings.find((v) => v.status === 'Scheduled')
  const completedViewing = viewings.find((v) => v.status === 'Completed')
  const primaryApp = apps[0]
  const depositPayment = payments.find((p) => p.type === 'Deposit' || p.type === 'Sale Deposit')
  const rentPayment = payments.find((p) => p.type === 'First Month Rent' || p.type === 'Rent')

  const leadActivityHref = `/workspace/sales/crm/${encodeURIComponent(lead.id)}?tab=activity`

  switch (stageKey) {
    case 'new':
      return {
        stageKey,
        headline: 'New enquiry — make first contact',
        summary: 'Capture how they found the listing and log your first outreach before scheduling a viewing.',
        links: [
          ...(property
            ? [
                {
                  id: 'property',
                  title: property.title,
                  description: 'Review listing details, photos, and pricing before you call back.',
                  href: `/workspace/properties/${encodeURIComponent(property.id)}`,
                },
              ]
            : []),
          {
            id: 'activity',
            title: 'Log contact note',
            description: 'Record calls, WhatsApp messages, or emails on the Activity tab.',
            href: leadActivityHref,
          },
        ],
        facts,
      }

    case 'contacted':
      return {
        stageKey,
        headline: 'Contact made — qualify interest',
        summary:
          lead.notes.trim() ||
          'Confirm budget, timeline, and whether they want a viewing or application pack.',
        links: [
          ...(property ? [propertyViewingsLink(property)] : []),
          {
            id: 'activity',
            title: 'View contact history',
            description: 'See notes and logged touchpoints for this lead.',
            href: leadActivityHref,
          },
        ],
        facts,
      }

    case 'viewing_scheduled':
      return {
        stageKey,
        headline: upcomingViewing
          ? `Viewing booked · ${upcomingViewing.date} ${upcomingViewing.time}`
          : 'Viewing scheduled',
        summary: upcomingViewing
          ? 'Confirm attendance and send directions before the slot.'
          : 'Link a viewing booking to this lead from the property viewing desk.',
        links: upcomingViewing ? [] : property ? [propertyViewingsLink(property)] : [],
        facts,
        emptyMessage: !upcomingViewing && property ? 'No viewing booking matched to this contact yet.' : undefined,
        emptyAction:
          !upcomingViewing && property ? propertyViewingsLink(property) : undefined,
      }

    case 'viewing_completed':
      return {
        stageKey,
        headline: completedViewing ? 'Viewing completed' : 'Post-viewing follow-up',
        summary: completedViewing?.feedback || 'Capture feedback and invite them to apply if they are still interested.',
        links: [
          ...(completedViewing
            ? [
                {
                  id: `viewing-${completedViewing.id}`,
                  title: `Viewing on ${completedViewing.date}`,
                  description: completedViewing.feedback || 'Open viewing record for attendance and notes.',
                  href: leadViewingDeskHref(completedViewing),
                  meta: completedViewing.attendance,
                },
              ]
            : []),
          ...(property ? [propertyApplicantsLink(property)] : []),
          ...(primaryApp ? [appLink(primaryApp)] : []),
        ],
        facts: completedViewing
          ? [...facts, { label: 'Attendance', value: completedViewing.attendance }]
          : facts,
      }

    case 'application_submitted':
    case 'credit_check':
      return {
        stageKey,
        headline:
          stageKey === 'credit_check' ? 'Credit check in progress' : 'Application on file',
        summary: primaryApp
          ? `${primaryApp.applicantName} is at “${primaryApp.stage}” (${primaryApp.progress}% complete).`
          : 'Match this lead to their submitted application to review documents and advance the workflow.',
        links: [
          ...apps.map(appLink),
          ...(property && !apps.length ? [propertyApplicantsLink(property)] : []),
        ],
        facts: primaryApp
          ? [
              ...facts,
              { label: 'Application stage', value: primaryApp.stage },
              { label: 'Credit check', value: primaryApp.creditCheck },
              ...(primaryApp.submittedAt
                ? [{ label: 'Submitted', value: primaryApp.submittedAt }]
                : []),
            ]
          : facts,
        emptyMessage: !apps.length
          ? 'No application matched yet — link by the same email or name on this property.'
          : undefined,
        emptyAction:
          !apps.length && property ? propertyApplicantsLink(property) : undefined,
      }

    case 'offer_sent':
      return {
        stageKey,
        headline: 'Offer or approval sent',
        summary: primaryApp
          ? `Track approval, lease signing, and payment on the application file.`
          : 'Open the application to send or confirm the offer.',
        links: [
          ...apps.map(appLink),
          ...(property ? [propertyApplicantsLink(property)] : []),
        ],
        facts: primaryApp
          ? [...facts, { label: 'Application stage', value: primaryApp.stage }]
          : facts,
        emptyMessage: !apps.length ? 'No linked application found for this offer stage.' : undefined,
        emptyAction: !apps.length && property ? propertyApplicantsLink(property) : undefined,
      }

    case 'deposit_paid':
      return {
        stageKey,
        headline: 'Deposit received',
        summary: 'Confirm deposit allocation and prepare lease signing or transfer milestones.',
        links: [
          ...apps.map(appLink),
          ...(depositPayment
            ? [
                {
                  id: `pay-${depositPayment.id}`,
                  title: `${depositPayment.type} · ${depositPayment.status}`,
                  description: 'Open the payment record for receipt and allocation details.',
                  href: `/workspace/operations/payments/${encodeURIComponent(depositPayment.id)}`,
                  meta: depositPayment.paidAt ?? depositPayment.dueDate,
                },
              ]
            : []),
        ],
        facts: depositPayment
          ? [...facts, { label: 'Deposit status', value: depositPayment.status }]
          : facts,
        emptyMessage: !depositPayment && !apps.length ? 'No deposit payment or application linked yet.' : undefined,
      }

    case 'lease_signed':
    case 'sale_completed':
      return {
        stageKey,
        headline: stageKey === 'sale_completed' ? 'Sale completed' : 'Lease signed',
        summary: 'Deal closed — retain the application file and payment history for compliance.',
        links: [
          ...apps.map(appLink),
          ...(rentPayment
            ? [
                {
                  id: `pay-${rentPayment.id}`,
                  title: `${rentPayment.type} payment`,
                  description: 'View rent or purchase payment schedule.',
                  href: `/workspace/operations/payments/${encodeURIComponent(rentPayment.id)}`,
                  meta: rentPayment.status,
                },
              ]
            : []),
          ...(property
            ? [
                {
                  id: 'property',
                  title: property.title,
                  description: 'Open the property workspace for tenancy or transfer records.',
                  href: `/workspace/properties/${encodeURIComponent(property.id)}`,
                },
              ]
            : []),
        ],
        facts,
      }

    default:
      return {
        stageKey,
        headline: `Working toward ${lead.stage}`,
        summary: 'Use the links below to open related records for this step.',
        links: [
          ...apps.map(appLink),
          ...(property ? [propertyViewingsLink(property), propertyApplicantsLink(property)] : []),
        ],
        facts,
      }
  }
}
