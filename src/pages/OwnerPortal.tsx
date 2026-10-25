import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { ViewingEvidenceBadge } from '../components/applications/ViewingEvidenceBadge'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { AttentionHero, DashboardBreadcrumb, DashboardPage } from '../components/dashboard'
import { DashboardTabs } from '../components/dashboard/DashboardTabs'
import { Badge, Button, Card, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'
import { useAgentDisplay } from '../hooks/useAgentDisplay'
import {
  getAvailableTransitions,
  resolveWorkflowStatus,
  workflowStageLabel,
} from '../lib/applicationWorkflow'
import { groupPortfolioByBuilding } from '../lib/buildingHierarchy'
import { gradingLabel } from '../lib/buildingGrading'
import { rolePermissions } from '../lib/permissions'
import { OwnerMessagesPanel } from '../components/messaging/OwnerMessagesPanel'
import { PortalHydrationGate } from '../components/PortalHydrationGate'
import { propertyRefLabel } from '../lib/propertyRefs'

const ICON_STROKE = 1.6

export default function OwnerPortal() {
  return (
    <PortalHydrationGate>
      <OwnerPortalContent />
    </PortalHydrationGate>
  )
}

function OwnerPortalContent() {
  const { state, advanceApplicationWorkflow } = useStore()
  const { user, has } = useAuth()
  const { listedBy } = useAgentDisplay()
  const { allowedPropertyIds, paymentVisible, ticketVisible } = usePropertyScope()
  const [busyAppId, setBusyAppId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const scoped = useMemo(() => {
    return state.properties.filter((p) => allowedPropertyIds.has(p.id))
  }, [state.properties, allowedPropertyIds])

  const propertyById = useMemo(
    () => Object.fromEntries(state.properties.map((p) => [p.id, p])),
    [state.properties],
  )

  /** Building → Units grouping for complexes. */
  const complexes = useMemo(
    () =>
      groupPortfolioByBuilding(
        scoped.map((property) => ({ property })),
        state.buildings,
      ),
    [scoped, state.buildings],
  )

  const payments = useMemo(() => {
    return state.payments
      .filter((p) => {
        if (!p.landlordVisible) return false
        const prop = propertyById[p.propertyId]
        return paymentVisible(p, { propertyLandlordId: prop?.landlordId ?? null })
      })
      .sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''))
  }, [state.payments, propertyById, paymentVisible])

  const collected = payments.filter((p) => p.status === 'Paid').reduce((n, p) => n + p.amount, 0)
  const due = payments
    .filter((p) => p.status === 'Due' || p.status === 'Overdue')
    .reduce((n, p) => n + p.amount, 0)
  const overdueAmt = payments
    .filter((p) => p.status === 'Overdue')
    .reduce((n, p) => n + p.amount, 0)

  const tickets = useMemo(
    () =>
      state.tickets
        .filter((t) => ticketVisible(t) && t.status !== 'Completed' && t.status !== 'Cancelled')
        .sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? '')),
    [state.tickets, ticketVisible],
  )

  const landlordPerms = useMemo(() => rolePermissions.landlord, [])
  const pendingReviews = useMemo(() => {
    if (!has('portal.owner')) return []
    return state.applications
      .filter((app) => {
        if (!allowedPropertyIds.has(app.propertyId)) return false
        return resolveWorkflowStatus(app) === 'landlord_review'
      })
      .sort((a, b) => (b.updatedAt ?? b.submittedAt ?? '').localeCompare(a.updatedAt ?? a.submittedAt ?? ''))
  }, [state.applications, allowedPropertyIds, has])

  const rented = scoped.filter((p) => p.status === 'Rented').length
  const occupancy = scoped.length ? Math.round((rented / scoped.length) * 100) : 0
  const featured = scoped[0]

  async function runLandlordDecision(
    applicationId: string,
    targetStatus: 'conditionally_approved' | 'rejected',
  ) {
    const app = state.applications.find((a) => a.id === applicationId)
    if (!app) return
    const transition = getAvailableTransitions(app, landlordPerms).find((t) => t.to === targetStatus)
    if (!transition) return
    if (transition.confirm && typeof window !== 'undefined' && !window.confirm(transition.confirm)) {
      return
    }
    setBusyAppId(applicationId)
    try {
      await advanceApplicationWorkflow({
        applicationId,
        actorUserId: user.id,
        targetStatus,
      })
    } finally {
      setBusyAppId(null)
    }
  }

  const overdueCount = payments.filter((p) => p.status === 'Overdue').length
  const dueCount = payments.filter((p) => p.status === 'Due' || p.status === 'Overdue').length

  type OwnerTab = 'review' | 'properties' | 'payments' | 'maintenance' | 'messages'
  const tabs = [
    ...(pendingReviews.length ? [{ id: 'review', label: 'To review', count: pendingReviews.length }] : []),
    { id: 'properties', label: 'Properties', count: scoped.length || undefined },
    { id: 'payments', label: 'Payments', count: dueCount || undefined },
    { id: 'maintenance', label: 'Maintenance', count: tickets.length || undefined },
    { id: 'messages', label: 'Messages' },
  ]
  const asked = searchParams.get('tab') as OwnerTab | null
  const tab: OwnerTab =
    asked && tabs.some((t) => t.id === asked) ? asked : pendingReviews.length ? 'review' : 'properties'
  const setTab = (next: string) => {
    const sp = new URLSearchParams(searchParams)
    sp.set('tab', next)
    setSearchParams(sp, { replace: true })
  }

  // One hero: the decision waiting on the owner, else their portfolio.
  const hero = pendingReviews.length
    ? {
        image: propertyById[pendingReviews[0].propertyId]?.images[0],
        eyebrow: 'Needs your decision',
        title: `${pendingReviews.length} applicant${pendingReviews.length === 1 ? '' : 's'} waiting for your approval`,
        detail: 'The agency sent these applicants to you. Approve or decline — the agency handles the lease.',
        badge: 'Action needed',
        badgeTone: 'warning' as const,
        cta: { label: 'Review applicants', to: '/workspace/portals/owner?tab=review' },
      }
    : {
        image: featured?.images[0],
        eyebrow: 'Landlord portal',
        title: `Welcome, ${user.name.split(' ')[0]}`,
        detail: 'Your properties, rent received and maintenance, managed by your agency.',
        badge: overdueCount ? `${overdueCount} overdue` : 'All up to date',
        badgeTone: overdueCount ? ('danger' as const) : ('success' as const),
        cta: {
          label: 'Documents',
          to: '/workspace/operations/documents',
          icon: <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />,
        },
      }

  const emptyRow = (text: string) => <li className="py-8 text-center text-sm text-ink-500">{text}</li>
  const sectionHead = (title: string, to: string, linkLabel: string, note?: string) => (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {note ? <p className="mt-0.5 text-sm text-ink-500">{note}</p> : null}
      </div>
      <Link to={to} className="text-sm font-semibold text-primary hover:underline">
        {linkLabel}
      </Link>
    </div>
  )

  return (
    <RequirePermission permission="portal.owner">
      <DashboardPage>
        <DashboardBreadcrumb items={[{ label: 'Dashboard', to: '/workspace' }, { label: 'Owner portal' }]} />

        <AttentionHero
          {...hero}
          stats={[
            { label: 'Properties', value: String(scoped.length) },
            { label: 'Occupancy', value: `${occupancy}%` },
            { label: 'Rent received', value: formatZAR(collected) },
            { label: 'Outstanding', value: formatZAR(due) },
          ]}
        />

        <DashboardTabs tabs={tabs} value={tab} onChange={setTab} />

        {tab === 'review' ? (
          <Card className="p-5">
            <ul className="divide-y divide-primary-50">
              {pendingReviews.map((app) => {
                const prop = propertyById[app.propertyId]
                const busy = busyAppId === app.id
                const actions = getAvailableTransitions(app, landlordPerms)
                const canApprove = actions.some((t) => t.to === 'conditionally_approved')
                const canReject = actions.some((t) => t.to === 'rejected')
                return (
                  <li key={app.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{app.applicantName}</p>
                      <p className="text-sm text-ink-500">
                        {prop?.title ?? propertyRefLabel(app.propertyId)} ·{' '}
                        {workflowStageLabel(app.type, resolveWorkflowStatus(app))}
                      </p>
                      <div className="mt-2">
                        <ViewingEvidenceBadge evidence={app.viewingEvidence} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canApprove ? (
                        <Button
                          className="min-h-11 cursor-pointer"
                          disabled={busy}
                          onClick={() => void runLandlordDecision(app.id, 'conditionally_approved')}
                        >
                          {busy ? 'Saving…' : 'Approve'}
                        </Button>
                      ) : null}
                      {canReject ? (
                        <Button
                          variant="secondary"
                          className="min-h-11 cursor-pointer"
                          disabled={busy}
                          onClick={() => void runLandlordDecision(app.id, 'rejected')}
                        >
                          Decline
                        </Button>
                      ) : null}
                      <Link
                        to={`/workspace/properties/${app.propertyId}?tab=applicants`}
                        className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary hover:underline"
                      >
                        Details
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        ) : null}

        {tab === 'properties' ? (
          <Card className="p-5">
            {sectionHead('Your properties', '/workspace/properties', 'View all')}
            {scoped.length === 0 ? (
              <div className="rounded-2xl bg-primary-50/50 p-6 text-center">
                <p className="font-semibold text-ink">No properties yet</p>
                <p className="mt-2 text-sm text-ink-500">Add a property so your agency can list it.</p>
                <Link
                  to="/workspace/properties/new"
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600"
                >
                  Add property
                </Link>
              </div>
            ) : (
              <div className="space-y-5">
                {complexes.map((group) => (
                  <div key={group.key}>
                    {group.building || group.unitCount > 1 ? (
                      <div className="mb-2 flex flex-wrap items-baseline gap-2">
                        <h3 className="text-sm font-semibold text-ink">{group.label}</h3>
                        {group.building?.grading ? <Badge tone="brand">{gradingLabel(group.building.grading)}</Badge> : null}
                        <p className="text-xs text-ink-400">
                          {group.unitCount} unit{group.unitCount === 1 ? '' : 's'}
                          {group.suburbCity ? ` · ${group.suburbCity}` : ''}
                        </p>
                      </div>
                    ) : null}
                    <ul className="divide-y divide-primary-50">
                      {group.items.map(({ property: p }) => {
                        const agent = state.users.find((u) => u.id === p.agentId)
                        const managedBy = listedBy(p.agentId, agent?.name, 'agency')
                        const propOutstanding = payments
                          .filter((x) => x.propertyId === p.id && (x.status === 'Due' || x.status === 'Overdue'))
                          .reduce((n, x) => n + x.amount, 0)
                        return (
                          <li key={p.id}>
                            <Link
                              to={`/workspace/properties/${p.id}`}
                              className="flex items-center gap-4 rounded-xl py-3 hover:bg-primary-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              {p.images[0] ? (
                                <img src={p.images[0]} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
                              ) : null}
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-ink">{p.title}</p>
                                <p className="truncate text-xs text-ink-500">
                                  {p.suburb}
                                  {managedBy ? ` · ${managedBy}` : ''}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="tabular text-sm font-semibold text-ink">
                                  {p.rent ? `${formatZAR(p.rent)}/mo` : formatZAR(p.price)}
                                </p>
                                {propOutstanding > 0 ? (
                                  <p className="tabular text-xs text-accent-700">{formatZAR(propOutstanding)} due</p>
                                ) : null}
                              </div>
                              <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : null}

        {tab === 'payments' ? (
          <Card className="p-5">
            {sectionHead(
              'Payments',
              '/workspace/operations/payments',
              'All payments',
              overdueAmt > 0 ? `${formatZAR(overdueAmt)} overdue` : 'Rent and deposits on your properties.',
            )}
            <ul className="divide-y divide-primary-50">
              {payments.slice(0, 10).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {p.type} · {propertyById[p.propertyId]?.title ?? propertyRefLabel(p.propertyId)}
                    </p>
                    <p className="text-xs text-ink-400">
                      {p.partyName} · Due {p.dueDate ?? '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="tabular font-semibold text-ink">{formatZAR(p.amount)}</p>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </div>
                </li>
              ))}
              {payments.length === 0 ? emptyRow('No payments on your properties yet.') : null}
            </ul>
          </Card>
        ) : null}

        {tab === 'maintenance' ? (
          <Card className="p-5">
            {sectionHead('Open maintenance', '/workspace/operations/maintenance', 'View all', 'Your agency assigns contractors.')}
            <ul className="divide-y divide-primary-50">
              {tickets.slice(0, 10).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{t.title}</p>
                    <p className="text-xs text-ink-400">
                      {propertyById[t.propertyId]?.title ?? propertyRefLabel(t.propertyId)} · {t.priority}
                    </p>
                  </div>
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                </li>
              ))}
              {tickets.length === 0 ? emptyRow('No open maintenance on your properties.') : null}
            </ul>
          </Card>
        ) : null}

        {tab === 'messages' ? <OwnerMessagesPanel /> : null}
      </DashboardPage>
    </RequirePermission>
  )
}
