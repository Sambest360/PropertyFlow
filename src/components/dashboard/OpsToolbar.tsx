import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Filter, Search } from 'lucide-react'
import { cn } from '../ui'

export type OpsFilterOption = {
  id: string
  label: string
}

export function OpsToolbar({
  query,
  onQueryChange,
  placeholder = 'Search…',
  filters,
  filterValue = 'all',
  onFilterChange,
  actions,
  className,
}: {
  query: string
  onQueryChange: (q: string) => void
  placeholder?: string
  filters?: OpsFilterOption[]
  filterValue?: string
  onFilterChange?: (id: string) => void
  actions?: ReactNode
  className?: string
  /** @deprecated use filters + onFilterChange */
  onFilter?: () => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const hasFilters = Boolean(filters?.length && onFilterChange)

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <label className="relative min-w-[12rem] flex-1">
        <span className="sr-only">Search</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          strokeWidth={1.6}
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-11 w-full rounded-2xl border border-primary-100 bg-white py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition-colors duration-200 placeholder:text-ink-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>

      {hasFilters && (
        <div className="relative" ref={rootRef}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="listbox"
            className={cn(
              'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-2xl border bg-white transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              filterValue !== 'all' || open
                ? 'border-primary text-primary'
                : 'border-primary-100 text-ink-500 hover:bg-primary-50 hover:text-primary',
            )}
            aria-label="Filter list"
          >
            <Filter className="h-4 w-4" strokeWidth={1.6} />
          </button>
          {open && (
            <div
              role="listbox"
              className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-primary-100 bg-white py-1 shadow-lg shadow-ink/10"
            >
              {filters!.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="option"
                  aria-selected={filterValue === f.id}
                  onClick={() => {
                    onFilterChange!(f.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex min-h-10 w-full cursor-pointer items-center px-3 text-left text-sm transition-colors duration-150 hover:bg-primary-50',
                    filterValue === f.id ? 'font-semibold text-primary' : 'text-ink',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {actions}
    </div>
  )
}
