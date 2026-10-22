/**
 * Mode A owner↔tenant in-app messaging helpers.
 * Persist via createThread / upsertThread — never claims WhatsApp/SMS delivery.
 */

export type MessageRoutesTo = 'agency' | 'agent' | 'landlord'

export const MESSAGING_MODE_A_BANNER =
  'In-app messaging only — not live chat, WhatsApp, or SMS. Messages stay inside Lekaya.'

export const MESSAGING_MODE_A_SHORT =
  'In-app only — not WhatsApp/SMS'

/** Map frontend routesTo → Postgres CHECK value. */
export function mapRoutesToPg(routesTo: string | null | undefined): 'AGENCY' | 'AGENT' | 'LANDLORD' {
  const u = String(routesTo ?? 'agent').toUpperCase()
  if (u.startsWith('AGENCY')) return 'AGENCY'
  if (u.startsWith('LANDLORD')) return 'LANDLORD'
  return 'AGENT'
}

/** Map Postgres routes_to → frontend MessageThread.routesTo. */
export function mapRoutesToFe(routesTo: string | null | undefined): MessageRoutesTo {
  const u = String(routesTo ?? 'AGENT').toUpperCase()
  if (u === 'AGENCY') return 'agency'
  if (u === 'LANDLORD') return 'landlord'
  return 'agent'
}

export function routesToBadgeLabel(routesTo: MessageRoutesTo | string): string {
  if (routesTo === 'landlord') return 'Landlord'
  if (routesTo === 'agency') return 'Agency'
  return 'Agent'
}

/** Dedupe participant ids preserving order. */
export function uniqueParticipantIds(ids: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const id of ids) {
    if (!id) continue
    if (!out.includes(id)) out.push(id)
  }
  return out
}

export type ArrearsThreadInput = {
  agencyId: string
  propertyId: string | null
  applicationId: string | null
  occupancyId: string
  staffUserId: string
  tenantUserId: string
  landlordId: string | null
  totalCents?: number
}

/**
 * Build createThread payload for Trust Arrears → in-app message.
 * Includes landlord when known (owner visibility); routesTo landlord when owner is on the thread.
 */
export function buildArrearsMessageThreadInput(input: ArrearsThreadInput): {
  agencyId: string
  propertyId: string | null
  applicationId: string | null
  subject: string
  participantIds: string[]
  routesTo: MessageRoutesTo
  fromUserId: string
  initialMessage: string
} {
  const participants = uniqueParticipantIds([
    input.staffUserId,
    input.tenantUserId,
    input.landlordId,
  ])
  const routesTo: MessageRoutesTo = input.landlordId ? 'landlord' : 'agency'
  const amountHint =
    typeof input.totalCents === 'number' && input.totalCents > 0
      ? ` Outstanding: R${(input.totalCents / 100).toFixed(2)}.`
      : ''
  return {
    agencyId: input.agencyId,
    propertyId: input.propertyId,
    applicationId: input.applicationId,
    subject: `Arrears follow-up — ${input.occupancyId}`,
    participantIds: participants,
    routesTo,
    fromUserId: input.staffUserId,
    initialMessage: `Hi — please review arrears for occupancy ${input.occupancyId}.${amountHint} Balances come from the Lekaya ledger and are not yet matched to the bank. Sent as an in-app Lekaya message.`,
  }
}

/** Tenant compose: landlord direct vs agency/agent. */
export function resolveTenantComposeTarget(opts: {
  preferLandlord: boolean
  tenantUserId: string
  landlordId: string | null | undefined
  agentId: string | null | undefined
}): { participantIds: string[]; routesTo: MessageRoutesTo } {
  if (opts.preferLandlord && opts.landlordId) {
    return {
      participantIds: uniqueParticipantIds([opts.tenantUserId, opts.landlordId]),
      routesTo: 'landlord',
    }
  }
  if (opts.agentId) {
    return {
      participantIds: uniqueParticipantIds([opts.tenantUserId, opts.agentId]),
      routesTo: 'agent',
    }
  }
  return {
    participantIds: uniqueParticipantIds([opts.tenantUserId]),
    routesTo: 'agency',
  }
}

/** Owner compose: message tenant on a property (agency optional). */
export function resolveOwnerComposeTarget(opts: {
  landlordUserId: string
  tenantUserId: string
  includeAgencyUserId?: string | null
}): { participantIds: string[]; routesTo: MessageRoutesTo } {
  return {
    participantIds: uniqueParticipantIds([
      opts.landlordUserId,
      opts.tenantUserId,
      opts.includeAgencyUserId,
    ]),
    routesTo: 'landlord',
  }
}

/** Honesty: helpers never call external messaging HTTP. Used by tests. */
export function messagingDeliveryClaim(): 'in-app' {
  return 'in-app'
}
