import { Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Star } from 'lucide-react'
import type { PropertyAsset } from '../../types/domain'
import { Badge, Button } from '../ui'
import { resolvePortfolioStatus } from '../../lib/propertyStatus'
import { canEditPropertyListing, ICON_STROKE } from './types'

export function PropertyDetailHeader({
  property,
  occupancy,
  unitLabel,
  buildingName,
  canManage,
  onEdit,
  onToggleFeatured,
}: {
  property: PropertyAsset
  occupancy?: string | null
  unitLabel?: string
  buildingName?: string
  canManage: boolean
  onEdit: () => void
  onToggleFeatured: () => void
}) {
  const resolved = resolvePortfolioStatus(property.status, occupancy)
  const editable = canEditPropertyListing(property.status)

  return (
    <div className="mb-5">
      <Link
        to="/workspace/properties"
        className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        All properties
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              {property.title}
            </h1>
            <Badge tone={resolved.tone}>{resolved.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {property.id}
            {unitLabel ? ` · Unit ${unitLabel}` : ''}
            {buildingName ? ` · ${buildingName}` : ''} · {property.suburb}, {property.city}
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {editable && (
              <Button className="min-h-11" onClick={onEdit}>
                <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Edit property
              </Button>
            )}
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={onToggleFeatured}
              aria-pressed={property.featured}
            >
              <Star
                className="h-4 w-4"
                strokeWidth={ICON_STROKE}
                fill={property.featured ? 'currentColor' : 'none'}
                aria-hidden
              />
              {property.featured ? 'Unfeature' : 'Feature'}
            </Button>
          </div>
        )}
      </div>

      {!editable && (
        <p
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          This listing is <strong>{property.status}</strong>. Core details are locked — ops tabs
          (viewings, maintenance, payments, documents, messages) remain available.
        </p>
      )}
    </div>
  )
}
