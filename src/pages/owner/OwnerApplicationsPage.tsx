import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { usePropertyScope } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { PortalHydrationGate } from '../../components/PortalHydrationGate'
import { DashboardBreadcrumb, DashboardPage } from '../../components/dashboard'
import { DashboardTabs } from '../../components/dashboard/DashboardTabs'
import { ViewingEvidenceBadge } from '../../components/applications/ViewingEvidenceBadge'
import { Badge, Button, Card, statusTone } from '../../components/ui'
import { useLandlordDecision } from '../../hooks/useLandlordDecision'
import { isTerminalWorkflowStatus, resolveWorkflowStatus, workflowStageLabel } from '../../lib/applicationWorkflow'
import { propertyRefLabel } from '../../lib/propertyRefs'

type Filter = 'needs' | 'progress' | 'closed' | 'all'

export default function OwnerApplicationsPage() {
  return (
    <PortalHydrationGate>
      <OwnerApplications />
    </PortalHydrationGate>
  )
}

/** Every application on the landlord's properties, and the ones waiting on them. */
function OwnerApplications() {
  const { state } = useStore()
  const { allowedPropertyIds } = usePropertyScope()
  const { busyAppId, options, decide } = useLandlordDecision()

  const rows = useMemo(
    () =>
      state.applications
        .filter((a) => allowedPropertyIds.has(a.propertyId))
        .map((app) => {
          const status = resolveWorkflowStatus(app)
          const kind: Exclude<Filter, 'all'> =
            status === 'landlord_review' ? 'needs' : isTerminalWorkflowStatus(app.type, status) ? 'closed' : 'progress'
          return { app, status, kind }
        })
        .sort((a, b) => (b.app.updatedAt ?? '').localeCompare(a.app.updatedAt ?? '')),
    [state.applications, allowedPropertyIds],
  )
  const count = (k: Exclude<Filter, 'all'>) => rows.filter((r) => r.kind === k).length
  const [filter, setFilter] = useState<Filter>(() => (rows.some((r) => r.kind === 'needs') ? 'needs' : 'progress'))
  const shown = rows.filter((r) => filter === 'all' || r.kind === filter)
  const propertyTitle = (id: string) => state.properties.find((p) => p.id === id)?.title ?? propertyRefLabel(id)

  return (
    <RequirePermission permission="portal.owner">
      <DashboardPage>
        <DashboardBreadcrumb items={[{ label: 'Dashboard', to: '/workspace/portals/owner' }, { label: 'Applications' }]} />
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold text-ink">Applications</h1>
          <p className="mt-1 text-sm text-ink-500">
            Applicants for your properties. The agency runs checks and the lease; you approve when they send one to you.
          </p>
        </div>

        <DashboardTabs
          tabs={[
            { id: 'needs', label: 'Needs you', count: count('needs') || undefined },
            { id: 'progress', label: 'In progress', count: count('progress') || undefined },
            { id: 'closed', label: 'Closed', count: count('closed') || undefined },
            { id: 'all', label: 'All', count: rows.length || undefined },
          ]}
          value={filter}
          onChange={(id) => setFilter(id as Filter)}
        />

        <Card className="mt-4 p-5">
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">
              {filter === 'needs' ? 'Nothing waiting on you right now.' : 'No applications here.'}
            </p>
          ) : (
            <ul className="divide-y divide-primary-50">
              {shown.map(({ app, status, kind }) => {
                const { canApprove, canReject } = options(app)
                const busy = busyAppId === app.id
                return (
                  <li key={app.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{app.applicantName}</p>
                        <Badge tone={kind === 'needs' ? 'warning' : statusTone(app.stage)}>
                          {workflowStageLabel(app.type, status)}
                        </Badge>
                      </div>
                      <p className="text-sm text-ink-500">
                        {propertyTitle(app.propertyId)} · {app.type === 'Purchase' ? 'Purchase offer' : 'Rental'}
                        {app.submittedAt ? ` · Applied ${app.submittedAt}` : ''}
                      </p>
                      <div className="mt-2">
                        <ViewingEvidenceBadge evidence={app.viewingEvidence} />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {kind === 'needs' && canApprove ? (
                        <Button className="min-h-11 cursor-pointer" disabled={busy} onClick={() => void decide(app.id, 'conditionally_approved')}>
                          {busy ? 'Saving…' : 'Approve'}
                        </Button>
                      ) : null}
                      {kind === 'needs' && canReject ? (
                        <Button variant="secondary" className="min-h-11 cursor-pointer" disabled={busy} onClick={() => void decide(app.id, 'rejected')}>
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
          )}
        </Card>
      </DashboardPage>
    </RequirePermission>
  )
}
