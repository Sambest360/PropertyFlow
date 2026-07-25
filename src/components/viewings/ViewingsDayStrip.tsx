import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../ui'

const ICON_STROKE = 1.6
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function addDays(iso: string, delta: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

function startOfWeek(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d.toISOString().slice(0, 10)
}

export function ViewingsDayStrip({
  selectedDate,
  onSelectDate,
  countsByDate,
  reducedMotion,
}: {
  selectedDate: string
  onSelectDate: (date: string) => void
  countsByDate: Record<string, number>
  reducedMotion?: boolean
}) {
  const weekStart = startOfWeek(selectedDate)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="rounded-[1.25rem] border border-primary-100/80 bg-white p-3 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Week strip</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => onSelectDate(addDays(selectedDate, -7))}
            className={cn(
              'inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              reducedMotion && 'transition-none',
            )}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => onSelectDate(addDays(selectedDate, 7))}
            className={cn(
              'inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              reducedMotion && 'transition-none',
            )}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="listbox" aria-label="Select day">
        {days.map((date) => {
          const d = new Date(`${date}T12:00:00`)
          const selected = date === selectedDate
          const count = countsByDate[date] ?? 0
          return (
            <button
              key={date}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelectDate(date)}
              className={cn(
                'flex min-h-[4.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                reducedMotion && 'transition-none',
                selected
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-primary-50/50 text-ink hover:bg-primary-50',
              )}
            >
              <span
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wide',
                  selected ? 'text-white/80' : 'text-ink-400',
                )}
              >
                {WEEKDAYS[d.getDay()]}
              </span>
              <span className="tabular text-lg font-semibold leading-none">{d.getDate()}</span>
              <span
                className={cn(
                  'tabular text-[10px] font-medium',
                  selected ? 'text-white/80' : count > 0 ? 'text-primary' : 'text-ink-400',
                )}
              >
                {count > 0 ? `${count}` : '—'}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
