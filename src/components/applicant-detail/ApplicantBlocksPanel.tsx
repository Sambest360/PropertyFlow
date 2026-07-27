import { Link } from 'react-router-dom'
import { Ban, MapPin } from 'lucide-react'
import type { Application, PropertyAsset } from '../../types/domain'
import { Button } from '../ui'
import { DetailSection } from '../detail/FlatFields'
import { ICON_STROKE } from './types'

export type BlockRecord = {
  application: Application
  property: PropertyAsset | null
}

export function ApplicantBlocksPanel({
  blocks,
  canReview,
  onBlock,
}: {
  blocks: BlockRecord[]
  canReview?: boolean
  onBlock?: () => void
}) {
  return (
    <DetailSection
      title="Blocks & showing bans"
      subtitle="If this applicant was blocked from a property or showing, the reason is recorded here."
      actions={
        canReview && onBlock ? (
          <Button variant="danger" className="min-h-11 shrink-0" onClick={onBlock}>
            <Ban className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Block applicant
          </Button>
        ) : null
      }
    >
      {blocks.length === 0 ? (
        <p className="py-6 text-sm text-ink-500">No blocks on record for this applicant.</p>
      ) : (
        <ul className="divide-y divide-primary-50 border-y border-primary-50">
          {blocks.map(({ application: a, property }) => (
            <li key={a.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">{property?.title ?? a.propertyId}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">
                  Blocked
                </p>
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                <MapPin className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
                {property ? `${property.suburb}, ${property.city}` : 'Property unavailable'}
              </p>
              <p className="mt-3 text-[11px] font-medium text-ink-400">Reason</p>
              <p className="mt-0.5 text-sm text-ink-700">
                {a.blockReason?.trim() ||
                  a.notes?.split('\n').find((l) => l.toLowerCase().includes('block')) ||
                  'No reason recorded.'}
              </p>
              {a.blockedAt && (
                <p className="mt-1 text-xs tabular text-ink-400">Blocked on {a.blockedAt}</p>
              )}
              {property && (
                <Link
                  to={`/workspace/properties/${property.id}?tab=applicants`}
                  className="mt-3 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Open property applicants
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
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
