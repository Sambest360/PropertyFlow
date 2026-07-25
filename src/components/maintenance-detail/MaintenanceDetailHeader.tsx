import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Badge, Button, priorityTone, statusTone } from '../ui'
import { formatAge, isOpenStatus, type PortfolioTicket } from '../maintenance/types'

const ICON_STROKE = 1.6

export function MaintenanceDetailHeader({
  item,
  canManage,
  onComplete,
}: {
  item: PortfolioTicket
  canManage: boolean
  onComplete: () => void
}) {
  const t = item.ticket
  const open = isOpenStatus(t.status)

  return (
    <div className="mb-5">
      <Link
        to="/workspace/operations/maintenance"
        className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        All maintenance
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              {t.title}
            </h1>
            <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
            <Badge tone={statusTone(t.status)}>{t.status}</Badge>
            {t.warrantyCovered && <Badge tone="success">Warranty</Badge>}
            {t.escalatedAt && <Badge tone="danger">Escalated</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {t.id} · {item.property.title} · {formatAge(item.ageHours)} open
          </p>
        </div>

        {canManage && open && (
          <div className="flex flex-wrap items-center gap-2">
            <Button className="min-h-11" onClick={onComplete}>
              <CheckCircle2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Complete work
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
