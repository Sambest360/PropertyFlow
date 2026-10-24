import { Link } from 'react-router-dom'
import { Fragment } from 'react'
import {
  ArrowRight,
  ChevronDown,
  HardHat,
  MapPin,
  Replace,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import type { MaintenanceTicket } from '../../types/domain'
import { Badge, Button, cn, priorityTone, statusTone } from '../ui'
import { formatAge, type PortfolioTicket } from './types'
import { UnopenedDot } from '../../context/UnopenedContext'

const ICON_STROKE = 1.6

function AttentionBadges({ item }: { item: PortfolioTicket }) {
  const t = item.ticket
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {t.escalatedAt && <Badge tone="danger">Escalated</Badge>}
      {t.warrantyCovered && (
        <Badge tone="success" className="gap-1">
          <ShieldCheck className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
          Warranty
        </Badge>
      )}
      {!t.contractorId && t.status !== 'Completed' && t.status !== 'Cancelled' && (
        <Badge tone="warning">Unassigned</Badge>
      )}
      {!t.escalatedAt && !t.warrantyCovered && t.contractorId && (
        <Badge tone="neutral">Quiet</Badge>
      )}
    </div>
  )
}

function DispositionChip({ disposition }: { disposition: string }) {
  if (disposition === 'REPLACE') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
        <Replace className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
        Replace
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-500">
      <Wrench className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
      Repair
    </span>
  )
}

export function TicketExpansion({
  item,
  reducedMotion,
}: {
  item: PortfolioTicket
  reducedMotion?: boolean
}) {
  const t = item.ticket
  const detailId = `/workspace/operations/maintenance/${t.id}`
  const health = item.assetHealth

  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Property', value: item.property.title },
    { label: 'Area', value: `${item.property.suburb}, ${item.property.city}` },
    { label: 'Asset', value: t.assetLabel },
    { label: 'Priority', value: t.priority },
    { label: 'Status', value: t.status },
    { label: 'Age', value: `${formatAge(item.ageHours)} open` },
    { label: 'Contractor', value: item.contractorName ?? 'Unassigned' },
    { label: 'Disposition', value: health.disposition_label },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-3">
        <p className="text-sm leading-relaxed text-ink-600 line-clamp-4">{t.description}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
          <Badge tone={statusTone(t.status)}>{t.status}</Badge>
          <DispositionChip disposition={health.disposition} />
        </div>
      </div>

      <div className="min-w-0">
        <dl className="grid gap-2 sm:grid-cols-2">
          {metaRows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                {row.label}
              </dt>
              <dd className="mt-0.5 truncate text-sm font-semibold text-ink" title={row.value}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <div
          className={cn(
            'mt-4 flex flex-wrap gap-2 border-t border-primary-100/80 pt-4',
            reducedMotion && 'transition-none',
          )}
        >
          <Link to={detailId} className="inline-flex">
            <Button className="min-h-11 cursor-pointer gap-2 rounded-2xl">
              Open full details
              <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </Link>
          <Link
            to={`/workspace/properties/${item.property.id}?tab=maintenance`}
            className="inline-flex"
          >
            <Button variant="secondary" className="min-h-11 rounded-2xl">
              <MapPin className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Property maintenance
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export function MaintenanceListView({
  items,
  expandedId,
  onToggle,
  reducedMotion,
}: {
  items: PortfolioTicket[]
  expandedId?: string | null
  onToggle: (item: PortfolioTicket) => void
  reducedMotion?: boolean
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] md:block">
        <div className="max-h-[min(78vh,56rem)] overflow-auto [scrollbar-width:thin]">
          <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-white/95 backdrop-blur-md">
              <tr className="border-b border-primary-100 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <th className="w-10 px-3 py-3" aria-hidden />
                <th className="px-4 py-3 font-semibold">Maintenance</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Attention</th>
                <th className="px-3 py-3 font-semibold">Contractor</th>
                <th className="px-4 py-3 font-semibold">Age</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const t = item.ticket
                const expanded = expandedId === t.id
                return (
                  <Fragment key={t.id}>
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
                          aria-label={
                            expanded ? 'Collapse maintenance details' : 'Expand maintenance details'
                          }
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
                          <PriorityPip priority={t.priority} expanded={expanded} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink group-hover:text-primary">
                              <UnopenedDot kind="ticket" id={t.id} className="mr-1.5 align-middle" />{t.title}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                              <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                              {item.property.suburb}, {item.property.city}
                              <span className="text-ink-300">·</span>
                              {t.assetLabel}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <div className="flex flex-col gap-1">
                            <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                            <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                          </div>
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
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-left text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <span className="inline-flex items-center gap-1">
                            <HardHat className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                            {item.contractorName ?? 'Unassigned'}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-left tabular text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {formatAge(item.ageHours)}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-primary-100 bg-primary-50/60">
                        <td colSpan={6} className="px-4 py-4 sm:px-5">
                          <TicketExpansion item={item} reducedMotion={reducedMotion} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-2 md:hidden">
        {items.map((item) => {
          const t = item.ticket
          const expanded = expandedId === t.id
          return (
            <li
              key={t.id}
              className={cn(
                'overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.14)]',
                expanded && 'border-primary-200 bg-primary-50/40',
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(item)}
                aria-expanded={expanded}
                className="flex w-full min-h-14 cursor-pointer items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <PriorityPip priority={t.priority} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink"><UnopenedDot kind="ticket" id={t.id} className="mr-1.5 align-middle" />{t.title}</span>
                    <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                  </span>
                  <span className="mt-1 block truncate text-xs text-ink-500">
                    {item.property.title} · {formatAge(item.ageHours)} open
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300',
                    expanded && 'rotate-180',
                    reducedMotion && 'transition-none',
                  )}
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
              </button>
              {expanded && (
                <div className="border-t border-primary-100/80 px-4 py-4">
                  <TicketExpansion item={item} reducedMotion={reducedMotion} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function PriorityPip({
  priority,
  expanded,
}: {
  priority: MaintenanceTicket['priority']
  expanded?: boolean
}) {
  const tone =
    priority === 'Emergency' || priority === 'Urgent'
      ? 'bg-accent'
      : priority === 'High'
        ? 'bg-amber-500'
        : priority === 'Medium'
          ? 'bg-primary'
          : 'bg-ink-300'
  return (
    <span
      className={cn(
        'shrink-0 rounded-full',
        tone,
        expanded ? 'h-12 w-1.5' : 'h-10 w-1.5',
      )}
      title={priority}
      aria-hidden
    />
  )
}
