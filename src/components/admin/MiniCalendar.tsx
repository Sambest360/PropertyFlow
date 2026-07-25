import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '../ui'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Monday-first calendar cells for one month */
function monthCells(month: Date): Array<Date | null> {
  const first = startOfMonth(month)
  const startPad = (first.getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: Array<Date | null> = []
  for (let i = 0; i < startPad; i += 1) cells.push(null)
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), d))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export type CalendarMarkerTone =
  | 'primary'
  | 'accent'
  | 'warning'
  | 'success'
  | 'danger'
  | 'info'
  | 'brand'
  | 'neutral'

export type CalendarMarker = {
  date: string // YYYY-MM-DD
  tone?: CalendarMarkerTone
}

const TONE_DOT: Record<CalendarMarkerTone, string> = {
  primary: 'bg-primary',
  accent: 'bg-accent',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  danger: 'bg-accent',
  info: 'bg-primary-400',
  brand: 'bg-primary-700',
  neutral: 'bg-ink-300',
}

const TONE_ORDER: CalendarMarkerTone[] = [
  'danger',
  'accent',
  'warning',
  'primary',
  'brand',
  'info',
  'success',
  'neutral',
]

function uniqueTones(tones: CalendarMarkerTone[]): CalendarMarkerTone[] {
  const set = new Set(tones)
  return TONE_ORDER.filter((t) => set.has(t))
}

export function MiniCalendar({
  selected,
  onSelect,
  markers = [],
  months = 2,
  onClose,
  dayViewTo,
  className,
}: {
  selected: Date
  onSelect: (d: Date) => void
  markers?: CalendarMarker[]
  months?: 1 | 2
  onClose?: () => void
  /** Link to full day view for the selected date */
  dayViewTo?: string
  className?: string
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(selected))
  const markerMap = useMemo(() => {
    const m = new Map<string, CalendarMarkerTone[]>()
    for (const mk of markers) {
      const tone = mk.tone ?? 'primary'
      const list = m.get(mk.date) ?? []
      list.push(tone)
      m.set(mk.date, list)
    }
    const uniq = new Map<string, CalendarMarkerTone[]>()
    for (const [date, tones] of m) uniq.set(date, uniqueTones(tones))
    return uniq
  }, [markers])

  const monthList = useMemo(
    () => Array.from({ length: months }, (_, i) => addMonths(cursor, i)),
    [cursor, months],
  )

  return (
    <div
      className={cn(
        'rounded-[1.25rem] border border-primary-100 bg-white p-4 shadow-[0_18px_40px_-24px_rgba(15,39,68,0.35)]',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setCursor((c) => addMonths(c, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
        </button>
        <p className="text-sm font-semibold text-ink">
          {monthList
            .map((m) =>
              new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(m),
            )
            .join('  ·  ')}
        </p>
        <div className="flex items-center gap-1">
          {dayViewTo && (
            <Link
              to={dayViewTo}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
              Day view
            </Link>
          )}
          <button
            type="button"
            className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.6} />
          </button>
          {onClose && (
            <button
              type="button"
              className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={onClose}
              aria-label="Close calendar"
            >
              <X className="h-4 w-4" strokeWidth={1.6} />
            </button>
          )}
        </div>
      </div>

      <div className={cn('grid gap-6', months === 2 && 'sm:grid-cols-2')}>
        {monthList.map((month) => {
          const cells = monthCells(month)
          const label = new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric' }).format(month)
          return (
            <div key={label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
              <div className="mb-1 grid grid-cols-7 gap-1">
                {WEEKDAYS.map((d) => (
                  <span key={d} className="text-center text-[10px] font-semibold text-ink-400">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, i) => {
                  if (!day) return <span key={`e-${i}`} className="h-9" />
                  const key = toKey(day)
                  const isSelected = sameDay(day, selected)
                  const dayTones = markerMap.get(key) ?? []
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSelect(day)}
                      className={cn(
                        'relative inline-flex h-9 cursor-pointer items-center justify-center rounded-full text-sm tabular transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        isSelected
                          ? 'bg-accent font-semibold text-white'
                          : 'text-ink hover:bg-primary-50',
                      )}
                    >
                      {day.getDate()}
                      {dayTones.length > 0 && !isSelected && (
                        <span
                          className="absolute bottom-0.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5"
                          aria-hidden
                        >
                          {dayTones.slice(0, 4).map((tone) => (
                            <span
                              key={tone}
                              className={cn('h-1 w-1 rounded-full', TONE_DOT[tone])}
                            />
                          ))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function dateKey(d: Date) {
  return toKey(d)
}
