import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn, Input } from '../ui'
import { DirectoryFilterSelect } from './DirectoryFilters'

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
  showViewToggle = true,
  activeFilterCount = 0,
  onClearFilters,
}: {
  query: string
  onQueryChange: (v: string) => void
  searchPlaceholder: string
  searchLabel?: string
  view?: DirectoryViewMode | string
  onViewChange?: (v: DirectoryViewMode) => void
  sort?: string
  onSortChange?: (v: string) => void
  sortOptions?: Array<{ value: string; label: string }>
  resultLabel: string
  reducedMotion?: boolean
  /** Extra filter selects / controls — shown inside the collapsible panel */
  filters?: ReactNode
  /** Optional extra view mode buttons (e.g. Board) */
  extraViews?: ReactNode
  /** When false, hide list/cards toggle (e.g. Users account list). */
  showViewToggle?: boolean
  /** Non-default filters + sort (query counted automatically). */
  activeFilterCount?: number
  onClearFilters?: () => void
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const hasSort = Boolean(sort != null && onSortChange && sortOptions?.length)
  const hasView = showViewToggle && Boolean(view != null && onViewChange)
  const hasFilterPanel = Boolean(filters) || hasSort
  const activeCount = activeFilterCount + (query.trim() ? 1 : 0)
  const showClear = activeCount > 0 && Boolean(onClearFilters)

  return (
    <div className="mb-4 rounded-2xl border border-primary-100/80 bg-white shadow-[0_4px_16px_-12px_rgba(15,39,68,0.16)]">
      <div className="flex flex-col gap-2 p-2.5 sm:p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-[12rem]" role="search" aria-label={searchLabel}>
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
            <Input
              className="min-h-10 pl-8 text-sm"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              aria-label={searchLabel}
            />
          </div>

          {hasFilterPanel ? (
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                'inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                reducedMotion && 'transition-none',
                filtersOpen || activeCount > 0
                  ? 'border-primary-200 bg-primary-50 text-primary'
                  : 'border-primary-100 bg-white text-ink-600 hover:bg-primary-50/60',
              )}
              aria-expanded={filtersOpen}
              aria-controls="directory-filter-panel"
            >
              <SlidersHorizontal className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              <span>Filters</span>
              {activeCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white tabular">
                  {activeCount}
                </span>
              ) : null}
              <ChevronDown
                className={cn(
                  'h-4 w-4 opacity-60 transition-transform duration-200',
                  filtersOpen && 'rotate-180',
                  reducedMotion && 'transition-none',
                )}
                aria-hidden
              />
            </button>
          ) : null}

          {showClear ? (
            <button
              type="button"
              onClick={onClearFilters}
              className={cn(
                'inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1 rounded-xl px-2.5 text-sm font-semibold text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                reducedMotion && 'transition-none',
              )}
            >
              <X className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              <span className="hidden sm:inline">Clear</span>
            </button>
          ) : null}

          {hasView || extraViews ? (
            <div
              className="inline-flex min-h-10 shrink-0 rounded-xl border border-primary-100 bg-primary-50/40 p-0.5"
              role="group"
              aria-label="View layout"
            >
              {hasView ? (
                <>
                  <button
                    type="button"
                    onClick={() => onViewChange!('list')}
                    className={cn(
                      'inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-2.5',
                      reducedMotion && 'transition-none',
                      view === 'list' ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink',
                    )}
                    aria-pressed={view === 'list'}
                    aria-label="List view"
                    title="List"
                  >
                    <List className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    <span className="hidden sm:inline">List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewChange!('cards')}
                    className={cn(
                      'inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-2.5',
                      reducedMotion && 'transition-none',
                      view === 'cards' ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink',
                    )}
                    aria-pressed={view === 'cards'}
                    aria-label="Card view"
                    title="Cards"
                  >
                    <LayoutGrid className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    <span className="hidden sm:inline">Cards</span>
                  </button>
                </>
              ) : null}
              {extraViews}
            </div>
          ) : null}

          <p className="w-full text-xs font-medium tabular text-ink-400 sm:ml-auto sm:w-auto">{resultLabel}</p>
        </div>

        {hasFilterPanel && filtersOpen ? (
          <div
            id="directory-filter-panel"
            className={cn('border-t border-primary-100 pt-2.5', !reducedMotion && 'animate-fade-in')}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filters}
              {hasSort ? (
                <DirectoryFilterSelect
                  value={sort}
                  onChange={(e) => onSortChange!(e.target.value)}
                  aria-label="Sort"
                >
                  {sortOptions!.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </DirectoryFilterSelect>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
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
    .replace(/\([^)]*\)/g, '')
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
