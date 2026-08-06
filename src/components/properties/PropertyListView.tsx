import { Link } from 'react-router-dom'
import { Fragment, useEffect, useState } from 'react'
import {
  ArrowRight,
  Bath,
  BedDouble,
  CalendarDays,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  MapPin,
  Wrench,
} from 'lucide-react'
import { Badge, Button, cn } from '../ui'
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

  if (quiet) {
    return <Badge tone="neutral">Quiet</Badge>
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {item.openTickets > 0 && (
        <Badge tone="danger" className="gap-1">
          <Wrench className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
          <span className="tabular">{item.openTickets}</span> maintenance
        </Badge>
      )}
      {item.scheduledViewings > 0 && (
        <Badge tone="info" className="gap-1">
          <CalendarDays className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
          <span className="tabular">{item.scheduledViewings}</span> viewings
        </Badge>
      )}
      {item.waitingApps > 0 && (
        <Badge tone="warning" className="gap-1">
          <ClipboardList className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
          <span className="tabular">{item.waitingApps}</span> apps
        </Badge>
      )}
    </div>
  )
}

function StatusBadge({ item }: { item: PortfolioProperty }) {
  const resolved = resolvePortfolioStatus(item.property.status, item.occupancy)
  return <Badge tone={resolved.tone}>{resolved.label}</Badge>
}

