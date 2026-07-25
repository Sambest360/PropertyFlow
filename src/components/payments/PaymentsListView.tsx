import { Link } from 'react-router-dom'
import { Fragment } from 'react'
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  FileText,
  MapPin,
  User,
} from 'lucide-react'
import { formatZAR } from '../../data/seed'
import { Badge, Button, cn, statusTone } from '../ui'
import { paymentAmountLabel, type PortfolioPayment } from './types'

const ICON_STROKE = 1.6

function AttentionBadges({ item }: { item: PortfolioPayment }) {
  const p = item.payment
  if (p.status === 'Paid') return <Badge tone="neutral">Settled</Badge>
  if (p.status === 'Cancelled') return <Badge tone="neutral">Cancelled</Badge>
  if (p.status === 'Overdue' || item.daysOverdue > 0) {
    return (
      <Badge tone="danger" className="gap-1">
        <span className="tabular">{item.daysOverdue || 0}</span>d overdue
      </Badge>
    )
  }
  if (item.attachmentCount > 0) {
    return (
      <Badge tone="info" className="gap-1">
        <FileText className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
        <span className="tabular">{item.attachmentCount}</span> docs
      </Badge>
    )
  }
  return <Badge tone="warning">Due</Badge>
}

export function PaymentExpansion({
  item,
  hideParty,
  reducedMotion,
}: {
  item: PortfolioPayment
  hideParty?: boolean
  reducedMotion?: boolean
}) {
  const p = item.payment
  const detailId = `/workspace/operations/payments/${p.id}`

  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Type', value: p.type },
    { label: 'Due', value: p.dueDate },
    { label: 'Amount', value: paymentAmountLabel(p, formatZAR) },
    { label: 'Status', value: p.status },
  ]
  if (!hideParty) metaRows.push({ label: 'Party', value: p.partyName })
  if (item.property) {
    metaRows.push({ label: 'Property', value: item.property.title })
    metaRows.push({ label: 'Area', value: `${item.property.suburb}, ${item.property.city}` })
  }
  if (p.reference) metaRows.push({ label: 'Reference', value: p.reference })
  if (p.method) metaRows.push({ label: 'Method', value: p.method })

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="min-w-0 space-y-3">
        <p className="font-display text-3xl font-semibold tabular tracking-tight text-ink">
          {paymentAmountLabel(p, formatZAR)}
        </p>
        <p className="text-sm text-ink-500">
          {p.id}
          {p.paidAt ? ` · Paid ${p.paidAt}` : ` · Due ${p.dueDate}`}
        </p>
      </div>

      <div className="min-w-0">
        <dl className="grid gap-2 sm:grid-cols-2">
          {metaRows.map((row) => (
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
          {item.property && (
            <Link
              to={`/workspace/properties/${item.property.id}?tab=payments`}
              className="inline-flex"
            >
              <Button variant="secondary" className="min-h-11 rounded-2xl">
                <MapPin className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Property payments
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

export function PaymentsListView({
  items,
  expandedId,
  onToggle,
  hideParty,
  reducedMotion,
}: {
  items: PortfolioPayment[]
  expandedId?: string | null
  onToggle: (item: PortfolioPayment) => void
  hideParty?: boolean
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
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-3 py-3 font-semibold">Amount</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Attention</th>
                <th className="px-4 py-3 font-semibold">Due</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const p = item.payment
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
                          aria-label={expanded ? 'Collapse payment details' : 'Expand payment details'}
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
                          <span
                            className={cn(
                              'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ring-primary-100',
                              p.status === 'Paid'
                                ? 'bg-emerald-50 text-emerald-700'
                                : p.status === 'Overdue' || item.daysOverdue > 0
                                  ? 'bg-accent/10 text-accent'
                                  : 'bg-primary-50 text-primary',
                            )}
                            aria-hidden
                          >
                            <CalendarDays className="h-5 w-5" strokeWidth={ICON_STROKE} />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink group-hover:text-primary">
                              {p.type}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                              {item.property ? (
                                <>
                                  <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                                  {item.property.suburb}, {item.property.city}
                                </>
                              ) : (
                                'Unlinked property'
                              )}
                              {!hideParty && (
                                <>
                                  <span className="text-ink-300">·</span>
                                  <User className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                                  <span className="truncate">{p.partyName}</span>
                                </>
                              )}
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
                          {paymentAmountLabel(p, formatZAR)}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Badge tone={statusTone(p.status)}>{p.status}</Badge>
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
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-left tabular text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {p.dueDate}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-primary-100 bg-primary-50/60">
                        <td colSpan={6} className="px-4 py-4 sm:px-5">
                          <PaymentExpansion
                            item={item}
                            hideParty={hideParty}
                            reducedMotion={reducedMotion}
                          />
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

      {/* Mobile stacked list */}
      <ul className="space-y-2 md:hidden">
        {items.map((item) => {
          const p = item.payment
          const expanded = expandedId === p.id
          return (
            <li
              key={p.id}
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
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{p.type}</span>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </span>
                  <span className="mt-1 block truncate text-xs text-ink-500">
                    {item.property?.title ?? 'Unlinked'} · Due {p.dueDate}
                  </span>
                </span>
                <span className="shrink-0 font-display text-base font-semibold tabular text-ink">
                  {paymentAmountLabel(p, formatZAR)}
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
                  <PaymentExpansion item={item} hideParty={hideParty} reducedMotion={reducedMotion} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Re-export helper used by detail pages — keep import path stable */
export { PaymentPropertyLink } from './PaymentPropertyLink'
