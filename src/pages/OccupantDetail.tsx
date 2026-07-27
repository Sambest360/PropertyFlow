import { useMemo } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { DashboardTabs } from '../components/dashboard/DashboardTabs'
import { HistoryTimeline } from '../components/history/HistoryTimeline'
import { TenantDetailHeader } from '../components/tenant-detail/TenantDetailHeader'
import { TenantOverviewPanel } from '../components/tenant-detail/TenantOverviewPanel'
import { TenantDetailsPanel } from '../components/tenant-detail/TenantDetailsPanel'
import { TenantLeasePanel } from '../components/tenant-detail/TenantLeasePanel'
import { TenantPaymentsPanel } from '../components/tenant-detail/TenantPaymentsPanel'
import { isTenantDetailTab, type TenantDetailTab } from '../components/tenant-detail/types'
import type { PropertyEvent } from '../types/domain'

export default function OccupantDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { state } = useStore()
  const { dealVisible } = usePropertyScope()

  const tenancy = state.tenancies.find((t) => t.id === id)
  const property = tenancy
    ? state.properties.find((p) => p.id === tenancy.propertyId) ?? null
    : null
  const agent = tenancy?.agentId ? state.users.find((u) => u.id === tenancy.agentId) : null
  const landlord = tenancy
    ? state.users.find((u) => u.id === tenancy.landlordId)
    : null

  const tabParam = params.get('tab')
  const tab: TenantDetailTab = isTenantDetailTab(tabParam) ? tabParam : 'overview'
  const setTab = (next: string) => {
    const sp = new URLSearchParams(params)
    if (next === 'overview') sp.delete('tab')
    else sp.set('tab', next)
    setParams(sp, { replace: true })
  }

  const inScope = useMemo(() => {
    if (!tenancy) return false
    return dealVisible(tenancy)
  }, [tenancy, dealVisible])

  const payments = useMemo(() => {
    if (!tenancy) return []
    return state.payments.filter(
      (p) =>
        p.tenancyId === tenancy.id ||
        (p.applicationId && p.applicationId === tenancy.applicationId) ||
        (p.propertyId === tenancy.propertyId &&
          (p.partyName === tenancy.tenantName || p.partyUserId === tenancy.tenantUserId)),
    )
  }, [tenancy, state.payments])

  const historyEvents = useMemo(() => {
    if (!tenancy) return [] as PropertyEvent[]
    const name = tenancy.tenantName.toLowerCase()
    const related = state.propertyEvents.filter((ev) => {
      if (ev.propertyId !== tenancy.propertyId) return false
      const hay = `${ev.action} ${(ev.changes ?? []).map((c) => `${c.from} ${c.to}`).join(' ')}`.toLowerCase()
      return (
        /tenant|lease|move-in|key|occupan|payment|deposit/i.test(ev.action) ||
        hay.includes(name) ||
        (tenancy.applicationId ? hay.includes(tenancy.applicationId.toLowerCase()) : false)
      )
    })

    const synthetic: PropertyEvent[] = [
      {
        id: `synth-lease-start-${tenancy.id}`,
        agencyId: tenancy.agencyId,
        propertyId: tenancy.propertyId,
        actorUserId: tenancy.agentId,
        actorName: agent?.name ?? 'Agency',
        action: 'started a Lease',
        at: tenancy.startDate,
        changes: [
          { field: 'Tenant', from: 'None', to: tenancy.tenantName },
          { field: 'Rent', from: 'None', to: String(tenancy.rent) },
          { field: 'Status', from: 'None', to: tenancy.status },
        ],
      },
    ]

    if (tenancy.endDate) {
      synthetic.push({
        id: `synth-lease-end-${tenancy.id}`,
        agencyId: tenancy.agencyId,
        propertyId: tenancy.propertyId,
        actorUserId: tenancy.agentId,
        actorName: agent?.name ?? 'Agency',
        action: tenancy.status === 'Ended' ? 'ended a Lease' : 'scheduled lease end',
        at: tenancy.endDate,
        changes: [{ field: 'End date', from: 'Open-ended', to: tenancy.endDate }],
      })
    }

    const byId = new Map<string, PropertyEvent>()
    for (const ev of [...synthetic, ...related]) byId.set(ev.id, ev)
    return [...byId.values()]
  }, [tenancy, state.propertyEvents, agent])

  if (!tenancy) return <Navigate to="/workspace/people/tenants" replace />
  if (!inScope) return <Navigate to="/workspace/people/tenants" replace />

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
    { id: 'lease', label: 'Lease' },
    { id: 'payments', label: 'Payments', count: payments.length },
    { id: 'history', label: 'History', count: historyEvents.length },
  ]

  return (
    <RequirePermission permission="occupants.view">
      <div className="animate-fade-in">
        <TenantDetailHeader tenancy={tenancy} />

        <div className="sticky top-0 z-20 -mx-1 mb-5 bg-white/95 px-1 backdrop-blur-md">
          <DashboardTabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        {tab === 'overview' && (
          <TenantOverviewPanel
            tenancy={tenancy}
            property={property}
            agentName={agent?.name ?? null}
          />
        )}
        {tab === 'details' && (
          <TenantDetailsPanel
            tenancy={tenancy}
            agentName={agent?.name ?? null}
            landlordName={landlord?.name ?? null}
          />
        )}
        {tab === 'lease' && <TenantLeasePanel tenancy={tenancy} />}
        {tab === 'payments' && <TenantPaymentsPanel payments={payments} />}
        {tab === 'history' && (
          <HistoryTimeline
            events={historyEvents}
            subtitle="Lease milestones and related property actions for this tenant."
          />
        )}
      </div>
    </RequirePermission>
  )
}
