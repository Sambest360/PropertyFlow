import { Link } from 'react-router-dom'
import { Globe, Loader2, Pencil, Star, Trash2, RotateCcw } from 'lucide-react'
import type { PropertyAsset } from '../../types/domain'
import { ActionButtonRow } from '../ActionButtonRow'
import { BackButton } from '../BackButton'
import { Badge, Button } from '../ui'
import type { BuildingGrading } from '../../data/infrastructure'
import { gradingLabel } from '../../lib/buildingGrading'
import { resolvePortfolioStatus } from '../../lib/propertyStatus'
import { isPropertyDeleted } from '../../lib/propertyDeletion'
import type { GuestMarketplaceBlock } from '../../lib/marketplaceVisibility'
import { canEditPropertyListing, ICON_STROKE } from './types'

export function PropertyDetailHeader({
  property,
  occupancy,
  unitLabel,
  buildingName,
  buildingGrading,
  buildingAddress,
  unitCount,
  siblingUnits = [],
  canManage,
  canPublish,
  onRequestPublish,
  publishBlockedReason,
  onPublish,
  onToggleFeatured,
  canFeature = false,
  publishBusy,
  canDelete,
  deleteBlockedReason,
  onDelete,
  onRestore,
  deleteBusy,
  restoreBusy,
  guestMarketplaceBlock,
}: {
  property: PropertyAsset
  occupancy?: string | null
  unitLabel?: string
  buildingName?: string
  buildingGrading?: BuildingGrading
  buildingAddress?: string
  /** Units in the building including this one; omit when not linked to a building. */
  unitCount?: number
  siblingUnits?: Array<Pick<PropertyAsset, 'id' | 'title'>>
  canManage: boolean
  canPublish?: boolean
  /** Shown instead of "Make live" for staff without publish permission. */
  onRequestPublish?: () => void
  publishBlockedReason?: string | null
  onPublish?: () => void
  onToggleFeatured: () => void
  /** Featuring is a paid platform service — super admins only. */
  canFeature?: boolean
  publishBusy?: boolean
  canDelete?: boolean
  deleteBlockedReason?: string | null
  onDelete?: () => void
  onRestore?: () => void
  deleteBusy?: boolean
  restoreBusy?: boolean
  /** Staff sees Available but signed-out /browse hides the listing */
  guestMarketplaceBlock?: GuestMarketplaceBlock | null
}) {
  const archiveActionBusy = Boolean(deleteBusy || restoreBusy)
  const deleted = isPropertyDeleted(property)
  const resolved = deleted
    ? { label: 'Deleted' as const, tone: 'neutral' as const }
    : resolvePortfolioStatus(property.status, occupancy)
  const editable = canEditPropertyListing(property.status) && !deleted
  const isDraft = property.status === 'Draft' && !deleted
  const showMakeLive =
    isDraft && canManage && canPublish && Boolean(onPublish) && !publishBlockedReason

  const backTo = deleted ? '/workspace/properties/archive' : '/workspace/properties'
  const backLabel = deleted ? 'Deleted properties' : 'All properties'

  return (
    <div className="mb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              {property.title}
            </h1>
            <Badge tone={resolved.tone}>{resolved.label}</Badge>
            {property.featured && !deleted ? <Badge tone="brand">Featured</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {property.id}
            {unitLabel ? ` · Unit ${unitLabel}` : ''}
            {buildingName ? ` · ${buildingName}` : ''}
            {buildingGrading ? ` · ${gradingLabel(buildingGrading)}` : ''} ·{' '}
            {buildingAddress ? `${buildingAddress}, ` : ''}
            {property.suburb}, {property.city}
            {unitCount ? ` · ${unitCount} unit${unitCount === 1 ? '' : 's'}` : ''}
            {siblingUnits.length > 0 ? (
              <>
                {' · Other units: '}
                {siblingUnits.map((sib, i) => (
                  <span key={sib.id}>
                    {i > 0 ? ', ' : ''}
                    <Link
                      to={`/workspace/properties/${sib.id}`}
                      className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {sib.title}
                    </Link>
                  </span>
                ))}
              </>
            ) : null}
          </p>
        </div>

        <ActionButtonRow className="sm:w-auto">
            {canManage && showMakeLive ? (
              <Button
                className="min-h-11 cursor-pointer"
                onClick={onPublish}
                disabled={publishBusy || archiveActionBusy}
              >
                <Globe className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Make live
              </Button>
            ) : null}
            {canManage && editable && (
              <Link to={`/workspace/properties/${property.id}/edit`}>
                <Button variant={showMakeLive ? 'secondary' : 'primary'} className="min-h-11 cursor-pointer">
                  <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Edit property
                </Button>
              </Link>
            )}
            {canFeature && !isDraft && !deleted ? (
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={onToggleFeatured}
                disabled={archiveActionBusy}
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
            ) : null}
            {canDelete && !deleted && onDelete ? (
              <Button
                variant="secondary"
                className="min-h-11 cursor-pointer text-accent-700 ring-accent-200 hover:bg-accent-50"
                onClick={onDelete}
                disabled={archiveActionBusy || Boolean(deleteBlockedReason)}
                title={deleteBlockedReason ?? undefined}
              >
                {deleteBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={ICON_STROKE} aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                )}
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </Button>
            ) : null}
            {canDelete && deleted && onRestore ? (
              <Button
                className="min-h-11 cursor-pointer"
                onClick={onRestore}
                disabled={archiveActionBusy}
              >
                {restoreBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={ICON_STROKE} aria-hidden />
                ) : (
                  <RotateCcw className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                )}
                {restoreBusy ? 'Restoring…' : 'Restore'}
              </Button>
            ) : null}
            <BackButton to={backTo} label={backLabel} />
        </ActionButtonRow>
      </div>

      {deleted ? (
        <div
          className="mt-4 rounded-2xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-700"
          role="status"
        >
          This property was deleted and is kept here for reference only. Restore it to edit or
          publish again.
        </div>
      ) : null}

      {deleteBlockedReason && canDelete && !deleted ? (
        <p className="mt-3 text-sm text-ink-500">{deleteBlockedReason}</p>
      ) : null}

      {guestMarketplaceBlock && canManage && !isDraft && !deleted ? (
        <div
          className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
          role="status"
        >
          <p className="font-semibold text-sky-950">Hidden from public browse</p>
          <p className="mt-0.5 text-sky-900/90">{guestMarketplaceBlock.message}</p>
          {guestMarketplaceBlock.landlordUserId ? (
            <p className="mt-2">
              <Link
                to={`/workspace/admin/users/${guestMarketplaceBlock.landlordUserId}`}
                className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Review landlord verification
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      {isDraft && canManage ? (
        <div
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-amber-950">This listing is still a draft</p>
              <p className="mt-0.5 text-amber-900/90">
                It is not visible on the marketplace yet.
                {publishBlockedReason ? ` ${publishBlockedReason}` : null}
              </p>
            </div>
            {showMakeLive ? (
              <ActionButtonRow className="shrink-0 sm:w-auto">
              <Button
                className="min-h-11 shrink-0 cursor-pointer"
                onClick={onPublish}
                disabled={publishBusy}
              >
                <Globe className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Make live
              </Button>
              </ActionButtonRow>
            ) : publishBlockedReason && editable ? (
              <ActionButtonRow className="shrink-0 sm:w-auto">
              <Link to={`/workspace/properties/${property.id}/edit`}>
                <Button variant="secondary" className="min-h-11 shrink-0 cursor-pointer">
                  Finish setup
                </Button>
              </Link>
              </ActionButtonRow>
            ) : canPublish ? null : onRequestPublish ? (
              <ActionButtonRow className="shrink-0 sm:w-auto">
                <Button variant="secondary" className="min-h-11 shrink-0 cursor-pointer" onClick={onRequestPublish}>
                  <Globe className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Request to publish
                </Button>
              </ActionButtonRow>
            ) : (
              <p className="text-xs font-medium text-amber-900/80">
                You need listing publish permission to make this live.
              </p>
            )}
          </div>
        </div>
      ) : null}

      {!editable && !isDraft && (
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
