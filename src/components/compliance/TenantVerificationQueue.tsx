/**
 * Agency compliance: applicants whose documents are waiting to be checked,
 * so agency admins verify tenants during their applications.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { usePropertyScope } from '../../context/AuthContext'
import { UnopenedDot } from '../../context/UnopenedContext'
import { Badge, Card, EmptyState } from '../ui'
import { applicationsNeedingDocCheck } from '../../lib/complianceQueue'

export function TenantVerificationQueue() {
  const { state } = useStore()
  const { dealVisible } = usePropertyScope()
  const rows = useMemo(() => {
    const visible = state.applications.filter((a) => dealVisible(a))
    const ids = new Set(applicationsNeedingDocCheck(visible))
    return visible
      .filter((a) => ids.has(a.id))
      .map((a) => ({
        app: a,
        waiting: a.documents.filter((d) => d.status === 'uploaded'),
        property: state.properties.find((p) => p.id === a.propertyId),
      }))
  }, [state.applications, state.properties, dealVisible])

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Tenant documents to verify</h2>
        <Badge tone={rows.length ? 'warning' : 'success'}>{rows.length} waiting</Badge>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing to verify" description="Applicants' uploaded ID, payslips and bank statements appear here until you check them." />
      ) : (
        <ul className="divide-y divide-primary-100">
          {rows.map(({ app, waiting, property }) => (
            <li key={app.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <UnopenedDot kind="compliance" id={app.id} />
                  {app.applicantName}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {property?.title ?? 'Property'} · {waiting.map((d) => d.label).join(', ')}
                </p>
              </div>
              <Link
                to={`/workspace/sales/applications/${encodeURIComponent(app.id)}?tab=documents`}
                className="shrink-0 text-sm font-semibold text-primary hover:underline"
              >
                Check documents
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
