import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Banknote,
  Building,
  ClipboardList,
  FileText,
  Home,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import {
  AttentionHero,
  DashboardBreadcrumb,
  DashboardPage,
  SectionBanner,
} from '../components/dashboard'
import { Badge, Button, Card, StatCard, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'
import { useAgentDisplay } from '../hooks/useAgentDisplay'
import {
  getAvailableTransitions,
  resolveWorkflowStatus,
  workflowStageLabel,
} from '../lib/applicationWorkflow'
import { rolePermissions } from '../lib/permissions'

const ICON_STROKE = 1.6

export default function OwnerPortal() {
  const { state, advanceApplicationWorkflow } = useStore()
  const { user, has } = useAuth()
  const { listedBy } = useAgentDisplay()
  const { allowedPropertyIds, paymentVisible, ticketVisible } = usePropertyScope()
  const [busyAppId, setBusyAppId] = useState<string | null>(null)

  const scoped = useMemo(() => {
    return state.properties.filter((p) => allowedPropertyIds.has(p.id))
  }, [state.properties, allowedPropertyIds])

  const propertyById = useMemo(
    () => Object.fromEntries(state.properties.map((p) => [p.id, p])),
    [state.properties],
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

  return (
    <RequirePermission permission="portal.owner">
      <DashboardPage>
        <DashboardBreadcrumb
          items={[
            { label: 'Dashboard', to: '/workspace' },
            { label: 'Owner portal' },
          ]}
        />

        <AttentionHero
          image={featured?.images[0]}
          eyebrow="Landlord portal"
          title={featured?.title ?? `Welcome, ${user.name.split(' ')[0]}`}
          detail="Your assets, rent receipts, and open works. Messaging with tenants stays with the agency."
          badge={featured?.status ?? 'Owner'}
          badgeTone="brand"
          secondaryBadge={featured?.type}
          stats={[
            { label: 'Assets', value: String(scoped.length) },
            { label: 'Occupancy', value: `${occupancy}%` },
            { label: 'Collected', value: formatZAR(collected) },
          ]}
          cta={{
            label: 'Documents',
            to: '/workspace/operations/documents',
            icon: <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />,
          }}
          secondaryCta={
            featured ? { label: 'Open property', to: `/workspace/properties/${featured.id}` } : undefined
          }
          propertyLink={
            featured
              ? { to: `/workspace/properties/${featured.id}` }
              : { to: '/workspace', label: 'Dashboard' }
          }
        />

        {pendingReviews.length > 0 && (
          <SectionBanner
            tone="warning"
            text={`${pendingReviews.length} applicant${pendingReviews.length === 1 ? '' : 's'} awaiting your landlord review.`}
          />
        )}

        {tickets.length > 0 && pendingReviews.length === 0 && (
          <SectionBanner
            tone="warning"
            text={`${tickets.length} open maintenance item${tickets.length === 1 ? '' : 's'} on your assets — agency-managed.`}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Your properties" value={scoped.length} icon={<Building className="h-5 w-5" />} />
          <StatCard label="Occupancy" value={`${occupancy}%`} icon={<TrendingUp className="h-5 w-5" />} />
          <StatCard label="Collected" value={formatZAR(collected)} icon={<Banknote className="h-5 w-5" />} />
          <StatCard label="Open works" value={tickets.length} icon={<Wrench className="h-5 w-5" />} />
        </div>

        {pendingReviews.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
              <h2 className="font-display text-lg font-semibold text-ink">Awaiting your review</h2>
            </div>
            <p className="mt-1 text-sm text-ink-500">
              Agency sent these applicants for owner approval. Approve or decline — lease generation stays
              with the agency.
            </p>
            <ul className="mt-4 space-y-3">
              {pendingReviews.map((app) => {
                const prop = propertyById[app.propertyId]
                const busy = busyAppId === app.id
                const actions = getAvailableTransitions(app, landlordPerms)
                const canApprove = actions.some((t) => t.to === 'conditionally_approved')
                const canReject = actions.some((t) => t.to === 'rejected')
                return (
                  <li
                    key={app.id}
                    className="flex flex-col gap-3 rounded-2xl border border-primary-100 bg-primary-50/40 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{app.applicantName}</p>
                      <p className="text-xs text-ink-500">
                        {prop?.title ?? app.propertyId} · {workflowStageLabel(app.type, resolveWorkflowStatus(app))}
                      </p>
                      {app.email ? <p className="mt-0.5 text-xs text-ink-400">{app.email}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
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
                        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
                      >
                        View property
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Building className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
                <h2 className="font-display text-lg font-semibold text-ink">Your properties</h2>
              </div>
              <Link
                to="/workspace/properties"
                className="text-sm font-semibold text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {scoped.map((p) => {
                const agent = state.users.find((u) => u.id === p.agentId)
                const managedBy = listedBy(p.agentId, agent?.name, 'agency')
                const propPay = payments.filter((x) => x.propertyId === p.id)
                const monthRent = propPay
                  .filter((x) => x.type === 'Rent' && x.status === 'Paid')
                  .reduce((n, x) => n + x.amount, 0)
                return (
                  <div key={p.id} className="flex gap-4 rounded-2xl border border-primary-50 p-3">
                    <img src={p.images[0]} alt="" className="h-20 w-28 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/workspace/properties/${p.id}`}
                          className="truncate font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {p.title}
                        </Link>
                        <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink-500">
                        {p.suburb}
                        {managedBy ? ` · Managed by ${managedBy}` : null}
                      </p>
                      <p className="mt-2 tabular text-sm font-semibold text-ink">
                        {p.rent ? `${formatZAR(p.rent)}/mo` : formatZAR(p.price)}
                      </p>
                      <p className="mt-1 text-xs text-ink-400">
                        Receipts: {formatZAR(monthRent)}
                        {due > 0 ? ` · Outstanding (book): ${formatZAR(due)}` : null}
                      </p>
                    </div>
                  </div>
                )
              })}
              {scoped.length === 0 && (
                <div className="rounded-2xl bg-primary-50/50 p-6 text-center">
                  <p className="font-semibold text-ink">No properties yet</p>
                  <p className="mt-2 text-sm text-ink-500">
                    Add a property to your portfolio and publish it so applicants can find it on the
                    marketplace.
                  </p>
                  <Link
                    to="/workspace/properties/new"
                    className="mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl bg-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Add property
                  </Link>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
                <h2 className="font-display text-lg font-semibold text-ink">Payment ledger</h2>
              </div>
              <Link
                to="/workspace/operations/payments"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Payments
              </Link>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              Landlord-visible receipts only. Tenant messaging stays with the agency.
            </p>
            <ul className="mt-4 space-y-2">
              {payments.slice(0, 8).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-primary-50 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {p.type} · {propertyById[p.propertyId]?.title ?? p.propertyId}
                    </p>
                    <p className="text-xs text-ink-400">
                      {p.partyName} · Due {p.dueDate ?? '—'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular font-semibold text-ink">{formatZAR(p.amount)}</p>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </div>
                </li>
              ))}
              {payments.length === 0 && (
                <li className="py-6 text-center text-sm text-ink-500">No landlord-visible payments yet.</li>
              )}
            </ul>
          </Card>
        </div>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
              <h2 className="font-display text-lg font-semibold text-ink">Open maintenance</h2>
            </div>
            <Link
              to="/workspace/operations/maintenance"
              className="text-sm font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          <p className="mt-1 text-xs text-ink-500">Read-only on your assets — the agency assigns contractors.</p>
          <ul className="mt-4 space-y-2">
            {tickets.slice(0, 6).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-primary-50 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{t.title}</p>
                  <p className="text-xs text-ink-400">
                    {propertyById[t.propertyId]?.title ?? t.propertyId} · {t.priority}
                  </p>
                </div>
                <Badge tone={statusTone(t.status)}>{t.status}</Badge>
              </li>
            ))}
            {tickets.length === 0 && (
              <li className="py-6 text-center text-sm text-ink-500">No open maintenance on your assets.</li>
            )}
          </ul>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/workspace/operations/documents"
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary-100 bg-white px-4 text-sm font-semibold text-primary hover:bg-primary-50"
          >
            <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Documents
          </Link>
          <Link
            to="/workspace"
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-primary-100 bg-white px-4 text-sm font-semibold text-ink-600 hover:bg-primary-50"
          >
            <Home className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Workspace overview
          </Link>
        </div>
      </DashboardPage>
    </RequirePermission>
  )
}
