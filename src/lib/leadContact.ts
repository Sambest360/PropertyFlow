import type { Application, AppUser, Lead, MessageThread, PropertyAsset } from '../types/domain'
import { uniqueParticipantIds } from './messaging/modeA'

const PORTAL_ROLES = new Set(['tenant', 'applicant', 'end_user'])
const STAFF_ROLES = new Set([
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'landlord',
  'contractor',
])

export function normalizePhoneDigits(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '')
}

export function whatsappUrlForLead(lead: Pick<Lead, 'phone'>): string | null {
  const digits = normalizePhoneDigits(lead.phone)
  if (digits.length < 9) return null
  return `https://wa.me/${digits}`
}

export function telUrlForLead(lead: Pick<Lead, 'phone'>): string | null {
  const digits = normalizePhoneDigits(lead.phone)
  if (digits.length < 9) return null
  return `tel:+${digits}`
}

export function mailtoUrlForLead(
  lead: Pick<Lead, 'email'>,
  property?: Pick<PropertyAsset, 'title'> | null,
): string | null {
  const email = lead.email?.trim()
  if (!email) return null
  const params = new URLSearchParams()
  if (property?.title) {
    params.set('subject', `Enquiry: ${property.title}`)
  }
  const qs = params.toString()
  return `mailto:${encodeURIComponent(email)}${qs ? `?${qs}` : ''}`
}

function emailKey(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase()
}

export function resolveLeadPortalUser(
  users: readonly AppUser[],
  lead: Pick<Lead, 'email' | 'propertyId'>,
  applications?: readonly Application[],
): AppUser | null {
  const key = emailKey(lead.email)
  if (!key) return null

  const appMatch = applications?.find(
    (a) =>
      a.propertyId === lead.propertyId &&
      emailKey(a.email) === key &&
      a.applicantUserId,
  )
  if (appMatch?.applicantUserId) {
    const fromApp = users.find((u) => u.id === appMatch.applicantUserId)
    if (fromApp) return fromApp
  }

  const byEmail = users.filter((u) => emailKey(u.email) === key)
  const portal = byEmail.filter((u) => PORTAL_ROLES.has(u.role) || !STAFF_ROLES.has(u.role))
  if (portal.length === 1) return portal[0]
  if (portal.length > 1) {
    return portal.find((u) => u.role === 'tenant') ?? portal[0]
  }
  return byEmail.find((u) => !STAFF_ROLES.has(u.role)) ?? null
}

export function leadThreadSubject(lead: Pick<Lead, 'id' | 'name'>, property: Pick<PropertyAsset, 'title'> | null): string {
  const title = property?.title?.trim() || 'Listing'
  return `[${lead.id}] Lead: ${lead.name} · ${title}`
}

export function findExistingLeadThread(
  threads: readonly MessageThread[],
  lead: Pick<Lead, 'id' | 'agencyId' | 'propertyId'>,
  portalUserId: string,
): MessageThread | null {
  return (
    threads.find(
      (t) =>
        t.agencyId === lead.agencyId &&
        t.propertyId === lead.propertyId &&
        t.participantIds.includes(portalUserId) &&
        t.subject.includes(lead.id),
    ) ?? null
  )
}

export type LeadThreadCreateParams = {
  lead: Lead
  property: PropertyAsset | null
  portalUserId: string
  currentUserId: string
  initialMessage: string
}

export function buildLeadThreadCreateInput(params: LeadThreadCreateParams) {
  const { lead, property, portalUserId, currentUserId, initialMessage } = params
  const participantIds = uniqueParticipantIds([
    currentUserId,
    lead.agentId,
    portalUserId,
  ])
  return {
    agencyId: lead.agencyId,
    propertyId: lead.propertyId,
    applicationId: null as string | null,
    subject: leadThreadSubject(lead, property),
    participantIds,
    routesTo: 'agent' as const,
    fromUserId: currentUserId,
    initialMessage: initialMessage.trim(),
  }
}
