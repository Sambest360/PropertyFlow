import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { priorityTone, statusTone } from '../ui'
import type { CalendarMarker } from '../admin/MiniCalendar'

/** Map badge tones → calendar dots */
export function toMarkerTone(
  tone: ReturnType<typeof statusTone> | ReturnType<typeof priorityTone>,
): CalendarMarker['tone'] {
  if (tone === 'accent') return 'accent'
  if (tone === 'danger') return 'danger'
  if (tone === 'warning') return 'warning'
  if (tone === 'success') return 'success'
  if (tone === 'info') return 'info'
  if (tone === 'brand') return 'brand'
  if (tone === 'neutral') return 'neutral'
  return 'primary'
}

export function listKey(kind: string, id: string) {
  return `${kind}:${id}`
}

export function parseListId(composite: string): { kind: string; id: string } | null {
  const idx = composite.indexOf(':')
  if (idx < 0) return null
  return {
    kind: composite.slice(0, idx),
    id: composite.slice(idx + 1),
  }
}

export function parseDay(iso: string, fallback = new Date()) {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return fallback
  return new Date(y, m - 1, d)
}

export function useEventCycle(
  dayKey: string,
  dayEventsLength: number,
  allEventDates: string[],
  setSelectedDay: (d: Date) => void,
) {
  const [eventIndex, setEventIndex] = useState(0)

  useEffect(() => {
    setEventIndex(0)
  }, [dayKey])

  useEffect(() => {
    if (eventIndex >= dayEventsLength) setEventIndex(0)
  }, [dayEventsLength, eventIndex])

  const cycleDayEvent = (dir: -1 | 1) => {
    if (dayEventsLength > 1) {
      setEventIndex((i) => (i + dir + dayEventsLength) % dayEventsLength)
      return
    }
    const days = [...new Set(allEventDates)].sort()
    if (days.length === 0) return
    const idx = days.indexOf(dayKey)
    const nextIdx =
      idx < 0
        ? dir === 1
          ? 0
          : days.length - 1
        : (idx + dir + days.length) % days.length
    const [y, m, d] = days[nextIdx].split('-').map(Number)
    setSelectedDay(new Date(y, m - 1, d))
  }

  return { eventIndex, cycleDayEvent }
}

/** Prev/next controls for day events (or jump across days with events). */
export function EventCycleNav({
  index,
  dayCount,
  hasMultiDay,
  onPrev,
  onNext,
}: {
  index: number
  dayCount: number
  hasMultiDay: boolean
  onPrev: () => void
  onNext: () => void
}) {
  if (dayCount <= 1 && !hasMultiDay) return null
  return (
    <div className="flex items-center justify-between gap-2 border-t border-primary-100 pt-3">
      <button
        type="button"
        onClick={onPrev}
        className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Previous event"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
      </button>
      <div className="min-w-0 text-center">
        <p className="text-xs font-semibold tabular text-ink">
          {dayCount > 0 ? `${index + 1} / ${dayCount}` : '—'}
        </p>
        <p className="truncate text-[11px] text-ink-400">
          {dayCount > 1 ? 'Events this day' : 'Cycle days with events'}
        </p>
      </div>
      <button
        type="button"
        onClick={onNext}
        className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Next event"
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.6} />
      </button>
    </div>
  )
}
