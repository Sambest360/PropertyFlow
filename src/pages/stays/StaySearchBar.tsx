/**
 * Where / dates / guests bar for the stays list. Dates are picked on the same
 * calendar as a stay page (Check in / Check out boxes on top); choosing both
 * filters the list straight away, without leaving the page.
 */
import { useState, type FormEvent } from 'react'
import { CalendarDays, ChevronDown, MapPin, Search, Users } from 'lucide-react'
import { fmtDay, type StaySearch } from '../../lib/api/guesthousesApi'
import { AvailabilityCalendar } from './AvailabilityCalendar'

export function StaySearchBar({ value, onSearch }: { value: StaySearch; onSearch: (s: StaySearch) => void; compact?: boolean }) {
  const [q, setQ] = useState(value.q ?? '')
  const [checkIn, setCheckIn] = useState(value.checkIn)
  const [checkOut, setCheckOut] = useState(value.checkOut)
  const [guests, setGuests] = useState(value.guests ?? 2)
  const [open, setOpen] = useState(false)

  const run = (patch: Partial<StaySearch> = {}) =>
    onSearch({ q: q.trim() || undefined, checkIn, checkOut, guests, ...patch })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setOpen(false)
    run()
  }
  const label = 'flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400'
  const input = 'w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-400'
  const dates = checkIn && checkOut ? `${fmtDay(checkIn)} → ${fmtDay(checkOut)}` : checkIn ? `${fmtDay(checkIn)} → ?` : 'Any dates'

  return (
    <form onSubmit={submit} className="rounded-2xl border border-primary-100 bg-white shadow-sm" aria-label="Search guest houses">
      <div className="grid grid-cols-2 divide-primary-100 md:flex md:items-center md:divide-x">
        <label className="col-span-2 flex min-w-0 flex-col border-b border-primary-100 px-4 py-2 md:flex-[2] md:border-b-0">
          <span className={label}><MapPin className="h-3 w-3" /> Where</span>
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="City, suburb or guest house" />
        </label>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-col border-r border-primary-100 px-4 py-2 text-left md:flex-[2] md:border-r-0"
          aria-expanded={open}
        >
          <span className={label}><CalendarDays className="h-3 w-3" /> Dates <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} /></span>
          <span className={`truncate text-sm ${checkIn ? 'font-medium text-ink' : 'text-ink-400'}`}>{dates}</span>
        </button>
        <label className="flex min-w-0 flex-col px-4 py-2 md:max-w-[8rem]">
          <span className={label}><Users className="h-3 w-3" /> Guests</span>
          <input type="number" min={1} max={30} className={input} value={guests} onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <div className="col-span-2 border-t border-primary-100 p-2 md:border-t-0">
          <button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600 md:w-auto">
            <Search className="h-4 w-4" /> Search
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-primary-100 p-4">
          <AvailabilityCalendar
            unavailable={[]}
            checkIn={checkIn}
            checkOut={checkOut}
            onChange={(a, b) => {
              setCheckIn(a)
              setCheckOut(b)
              // Filter as soon as both dates are chosen (or when cleared); stay on this page.
              if ((a && b) || (!a && !b)) {
                run({ checkIn: a, checkOut: b })
                if (a && b) setOpen(false)
              }
            }}
          />
        </div>
      )}
    </form>
  )
}
