import type { AgencyContractor, AppUser, MaintenanceTicket } from '../types/domain'
import { isVerificationApproved } from './verification.js'

/**
 * Derive the agency contractor roster from contractor-role users' verification
 * metadata (the persisted source of truth for seeded + registered vendors).
 * Used by both bootstrap fetch paths; the store merges it over static seed rows.
 */
export function deriveAgencyContractors(
  users: readonly {
    role: string
    agencyId: string | null
    id: string
    verification?: { status?: unknown; submittedAt?: unknown; reviewedAt?: unknown; reviewedBy?: unknown; profile?: { trades?: unknown } } | null
  }[],
): AgencyContractor[] {
  const rows: AgencyContractor[] = []
  for (const u of users) {
    if (u.role !== 'contractor') continue
    const vStatus = u.verification?.status as string | undefined
    const status: AgencyContractor['status'] =
      vStatus === 'approved' ? 'approved' : vStatus === 'suspended' ? 'suspended' : 'pending'
    const tradesRaw = u.verification?.profile?.trades
    const trades = Array.isArray(tradesRaw)
      ? (tradesRaw as string[]).map((t) => normalizeTradeKey(String(t)))
      : ['GENERAL']
    rows.push({
      id: `roster-${u.id}`,
      agencyId: u.agencyId ?? '',
      contractorUserId: u.id,
      status,
      trades,
      addedAt:
        (u.verification?.submittedAt as string | undefined) ??
        (u.verification?.reviewedAt as string | undefined) ??
        new Date().toISOString(),
      addedByUserId: (u.verification?.reviewedBy as string | undefined) ?? null,
    })
  }
  return rows
}

export const CONTRACTOR_TRADES = [
  { key: 'GENERAL', label: 'General maintenance' },
  { key: 'PLUMBING', label: 'Plumbing' },
  { key: 'ELECTRICAL', label: 'Electrical' },
  { key: 'APPLIANCE_FAILURE', label: 'Appliances' },
  { key: 'HVAC', label: 'HVAC / geyser' },
  { key: 'LOCKSMITH', label: 'Locksmith' },
  { key: 'PAINTING', label: 'Painting' },
  { key: 'ROOFING', label: 'Roofing' },
  { key: 'LANDSCAPING', label: 'Landscaping' },
  { key: 'SECURITY', label: 'Security / access' },
] as const

export function tradeLabel(key: string): string {
  return CONTRACTOR_TRADES.find((t) => t.key === key)?.label ?? key.replace(/_/g, ' ')
}

/** Canonical trade key for a raw value, tolerating label spellings like "General maintenance" or "gardening / landscaping". */
function normalizeTradeKey(raw: string): string {
  const trimmed = raw.trim()
  const upper = trimmed.toUpperCase()
  if (CONTRACTOR_TRADES.some((t) => t.key === upper)) return upper
  const byLabel = CONTRACTOR_TRADES.find(
    (t) => t.label.toLowerCase() === trimmed.toLowerCase(),
  )
  if (byLabel) return byLabel.key
  if (upper.includes('GARDEN') || upper.includes('LANDSCAP')) return 'LANDSCAPING'
  if (upper.includes('GENERAL')) return 'GENERAL'
  return trimmed
}

/** Whether a trade list covers a category key, tolerating keys stored as labels. */
function tradesInclude(trades: readonly string[], categoryKey: string): boolean {
  const want = normalizeTradeKey(categoryKey)
  return trades.some((t) => normalizeTradeKey(t) === want)
}

export type ContractorProfile = {
  user: AppUser
  roster: AgencyContractor
}

