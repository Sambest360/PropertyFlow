/**
 * Night picker for a stay: tap the arrival day, then the departure day.
 * The chosen dates show in the Check in / Check out boxes above the months,
 * the nights between are shaded, and taken nights are struck through.
 */
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { addDays, fmtDay, isoDay } from '../../lib/api/guesthousesApi'

type Range = { from: string; to: string }

const nightsBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

export function AvailabilityCalendar({
  unavailable,
  checkIn,
  checkOut,
  onChange,
  minNights = 1,
}: {
  unavailable: Range[]
  checkIn?: string
  checkOut?: string
  onChange: (checkIn: string | undefined, checkOut: string | undefined) => void
  minNights?: number
}) {
  const todayIso = isoDay(new Date())
  const [offset, setOffset] = useState(0)
  const [hint, setHint] = useState<string | null>(null)
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

  const choosingCheckOut = Boolean(checkIn && !checkOut)

  const pick = (d: string) => {
    setHint(null)
    if (!checkIn || checkOut || d <= checkIn) {
      if (taken.has(d)) {
        setHint('That night is already booked. Pick another arrival day.')
        return
      }
      onChange(d, undefined)
      return
    }
    // A departure day may be taken (someone arrives that day); nights before it may not.
    for (let x = checkIn; x < d; x = addDays(x, 1)) {
      if (taken.has(x)) {
        setHint('Some nights in that range are booked. Starting again from this day.')
        if (!taken.has(d)) onChange(d, undefined)
        return
      }
    }
    if (nightsBetween(checkIn, d) < minNights) {
      setHint(`This room needs at least ${minNights} nights.`)
      return
    }
    onChange(checkIn, d)
  }

  const box = (label: string, value: string | undefined, active: boolean, placeholder: string) => (
    <div className={`rounded-xl border px-3 py-2 ${active ? 'border-primary ring-2 ring-primary/20' : 'border-primary-100'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`text-sm font-medium ${value ? 'text-ink' : 'text-ink-300'}`}>{value ? fmtDay(value) : placeholder}</p>
    </div>
  )

  const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        {box('Check in', checkIn, !checkIn || Boolean(checkIn && checkOut), 'Add date')}
        {box('Check out', checkOut, choosingCheckOut, choosingCheckOut ? 'Now tap departure' : 'Add date')}
      </div>
      <div className="mb-3 flex min-h-6 items-center justify-between gap-2 text-sm">
        <span className={hint ? 'text-accent-700' : 'text-ink-400'}>
          {hint ?? (nights ? `${nights} night${nights === 1 ? '' : 's'} selected` : choosingCheckOut ? 'Tap your departure day' : 'Tap your arrival day')}
        </span>
        {checkIn && (
          <button type="button" onClick={() => { setHint(null); onChange(undefined, undefined) }} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
            <X className="h-3.5 w-3.5" /> Clear dates
          </button>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="rounded-full p-2 hover:bg-primary-50 disabled:opacity-30" disabled={offset === 0} onClick={() => setOffset((o) => o - 1)} aria-label="Previous month">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button type="button" className="rounded-full p-2 hover:bg-primary-50 disabled:opacity-30" disabled={offset >= 10} onClick={() => setOffset((o) => o + 1)} aria-label="Next month">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {months.map(({ year, month }) => {
          const first = new Date(Date.UTC(year, month, 1))
          const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
          const lead = (first.getUTCDay() + 6) % 7
          return (
            <div key={`${year}-${month}`}>
              <p className="mb-2 text-center text-sm font-semibold text-ink">
                {first.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
              </p>
              <div className="mb-1 grid grid-cols-7 text-center text-[11px] text-ink-400">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-1 text-center text-sm">
                {Array.from({ length: lead }).map((_, i) => <span key={`l${i}`} />)}
                {Array.from({ length: days }).map((_, i) => {
                  const d = `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
                  const past = d < todayIso
                  const isTaken = taken.has(d)
                  const isStart = d === checkIn
                  const isEnd = d === checkOut
                  const inside = Boolean(checkIn && checkOut && d > checkIn && d < checkOut)
                  // Shaded band behind the range so the stay reads as one block.
                  const band = checkIn && checkOut
                    ? inside ? 'bg-primary-50' : isStart ? 'bg-gradient-to-r from-transparent from-50% to-primary-50 to-50%' : isEnd ? 'bg-gradient-to-l from-transparent from-50% to-primary-50 to-50%' : ''
                    : ''
                  return (
                    <div key={d} className={band}>
                      <button
                        type="button"
                        disabled={past}
                        onClick={() => pick(d)}
                        className={[
                          'mx-auto flex h-10 w-10 items-center justify-center rounded-full transition',
                          past ? 'cursor-default text-ink-300' : isTaken ? 'text-ink-300 line-through' : 'text-ink hover:bg-primary-100',
                          isStart || isEnd ? 'bg-primary font-semibold text-white hover:bg-primary' : '',
                        ].join(' ')}
                        aria-label={`${fmtDay(d)}${isTaken ? ' (booked)' : ''}${isStart ? ' — check in' : ''}${isEnd ? ' — check out' : ''}`}
                        aria-pressed={isStart || isEnd}
                      >
                        {i + 1}
                      </button>
                    </div>
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
