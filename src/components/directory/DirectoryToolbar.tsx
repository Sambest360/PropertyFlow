import { useEffect, useState, type ReactNode } from 'react'
import { LayoutGrid, List, Search } from 'lucide-react'
import { cn, Input, Select } from '../ui'

const ICON_STROKE = 1.6

export type DirectoryViewMode = 'list' | 'cards'

export function readDirectoryView(key: string, fallback: DirectoryViewMode = 'list'): DirectoryViewMode {
  try {
    const v = localStorage.getItem(key)
    if (v === 'list' || v === 'cards') return v
  } catch {
    /* ignore */
  }
  return fallback
}

export function useDirectoryView(storageKey: string, fallback: DirectoryViewMode = 'list') {
  const [view, setView] = useState<DirectoryViewMode>(() => readDirectoryView(storageKey, fallback))
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, view)
    } catch {
      /* ignore */
    }
  }, [storageKey, view])
  return [view, setView] as const
}

export function DirectoryToolbar({
  query,
  onQueryChange,
  searchPlaceholder,
  searchLabel = 'Filter this list',
  view,
  onViewChange,
  sort,
  onSortChange,
  sortOptions,
  resultLabel,
  reducedMotion,
  filters,
  extraViews,
}: {
  query: string
  onQueryChange: (v: string) => void
  searchPlaceholder: string
  searchLabel?: string
  view: DirectoryViewMode | string
  onViewChange: (v: DirectoryViewMode) => void
  sort: string
  onSortChange: (v: string) => void
  sortOptions: Array<{ value: string; label: string }>
  resultLabel: string
  reducedMotion?: boolean
  /** Extra filter selects / controls */
  filters?: ReactNode
  /** Optional extra view mode buttons (e.g. Board) */
  extraViews?: ReactNode
}) {
  return (
    <div className="mb-5 space-y-3 rounded-[1.25rem] border border-primary-100/80 bg-white p-3 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1" role="search" aria-label={searchLabel}>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          <Input
            className="min-h-11 pl-9 pr-[5.25rem]"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label={searchLabel}
          />
          <span
            className="pointer-events-none absolute right-2 top-1/2 inline-flex min-h-8 -translate-y-1/2 items-center rounded-full border border-primary-100 bg-primary-50 px-2.5 text-[11px] font-semibold text-ink-600"
            aria-hidden
          >
            This list
          </span>
        </div>

        <div
          className="inline-flex min-h-11 shrink-0 rounded-2xl border border-primary-100 bg-primary-50/40 p-1"
          role="group"
          aria-label="View density"
        >
          <button
            type="button"
            onClick={() => onViewChange('list')}
            className={cn(
              'inline-flex min-h-9 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              reducedMotion && 'transition-none',
              view === 'list' ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink',
            )}
            aria-pressed={view === 'list'}
          >
            <List className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            List
          </button>
          <button
            type="button"
            onClick={() => onViewChange('cards')}
            className={cn(
              'inline-flex min-h-9 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              reducedMotion && 'transition-none',
              view === 'cards' ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink',
            )}
            aria-pressed={view === 'cards'}
          >
            <LayoutGrid className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Cards
          </button>
          {extraViews}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {filters}
        <Select
          className="min-h-11"
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          aria-label="Sort"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      <p className="text-xs font-medium tabular text-ink-400">{resultLabel}</p>
    </div>
  )
}

export function DirectoryEmpty({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-[1.25rem] border border-dashed border-primary-100 bg-white px-6 py-14 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function PersonAvatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-white',
        className,
      )}
      aria-hidden
    >
      {initials || '?'}
    </span>
  )
}

export function ClearFiltersButton({
  onClick,
  reducedMotion,
}: {
  onClick: () => void
  reducedMotion?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl px-4 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        reducedMotion && 'transition-none',
      )}
    >
      Clear filters
    </button>
  )
}
