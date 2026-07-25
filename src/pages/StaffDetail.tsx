import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Mail, Phone } from 'lucide-react'
import { useMemo } from 'react'
import { useStore } from '../context/AppStore'
import { useAgencyScope } from '../context/AuthContext'
import { roleLabels } from '../lib/permissions'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, Button, cn } from '../components/ui'

const ICON_STROKE = 1.6
const STAFF_ROLES = ['client_admin', 'agent_admin', 'ground_agent', 'agent', 'super_admin'] as const

export default function StaffDetail() {
  const { id } = useParams()
  const { state } = useStore()
  const { scopeAgency, agencyId } = useAgencyScope()

  const user = state.users.find((u) => u.id === id)

  const inScope = useMemo(() => {
    if (!user) return false
    if (!STAFF_ROLES.includes(user.role as (typeof STAFF_ROLES)[number])) return false
    if (user.role === 'super_admin') return true
    return scopeAgency(user.agencyId)
  }, [user, scopeAgency])

  const stats = useMemo(() => {
    if (!user) return { closedDeals: 0, openLeads: 0, assignedProperties: 0 }
    return {
      closedDeals: state.leads.filter(
        (l) => l.agentId === user.id && ['Lease Signed', 'Sale Completed'].includes(l.stage),
      ).length,
      openLeads: state.leads.filter(
        (l) =>
          l.agentId === user.id &&
          !['Lease Signed', 'Sale Completed', 'Rejected'].includes(l.stage),
      ).length,
      assignedProperties: state.properties.filter((p) => p.agentId === user.id).length,
    }
  }, [user, state.leads, state.properties])

  if (!user) return <Navigate to="/workspace/people/staff" replace />
  if (!inScope) return <Navigate to="/workspace/people/staff" replace />

  const agency = state.agencies.find((a) => a.id === user.agencyId)
  const agencyName =
    agency?.name ?? (user.role === 'super_admin' ? 'Platform' : agencyId ?? '—')

  const rows = [
    { label: 'Role', value: roleLabels[user.role] },
    { label: 'Agency', value: agencyName },
    { label: 'Closed deals', value: String(stats.closedDeals), tabular: true },
    { label: 'Open leads', value: String(stats.openLeads), tabular: true },
    { label: 'Properties', value: String(stats.assignedProperties), tabular: true },
  ]

  return (
    <RequirePermission permission="users.manage">
      <div className="animate-fade-in w-full">
        <Link
          to="/workspace/people/staff"
          className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          All team
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {user.name}
          </h1>
          <Badge tone={user.active ? 'success' : 'warning'}>
            {user.active ? 'Active' : 'Inactive'}
          </Badge>
          <Badge tone="neutral">{roleLabels[user.role]}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-500">{user.email}</p>

        <dl className="mt-6 divide-y divide-primary-50 border-y border-primary-50">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="shrink-0 text-sm text-ink-500">{row.label}</dt>
              <dd
                className={cn(
                  'min-w-0 text-right text-sm font-medium text-ink',
                  row.tabular && 'tabular',
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => window.open(`mailto:${user.email}`, '_self')}
          >
            <Mail className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Email
          </Button>
          {user.phone && (
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() => window.open(`tel:${user.phone}`, '_self')}
            >
              <Phone className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Call
            </Button>
          )}
        </div>
      </div>
    </RequirePermission>
  )
}
