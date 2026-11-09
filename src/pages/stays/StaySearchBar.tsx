/** Where / check-in / check-out / guests bar shared by the stays pages. */
import { useState, type FormEvent } from 'react'
import { CalendarDays, MapPin, Search, Users } from 'lucide-react'
import { addDays, isoDay, type StaySearch } from '../../lib/api/guesthousesApi'

export function StaySearchBar({ value, onSearch, compact }: { value: StaySearch; onSearch: (s: StaySearch) => void; compact?: boolean }) {
  const [q, setQ] = useState(value.q ?? '')
  const [checkIn, setCheckIn] = useState(value.checkIn ?? '')
  const [checkOut, setCheckOut] = useState(value.checkOut ?? '')
  const [guests, setGuests] = useState(value.guests ?? 2)
  const todayIso = isoDay(new Date())

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSearch({ q: q.trim() || undefined, checkIn: checkIn || undefined, checkOut: checkOut || undefined, guests })
  }
  const field = 'flex min-w-0 flex-1 flex-col px-4 py-2'
  const label = 'flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400'
  const input = 'w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-400'
  return (
    <form
      onSubmit={submit}
      className={`flex flex-col divide-y divide-primary-100 rounded-2xl border border-primary-100 bg-white shadow-sm md:flex-row md:items-center md:divide-x md:divide-y-0 md:rounded-full ${compact ? '' : 'md:p-1'}`}
      aria-label="Search guest houses"
    >
      <label className={field}>
        <span className={label}><MapPin className="h-3 w-3" /> Where</span>
        <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="City, suburb or guest house" />
      </label>
      <label className={field}>
        <span className={label}><CalendarDays className="h-3 w-3" /> Check in</span>
        <input
          type="date"
          className={input}
          min={todayIso}
          value={checkIn}
          onChange={(e) => {
            setCheckIn(e.target.value)
            if (e.target.value && (!checkOut || checkOut <= e.target.value)) setCheckOut(addDays(e.target.value, 1))
          }}
        />
      </label>
      <label className={field}>
        <span className={label}><CalendarDays className="h-3 w-3" /> Check out</span>
        <input type="date" className={input} min={checkIn ? addDays(checkIn, 1) : todayIso} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
      </label>
      <label className={`${field} md:max-w-[8rem]`}>
        <span className={label}><Users className="h-3 w-3" /> Guests</span>
        <input type="number" min={1} max={30} className={input} value={guests} onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))} />
      </label>
      <div className="p-2">
        <button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600 md:w-auto">
          <Search className="h-4 w-4" /> Search
        </button>
      </div>
    </form>
  )
}
