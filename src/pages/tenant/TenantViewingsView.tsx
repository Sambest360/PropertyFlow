import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CalendarDays, CalendarCheck, XCircle } from 'lucide-react'
import type { TenantPortalState } from '../../hooks/useTenantPortalState'
import type { Viewing } from '../../types/domain'
import { Badge, Card, EmptyState } from '../../components/ui'

type Filter = 'upcoming' | 'past' | 'all'

function isUpcoming(v: Viewing) {
  return `${v.date}T${v.time}` >= new Date().toISOString().slice(0, 16)
}

function viewingTone(status: Viewing['status']) {
  if (status === 'Scheduled') return 'brand' as const
  if (status === 'Completed') return 'success' as const
  if (status === 'Cancelled') return 'danger' as const
  return 'warning' as const // No-show
}

function formatWhen(v: Viewing) {
  const d = new Date(`${v.date}T${v.time || '00:00'}`)
  if (Number.isNaN(d.getTime())) return `${v.date} · ${v.time}`
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }) + ` · ${v.time}`
}

export function TenantViewingsView({ portal }: { portal: TenantPortalState }) {
  const { viewings, viewingProperties } = portal
  const [filter, setFilter] = useState<Filter>('upcoming')

  const counts = useMemo(() => {
    const upcoming = viewings.filter((v) => isUpcoming(v) && v.status !== 'Cancelled').length
    const past = viewings.length - upcoming
    return { upcoming, past, all: viewings.length }
  }, [viewings])

  const list = useMemo(() => {
    const upcoming = (v: Viewing) => isUpcoming(v) && v.status !== 'Cancelled'
    if (filter === 'upcoming') return viewings.filter(upcoming).reverse()
    if (filter === 'past') return viewings.filter((v) => !upcoming(v)).reverse()
    return [...viewings].reverse()
  }, [viewings, filter])

  const propertyFor = (propertyId: string) =>
    viewingProperties.find((p) => p.id === propertyId) ?? null

  if (viewings.length === 0) {
    return (
      <div data-tip-target="tenant-viewings">
      <EmptyState
        title="No viewings yet"
        description="Open any listing and tap “Book a viewing” — your booked viewings will appear here."
      />
      </div>
    )
  }

  return (
    <div data-tip-target="tenant-viewings" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Viewing filter">
        {(
          [
            ['upcoming', `Upcoming (${counts.upcoming})`],
            ['past', `Past (${counts.past})`],
            ['all', `All (${counts.all})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={
              'cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
              (filter === key
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-primary-100 bg-white text-ink-600 hover:bg-primary-50')
            }
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {list.map((v) => {
          const prop = propertyFor(v.propertyId)
          const cancelled = v.status === 'Cancelled'
          return (
            <li key={v.id}>
              <Card
                className={
                  'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between ' +
                  (cancelled ? 'opacity-70' : '')
                }
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' +
                      (cancelled
                        ? 'bg-red-50 text-red-600'
                        : isUpcoming(v)
                          ? 'bg-primary-50 text-primary'
                          : 'bg-emerald-50 text-emerald-600')
                    }
                    aria-hidden
                  >
                    {cancelled ? (
                      <XCircle className="h-5 w-5" strokeWidth={1.6} />
                    ) : isUpcoming(v) ? (
                      <CalendarDays className="h-5 w-5" strokeWidth={1.6} />
                    ) : (
                      <CalendarCheck className="h-5 w-5" strokeWidth={1.6} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">
                      {prop?.title ?? 'Property viewing'}
                    </p>
                    <p className="text-xs text-ink-400">
                      {prop ? `${prop.suburb}, ${prop.city}` : 'Address confirmed by your agency'}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-ink-600">
                      <CalendarClock className="h-4 w-4 text-ink-400" strokeWidth={1.6} aria-hidden />
                      {formatWhen(v)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
                  <Badge tone={viewingTone(v.status)}>{v.status}</Badge>
                  {prop && (
                    <Link
                      to={`/listing/${prop.id}`}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      View listing →
                    </Link>
                  )}
                </div>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
