import { Link } from 'react-router-dom'
import { Building2, CalendarDays, ChevronDown, MapPin } from 'lucide-react'
import type { Viewing } from '../../types/domain'
import { Badge, cn, statusTone } from '../ui'
import { ViewingExpansion } from './ViewingsListView'
import {
  viewingPrimaryLabel,
  viewingStatus,
  viewingWhenLabel,
  type PortfolioViewing,
} from './types'

const ICON_STROKE = 1.6

export function ViewingCard({
  item,
  expanded,
  onToggle,
  onUpdateBooking,
  onBookSlot,
  reducedMotion,
}: {
  item: PortfolioViewing
  expanded: boolean
  onToggle: (item: PortfolioViewing) => void
  onUpdateBooking?: (id: string, patch: Partial<Viewing>) => void
  onBookSlot?: (slotId: string, applicantName: string) => void
  reducedMotion?: boolean
}) {
  const p = item.property
  return (
    <article
      className={cn(
        'overflow-hidden rounded-[1.25rem] border shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]',
        expanded ? 'border-primary-100 bg-primary-100' : 'border-primary-100/80 bg-white',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="relative aspect-[16/10] bg-primary-50">
          {p.images[0] ? (
            <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-primary">
              <Building2 className="h-8 w-8" strokeWidth={ICON_STROKE} aria-hidden />
            </div>
          )}
          <div className="absolute left-3 top-3">
            <Badge tone={statusTone(viewingStatus(item))}>{viewingStatus(item)}</Badge>
          </div>
        </div>
        <div className="flex items-start gap-2 p-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{p.title}</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
              <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              {p.suburb}, {p.city}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold tabular text-ink">
              <CalendarDays className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
              {viewingWhenLabel(item)}
            </p>
            <p className="mt-1 text-sm font-medium text-ink-600">{viewingPrimaryLabel(item)}</p>
            <p className="mt-1 text-xs text-ink-500">{item.agentName ?? 'Unassigned'}</p>
          </div>
          <ChevronDown
            className={cn(
              'mt-1 h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300',
              expanded && 'rotate-180',
              reducedMotion && 'transition-none',
            )}
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
        </div>
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          reducedMotion && 'transition-none',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-primary-100/80 bg-primary-50 px-4 py-3">
            <ViewingExpansion
              item={item}
              reducedMotion={reducedMotion}
              onUpdateBooking={onUpdateBooking}
              onBookSlot={onBookSlot}
            />
            <p className="mt-3 text-xs text-ink-400">
              <Link
                to={`/workspace/properties/${p.id}`}
                className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                View property
              </Link>
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}
