import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useStore } from '../context/AppStore'
import { useAgencyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { DashboardTabs } from '../components/dashboard/DashboardTabs'
import { HistoryTimeline } from '../components/history/HistoryTimeline'
import { TeamDetailHeader } from '../components/team-detail/TeamDetailHeader'
import { TeamOverviewPanel } from '../components/team-detail/TeamOverviewPanel'
import { TeamDetailsPanel } from '../components/team-detail/TeamDetailsPanel'
import { TeamWorkloadPanel } from '../components/team-detail/TeamWorkloadPanel'
import { isTeamDetailTab, type TeamDetailTab } from '../components/team-detail/types'
import type { PropertyEvent } from '../types/domain'

const STAFF_ROLES = ['client_admin', 'agent_admin', 'ground_agent', 'agent', 'super_admin'] as const

export default function StaffDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { state } = useStore()
  const { scopeAgency, agencyId } = useAgencyScope()

  const user = state.users.find((u) => u.id === id)

  const tabParam = params.get('tab')
  const tab: TeamDetailTab = isTeamDetailTab(tabParam) ? tabParam : 'overview'
  const setTab = (next: string) => {
    const sp = new URLSearchParams(params)
    if (next === 'overview') sp.delete('tab')
    else sp.set('tab', next)
    setParams(sp, { replace: true })
  }

  const inScope = useMemo(() => {
    if (!user) return false
    if (!STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number])) return false
    if (user.role === 'super_admin') return true
    return scopeAgency(user.agencyId)
  }, [user, scopeAgency])

  const stats = useMemo(() => {
    if (!user) {
      return {
        closedDeals: 0,
        openLeads: [] as Array<{ lead: (typeof state.leads)[number]; propertyTitle: string }>,
        closedCount: 0,
        properties: [] as typeof state.properties,
      }
    }
    const closed = state.leads.filter(
      (l) => l.agentId === user.id && ['Lease Signed', 'Sale Completed'].includes(l.stage),
    )
    const open = state.leads
      .filter(
        (l) =>
          l.agentId === user.id && !['Lease Signed', 'Sale Completed', 'Rejected'].includes(l.stage),
      )
      .map((lead) => ({
        lead,
        propertyTitle: state.properties.find((p) => p.id === lead.propertyId)?.title ?? lead.propertyId,
      }))
    const properties = state.properties.filter((p) => p.agentId === user.id)
    return {
      closedDeals: closed.length,
      openLeads: open,
      closedCount: closed.length,
      properties,
    }
  }, [user, state.leads, state.properties])

  const historyEvents = useMemo(() => {
    if (!user) return [] as PropertyEvent[]
    const name = user.name.toLowerCase()
    const related = state.propertyEvents.filter(
      (ev) => ev.actorUserId === user.id || ev.actorName.toLowerCase() === name,
    )
    const activities = state.activities
      .filter(
        (a) =>
          a.user.toLowerCase() === name ||
          a.text.toLowerCase().includes(name) ||
          (user.agencyId && a.agencyId === user.agencyId && a.user === user.name),
      )
      .map(
        (a): PropertyEvent => ({
          id: `act-${a.id}`,
          agencyId: a.agencyId ?? user.agencyId ?? '',
          propertyId: related[0]?.propertyId ?? stats.properties[0]?.id ?? '—',
          actorUserId: user.id,
          actorName: a.user,
          action: a.text,
          at: a.at,
        }),
      )

    const synthetic: PropertyEvent[] = [
      {
        id: `synth-team-${user.id}`,
        agencyId: user.agencyId ?? '',
        propertyId: stats.properties[0]?.id ?? '—',
        actorUserId: null,
        actorName: 'System',
        action: 'added a Team member',
        at: related[0]?.at ?? new Date().toISOString(),
        changes: [
          { field: 'Person', from: 'None', to: user.name },
          { field: 'Role', from: 'None', to: user.role },
        ],
      },
    ]

    const byId = new Map<string, PropertyEvent>()
    for (const ev of [...synthetic, ...related, ...activities]) byId.set(ev.id, ev)
    return [...byId.values()]
  }, [user, state.propertyEvents, state.activities, stats.properties])

  if (!user) return <Navigate to="/workspace/people/staff" replace />
  if (!inScope) return <Navigate to="/workspace/people/staff" replace />

  const agency = state.agencies.find((a) => a.id === user.agencyId)
  const agencyName =
    agency?.name ?? (user.role === 'super_admin' ? 'Platform' : agencyId ?? '—')

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
    {
      id: 'workload',
      label: 'Workload',
      count: stats.openLeads.length + stats.properties.length,
    },
    { id: 'history', label: 'History', count: historyEvents.length },
  ]

  return (
    <RequirePermission permission="users.manage">
      <div className="animate-fade-in">
        <TeamDetailHeader user={user} />

        <div className="sticky top-0 z-20 -mx-1 mb-5 bg-white/95 px-1 backdrop-blur-md">
          <DashboardTabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        {tab === 'overview' && (
          <TeamOverviewPanel
            user={user}
            agencyName={agencyName}
            closedDeals={stats.closedDeals}
            openLeads={stats.openLeads.length}
            assignedProperties={stats.properties.length}
          />
        )}
        {tab === 'details' && <TeamDetailsPanel user={user} agencyName={agencyName} />}
        {tab === 'workload' && (
          <TeamWorkloadPanel openLeads={stats.openLeads} properties={stats.properties} />
        )}
        {tab === 'history' && (
          <HistoryTimeline
            events={historyEvents}
            subtitle="Actions and notes associated with this team member."
          />
        )}
      </div>
    </RequirePermission>
  )
}
