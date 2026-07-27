import type { AppState } from '../context/AppStore'
import type { PaymentRecord } from '../types/domain'

export type ReportTab =
  | 'overview'
  | 'pipeline'
  | 'sales'
  | 'occupancy'
  | 'team'
  | 'agents'
  | 'collections'
  | 'payments'
  | 'operations'
  | 'maintenance'

export function buildReportMetrics(
  state: AppState,
  agencyFilter: string | null,
  scopeAgency: (id: string | null | undefined) => boolean,
  /** When set (field agents / landlords / etc.), further limit to these property ids. */
  allowedPropertyIds?: ReadonlySet<string> | null,
) {
  const inScope = (agencyId: string | null | undefined) => {
    if (agencyFilter) return agencyId === agencyFilter
    return scopeAgency(agencyId)
  }
  const propOk = (propertyId: string) =>
    !allowedPropertyIds || allowedPropertyIds.has(propertyId)

  const properties = state.properties.filter((p) => inScope(p.agencyId) && propOk(p.id))
  const leads = state.leads.filter((l) => inScope(l.agencyId) && propOk(l.propertyId))
  const payments = state.payments.filter((p) => inScope(p.agencyId) && propOk(p.propertyId))
  const tickets = state.tickets.filter((t) => inScope(t.agencyId) && propOk(t.propertyId))
  const tenancies = state.tenancies.filter((t) => inScope(t.agencyId) && propOk(t.propertyId))
  const viewings = state.viewings.filter((v) => inScope(v.agencyId) && propOk(v.propertyId))
  const applications = state.applications.filter(
    (a) => inScope(a.agencyId) && propOk(a.propertyId),
  )
  const agents = state.users.filter(
    (u) =>
      u.active &&
      (u.role === 'ground_agent' || u.role === 'agent') &&
      inScope(u.agencyId),
  )

  const occupied = tenancies.filter((t) => t.status === 'Active').length
  const vacantUnits = Math.max(properties.length - occupied, 0)
  const occupancyPct = properties.length
    ? Math.round((occupied / Math.max(properties.length, 1)) * 100)
    : 0

  const openLeads = leads.filter(
    (l) => !['Lease Signed', 'Sale Completed', 'Rejected'].includes(l.stage),
  ).length
  const closedDeals = leads.filter((l) =>
    ['Lease Signed', 'Sale Completed'].includes(l.stage),
  ).length
  const conversionPct =
    leads.length > 0 ? Math.round((closedDeals / leads.length) * 100) : 0

  const overduePayments = payments.filter((p) => p.status === 'Overdue')
  const duePayments = payments.filter((p) => p.status === 'Due')
  const paidPayments = payments.filter((p) => p.status === 'Paid')
  const paidTotal = paidPayments.reduce((s, p) => s + (p.paidAmount ?? p.amount), 0)
  const overdueTotal = overduePayments.reduce((s, p) => s + p.amount, 0)
  const dueTotal = duePayments.reduce((s, p) => s + p.amount, 0)
  const collectible = paidTotal + overdueTotal + dueTotal
  const collectionPct = collectible > 0 ? Math.round((paidTotal / collectible) * 100) : 100

  const openTicketsList = tickets.filter(
    (t) => t.status !== 'Completed' && t.status !== 'Cancelled',
  )
  const openTickets = openTicketsList.length
  const highPriorityTickets = openTicketsList.filter((t) =>
    ['High', 'Urgent', 'Emergency'].includes(t.priority),
  ).length

  const scheduledViewings = viewings.filter((v) => v.status === 'Scheduled').length
  const completedViewings = viewings.filter((v) => v.status === 'Completed').length
  const noShowViewings = viewings.filter((v) => v.status === 'No-show').length

  const awaitingApps = applications.filter(
    (a) => a.progress < 100 && a.stage !== 'Active Tenancy' && a.stage !== 'Rejected',
  ).length
  const activeListings = properties.filter((p) =>
    ['Published', 'Featured', 'Under Offer'].includes(p.status),
  ).length

  const leadsByStage = Object.entries(
    leads.reduce<Record<string, number>>((acc, l) => {
      acc[l.stage] = (acc[l.stage] ?? 0) + 1
      return acc
    }, {}),
  ).map(([stage, count]) => ({ stage, count }))

  const ticketsByStatus = Object.entries(
    tickets.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1
      return acc
    }, {}),
  ).map(([status, count]) => ({ status, count }))

  const viewingsByStatus = Object.entries(
    viewings.reduce<Record<string, number>>((acc, v) => {
      acc[v.status] = (acc[v.status] ?? 0) + 1
      return acc
    }, {}),
  ).map(([status, count]) => ({ status, count }))

  const monthKey = (iso: string) => iso.slice(0, 7)
  const revenueByMonthMap = new Map<string, { month: string; paid: number; overdue: number }>()
  for (const p of payments) {
    const key = monthKey(p.paidAt ?? p.dueDate)
    const row = revenueByMonthMap.get(key) ?? { month: key, paid: 0, overdue: 0 }
    if (p.status === 'Paid') row.paid += p.paidAmount ?? p.amount
    if (p.status === 'Overdue') row.overdue += p.amount
    revenueByMonthMap.set(key, row)
  }
  const revenueByMonth = Array.from(revenueByMonthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month),
  )

  const agentRows = agents.map((a) => {
    const closed = leads.filter(
      (l) => l.agentId === a.id && ['Lease Signed', 'Sale Completed'].includes(l.stage),
    ).length
    const open = leads.filter(
      (l) =>
        l.agentId === a.id && !['Lease Signed', 'Sale Completed', 'Rejected'].includes(l.stage),
    ).length
    const props = properties.filter((p) => p.agentId === a.id).length
    const agentViewings = viewings.filter((v) => v.agentId === a.id).length
    const agentTickets = openTicketsList.filter((t) => t.assignedAgentId === a.id).length
    return {
      id: a.id,
      name: a.name,
      closed,
      openLeads: open,
      properties: props,
      viewings: agentViewings,
      openTickets: agentTickets,
    }
  }).sort((a, b) => b.closed - a.closed || b.openLeads - a.openLeads)

  const outstandingPayments: PaymentRecord[] = [...overduePayments, ...duePayments].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  )

  return {
    kpis: {
      properties: properties.length,
      occupancyPct,
      vacantUnits,
      activeListings,
      openLeads,
      closedDeals,
      conversionPct,
      paidTotal,
      overdueTotal,
      dueTotal,
      collectionPct,
      openTickets,
      highPriorityTickets,
      activeTenancies: occupied,
      scheduledViewings,
      completedViewings,
      noShowViewings,
      awaitingApps,
      teamSize: agents.length,
    },
    leadsByStage,
    ticketsByStatus,
    viewingsByStatus,
    revenueByMonth,
    agentRows,
    outstandingPayments: outstandingPayments.slice(0, 50),
  }
}
