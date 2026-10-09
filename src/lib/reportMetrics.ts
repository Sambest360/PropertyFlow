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
  | 'owner-statement'
  | 'rent-roll'

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

  const propertiesBySuburb = Object.entries(
    properties.reduce<Record<string, number>>((acc, p) => {
      const key = p.suburb?.trim() || 'Unknown'
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {}),
  )
    .map(([suburb, count]) => ({ suburb, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const collectionsBreakdown = [
    { name: 'Collected', value: paidTotal, tone: 'primary' as const },
    { name: 'Due', value: dueTotal, tone: 'warning' as const },
    { name: 'Overdue', value: overdueTotal, tone: 'danger' as const },
  ].filter((row) => row.value > 0)

  const collectionsTotal = paidTotal + dueTotal + overdueTotal

  const weekKey = (iso: string | undefined) => {
    if (!iso) return 'unknown'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
    const start = new Date(d)
    start.setDate(d.getDate() - d.getDay())
    return start.toISOString().slice(0, 10)
  }
  const openPipelineByWeek = (() => {
    const open = leads.filter(
      (l) => !['Lease Signed', 'Sale Completed', 'Rejected'].includes(l.stage),
    )
    const map = new Map<string, number>()
    for (const l of open) {
      const key = weekKey(l.createdAt)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-4)
  })()

  const agentUtilization = (() => {
    let busy = 0
    let active = 0
    let idle = 0
    for (const row of agentRows) {
      if (row.openLeads >= 3 || row.openTickets > 0) busy += 1
      else if (row.openLeads > 0 || row.properties > 0 || row.viewings > 0) active += 1
      else idle += 1
    }
    const total = Math.max(busy + active + idle, 1)
    return {
      busy,
      active,
      idle,
      busyPct: Math.round((busy / total) * 100),
      activePct: Math.round((active / total) * 100),
      idlePct: Math.round((idle / total) * 100),
    }
  })()

  const monthTrend = (() => {
    if (revenueByMonth.length < 2) return { paid: 0, overdue: 0, collection: 0 }
    const prev = revenueByMonth[revenueByMonth.length - 2]
    const last = revenueByMonth[revenueByMonth.length - 1]
    const pct = (cur: number, prevVal: number) =>
      prevVal > 0 ? Math.round(((cur - prevVal) / prevVal) * 100) : cur > 0 ? 100 : 0
    return {
      paid: pct(last.paid, prev.paid),
      overdue: pct(last.overdue, prev.overdue),
      collection: collectionPct,
    }
  })()

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
    propertiesBySuburb,
    collectionsBreakdown,
    collectionsTotal,
    openPipelineByWeek,
    agentUtilization,
    monthTrend,
  }
}
