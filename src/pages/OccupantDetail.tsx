import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope } from '../context/AuthContext'
import { isFieldAgent } from '../lib/permissions'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, cn, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'

const ICON_STROKE = 1.6

export default function OccupantDetail() {
  const { id } = useParams()
  const { state } = useStore()
  const { scopeAgency, scopeAgent, role } = useAgencyScope()

  const tenancy = state.tenancies.find((t) => t.id === id)
  const property = tenancy
    ? state.properties.find((p) => p.id === tenancy.propertyId)
    : null
  const agent = tenancy?.agentId
    ? state.users.find((u) => u.id === tenancy.agentId)
    : null

  const inScope = useMemo(() => {
    if (!tenancy) return false
    if (!scopeAgency(tenancy.agencyId)) return false
    if (isFieldAgent(role) && !scopeAgent(tenancy.agentId)) return false
    return true
  }, [tenancy, scopeAgency, scopeAgent, role])

  if (!tenancy) return <Navigate to="/workspace/people/tenants" replace />
  if (!inScope) return <Navigate to="/workspace/people/tenants" replace />

  const propertyTitle = property?.title ?? tenancy.propertyId
  const propertyArea = property ? `${property.suburb}, ${property.city}` : '—'

  const rows = [
    { label: 'Property', value: propertyTitle },
    { label: 'Area', value: propertyArea },
    { label: 'Agent', value: agent?.name ?? 'Unassigned' },
    { label: 'Lease start', value: tenancy.startDate, tabular: true },
    { label: 'Lease end', value: tenancy.endDate ?? 'Open-ended', tabular: true },
  ]

  return (
    <RequirePermission permission="occupants.view">
      <div className="animate-fade-in w-full">
        <Link
          to="/workspace/people/tenants"
          className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          All occupants
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {tenancy.tenantName}
          </h1>
          <Badge tone={statusTone(tenancy.status)}>{tenancy.status}</Badge>
        </div>
        <p className="mt-1 tabular text-sm text-ink-500">{tenancy.id}</p>

        <p className="mt-6 font-display text-4xl font-semibold tabular tracking-tight text-ink">
          {formatZAR(tenancy.rent)}
          <span className="ml-1 text-base font-sans font-medium text-ink-500">/mo</span>
        </p>
        <p className="mt-1 text-sm text-ink-500">{tenancy.tenantEmail}</p>

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

        <Link
          to={`/workspace/properties/${tenancy.propertyId}`}
          className="mt-6 inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/50 px-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MapPin className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{propertyTitle}</span>
        </Link>
      </div>
    </RequirePermission>
  )
}
