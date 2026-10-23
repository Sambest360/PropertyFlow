import { Link } from 'react-router-dom'
import { ArrowUpRight, DoorOpen, MapPin, Users } from 'lucide-react'
import { Badge, cn, statusTone } from '../ui'
import { AttendanceActions } from './AttendanceActions'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import {
  viewingPrimaryLabel,
  viewingRowKey,
  viewingStatus,
  viewingAgentId,
  viewingDeskPath,
  viewingDeskLinkLabel,
  type PortfolioViewing,
} from './types'
import { UnopenedDot, useUnopened } from '../../context/UnopenedContext'
import { TenantConsentBadge } from './TenantConsentBadge'

const ICON_STROKE = 1.6

export function ViewingsAgenda({
  items,
  reducedMotion,
  emptyLabel,
  onAttendance,
}: {
  items: PortfolioViewing[]
  reducedMotion?: boolean
  emptyLabel?: string
  onAttendance?: (id: string, status: 'COMPLETED' | 'NO_SHOW', viewingMode: 'IN_PERSON' | 'VIRTUAL') => void
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-[1.25rem] border border-dashed border-primary-100 bg-white px-6 py-12 text-center text-sm text-ink-500">
        {emptyLabel ?? 'Nothing scheduled for this day.'}
      </div>
    )
  }

  const byTime = new Map<string, PortfolioViewing[]>()
  for (const item of items) {
    const time = item.kind === 'booking' ? item.viewing.time : item.slot.time
    const list = byTime.get(time) ?? []
    list.push(item)
    byTime.set(time, list)
  }
  const times = [...byTime.keys()].sort()

  return (
    <div className="space-y-6">
      {times.map((time) => (
        <section key={time} aria-labelledby={`agenda-time-${time}`}>
          <div className="mb-2 flex items-baseline gap-3">
            <h3
              id={`agenda-time-${time}`}
              className="tabular font-display text-2xl font-semibold text-ink"
            >
              {time}
            </h3>
            <span className="h-px flex-1 bg-primary-100" aria-hidden />
          </div>
          <ul className="space-y-2">
            {(byTime.get(time) ?? []).map((item) => (
              <AgendaRow key={viewingRowKey(item)} item={item} reducedMotion={reducedMotion} onAttendance={onAttendance} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function AgendaAgent({ item }: { item: PortfolioViewing }) {
  const { label } = useAgentDisplay()
  const text = label(viewingAgentId(item), item.agentName)
  if (!text) return null
  return (
    <>
      <span aria-hidden>·</span>
      <span>{text}</span>
    </>
  )
}

function AgendaRow({
  item,
  reducedMotion,
  onAttendance,
}: {
  item: PortfolioViewing
  reducedMotion?: boolean
  onAttendance?: (id: string, status: 'COMPLETED' | 'NO_SHOW', viewingMode: 'IN_PERSON' | 'VIRTUAL') => void
}) {
  const st = viewingStatus(item)
  const to = viewingDeskPath(item)
  const { markOpened } = useUnopened()
  const bookingId = item.kind === 'booking' ? item.viewing.id : null
  const linkLabel = viewingDeskLinkLabel(item)
  const peopleLabel =
    item.kind === 'slot'
      ? `${item.slot.booked}/${item.slot.capacity} booked`
      : item.viewing.applicantName

  return (
    <li className="space-y-2">
      <Link
        to={to}
        onClick={() => markOpened('viewing', bookingId)}
        className={cn(
          'group flex min-h-14 cursor-pointer items-stretch gap-0 overflow-hidden rounded-[1.25rem] border border-primary-100 bg-white transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          reducedMotion && 'transition-none',
        )}
      >
        <span
          className={cn(
            'w-1.5 shrink-0',
            item.kind === 'slot' ? 'bg-primary' : 'bg-accent',
          )}
          aria-hidden
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
            {item.kind === 'slot' ? (
              <DoorOpen className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            ) : (
              <Users className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-ink">
                {bookingId ? <UnopenedDot kind="viewing" id={bookingId} className="mr-1.5 align-middle" /> : null}
                {item.property.title}
              </span>
              <Badge tone={statusTone(st)}>{st}</Badge>
              {item.kind === 'booking' && <TenantConsentBadge viewing={item.viewing} />}
              <Badge tone="neutral">{item.kind === 'slot' ? 'Open slot' : 'Invite'}</Badge>
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
                {item.property.suburb}
              </span>
              <span aria-hidden>·</span>
              <span>{viewingPrimaryLabel(item)}</span>
              <AgendaAgent item={item} />
            </span>
          </span>
          <span className="hidden tabular text-xs font-medium text-ink-500 sm:block">
            {peopleLabel}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-80 group-hover:opacity-100">
            {linkLabel}
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
          </span>
        </span>
      </Link>
      {item.kind === 'booking' && onAttendance ? (
        <div className="px-1">
          <AttendanceActions onMark={(status, viewingMode) => onAttendance(item.viewing.id, status, viewingMode)} />
        </div>
      ) : null}
    </li>
  )
}