export function PropertyExpansion({
  item,
  reducedMotion,
}: {
  item: PortfolioProperty
  reducedMotion?: boolean
}) {
  const [activePhoto, setActivePhoto] = useState(0)
  const p = item.property
  const photos = p.images.length > 0 ? p.images.slice(0, 8) : []
  const detailId = `/workspace/properties/${p.id}`
  const current = photos[Math.min(activePhoto, Math.max(photos.length - 1, 0))]
  const resolved = resolvePortfolioStatus(p.status, item.occupancy)
  const { viewerId } = useAgentDisplay()

  const metaRows: Array<{ label: string; value: string }> = appendAgentMetaRow(
    [
      { label: 'Address', value: p.address },
      { label: 'Area', value: `${p.suburb}, ${p.city}` },
      { label: 'Type', value: p.type },
      { label: 'Market', value: listingModeLabel(p.listingMode) },
      { label: 'Price', value: priceLabel(p, formatZAR) },
      { label: 'Beds / baths / parking', value: `${p.beds} / ${p.baths} / ${p.parking}` },
      { label: 'Size', value: p.area > 0 ? `${p.area} m²` : '—' },
    ],
    viewerId,
    p.agentId,
    item.agentName,
  )

  const prevPhoto = () => setActivePhoto((i) => (i - 1 + photos.length) % photos.length)
  const nextPhoto = () => setActivePhoto((i) => (i + 1) % photos.length)

  useEffect(() => {
    setActivePhoto(0)
  }, [p.id])

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        {current ? (
          <>
            <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-primary-100/80">
              <img
                src={current}
                alt=""
                className={cn(
                  'max-h-full max-w-full object-contain',
                  !reducedMotion && 'transition-opacity duration-200',
                )}
              />
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prevPhoto}
                    aria-label="Previous photo"
                    className="absolute left-2 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-primary-100 bg-white/95 text-ink shadow-sm transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronLeft className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={nextPhoto}
                    aria-label="Next photo"
                    className="absolute right-2 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-primary-100 bg-white/95 text-ink shadow-sm transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronRight className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                </>
              )}
            </div>
            {photos.length > 1 && (
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                  {photos.map((src, i) => (
                    <button
                      key={`${src}-${i}`}
                      type="button"
                      onClick={() => setActivePhoto(i)}
                      aria-label={`Show photo ${i + 1}`}
                      aria-pressed={i === activePhoto}
                      className={cn(
                        'relative h-14 w-20 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-2 transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                        i === activePhoto ? 'ring-primary' : 'ring-transparent hover:ring-primary-200',
                        reducedMotion && 'transition-none',
                      )}
                    >
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
                <p className="shrink-0 text-[11px] tabular text-ink-400">
                  {activePhoto + 1} / {photos.length}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-white text-sm text-ink-400 ring-1 ring-primary-100/80">
            No photos
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold tracking-tight text-ink">{p.title}</p>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              {p.suburb}, {p.city}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-500">
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
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge tone={resolved.tone}>{resolved.label}</Badge>
            <AttentionBadges item={item} />
          </div>
        </div>

        <dl className="mt-4 space-y-2">
          {metaRows.map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-primary-50 pb-2 last:border-b-0"
            >
              <dt className="shrink-0 text-xs font-medium text-ink-400">{row.label}</dt>
              <dd className="min-w-0 text-sm font-semibold tabular text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Quick actions
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to={`/workspace/operations/maintenance?property=${encodeURIComponent(p.id)}`}>
              <Button
                variant={item.openTickets > 0 ? 'danger' : 'secondary'}
                className="min-h-11 rounded-2xl"
              >
                <Wrench className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Log maintenance
                {item.openTickets > 0 && (
                  <span className="tabular opacity-90">({item.openTickets})</span>
                )}
              </Button>
            </Link>
            <Link to={`/workspace/sales/viewings/property/${encodeURIComponent(p.id)}`}>
              <Button variant="primary" className="min-h-11 rounded-2xl">
                <CalendarDays className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Book viewing
                {item.scheduledViewings > 0 && (
                  <span className="tabular opacity-90">({item.scheduledViewings})</span>
                )}
              </Button>
            </Link>
            <Link to={`/workspace/sales/applications?property=${encodeURIComponent(p.id)}`}>
              <Button
                variant="secondary"
                className={cn(
                  'min-h-11 rounded-2xl',
                  item.waitingApps > 0 &&
                    'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100',
                )}
              >
                <ClipboardList className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Applications
                {item.waitingApps > 0 && (
                  <span className="tabular opacity-90">({item.waitingApps})</span>
                )}
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={detailId} className="inline-flex">
            <Button className="min-h-11 cursor-pointer gap-2 rounded-2xl">
              Open full details
              <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export function PropertyListView({
  items,
  expandedId,
  onToggle,
  reducedMotion,
}: {
  items: PortfolioProperty[]
  expandedId?: string | null
  onToggle: (item: PortfolioProperty) => void
  reducedMotion?: boolean
}) {
  const hideAgentColumn = useHideAgentColumn()
  const colSpan = hideAgentColumn ? 5 : 6
  return (
    <>
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] md:block">
        <div className="max-h-[min(78vh,56rem)] overflow-auto [scrollbar-width:thin]">
          <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-white/95 backdrop-blur-md">
              <tr className="border-b border-primary-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <th className="w-10 px-3 py-3" aria-hidden />
                <th className="px-4 py-3 font-semibold">Property</th>
                <th className="px-3 py-3 font-semibold">Price</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Attention</th>
                {!hideAgentColumn ? <th className="px-4 py-3 font-semibold">Agent</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const p = item.property
                const expanded = expandedId === p.id
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={cn(
                        'border-b border-primary-50',
                        expanded && 'border-b-0 bg-primary-100',
                      )}
                    >
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Collapse property details' : 'Expand property details'}
                          className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                              expanded && 'rotate-180',
                              reducedMotion && 'transition-none',
                            )}
                            strokeWidth={ICON_STROKE}
                            aria-hidden
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <img
                            src={p.images[0]}
                            alt=""
                            className={cn(
                              'shrink-0 rounded-lg object-cover ring-1 ring-primary-100 transition-[width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                              expanded ? 'h-16 w-24' : 'h-12 w-16',
                              reducedMotion && 'transition-none',
                            )}
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink group-hover:text-primary">
                              {p.title}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                              <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                              {p.suburb}, {p.city}
                              <span className="text-ink-300">·</span>
                              {p.type}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-left font-semibold tabular text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {priceLabel(p, formatZAR)}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <StatusBadge item={item} />
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <AttentionBadges item={item} />
                        </button>
                      </td>
                      {!hideAgentColumn ? (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => onToggle(item)}
                            className="w-full cursor-pointer text-left font-medium text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <AgentAssigneeText
                              agentId={p.agentId}
                              agentName={item.agentName}
                              className="font-medium text-ink-600"
                            />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                    <tr className={cn(!expanded && 'border-b border-primary-50')}>
                      <td colSpan={colSpan} className="p-0">
                        <div
                          className={cn(
                            'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                            reducedMotion && 'transition-none',
                          )}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div
                              className={cn(
                                'border-b border-primary-100 bg-primary-50 px-4 py-4 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-5',
                                expanded
                                  ? 'translate-y-0 opacity-100'
                                  : 'pointer-events-none -translate-y-1 opacity-0',
                                reducedMotion && 'translate-y-0 transition-none',
                              )}
                              aria-hidden={!expanded}
                            >
                              <PropertyExpansion item={item} reducedMotion={reducedMotion} />
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-2 md:hidden">
        {items.map((item) => {
          const p = item.property
          const expanded = expandedId === p.id
          return (
            <li
              key={p.id}
              className={cn(
                'overflow-hidden rounded-[1.25rem] border shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]',
                expanded
                  ? 'border-primary-100 bg-primary-100'
                  : 'border-primary-100/80 bg-white',
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(item)}
                aria-expanded={expanded}
                className="flex w-full cursor-pointer gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img
                  src={p.images[0]}
                  alt=""
                  className={cn(
                    'shrink-0 rounded-xl object-cover ring-1 ring-primary-100 transition-[width,height] duration-300',
                    expanded ? 'h-24 w-28' : 'h-20 w-24',
                    reducedMotion && 'transition-none',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold text-ink">{p.title}</p>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300',
                        expanded && 'rotate-180',
                        reducedMotion && 'transition-none',
                      )}
                      strokeWidth={ICON_STROKE}
                      aria-hidden
                    />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {p.suburb}, {p.city} · {p.type}
                  </p>
                  <p className="mt-1.5 font-semibold tabular text-ink">{priceLabel(p, formatZAR)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge item={item} />
                    <AttentionBadges item={item} />
                  </div>
                  {!hideAgentColumn ? (
                    <p className="mt-1.5 text-xs font-medium text-ink-500">
                      <AgentAssigneeText agentId={p.agentId} agentName={item.agentName} />
                    </p>
                  ) : null}
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
                  <div className="border-t border-primary-100/80 bg-primary-50 px-3 py-3">
                    <PropertyExpansion item={item} reducedMotion={reducedMotion} />
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
