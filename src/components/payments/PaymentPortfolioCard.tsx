import { CalendarDays, ChevronDown, MapPin, User } from 'lucide-react'
import { Badge, Card, cn, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { PaymentExpansion } from './PaymentsListView'
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
        <span className="tabular">{item.attachmentCount}</span> docs
      </Badge>
    )
  }
  return <Badge tone="warning">Due</Badge>
}

export function PaymentPortfolioCard({
  item,
  expanded,
  onToggle,
  hideParty,
  reducedMotion,
}: {
  item: PortfolioPayment
  expanded?: boolean
  onToggle: (item: PortfolioPayment) => void
  hideParty?: boolean
  reducedMotion?: boolean
}) {
  const p = item.payment

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[1.25rem] border bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] transition-shadow duration-200',
        expanded
          ? 'border-primary-200 ring-1 ring-primary-100 shadow-[0_14px_28px_-16px_rgba(15,39,68,0.28)]'
          : 'border-primary-100/80',
        reducedMotion && 'transition-none',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse payment details' : 'Expand payment details'}
        className="w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <Card hover className="border-0 shadow-none">
          <div className="p-4">
            <div className="flex items-start gap-3">
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
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 font-semibold text-ink">{p.type}</h3>
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
                <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-500">
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
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  <AttentionBadges item={item} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-lg font-semibold tabular text-ink">
                  {paymentAmountLabel(p, formatZAR)}
                </p>
                <p className="mt-0.5 text-xs tabular text-ink-500">Due {p.dueDate}</p>
              </div>
            </div>
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
          <div className="border-t border-primary-100/80 bg-primary-50/60 px-4 py-4">
            <PaymentExpansion item={item} hideParty={hideParty} reducedMotion={reducedMotion} />
          </div>
        </div>
      </div>
    </div>
  )
}
