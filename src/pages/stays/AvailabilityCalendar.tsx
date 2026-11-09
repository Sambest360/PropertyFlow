/** Two-month night picker: taken nights are struck through; click arrival, then departure. */
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, isoDay } from '../../lib/api/guesthousesApi'

type Range = { from: string; to: string }

export function AvailabilityCalendar({
  unavailable,
  checkIn,
  checkOut,
  onChange,
}: {
  unavailable: Range[]
  checkIn?: string
  checkOut?: string
  onChange: (checkIn: string, checkOut: string | undefined) => void
}) {
  const todayIso = isoDay(new Date())
  const [offset, setOffset] = useState(0)
  const taken = useMemo(() => {
    const s = new Set<string>()
    for (const r of unavailable) for (let d = r.from; d < r.to; d = addDays(d, 1)) s.add(d)
    return s
  }, [unavailable])

  const months = [0, 1].map((i) => {
    const base = new Date()
    base.setDate(1)
    base.setMonth(base.getMonth() + offset + i)
    return { year: base.getFullYear(), month: base.getMonth() }
  })

  const pick = (d: string) => {
    if (!checkIn || checkOut || d <= checkIn) {
      if (taken.has(d)) return
      onChange(d, undefined)
      return
    }
    // A departure day may be taken (someone arrives that day); nights before it may not.
    for (let x = checkIn; x < d; x = addDays(x, 1)) if (taken.has(x)) return onChange(d, undefined)
    onChange(checkIn, d)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded-full p-1 hover:bg-primary-50 disabled:opacity-30" disabled={offset === 0} onClick={() => setOffset((o) => o - 1)} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" className="rounded-full p-1 hover:bg-primary-50 disabled:opacity-30" disabled={offset >= 10} onClick={() => setOffset((o) => o + 1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {months.map(({ year, month }) => {
          const first = new Date(Date.UTC(year, month, 1))
          const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
          const lead = (first.getUTCDay() + 6) % 7
          return (
            <div key={`${year}-${month}`}>
              <p className="mb-1 text-center text-sm font-semibold text-ink">
                {first.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
              </p>
              <div className="grid grid-cols-7 text-center text-[11px] text-ink-400">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
                {Array.from({ length: lead }).map((_, i) => <span key={`l${i}`} />)}
                {Array.from({ length: days }).map((_, i) => {
                  const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
                  const past = d < todayIso
                  const isTaken = taken.has(d)
                  const edge = d === checkIn || d === checkOut
                  const inside = checkIn && checkOut && d > checkIn && d < checkOut
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={past}
                      onClick={() => pick(d)}
                      className={[
                        'mx-auto flex h-8 w-8 items-center justify-center rounded-full',
                        past ? 'text-ink-300' : isTaken ? 'text-ink-300 line-through' : 'text-ink hover:bg-primary-50',
                        inside ? 'bg-primary-50' : '',
                        edge ? 'bg-primary font-semibold text-white hover:bg-primary' : '',
                      ].join(' ')}
                      aria-label={`${d}${isTaken ? ' (booked)' : ''}`}
                    >
                      {i + 1}
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
