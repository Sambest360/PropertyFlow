import type { AgencyContractor, AppUser, MaintenanceTicket } from '../types/domain'
import { isVerificationApproved } from './verification'

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
    if (opts?.trade && !r.trades.includes(opts.trade)) return false
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
  roster: AgencyContractor[],
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
  return rosterEntry.trades.includes(categoryKey) || rosterEntry.trades.includes('GENERAL')
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
