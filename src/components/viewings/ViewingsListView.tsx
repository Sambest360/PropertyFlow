import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronDown,
  MapPin,
  User,
  Users,
} from 'lucide-react'
import type { Viewing } from '../../types/domain'
import { Badge, Button, Select, cn, statusTone } from '../ui'
import {
  VIEWING_BOOKING_STATUSES,
  viewingPrimaryLabel,
  viewingStatus,
  viewingWhenLabel,
  type PortfolioViewing,
} from './types'

const ICON_STROKE = 1.6

function KindBadge({ item }: { item: PortfolioViewing }) {
  if (item.kind === 'slot') {
    return (
      <Badge tone="brand" className="gap-1">
        <Users className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
        Slot
      </Badge>
    )
  }
  return (
    <Badge tone="info" className="gap-1">
      <User className="h-3 w-3" strokeWidth={ICON_STROKE} aria-hidden />
      Booking
    </Badge>
  )
}

function PropertyThumb({ item, expanded }: { item: PortfolioViewing; expanded?: boolean }) {
  const src = item.property.images[0]
  return src ? (
    <img
      src={src}
      alt=""
      className={cn(
        'shrink-0 rounded-lg object-cover ring-1 ring-primary-100 transition-[width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        expanded ? 'h-16 w-24' : 'h-12 w-16',
      )}
    />
  ) : (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary ring-1 ring-primary-100',
        expanded ? 'h-16 w-24' : 'h-12 w-16',
      )}
    >
      <Building2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
    </span>
  )
}

