import { LayoutGrid, List, Search } from 'lucide-react'
import { cn, Input, Select } from '../ui'
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  type AttentionFilter,
  type PropertiesViewMode,
  type SortKey,
} from './types'

const ICON_STROKE = 1.6

export function PropertiesToolbar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  type,
  onTypeChange,
  listingMode,
  onListingModeChange,
  suburb,
  onSuburbChange,
  suburbs,
  attention,
  onAttentionChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  resultLabel,
  reducedMotion,
}: {
  query: string
  onQueryChange: (v: string) => void
  status: string
  onStatusChange: (v: string) => void
  type: string
  onTypeChange: (v: string) => void
  listingMode: string
  onListingModeChange: (v: string) => void
  suburb: string
  onSuburbChange: (v: string) => void
  suburbs: string[]
  attention: AttentionFilter
  onAttentionChange: (v: AttentionFilter) => void
  sort: SortKey
  onSortChange: (v: SortKey) => void
  view: PropertiesViewMode
  onViewChange: (v: PropertiesViewMode) => void
  resultLabel: string
  reducedMotion?: boolean
}) {
  return (
    <div className="mb-5 space-y-3 rounded-[1.25rem] border border-primary-100/80 bg-white p-3 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1" role="search" aria-label="Filter this property list">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          <Input
            className="min-h-11 pl-9 pr-[5.25rem]"
            placeholder="Filter by title, address, suburb, city, or ID…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Filter this property list"
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
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Select
          className="min-h-11"
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          aria-label="Filter by status"
        >
          {PROPERTY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'All' ? 'All statuses' : s === 'Published' ? 'Available (Published)' : s === 'Rented' ? 'Occupied (Rented)' : s}
            </option>
          ))}
        </Select>

        <Select
          className="min-h-11"
          value={type}
          onChange={(e) => onTypeChange(e.target.value)}
          aria-label="Filter by type"
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'All' ? 'All types' : t}
            </option>
          ))}
        </Select>

        <Select
          className="min-h-11"
          value={listingMode}
          onChange={(e) => onListingModeChange(e.target.value)}
          aria-label="Filter by listing mode"
        >
          <option value="all">All listing modes</option>
          <option value="sale">Sale</option>
          <option value="rent">Rent</option>
          <option value="both">Sale &amp; rent</option>
        </Select>

        <Select
          className="min-h-11"
          value={suburb}
          onChange={(e) => onSuburbChange(e.target.value)}
          aria-label="Filter by suburb or city"
        >
          <option value="all">All areas</option>
          {suburbs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <Select
          className="min-h-11"
          value={attention}
          onChange={(e) => onAttentionChange(e.target.value as AttentionFilter)}
          aria-label="Filter by attention"
        >
          <option value="all">All attention</option>
          <option value="any">Needs attention</option>
          <option value="tickets">Open maintenance</option>
          <option value="viewings">Scheduled viewings</option>
          <option value="apps">Waiting applications</option>
        </Select>

        <Select
          className="min-h-11"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          aria-label="Sort properties"
        >
          <option value="name">Sort: Name</option>
          <option value="suburb">Sort: Suburb</option>
          <option value="status">Sort: Status</option>
          <option value="price">Sort: Price / rent</option>
          <option value="attention">Sort: Most attention</option>
        </Select>
      </div>

      <p className="text-xs font-medium tabular text-ink-400">{resultLabel}</p>
    </div>
  )
}
