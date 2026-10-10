/**
 * Tenant view of maintenance tickets (shared by the server bootstrap gate and
 * the tenant portal).
 *
 * A tenant sees a ticket when they reported it (any id form they carry,
 * whatever the tenancy status) or when it is linked to one of their own
 * tenancies that is Active or Notice (ownTenancyIds — see
 * tenantTicketTenancyIds). Never by unit or property alone, and no other
 * past-tenancy tickets.
 */
/**
 * Ids of the tenant's own tenancies whose linked tickets they see: raw lease
 * status active / notice; without a raw status (local demo data) the Active
 * label.
 */
export function tenantTicketTenancyIds(
  tenancies: Array<{ id?: string; tenantUserId?: string | null; status?: string; leaseStatus?: string }>,
  isMine: (userId: string) => boolean,
): Set<string> {
  return new Set(
    tenancies
      .filter((t) => typeof t.tenantUserId === 'string' && t.tenantUserId !== '' && isMine(t.tenantUserId))
      .filter((t) => (t.leaseStatus ? t.leaseStatus === 'active' || t.leaseStatus === 'notice' : t.status === 'Active'))
      .map((t) => t.id)
      .filter((id): id is string => typeof id === 'string' && id !== ''),
  )
}

export function tenantSeesTicket(
  t: { reportedByUserId?: string | null; tenancyId?: string | null },
  actorIds: ReadonlySet<string>,
  ownTenancyIds: ReadonlySet<string>,
): boolean {
  const reporter = t.reportedByUserId
  if (typeof reporter === 'string' && reporter !== '' && actorIds.has(reporter)) return true
  const tenancy = t.tenancyId
  return typeof tenancy === 'string' && tenancy !== '' && ownTenancyIds.has(tenancy)
}

/**
 * Fields a tenant may see on ANY ticket in their view (their own reports and
 * tickets staff linked to their tenancy): what was reported, the status and
 * the dates. Staff notes (the only notes field, resolutionNotes, is
 * staff-only), contractor / vendor, quotes, costs, warranty and assignment
 * are always dropped. Access notes and photos are kept only on the tenant's
 * own reports (OWN_TICKET_EXTRA_FIELDS).
 */
const TENANT_TICKET_FIELDS = [
  'id',
  'agencyId',
  'propertyId',
  'unitId',
  'tenancyId',
  'categoryKey',
  'title',
  'description',
  'priority',
  'status',
  'openedAt',
  'openedAtIso',
  'resolvedAt',
  'locationDetail',
  'preferredSchedule',
  'issueTags',
] as const

/** Kept on the tenant's own reports only. */
const OWN_TICKET_EXTRA_FIELDS = ['accessNotes', 'photos', 'photoUrls'] as const

/**
 * Tenant view of a ticket, reduced to TENANT_TICKET_FIELDS. Their own report
 * keeps its reporter (their own id and name); a ticket they only see through
 * the tenancy link shows the reporter as the agency, with no staff id.
 */
export function tenantTicketView<T extends Record<string, unknown>>(
  t: T,
  actorIds: ReadonlySet<string>,
): T {
  const reporter = t.reportedByUserId
  const own = typeof reporter === 'string' && reporter !== '' && actorIds.has(reporter)
  const out: Record<string, unknown> = {}
  for (const k of TENANT_TICKET_FIELDS) {
    if (k in t) out[k] = t[k]
  }
  if (own) {
    for (const k of OWN_TICKET_EXTRA_FIELDS) {
      if (k in t) out[k] = t[k]
    }
  }
  out.reportedBy = own ? t.reportedBy : 'Agency'
  out.reportedByUserId = own ? reporter : null
  out.assetLabel = ''
  return out as T
}

/**
 * Tickets for the tenant portal: own reported tickets, or tickets linked to
 * one of the tenant's own Active / Notice tenancies, all in the tenant view. No name match, no unit match.
 */
export function tenantPortalTickets<T extends { reportedByUserId?: string | null; tenancyId?: string | null }>(
  tickets: T[],
  tenancies: Array<{ id: string; tenantUserId: string | null; status?: string; leaseStatus?: string }>,
  userId: string,
): T[] {
  const me = new Set([userId])
  const ownTenancyIds = tenantTicketTenancyIds(tenancies, (id) => id === userId)
  return tickets
    .filter((t) => tenantSeesTicket(t, me, ownTenancyIds))
    .map((t) => tenantTicketView(t as unknown as Record<string, unknown>, me) as unknown as T)
}
