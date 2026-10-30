import { Link } from 'react-router-dom'
import { Fragment, useEffect, useState, type ReactNode } from 'react'
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
import { useStore } from '../../context/AppStore'
import { ActionButtonRow } from '../ActionButtonRow'
import { Badge, Button, cn } from '../ui'
import { AgentAssigneeText } from '../detail/FlatFields'
import { QuickAssignAgent, useCanAssignAgents } from './QuickAssignAgent'
import { formatZAR } from '../../data/seed'
import { appendAgentMetaRow } from '../../lib/agentDisplay'
import { useAgentDisplay, useHideAgentColumn } from '../../hooks/useAgentDisplay'
import { resolvePortfolioStatus } from '../../lib/propertyStatus'
import {
  listingModeLabel,
  marketSegmentLabel,
  priceLabel,
  priceLabelForSegment,
  type PortfolioProperty,
  type PropertyListRow,
} from './types'

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
  const { state } = useStore()
  const openLeadsList = state.leads.filter((l) => l.propertyId === p.id && l.stage !== 'Rejected' && l.stage !== 'Lease Signed' && l.stage !== 'Sale Completed')
  const openTicketsList = state.tickets.filter((t) => t.propertyId === p.id && t.status !== 'Completed' && t.status !== 'Cancelled')
  const waitingAppsList = state.applications.filter((a) => a.propertyId === p.id && a.progress < 100 && a.stage !== 'Active Tenancy' && a.stage !== 'Rejected')
  const scheduledViewingsList = state.viewings.filter((v) => v.propertyId === p.id && v.status === 'Scheduled')
  const openLeads = openLeadsList.length
  const openTickets = openTicketsList.length
  const waitingApps = waitingAppsList.length
  const scheduledViewings = scheduledViewingsList.length
  const photos = p.images
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
    <div className="flex min-w-0 flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:items-start">
      <div className="min-w-0">
        {current ? (
          <>
            <div className="relative mx-auto aspect-[16/10] max-h-64 w-full overflow-hidden rounded-xl bg-primary-100 ring-1 ring-primary-100/80 sm:max-h-72 xl:max-h-80">
              <img
                src={current}
                alt=""
                className={cn(
                  'h-full w-full object-cover',
                  !reducedMotion && 'transition-opacity duration-200',
                )}
              />
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prevPhoto}
                    aria-label="Previous photo"
                    className="absolute left-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-primary-100/80 bg-white/95 text-ink shadow-sm transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={nextPhoto}
                    aria-label="Next photo"
                    className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-primary-100/80 bg-white/95 text-ink shadow-sm transition-colors duration-200 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                  <p className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] font-medium tabular text-white">
                    {activePhoto + 1} / {photos.length}
                  </p>
                </>
              )}
            </div>
            {photos.length > 1 && (
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
                {photos.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    onClick={() => setActivePhoto(i)}
                    aria-label={`Show photo ${i + 1}`}
                    aria-pressed={i === activePhoto}
                    className={cn(
                      'relative h-12 w-16 shrink-0 cursor-pointer overflow-hidden rounded-md ring-2 transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      i === activePhoto ? 'ring-primary' : 'ring-transparent hover:ring-primary-200',
                      reducedMotion && 'transition-none',
                    )}
                  >
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex aspect-[16/10] max-h-48 items-center justify-center rounded-xl bg-primary-50 text-sm text-ink-400 ring-1 ring-primary-100/80">
            No photos
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold tracking-tight text-ink">{p.title}</p>
            <p className="mt-0.5 flex items-start gap-1 text-sm text-ink-500">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              <span className="min-w-0 break-words">
                {p.suburb}, {p.city}
              </span>
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
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Badge tone={resolved.tone}>{resolved.label}</Badge>
            <AttentionBadges item={item} />
          </div>
        </div>

        <dl className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {metaRows.map((row) => (
            <div
              key={row.label}
              className="min-w-0 border-b border-primary-50 pb-2 last:border-b-0 sm:last:border-b sm:[&:nth-last-child(-n+2)]:border-b-0"
            >
              <dt className="text-[11px] font-medium text-ink-400">{row.label}</dt>
              <dd className="mt-0.5 break-words text-sm font-semibold tabular text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Quick actions
          </p>
          <ActionButtonRow>
            <Link to={scheduledViewings === 1 ? `/workspace/sales/viewings/property/${encodeURIComponent(p.id)}` : `/workspace/sales/viewings/property/${encodeURIComponent(p.id)}`}>
              <Button variant="primary" className="min-h-10 rounded-xl px-3 text-sm">
                <CalendarDays className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Viewing
                {scheduledViewings > 0 && (
                  <span className="tabular opacity-90">({scheduledViewings})</span>
                )}
              </Button>
            </Link>
            <Link to={openTickets === 1 ? `/workspace/operations/maintenance/${encodeURIComponent(openTicketsList[0].id)}` : `/workspace/operations/maintenance?property=${encodeURIComponent(p.id)}`}>
              <Button
                variant={openTickets > 0 ? 'danger' : 'secondary'}
                className="min-h-10 rounded-xl px-3 text-sm"
              >
                <Wrench className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Maintenance
                {openTickets > 0 && (
                  <span className="tabular opacity-90">({openTickets})</span>
                )}
              </Button>
            </Link>
            <Link to={openLeads === 1 ? `/workspace/sales/crm/${encodeURIComponent(openLeadsList[0].id)}` : `/workspace/sales/crm`}>
              <Button
                variant="secondary"
                className={cn(
                  'min-h-10 rounded-xl px-3 text-sm',
                  openLeads > 0 && 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100',
                )}
              >
                <ClipboardList className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Leads
                {openLeads > 0 && (
                  <span className="tabular opacity-90">({openLeads})</span>
                )}
              </Button>
            </Link>
            <Link to={waitingApps === 1 ? `/workspace/sales/applications/${encodeURIComponent(waitingAppsList[0].id)}` : `/workspace/sales/applications?property=${encodeURIComponent(p.id)}`}>
              <Button
                variant="secondary"
                className={cn(
                  'min-h-10 rounded-xl px-3 text-sm',
                  waitingApps > 0 &&
                    'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100',
                )}
              >
                <ClipboardList className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Applications
                {waitingApps > 0 && (
                  <span className="tabular opacity-90">({waitingApps})</span>
                )}
              </Button>
            </Link>
          </ActionButtonRow>
        </div>

        <ActionButtonRow className="mt-4">
          <Link to={detailId} className="inline-flex">
            <Button className="min-h-10 cursor-pointer gap-2 rounded-xl px-4 text-sm">
              Open full details
              <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </Link>
        </ActionButtonRow>
      </div>
    </div>
  )
}

/** Row cell action: a link to the property detail, or a toggle for the inline panel. */
function RowCellAction({
  linkTo,
  onClick,
  className,
  children,
}: {
  linkTo?: string
  onClick: () => void
  className: string
  children: ReactNode
}) {
  if (linkTo) {
    return (
      <Link to={linkTo} className={className}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  )
}

function normalizePropertyListRows(
  items: PortfolioProperty[],
  rows?: PropertyListRow[],
): PropertyListRow[] {
  if (rows?.length) return rows
  return items.map((item) => ({ item }))
}

export function PropertyListView({
  items,
  rows,
  expandedId,
  onToggle,
  reducedMotion,
  rowLinksToDetail = false,
}: {
  items: PortfolioProperty[]
  rows?: PropertyListRow[]
  expandedId?: string | null
  onToggle?: (item: PortfolioProperty) => void
  reducedMotion?: boolean
  /** Rows open /workspace/properties/:id instead of an inline expansion panel. */
  rowLinksToDetail?: boolean
}) {
  const hideAgentColumn = useHideAgentColumn()
  const canAssign = useCanAssignAgents()
  const colSpan = (hideAgentColumn ? 5 : 6) - (rowLinksToDetail ? 1 : 0)
  const toggle = (item: PortfolioProperty) => onToggle?.(item)
  const detailHref = (item: PortfolioProperty) =>
    rowLinksToDetail ? `/workspace/properties/${item.property.id}` : undefined
  const listRows = normalizePropertyListRows(items, rows)
  return (
    <>
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] md:block">
        <div className="max-h-[min(78vh,56rem)] overflow-auto [scrollbar-width:thin]">
          <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-white/95 backdrop-blur-md">
              <tr className="border-b border-primary-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {!rowLinksToDetail ? <th className="w-10 px-3 py-3" aria-hidden /> : null}
                <th className="px-4 py-3 font-semibold">Property</th>
                <th className="px-3 py-3 font-semibold">Price</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Attention</th>
                {!hideAgentColumn ? <th className="px-4 py-3 font-semibold">Agent</th> : null}
              </tr>
            </thead>
            <tbody>
              {listRows.map((row) => {
                const item = row.item
                const p = item.property
                const segment = row.marketSegment
                const rowKey = segment ? `${p.id}-${segment}` : p.id
                const expanded = !rowLinksToDetail && expandedId === p.id
                const linkTo = detailHref(item)
                const displayTitle = segment
                  ? `${p.title} — ${marketSegmentLabel(segment)}`
                  : p.title
                const displayPrice = segment
                  ? priceLabelForSegment(p, segment, formatZAR)
                  : priceLabel(p, formatZAR)
                return (
                  <Fragment key={rowKey}>
                    <tr
                      className={cn(
                        'border-b border-primary-50',
                        expanded && 'border-b-0 bg-primary-100',
                      )}
                    >
                      {!rowLinksToDetail ? (
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => toggle(item)}
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
                      ) : null}
                      <td className="px-4 py-3">
                        <RowCellAction
                          linkTo={linkTo}
                          onClick={() => toggle(item)}
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
                              {displayTitle}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                              <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                              {item.unitNumber ? `Unit ${item.unitNumber}` : null}
                              {item.unitNumber ? <span className="text-ink-300">·</span> : null}
                              {item.buildingName ? (
                                <>
                                  {item.buildingName}
                                  <span className="text-ink-300">·</span>
                                </>
                              ) : null}
                              {p.suburb}, {p.city}
                              <span className="text-ink-300">·</span>
                              {p.type}
                            </span>
                          </span>
                        </RowCellAction>
                      </td>
                      <td className="px-3 py-3">
                        <RowCellAction
                          linkTo={linkTo}
                          onClick={() => toggle(item)}
                          className="w-full cursor-pointer text-left font-semibold tabular text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {displayPrice}
                        </RowCellAction>
                      </td>
                      <td className="px-3 py-3">
                        <RowCellAction
                          linkTo={linkTo}
                          onClick={() => toggle(item)}
                          className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <StatusBadge item={item} />
                        </RowCellAction>
                      </td>
                      <td className="px-3 py-3">
                        <RowCellAction
                          linkTo={linkTo}
                          onClick={() => toggle(item)}
                          className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <AttentionBadges item={item} />
                        </RowCellAction>
                      </td>
                      {!hideAgentColumn ? (
                        <td className="px-4 py-3">
                          {!p.agentId && canAssign ? (
                            <QuickAssignAgent property={p} />
                          ) : (
                          <RowCellAction
                            linkTo={linkTo}
                            onClick={() => toggle(item)}
                            className="w-full cursor-pointer text-left font-medium text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <AgentAssigneeText
                              agentId={p.agentId}
                              agentName={item.agentName}
                              className="font-medium text-ink-600"
                            />
                          </RowCellAction>
                          )}
                        </td>
                      ) : null}
                    </tr>
                    {!rowLinksToDetail && !segment ? (
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
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-2 md:hidden">
        {listRows.map((row) => {
          const item = row.item
          const p = item.property
          const segment = row.marketSegment
          const rowKey = segment ? `${p.id}-${segment}` : p.id
          const expanded = !rowLinksToDetail && expandedId === p.id
          const linkTo = detailHref(item)
          const displayTitle = segment
            ? `${p.title} — ${marketSegmentLabel(segment)}`
            : p.title
          const displayPrice = segment
            ? priceLabelForSegment(p, segment, formatZAR)
            : priceLabel(p, formatZAR)
          return (
            <li
              key={rowKey}
              className={cn(
                'overflow-hidden rounded-[1.25rem] border shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]',
                expanded
                  ? 'border-primary-100 bg-primary-100'
                  : 'border-primary-100/80 bg-white',
              )}
            >
              <RowCellAction
                linkTo={linkTo}
                onClick={() => toggle(item)}
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
                    <p className="min-w-0 flex-1 truncate font-semibold text-ink">{displayTitle}</p>
                    {!rowLinksToDetail ? (
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300',
                          expanded && 'rotate-180',
                          reducedMotion && 'transition-none',
                        )}
                        strokeWidth={ICON_STROKE}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {item.unitNumber ? `Unit ${item.unitNumber} · ` : ''}
                    {item.buildingName ? `${item.buildingName} · ` : ''}
                    {p.suburb}, {p.city} · {p.type}
                  </p>
                  <p className="mt-1.5 font-semibold tabular text-ink">{displayPrice}</p>
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
              </RowCellAction>
              {!hideAgentColumn && !p.agentId && canAssign ? (
                <div className="px-4 pb-3">
                  <QuickAssignAgent property={p} />
                </div>
              ) : null}
              {!rowLinksToDetail && !segment ? (
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
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}