export function ViewingExpansion({
  item,
  onUpdateBooking,
  onBookSlot,
  reducedMotion,
}: {
  item: PortfolioViewing
  onUpdateBooking?: (id: string, patch: Partial<Viewing>) => void
  onBookSlot?: (slotId: string, applicantName: string) => void
  reducedMotion?: boolean
}) {
  const p = item.property
  const detailId = `/workspace/properties/${p.id}?tab=viewings`
  const [walkIn, setWalkIn] = useState('Walk-in applicant')

  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Property', value: p.title },
    { label: 'Address', value: `${p.address} · ${p.suburb}` },
    { label: 'When', value: viewingWhenLabel(item) },
    { label: 'Agent', value: item.agentName ?? 'Unassigned' },
    ...(item.kind === 'booking'
      ? [
          { label: 'Applicant', value: item.viewing.applicantName },
          { label: 'Email', value: item.viewing.applicantEmail ?? '—' },
          { label: 'Attendance', value: item.viewing.attendance || '—' },
          { label: 'Notes', value: item.viewing.notes?.trim() || item.viewing.feedback || '—' },
        ]
      : [
          {
            label: 'Capacity',
            value: `${item.slot.booked} / ${item.slot.capacity} booked`,
          },
          {
            label: 'Duration',
            value: item.slot.durationMinutes ? `${item.slot.durationMinutes} min` : '—',
          },
          { label: 'Notes', value: item.slot.notes?.trim() || '—' },
        ]),
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        {p.images[0] ? (
          <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-primary-100/80">
            <img
              src={p.images[0]}
              alt=""
              className={cn(
                'max-h-full max-w-full object-contain',
                !reducedMotion && 'transition-opacity duration-200',
              )}
            />
          </div>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-primary-50 text-sm text-ink-400 ring-1 ring-primary-100">
            No property photo
          </div>
        )}
        <KindBadge item={item} />
      </div>

      <div className="min-w-0">
        <dl className="grid gap-2 sm:grid-cols-2">
          {metaRows.map((row) => (
            <div
              key={row.label}
              className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-primary-100/80"
            >
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {row.label}
              </dt>
              <dd className="mt-0.5 min-w-0 truncate text-sm font-semibold text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>

        {item.kind === 'booking' && onUpdateBooking && (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Update status
            </p>
            <Select
              className="min-h-11 w-full max-w-xs"
              value={item.viewing.status}
              onChange={(e) =>
                onUpdateBooking(item.viewing.id, {
                  status: e.target.value as Viewing['status'],
                  attendance:
                    e.target.value === 'Completed'
                      ? 'Attended'
                      : e.target.value === 'No-show'
                        ? 'No-show'
                        : item.viewing.attendance,
                })
              }
            >
              {VIEWING_BOOKING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        )}

        {item.kind === 'slot' && item.slot.status === 'Open' && onBookSlot && (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              Book into this slot
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                className="min-h-11 min-w-[12rem] flex-1 rounded-xl border border-primary-100 bg-white px-3 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                value={walkIn}
                onChange={(e) => setWalkIn(e.target.value)}
                aria-label="Applicant name"
              />
              <Button
                type="button"
                className="min-h-11 rounded-2xl"
                onClick={() => onBookSlot(item.slot.id, walkIn.trim() || 'Walk-in applicant')}
              >
                Book applicant
              </Button>
            </div>
            {item.bookings.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {item.bookings.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-primary-100"
                  >
                    <span className="font-medium text-ink">{b.applicantName}</span>
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={detailId} className="inline-flex">
            <Button className="min-h-11 cursor-pointer gap-2 rounded-2xl">
              Open property viewings
              <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </Link>
          <Link to={`/workspace/properties/${p.id}`} className="inline-flex">
            <Button variant="secondary" className="min-h-11 rounded-2xl">
              Property details
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export function ViewingsListView({
  items,
  expandedId,
  onToggle,
  onUpdateBooking,
  onBookSlot,
  reducedMotion,
}: {
  items: PortfolioViewing[]
  expandedId?: string | null
  onToggle: (item: PortfolioViewing) => void
  onUpdateBooking?: (id: string, patch: Partial<Viewing>) => void
  onBookSlot?: (slotId: string, applicantName: string) => void
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
                <th className="px-4 py-3 font-semibold">Property</th>
                <th className="px-3 py-3 font-semibold">When</th>
                <th className="px-3 py-3 font-semibold">Who / slot</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Agent</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const expanded = expandedId === item.id
                return (
                  <Fragment key={item.id}>
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
                          aria-label={expanded ? 'Collapse viewing details' : 'Expand viewing details'}
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
                          <PropertyThumb item={item} expanded={expanded} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-ink group-hover:text-primary">
                              {item.property.title}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                              <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                              {item.property.suburb}, {item.property.city}
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
                          <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                            {viewingWhenLabel(item)}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <span className="block font-medium text-ink">{viewingPrimaryLabel(item)}</span>
                          <span className="mt-0.5 inline-flex">
                            <KindBadge item={item} />
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <Badge tone={statusTone(viewingStatus(item))}>{viewingStatus(item)}</Badge>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(item)}
                          className="w-full cursor-pointer text-left font-medium text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {item.agentName ?? 'Unassigned'}
                        </button>
                      </td>
                    </tr>
                    <tr className={cn(!expanded && 'border-b border-primary-50')}>
                      <td colSpan={6} className="p-0">
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
                              <ViewingExpansion
                                item={item}
                                reducedMotion={reducedMotion}
                                onUpdateBooking={onUpdateBooking}
                                onBookSlot={onBookSlot}
                              />
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
          const expanded = expandedId === item.id
          return (
            <li
              key={item.id}
              className={cn(
                'overflow-hidden rounded-[1.25rem] border shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]',
                expanded ? 'border-primary-100 bg-primary-100' : 'border-primary-100/80 bg-white',
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(item)}
                aria-expanded={expanded}
                className="flex w-full cursor-pointer gap-3 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <PropertyThumb item={item} expanded={expanded} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold text-ink">
                      {item.property.title}
                    </p>
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
                  <p className="mt-0.5 truncate text-xs tabular text-ink-500">
                    {viewingWhenLabel(item)}
                  </p>
                  <p className="mt-1.5 font-medium text-ink">{viewingPrimaryLabel(item)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(viewingStatus(item))}>{viewingStatus(item)}</Badge>
                    <KindBadge item={item} />
                  </div>
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
                    <ViewingExpansion
                      item={item}
                      reducedMotion={reducedMotion}
                      onUpdateBooking={onUpdateBooking}
                      onBookSlot={onBookSlot}
                    />
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
