import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { DashboardTabs } from '../components/dashboard/DashboardTabs'
import { HistoryTimeline } from '../components/history/HistoryTimeline'
import { LeadDetailHeader } from '../components/lead-detail/LeadDetailHeader'
import { LeadOverviewPanel } from '../components/lead-detail/LeadOverviewPanel'
import { LeadDetailsPanel } from '../components/lead-detail/LeadDetailsPanel'
import { LeadDealPanel } from '../components/lead-detail/LeadDealPanel'
import { LeadActivityPanel } from '../components/lead-detail/LeadActivityPanel'
import { CloseLeadModal } from '../components/lead-detail/CloseLeadModal'
import { isLeadDetailTab, type LeadDetailTab } from '../components/lead-detail/types'
import { canCloseLead } from '../lib/leadLifecycle'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import type { PropertyEvent } from '../types/domain'

export default function LeadDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { state, updateLeadStage, closeLead, addActivity, addPropertyEvent } = useStore()
  const { user, has } = useAuth()
  const { dealVisible } = usePropertyScope()
  const alert = useSuiteAlert()
  const navigate = useNavigate()
  const [note, setNote] = useState('')
  const [closeOpen, setCloseOpen] = useState(false)

  const lead = state.leads.find((l) => l.id === id)
  const property = lead ? state.properties.find((p) => p.id === lead.propertyId) ?? null : null
  const agent = lead?.agentId ? state.users.find((u) => u.id === lead.agentId) : null

  const tabParam = params.get('tab')
  const tab: LeadDetailTab = isLeadDetailTab(tabParam) ? tabParam : 'overview'
  const setTab = (next: string) => {
    const sp = new URLSearchParams(params)
    if (next === 'overview') sp.delete('tab')
    else sp.set('tab', next)
    setParams(sp, { replace: true })
  }

  const inScope = useMemo(() => {
    if (!lead) return false
    return dealVisible(lead)
  }, [lead, dealVisible])

  const historyEvents = useMemo(() => {
    if (!lead) return [] as PropertyEvent[]
    const related = state.propertyEvents.filter((ev) => {
      if (ev.propertyId !== lead.propertyId) return false
      const hay = `${ev.action} ${(ev.changes ?? []).map((c) => `${c.from} ${c.to}`).join(' ')}`.toLowerCase()
      return /lead|enquiry|stage|viewing|offer|lease|sale/i.test(ev.action) || hay.includes(lead.name.toLowerCase())
    })

    const synthetic: PropertyEvent[] = [
      {
        id: `synth-lead-create-${lead.id}`,
        agencyId: lead.agencyId,
        propertyId: lead.propertyId,
        actorUserId: lead.agentId,
        actorName: agent?.name ?? 'Agency',
        action: 'captured a Lead',
        at: lead.createdAt,
        changes: [
          { field: 'Lead', from: 'None', to: lead.id },
          { field: 'Channel', from: 'None', to: lead.channel },
        ],
      },
    ]

    if (lead.updatedAt !== lead.createdAt) {
      synthetic.push({
        id: `synth-lead-update-${lead.id}`,
        agencyId: lead.agencyId,
        propertyId: lead.propertyId,
        actorUserId: lead.agentId,
        actorName: agent?.name ?? 'Agency',
        action: 'updated the Lead',
        at: lead.updatedAt,
        changes: [{ field: 'Stage', from: '—', to: lead.stage }],
      })
    }

    const noteActivities = state.activities
      .filter((a) => a.agencyId === lead.agencyId && a.text.toLowerCase().includes(lead.name.toLowerCase()))
      .map(
        (a): PropertyEvent => ({
          id: `act-${a.id}`,
          agencyId: lead.agencyId,
          propertyId: lead.propertyId,
          actorUserId: null,
          actorName: a.user,
          action: a.text,
          at: a.at,
        }),
      )

    const byId = new Map<string, PropertyEvent>()
    for (const ev of [...synthetic, ...related, ...noteActivities]) byId.set(ev.id, ev)
    return [...byId.values()]
  }, [lead, state.propertyEvents, state.activities, agent])

  if (!lead) return <Navigate to="/workspace/sales/crm" replace />
  if (!inScope) return <Navigate to="/workspace/sales/crm" replace />

  const canManage = has('leads.manage')
  const canClose = canCloseLead(lead, { userId: user.id, canManageLeads: canManage })
  const agentName = agent?.name ?? null

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
    { id: 'deal', label: 'Progress' },
    { id: 'activity', label: 'Activity' },
    { id: 'history', label: 'History', count: historyEvents.length },
  ]

  return (
    <RequirePermission permission="leads.view">
      <div className="animate-fade-in">
        <LeadDetailHeader
          lead={lead}
          canManage={canManage}
          canClose={canClose}
          onClose={() => setCloseOpen(true)}
        />

        <div className="sticky top-0 z-20 -mx-1 mb-5 bg-white/95 px-1 backdrop-blur-md">
          <DashboardTabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        {tab === 'overview' && (
          <LeadOverviewPanel lead={lead} property={property} agentName={agentName} />
        )}
        {tab === 'details' && <LeadDetailsPanel lead={lead} agentName={agentName} />}
        {tab === 'deal' && (
          <LeadDealPanel
            lead={lead}
            property={property}
            agentName={agentName}
            canManage={canManage}
            applications={state.applications}
            viewings={state.viewings}
            payments={state.payments}
            activities={state.activities}
            onStageChange={(stage) => {
              const prev = lead.stage
              updateLeadStage(lead.id, stage)
              addPropertyEvent({
                agencyId: lead.agencyId,
                propertyId: lead.propertyId,
                actorUserId: user.id,
                actorName: user.name,
                action: 'changed the Lead stage',
                changes: [{ field: 'Stage', from: prev, to: stage }],
              })
            }}
          />
        )}
        {tab === 'activity' && (
          <LeadActivityPanel
            lead={lead}
            canManage={canManage}
            note={note}
            onNoteChange={setNote}
            onLogNote={() => {
              if (!note.trim()) return
              addActivity(`Note on ${lead.name}: ${note.trim()}`, user.name, lead.agencyId)
              setNote('')
            }}
          />
        )}
        {tab === 'history' && (
          <HistoryTimeline
            events={historyEvents}
            subtitle="Timeline of stage changes, notes, and related property actions for this lead."
          />
        )}

        <CloseLeadModal
          open={closeOpen}
          leadName={lead.name}
          onClose={() => setCloseOpen(false)}
          onConfirm={(reason) => {
            const prev = lead
            const result = closeLead(prev.id, reason)
            if (result.ok === false) {
              void alert.success({ title: 'Could not close lead', text: result.reason, tone: 'danger' })
              return
            }
            addPropertyEvent({
              agencyId: prev.agencyId,
              propertyId: prev.propertyId,
              actorUserId: user.id,
              actorName: user.name,
              action: 'closed a Lead',
              changes: [
                { field: 'Stage', from: prev.stage, to: 'Rejected' },
                { field: 'Reason', from: '—', to: reason },
              ],
            })
            void alert.success({
              title: 'Lead closed',
              text: `${prev.name} was moved to History.`,
            })
            navigate('/workspace/sales/crm?tab=history')
          }}
        />
      </div>
    </RequirePermission>
  )
}
