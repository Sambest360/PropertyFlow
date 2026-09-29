import { useId, useMemo, useState } from 'react'
import { Building2, MapPin, Search, X } from 'lucide-react'
import type { PropertyAsset } from '../types/domain'
import { MediaImage } from './media/MediaImage'
import { Input, cn } from './ui'

const ICON_STROKE = 1.6

function filterProperties(properties: PropertyAsset[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return properties
  return properties.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.suburb.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q),
  )
}

export function PropertySearchPicker({
  properties,
  value,
  onChange,
  label = 'Property',
  required,
  locked,
  maxResults = 10,
  id,
}: {
  properties: PropertyAsset[]
  value: string
  onChange: (propertyId: string) => void
  label?: string
  required?: boolean
  /** When true, only show the selected property summary (not searchable). */
  locked?: boolean
  maxResults?: number
  id?: string
}) {
  const autoId = useId()
  const inputId = id ?? autoId
  const [query, setQuery] = useState('')
  const selected = properties.find((p) => p.id === value) ?? null
  const filtered = useMemo(() => filterProperties(properties, query), [properties, query])

  if (locked) {
    if (!selected) return null
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-50/50 px-3 py-2.5">
        <PropertyThumb property={selected} size="md" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
          <p className="truncate font-semibold text-ink">{selected.title}</p>
          <p className="truncate text-xs text-ink-500">
            {selected.suburb}, {selected.city}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-ink-500" htmlFor={inputId}>
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </label>

      {selected && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50/60 px-3 py-2.5">
          <PropertyThumb property={selected} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{selected.title}</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
              <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              {selected.suburb}, {selected.city}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange('')
              setQuery('')
            }}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-ink-400 transition-colors duration-200 hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Clear selected property"
          >
            <X className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </button>
        </div>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          strokeWidth={ICON_STROKE}
          aria-hidden
        />
        <Input
          id={inputId}
          className="min-h-11 pl-9"
          placeholder="Search by title, suburb, city, or ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Search ${label.toLowerCase()}`}
        />
      </div>

      <div
        className="max-h-48 overflow-y-auto rounded-2xl border border-primary-100 [scrollbar-width:thin]"
        role="listbox"
        aria-label={label}
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-ink-500">No properties match.</p>
        ) : (
          <ul className="divide-y divide-primary-50">
            {filtered.slice(0, maxResults).map((p) => {
              const active = p.id === value
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(p.id)
                      setQuery('')
                    }}
                    className={cn(
                      'flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      active ? 'bg-primary-50' : 'hover:bg-primary-50/60',
                    )}
                  >
                    <PropertyThumb property={p} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{p.title}</span>
                      <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
                        <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                        {p.suburb}, {p.city}
                        <span aria-hidden>·</span>
                        <span className="truncate">{p.type}</span>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {filtered.length > maxResults && (
        <p className="tabular text-[11px] text-ink-400">
          Showing {maxResults} of {filtered.length} — refine your search
        </p>
      )}
    </div>
  )
}

function PropertyThumb({
  property,
  size,
}: {
  property: PropertyAsset
  size: 'sm' | 'md'
}) {
  const box = size === 'md' ? 'h-12 w-16' : 'h-11 w-14'
  if (property.images[0]) {
    return (
      <MediaImage
        src={property.images[0]}
        alt=""
        className={cn(box, 'shrink-0 rounded-lg object-cover ring-1 ring-primary-100')}
      />
    )
  }
  return (
    <span
      className={cn(
        box,
        'inline-flex shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary',
      )}
    >
      <Building2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
    </span>
  )
}
