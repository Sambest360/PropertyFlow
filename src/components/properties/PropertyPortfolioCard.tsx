import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bath,
  BedDouble,
  CalendarDays,
  Car,
  ChevronDown,
  ClipboardList,
  MapPin,
  Wrench,
} from 'lucide-react'
import { MediaImage } from '../media/MediaImage'
import { Badge, Button, Card, cn } from '../ui'
import { AgentAssigneeText } from '../detail/FlatFields'
import { formatZAR } from '../../data/seed'
import { appendAgentMetaRow } from '../../lib/agentDisplay'
import { useAgentDisplay, useHideAgentColumn } from '../../hooks/useAgentDisplay'
import { resolvePortfolioStatus } from '../../lib/propertyStatus'
import { listingModeLabel, priceLabel, type PortfolioProperty } from './types'

const ICON_STROKE = 1.6

function AttentionBadges({ item }: { item: PortfolioProperty }) {
  const quiet =
    item.openTickets === 0 && item.scheduledViewings === 0 && item.waitingApps === 0
  if (quiet) return <Badge tone="neutral">Quiet</Badge>
  return (
    <div className="flex flex-wrap gap-1">
      {item.openTickets > 0 && <Badge tone="danger">{item.openTickets} maintenance</Badge>}
      {item.scheduledViewings > 0 && <Badge tone="info">{item.scheduledViewings} viewings</Badge>}
      {item.waitingApps > 0 && <Badge tone="warning">{item.waitingApps} apps</Badge>}
    </div>
  )
}

/** Compact actions panel for card grid — no gallery (hero already shows the photo). */
function PropertyCardExpansion({
  item,
  reducedMotion,
}: {
  item: PortfolioProperty
  reducedMotion?: boolean
}) {
  const p = item.property
  const detailId = `/workspace/properties/${p.id}`
  const { viewerId } = useAgentDisplay()

  const facts: Array<{ label: string; value: string }> = appendAgentMetaRow(
    [
      { label: 'Address', value: p.address },
      { label: 'Type', value: p.type },
      { label: 'Market', value: listingModeLabel(p.listingMode) },
      { label: 'Size', value: p.area > 0 ? `${p.area} m²` : '—' },
    ],
    viewerId,
    p.agentId,
    item.agentName,
  )

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {facts.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              {row.label}
            </dt>
            <dd className="mt-0.5 truncate text-sm font-semibold tabular text-ink" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div
        className={cn(
          'flex flex-col gap-2 border-t border-primary-100/80 pt-3',
          reducedMotion && 'transition-none',
        )}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          Quick actions
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Link
            to={`/workspace/operations/maintenance?property=${encodeURIComponent(p.id)}`}
            className="block"
          >
            <Button
              variant={item.openTickets > 0 ? 'danger' : 'secondary'}
              className="min-h-11 w-full justify-center rounded-2xl px-2 text-xs sm:text-sm"
            >
              <Wrench className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              Maintenance
              {item.openTickets > 0 && (
                <span className="tabular opacity-90">({item.openTickets})</span>
              )}
            </Button>
          </Link>
          <Link
            to={`/workspace/sales/viewings/property/${encodeURIComponent(p.id)}`}
            className="block"
          >
            <Button
              variant="primary"
              className="min-h-11 w-full justify-center rounded-2xl px-2 text-xs sm:text-sm"
            >
              <CalendarDays className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              Viewing
              {item.scheduledViewings > 0 && (
                <span className="tabular opacity-90">({item.scheduledViewings})</span>
              )}
            </Button>
          </Link>
          <Link
            to={`/workspace/sales/applications?property=${encodeURIComponent(p.id)}`}
            className="block"
          >
            <Button
              variant="secondary"
              className={cn(
                'min-h-11 w-full justify-center rounded-2xl px-2 text-xs sm:text-sm',
                item.waitingApps > 0 &&
                  'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100',
              )}
            >
              <ClipboardList className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              Apps
              {item.waitingApps > 0 && (
                <span className="tabular opacity-90">({item.waitingApps})</span>
              )}
            </Button>
          </Link>
          <Link to={detailId} className="block">
            <Button className="min-h-11 w-full cursor-pointer justify-center gap-1.5 rounded-2xl px-2 text-xs sm:text-sm">
              Details
              <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export function PropertyPortfolioCard({
  item,
  expanded,
  onToggle,
  reducedMotion,
}: {
  item: PortfolioProperty
  expanded?: boolean
  onToggle: (item: PortfolioProperty) => void
  reducedMotion?: boolean
}) {
  const p = item.property
  const resolved = resolvePortfolioStatus(p.status, item.occupancy)
  const hideAgent = useHideAgentColumn()

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[1.25rem] border bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] transition-shadow duration-200',
        expanded
          ? 'border-primary-200 bg-white shadow-[0_14px_28px_-16px_rgba(15,39,68,0.28)] ring-1 ring-primary-100'
          : 'border-primary-100/80 bg-white',
        reducedMotion && 'transition-none',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse property actions' : 'Expand property actions'}
        className="w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Card hover className="border-0 shadow-none">
          <div
            className={cn(
              'relative overflow-hidden transition-[aspect-ratio,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
              expanded ? 'aspect-[21/9] max-h-28' : 'aspect-[16/10]',
              reducedMotion && 'transition-none',
            )}
          >
            <MediaImage
              src={p.images[0]}
              alt=""
              className={cn(
                'h-full w-full object-cover transition-transform duration-300',
                expanded && 'scale-[1.02]',
                reducedMotion && 'transition-none',
              )}
            />
            <div className="absolute left-3 top-3">
              <Badge tone={resolved.tone}>{resolved.label}</Badge>
            </div>
          </div>
          <div className={cn('p-4', expanded && 'pb-3')}>
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 line-clamp-1 font-semibold text-ink">{p.title}</h3>
              <ChevronDown
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300',
                  expanded && 'rotate-180',
                  reducedMotion && 'transition-none',
                )}
                strokeWidth={ICON_STROKE}
                aria-hidden
              />
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
              <MapPin className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              {p.suburb}, {p.city}
            </p>
            <p className="mt-2 tabular text-lg font-semibold text-ink">{priceLabel(p, formatZAR)}</p>
            {!expanded && (
              <>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-500">
                  {p.beds > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <BedDouble className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                      <span className="tabular">{p.beds}</span>
                    </span>
                  )}
                  {p.baths > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Bath className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                      <span className="tabular">{p.baths}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Car className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                    <span className="tabular">{p.parking}</span>
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-primary-50 pt-3">
                  <AttentionBadges item={item} />
                  {!hideAgent ? (
                    <AgentAssigneeText
                      agentId={p.agentId}
                      agentName={item.agentName}
                      className="text-xs font-medium text-ink-500"
                    />
                  ) : null}
                </div>
              </>
            )}
          </div>
        </Card>
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          reducedMotion && 'transition-none',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-primary-100/80 bg-primary-50/60 px-4 py-3">
            <PropertyCardExpansion item={item} reducedMotion={reducedMotion} />
          </div>
        </div>
      </div>
    </div>
  )
}
