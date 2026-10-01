import { Link } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import type { Building } from '../../data/infrastructure'
import type { PropertyAsset } from '../../types/domain'
import { gradingLabel } from '../../lib/buildingGrading'
import { Badge, Card } from '../ui'
import { ICON_STROKE } from './types'

export function BuildingUnitsStrip({
  building,
  siblings,
  currentPropertyId,
}: {
  building?: Building | null
  siblings: PropertyAsset[]
  currentPropertyId: string
}) {
  if (!building && siblings.length === 0) return null

  return (
    <Card className="mb-5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
            <Building2 className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
            Building
          </p>
          <p className="mt-1 font-semibold text-ink">
            {building?.name ?? 'Linked building'}
            {building?.grading ? (
              <span className="ml-2 inline-flex align-middle">
                <Badge tone="brand">{gradingLabel(building.grading)}</Badge>
              </span>
            ) : null}
          </p>
          {building ? (
            <p className="mt-0.5 text-sm text-ink-500">
              {building.addressLine1} · {building.suburb}, {building.city}
            </p>
          ) : null}
        </div>
        <p className="text-xs font-medium tabular text-ink-400">
          {siblings.length + 1} unit{siblings.length + 1 === 1 ? '' : 's'} in complex
        </p>
      </div>

      {siblings.length > 0 ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {siblings.map((sib) => (
            <li key={sib.id}>
              <Link
                to={`/workspace/properties/${sib.id}`}
                className="flex min-h-11 items-center gap-3 rounded-xl border border-primary-100/80 bg-primary-50/40 px-3 py-2 text-sm transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {sib.images[0] ? (
                  <img
                    src={sib.images[0]}
                    alt=""
                    className="h-10 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : null}
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{sib.title}</span>
                  <span className="text-xs text-ink-500">
                    {sib.status}
                    {sib.id === currentPropertyId ? ' · Current' : ''}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-500">
          No other listed units in this building yet. Add another unit via the create wizard and
          pick this building.
        </p>
      )}
    </Card>
  )
}
