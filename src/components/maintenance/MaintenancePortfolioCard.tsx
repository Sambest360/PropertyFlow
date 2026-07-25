import {
  ChevronDown,
  HardHat,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import { Badge, Card, cn, priorityTone, statusTone } from '../ui'
import { formatAge, type PortfolioTicket } from './types'
import { TicketExpansion } from './MaintenanceListView'

const ICON_STROKE = 1.6

export function MaintenancePortfolioCard({
  item,
  expanded,
  onToggle,
  reducedMotion,
}: {
  item: PortfolioTicket
  expanded: boolean
  onToggle: (item: PortfolioTicket) => void
  reducedMotion?: boolean
}) {
  const t = item.ticket

  return (
    <Card
      className={cn(
        'overflow-hidden transition-colors duration-200',
        expanded && 'border-primary-200 bg-primary-50/30',
        reducedMotion && 'transition-none',
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(item)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer flex-col gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-semibold text-ink">{t.title}</h2>
              <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
            </div>
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-500">
              <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              {item.property.suburb}, {item.property.city}
            </p>
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

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(t.status)}>{t.status}</Badge>
          {t.warrantyCovered && (
            <Badge tone="success" className="gap-1">
              <ShieldCheck className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
              Warranty
            </Badge>
          )}
          {t.escalatedAt && <Badge tone="danger">Escalated</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          <span className="truncate">{t.assetLabel}</span>
          <span className="tabular">{formatAge(item.ageHours)} open</span>
          <span className="inline-flex items-center gap-1 truncate">
            <HardHat className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
            {item.contractorName ?? 'Unassigned'}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-primary-100/80 px-4 py-4">
          <TicketExpansion item={item} reducedMotion={reducedMotion} />
        </div>
      )}
    </Card>
  )
}
