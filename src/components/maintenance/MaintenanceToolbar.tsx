import { useMemo, useState } from 'react'
import {
  ChevronDown,
  Columns3,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { cn, Input, Select } from '../ui'
import type {
  AttentionFilter,
  MaintenanceViewMode,
  PriorityFilter,
  SortKey,
} from './types'
import { TICKET_PRIORITIES } from './types'

import { RESPONSIBLE_FILTER_OPTIONS, type ResponsibleFilter } from './TicketResponsibilityCard'

const ICON_STROKE = 1.6

export function MaintenanceToolbar({
  query,
  onQueryChange,
  priority,
  onPriorityChange,
  propertyId,
  onPropertyChange,
  properties,
  attention,
  onAttentionChange,
  responsible = 'all',
  onResponsibleChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  resultLabel,
  reducedMotion,
  priorities,
  onClearFilters,
}: {
  query: string
  onQueryChange: (v: string) => void
  priority: PriorityFilter
  onPriorityChange: (v: PriorityFilter) => void
  propertyId: string
  onPropertyChange: (v: string) => void
  properties: Array<{ id: string; title: string }>
  attention: AttentionFilter
  onAttentionChange: (v: AttentionFilter) => void
  responsible?: ResponsibleFilter
  onResponsibleChange?: (v: ResponsibleFilter) => void
  sort: SortKey
  onSortChange: (v: SortKey) => void
  view: MaintenanceViewMode
  onViewChange: (v: MaintenanceViewMode) => void
  resultLabel: string
  reducedMotion?: boolean
  priorities?: Array<{ value: string; label: string }>
  onClearFilters?: () => void
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const priorityOptions = priorities?.length
    ? priorities
    : TICKET_PRIORITIES.map((p) => ({ value: p, label: p }))

  const activeCount = useMemo(() => {
    let n = 0
    if (query.trim()) n += 1
    if (attention !== 'all') n += 1
    if (priority !== 'all') n += 1
    if (propertyId !== 'all') n += 1
    if (sort !== 'priority') n += 1
    return n
  }, [query, attention, priority, propertyId, sort])

  return (
    <div className="mb-5 rounded-[1.25rem] border border-primary-100/80 bg-white p-3 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div
          className="relative min-w-0 flex-1"
          role="search"
          aria-label="Filter this maintenance list"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          <Input
            className="min-h-11 pl-9 pr-[5.25rem]"
            placeholder="Filter by title, property, asset, or maintenance ID…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Filter this maintenance list"
          />
          <span
            className="pointer-events-none absolute right-2 top-1/2 inline-flex min-h-8 -translate-y-1/2 items-center rounded-full border border-primary-100 bg-primary-50 px-2.5 text-[11px] font-semibold text-ink-600"
            aria-hidden
          >
            This list
          </span>
        </div>

        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          className={cn(
            'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl border px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            reducedMotion && 'transition-none',
            filtersOpen || activeCount > 0
              ? 'border-primary-200 bg-primary-50 text-primary'
              : 'border-primary-100 bg-white text-ink-600 hover:bg-primary-50/60',
          )}
          aria-expanded={filtersOpen}
          aria-controls="maintenance-filter-panel"
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white tabular">
              {activeCount}
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 opacity-60 transition-transform duration-200',
              filtersOpen && 'rotate-180',
              reducedMotion && 'transition-none',
            )}
            aria-hidden
          />
        </button>

        {activeCount > 0 && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-2xl px-2.5 text-sm font-semibold text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
            Clear
          </button>
        )}

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
          <button
            type="button"
            onClick={() => onViewChange('board')}
            className={cn(
              'inline-flex min-h-9 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              reducedMotion && 'transition-none',
              view === 'board' ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink',
            )}
            aria-pressed={view === 'board'}
          >
            <Columns3 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Board
          </button>
        </div>
      </div>

      {filtersOpen && (
        <div
          id="maintenance-filter-panel"
          className={cn(
            'mt-3 border-t border-primary-100 pt-3',
            !reducedMotion && 'animate-fade-in',
          )}
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              className="min-h-11"
              value={attention}
              onChange={(e) => onAttentionChange(e.target.value as AttentionFilter)}
              aria-label="Filter by attention"
            >
              <option value="all">All attention</option>
              <option value="open">Open only</option>
              <option value="emergency">Emergency</option>
              <option value="escalated">Escalated</option>
              <option value="warranty">Warranty</option>
              <option value="unassigned">Unassigned</option>
            </Select>

            {onResponsibleChange ? (
              <Select
                className="min-h-11"
                value={responsible}
                onChange={(e) => onResponsibleChange(e.target.value as ResponsibleFilter)}
                aria-label="Filter by responsible party"
              >
                {RESPONSIBLE_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : null}

            <Select
              className="min-h-11"
              value={priority}
              onChange={(e) => onPriorityChange(e.target.value as PriorityFilter)}
              aria-label="Filter by priority"
            >
              <option value="all">All priorities</option>
              {priorityOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>

            <Select
              className="min-h-11"
              value={propertyId}
              onChange={(e) => onPropertyChange(e.target.value)}
              aria-label="Filter by property"
            >
              <option value="all">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>

            <Select
              className="min-h-11"
              value={sort}
              onChange={(e) => onSortChange(e.target.value as SortKey)}
              aria-label="Sort maintenance"
            >
              <option value="priority">Sort: Urgency</option>
              <option value="opened">Sort: Oldest</option>
              <option value="property">Sort: Property</option>
              <option value="status">Sort: Status</option>
              <option value="cost">Sort: Cost</option>
            </Select>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs font-medium tabular text-ink-400">{resultLabel}</p>
    </div>
  )
}
