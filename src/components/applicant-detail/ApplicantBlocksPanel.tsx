import { Link } from 'react-router-dom'
import { Ban, MapPin } from 'lucide-react'
import type { Application, PropertyAsset } from '../../types/domain'
import { Badge, Card } from '../ui'
import { ICON_STROKE } from './types'

export type BlockRecord = {
  application: Application
  property: PropertyAsset | null
}

export function ApplicantBlocksPanel({ blocks }: { blocks: BlockRecord[] }) {
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
        <Ban className="h-5 w-5 text-accent" strokeWidth={ICON_STROKE} aria-hidden />
        Blocks & showing bans
      </h2>
      <p className="mt-1 text-sm text-ink-500">
        If this applicant was blocked from a property or showing, the reason is recorded here.
      </p>

      {blocks.length === 0 ? (
        <p className="mt-8 text-center text-sm text-ink-500">
          No blocks on record for this applicant.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {blocks.map(({ application: a, property }) => (
            <li
              key={a.id}
              className="rounded-xl border border-accent-100 bg-accent-50/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {property?.title ?? a.propertyId}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                    <MapPin className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
                    {property
                      ? `${property.suburb}, ${property.city}`
                      : 'Property unavailable'}
                  </p>
                </div>
                <Badge tone="danger">Blocked</Badge>
              </div>
              <div className="mt-3 rounded-lg border border-accent-100 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  Reason
                </p>
                <p className="mt-1 text-sm text-ink-700">
                  {a.blockReason?.trim() ||
                    a.notes?.split('\n').find((l) => l.toLowerCase().includes('block')) ||
                    'No reason recorded.'}
                </p>
                {a.blockedAt && (
                  <p className="mt-1 text-xs tabular text-ink-400">Blocked on {a.blockedAt}</p>
                )}
              </div>
              {property && (
                <Link
                  to={`/workspace/properties/${property.id}?tab=applicants`}
                  className="mt-2 inline-flex min-h-10 cursor-pointer items-center text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Open property applicants
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function buildBlockRecords(params: {
  currentApp: Application
  applications: Application[]
  properties: PropertyAsset[]
}): BlockRecord[] {
  const { currentApp, applications, properties } = params
  const email = currentApp.email.toLowerCase()
  const userId = currentApp.applicantUserId
  const propById = new Map(properties.map((p) => [p.id, p]))

  return applications
    .filter((a) => {
      if (a.stage !== 'Blocked') return false
      if (userId && a.applicantUserId === userId) return true
      return a.email.toLowerCase() === email
    })
    .map((a) => ({
      application: a,
      property: propById.get(a.propertyId) ?? null,
    }))
    .sort((a, b) =>
      (b.application.blockedAt ?? b.application.updatedAt).localeCompare(
        a.application.blockedAt ?? a.application.updatedAt,
      ),
    )
}
