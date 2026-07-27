import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react'
import {
  nearestPlaces,
  searchPlaces,
  type Place,
} from '../lib/placeCatalog'
import { cn } from './ui'

type AreaSearchProps = {
  value: Place[]
  onChange: (next: Place[]) => void
  /** Called when user submits (Enter with no highlight, or explicit Search). */
  onSubmit?: (payload: { areas: Place[]; keyword: string }) => void
  placeholder?: string
  className?: string
  /** Show Near me control (default true). */
  showNearMe?: boolean
  /** Compact layout for browse header. */
  compact?: boolean
  /** Optional submit button label; omit to hide dedicated submit. */
  submitLabel?: string
}

export function AreaSearch({
  value,
  onChange,
  onSubmit,
  placeholder = 'City, suburb, or estate',
  className,
  showNearMe = true,
  compact = false,
  submitLabel,
}: AreaSearchProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

  const suggestions = useMemo(() => {
    const selected = new Set(value.map((p) => p.id))
    return searchPlaces(query, 8).filter((p) => !selected.has(p.id))
  }, [query, value])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  const addPlace = (place: Place) => {
    if (value.some((p) => p.id === place.id)) return
    onChange([...value, place])
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const removePlace = (id: string) => {
    onChange(value.filter((p) => p.id !== id))
  }

  const commitTyped = (): { areas: Place[]; keyword: string } => {
    const q = query.trim()
    if (!q) return { areas: value, keyword: '' }
    const hit = searchPlaces(q, 1)[0]
    const qLower = q.toLowerCase()
    const strongHit =
      hit &&
      (hit.label.toLowerCase() === qLower ||
        hit.label.toLowerCase().startsWith(qLower) ||
        hit.aliases.some((a) => a.toLowerCase() === qLower || a.toLowerCase().startsWith(qLower)))
    if (strongHit && hit) {
      const areas = value.some((p) => p.id === hit.id) ? value : [...value, hit]
      if (areas !== value) onChange(areas)
      return { areas, keyword: '' }
    }
    return { areas: value, keyword: q }
  }

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault()
    const { areas, keyword } = commitTyped()
    setQuery('')
    setOpen(false)
    onSubmit?.({ areas, keyword })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, Math.max(0, suggestions.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && suggestions[highlight]) {
        addPlace(suggestions[highlight]!)
        return
      }
      handleSubmit()
      return
    }
    if (e.key === 'Backspace' && !query && value.length) {
      removePlace(value[value.length - 1]!.id)
    }
  }

  const nearMe = () => {
    setGeoError(null)
    if (!navigator.geolocation) {
      setGeoError('Location is not supported in this browser.')
      return
    }
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false)
        const nearby = nearestPlaces(pos.coords.latitude, pos.coords.longitude, {
          limit: 4,
          maxKm: 25,
        })
        if (!nearby.length) {
          setGeoError('No listed areas near your location yet — try searching a suburb.')
          return
        }
        const merged = [...value]
        for (const p of nearby) {
          if (!merged.some((m) => m.id === p.id)) merged.push(p)
        }
        onChange(merged)
      },
      () => {
        setGeoLoading(false)
        setGeoError('Could not read your location. Allow location access or search by name.')
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }

  return (
    <div className={cn('w-full', className)}>
      <form
        onSubmit={handleSubmit}
        className={cn(
          'rounded-2xl bg-white',
          compact ? 'border border-primary-100 p-2' : 'p-0',
        )}
      >
        {value.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1 pt-1">
            {value.map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => removePlace(place.id)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-primary-50 px-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`Remove ${place.label}`}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {place.label}
                <X className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </button>
            ))}
          </div>
        )}

        <div className={cn('flex flex-col gap-2', !compact && 'sm:flex-row sm:items-center')}>
          <div className="relative min-w-0 flex-1">
            <label className="relative block">
              <span className="sr-only">{placeholder}</span>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
                aria-hidden
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setOpen(true)
                  setGeoError(null)
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                  // Delay so suggestion click registers
                  window.setTimeout(() => setOpen(false), 150)
                }}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                autoComplete="off"
                role="combobox"
                aria-expanded={open}
                aria-controls={listId}
                aria-autocomplete="list"
                className={cn(
                  'w-full cursor-text border-0 bg-primary-50 text-base text-ink outline-none transition-colors duration-200 placeholder:text-ink-400 focus:bg-white focus-visible:ring-2 focus-visible:ring-primary',
                  compact
                    ? 'h-11 rounded-xl pl-10 pr-3'
                    : 'h-12 rounded-xl pl-11 pr-4 sm:h-14 sm:rounded-2xl',
                )}
              />
            </label>

            {open && suggestions.length > 0 && (
              <ul
                id={listId}
                role="listbox"
                className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-primary-100 bg-white py-1 shadow-lg shadow-ink/10"
              >
                {suggestions.map((place, i) => (
                  <li key={place.id} role="option" aria-selected={i === highlight}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addPlace(place)}
                      className={cn(
                        'flex min-h-11 w-full cursor-pointer items-center gap-2 px-3 text-left text-sm transition-colors duration-150',
                        i === highlight ? 'bg-primary-50 text-primary' : 'text-ink hover:bg-primary-50',
                      )}
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      <span className="font-medium">{place.label}</span>
                      <span className="text-xs text-ink-400">
                        {place.kind === 'city' ? 'City' : 'Suburb'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {showNearMe && (
              <button
                type="button"
                onClick={nearMe}
                disabled={geoLoading}
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-primary-100 bg-white px-3.5 text-sm font-semibold text-ink transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-70"
              >
                {geoLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <LocateFixed className="h-4 w-4 text-primary" aria-hidden />
                )}
                Near me
              </button>
            )}
            {submitLabel && (
              <button
                type="submit"
                className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-7"
              >
                {submitLabel}
              </button>
            )}
          </div>
        </div>
      </form>

      {geoError && (
        <p className="mt-2 px-1 text-xs font-medium text-accent" role="status">
          {geoError}
        </p>
      )}
    </div>
  )
}
