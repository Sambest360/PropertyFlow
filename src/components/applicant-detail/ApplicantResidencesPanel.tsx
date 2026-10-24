import { Link } from 'react-router-dom'
import { Building2, MapPin } from 'lucide-react'
import type { Application, PropertyAsset, Tenancy } from '../../types/domain'
import { Badge, Card, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { ICON_STROKE } from './types'
import { propertyRefLabel } from '../../lib/propertyRefs'

export type PastResidence = {
  kind: 'tenancy' | 'application'
  id: string
  property: PropertyAsset | null
  propertyId: string
  label: string
  status: string
  from: string
  to?: string | null
  rent?: number
}

export function ApplicantResidencesPanel({ items }: { items: PastResidence[] }) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Building2 className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
        Previous residences
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        Properties this applicant has stayed in or completed tenancy for (excluding the current
        application).
      </p>

      {items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-ink-500">
          No prior residences on record for this applicant.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={`${item.kind}-${item.id}`}
              className="rounded-xl border border-primary-100 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {item.property?.title ?? propertyRefLabel(item.propertyId)}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
                      {item.property
                        ? `${item.property.suburb}, ${item.property.city}`
                        : 'Address unavailable'}
                    </span>
                    <span>· {item.label}</span>
                    {item.rent != null && (
                      <span className="tabular">· {formatZAR(item.rent)}</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs tabular text-ink-400">
                    {item.from}
                    {item.to ? ` → ${item.to}` : ' → present'}
                  </p>
                </div>
                <Badge tone={statusTone(item.status)}>{item.status}</Badge>
              </div>
              {item.property && (
                <Link
                  to={`/workspace/properties/${item.property.id}`}
                  className="mt-2 inline-flex min-h-10 cursor-pointer items-center text-xs font-semibold text-primary hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Open property
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function buildPastResidences(params: {
  currentApp: Application
  applications: Application[]
  tenancies: Tenancy[]
  properties: PropertyAsset[]
}): PastResidence[] {
  const { currentApp, applications, tenancies, properties } = params
  const email = currentApp.email.toLowerCase()
  const userId = currentApp.applicantUserId
  const propById = new Map(properties.map((p) => [p.id, p]))

  const fromTenancies: PastResidence[] = tenancies
    .filter((t) => {
      if (t.propertyId === currentApp.propertyId && t.applicationId === currentApp.id) return false
      if (userId && t.tenantUserId === userId) return true
      return t.tenantEmail.toLowerCase() === email
    })
    .map((t) => ({
      kind: 'tenancy' as const,
      id: t.id,
      propertyId: t.propertyId,
      property: propById.get(t.propertyId) ?? null,
      label: 'Tenancy',
      status: t.status,
      from: t.startDate,
      to: t.endDate,
      rent: t.rent,
    }))

  const settled = new Set([
    'Active Tenancy',
    'Keys Handed Over',
    'Lease Signed',
    'Move-In Scheduled',
  ])

  const fromApps: PastResidence[] = applications
    .filter((a) => {
      if (a.id === currentApp.id) return false
      if (a.propertyId === currentApp.propertyId) return false
      const same =
        (userId && a.applicantUserId === userId) || a.email.toLowerCase() === email
      if (!same) return false
      return settled.has(a.stage) || a.stage === 'Active Tenancy'
    })
    .filter((a) => !fromTenancies.some((t) => t.propertyId === a.propertyId))
    .map((a) => ({
      kind: 'application' as const,
      id: a.id,
      propertyId: a.propertyId,
      property: propById.get(a.propertyId) ?? null,
      label: 'Prior application',
      status: a.stage,
      from: a.submittedAt,
      to: a.updatedAt,
    }))

  return [...fromTenancies, ...fromApps].sort((a, b) => b.from.localeCompare(a.from))
}
