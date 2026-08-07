import { HardHat, MapPin } from 'lucide-react'
import type { MaintenanceTicket } from '../../types/domain'
import type { PropertyAsset } from '../../types/domain'
import { BackButton } from '../BackButton'
import { Badge, Button, Card, statusTone } from '../ui'
import { formatAge, ticketAgeHours } from '../maintenance/types'

const ICON_STROKE = 1.6

/** Limited job summary for contractors before they accept a ticket. */
export function ContractorMaintenancePreview({
  ticket,
  property,
  onAccept,
  acceptDisabled,
  acceptHint,
}: {
  ticket: MaintenanceTicket
  property: PropertyAsset
  onAccept: () => void
  acceptDisabled?: boolean
  acceptHint?: string
}) {
  return (
    <div className="space-y-5">
      <Card className="border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-950">
        <p className="font-semibold">Preview only</p>
        <p className="mt-1 text-amber-900/90">
          Accept this job to see access notes, tenant contact, full site photos, and update status.
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink">{ticket.title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
              <MapPin className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              {property.suburb}, {property.city}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={statusTone(ticket.status)}>{ticket.status}</Badge>
            <Badge tone="neutral">{ticket.priority}</Badge>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-ink-600 line-clamp-4">{ticket.description}</p>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Category</dt>
            <dd className="mt-0.5 font-medium text-ink">{ticket.categoryKey ?? 'General'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Asset</dt>
            <dd className="mt-0.5 font-medium text-ink">{ticket.assetLabel}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Age</dt>
            <dd className="mt-0.5 font-medium tabular text-ink">{formatAge(ticketAgeHours(ticket))}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            className="min-h-11 cursor-pointer"
            disabled={acceptDisabled}
            onClick={onAccept}
          >
            <HardHat className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Accept job
          </Button>
          <BackButton to="/workspace/portals/contractor" label="Back to jobs" />
        </div>
        {acceptHint ? <p className="text-xs text-ink-500">{acceptHint}</p> : null}
      </Card>
    </div>
  )
}