export function listAgencyContractorRoster(
  roster: AgencyContractor[],
  users: AppUser[],
  agencyId: string | null,
  opts?: { includePending?: boolean; trade?: string },
): ContractorProfile[] {
  const rows = roster.filter((r) => {
    if (agencyId && r.agencyId !== agencyId) return false
    if (!opts?.includePending && r.status !== 'approved') return false
    if (opts?.includePending && r.status === 'suspended') return false
    // No category filter → any trade matches. With one: exact trade, or a
    // generalist covering everything (generalists surface in every picker).
    if (opts?.trade && !tradesInclude(r.trades, opts.trade) && !tradesInclude(r.trades, 'GENERAL'))
      return false
    return true
  })
  return rows
    .map((row) => {
      const user = users.find((u) => u.id === row.contractorUserId)
      if (!user || user.role !== 'contractor' || !user.active) return null
      if (!isVerificationApproved(user.verification, user.role)) return null
      return { user, roster: row }
    })
    .filter(Boolean) as ContractorProfile[]
}

/** Approved contractors for assignment dropdowns. */
export function listApprovedContractors(
  roster: AgencyContractor[],
  users: AppUser[],
  agencyId: string | null,
  categoryKey?: string | null,
): AppUser[] {
  return listAgencyContractorRoster(roster, users, agencyId, {
    trade: categoryKey ?? undefined,
  }).map((p) => p.user)
}

/** Contractors not yet on this agency's roster (any agency — vendors can serve multiple agencies). */
export function listContractorsAvailableForRoster(
  roster: AgencyContractor[],
  users: AppUser[],
  agencyId: string | null,
): AppUser[] {
  if (!agencyId) return []
  const onRoster = new Set(
    roster.filter((r) => r.agencyId === agencyId).map((r) => r.contractorUserId),
  )
  return users
    .filter((u) => u.role === 'contractor' && u.active && !onRoster.has(u.id))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function isContractorApprovedForAgency(
  roster: readonly AgencyContractor[],
  agencyId: string,
  contractorUserId: string,
): boolean {
  return roster.some(
    (r) =>
      r.agencyId === agencyId &&
      r.contractorUserId === contractorUserId &&
      r.status === 'approved',
  )
}

export function contractorMatchesCategory(
  rosterEntry: AgencyContractor,
  categoryKey?: string | null,
): boolean {
  if (!categoryKey) return true
  return tradesInclude(rosterEntry.trades, categoryKey) || tradesInclude(rosterEntry.trades, 'GENERAL')
}

export function syncTicketPhotoCount(ticket: MaintenanceTicket): MaintenanceTicket {
  const urls = ticket.photoUrls ?? []
  return { ...ticket, photos: urls.length > 0 ? urls.length : ticket.photos }
}

export function ticketsForContractor(
  tickets: MaintenanceTicket[],
  contractorUserId: string,
): MaintenanceTicket[] {
  return tickets.filter((t) => t.contractorId === contractorUserId)
}

export function openJobsForContractor(tickets: MaintenanceTicket[], contractorUserId: string) {
  return ticketsForContractor(tickets, contractorUserId).filter(
    (t) => t.status !== 'Completed' && t.status !== 'Cancelled',
  )
}

/** Agency ids where this contractor is on the approved roster. */
export function contractorApprovedAgencyIds(
  roster: readonly AgencyContractor[],
  contractorUserId: string,
): Set<string> {
  return new Set(
    roster
      .filter((r) => r.contractorUserId === contractorUserId && r.status === 'approved')
      .map((r) => r.agencyId),
  )
}

/** Whether a contractor may self-assign an open maintenance ticket. */
export function canContractorClaimTicket(
  user: Pick<AppUser, 'id' | 'role' | 'active' | 'verification'>,
  ticket: Pick<MaintenanceTicket, 'contractorId' | 'agencyId' | 'status'>,
  roster: readonly AgencyContractor[],
): boolean {
  if (user.role !== 'contractor' || !user.active) return false
  if (!isVerificationApproved(user.verification, user.role)) return false
  if (ticket.contractorId) return false
  if (ticket.status === 'Completed' || ticket.status === 'Cancelled') return false
  return isContractorApprovedForAgency(roster, ticket.agencyId, user.id)
}
