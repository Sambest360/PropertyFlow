import { useMemo, useState } from 'react'
import { ChevronDown, LayoutGrid, List, Map, Search, SlidersHorizontal, X } from 'lucide-react'
import { STANDALONE_BUILDING_KEY } from '../../lib/buildingHierarchy'
import { cn, Input, Select } from '../ui'
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  type AttentionFilter,
  type OccupancyFilter,
  type PropertiesViewMode,
  type SortKey,
} from './types'

const ICON_STROKE = 1.6

function countActiveFilters(input: {
  query: string
  status: string
  type: string
  listingMode: string
  suburb: string
  attention: AttentionFilter
  building: string
  occupancy: OccupancyFilter
  sort: SortKey
}): number {
  let n = 0
  if (input.query.trim()) n += 1
  if (input.status !== 'All') n += 1
  if (input.type !== 'All') n += 1
  if (input.listingMode !== 'all') n += 1
  if (input.suburb !== 'all') n += 1
  if (input.attention !== 'all') n += 1
  if (input.building !== 'all') n += 1
  if (input.occupancy !== 'all') n += 1
  if (input.sort !== 'name') n += 1
  return n
}

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
  building,
  onBuildingChange,
  buildings,
  occupancy,
  onOccupancyChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  resultLabel,
  reducedMotion,
  propertyTypes,
  propertyStatuses,
  listingModes,
  onClearFilters,
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
  building: string
  onBuildingChange: (v: string) => void
  buildings: Array<{ value: string; label: string }>
  occupancy: OccupancyFilter
  onOccupancyChange: (v: OccupancyFilter) => void
  sort: SortKey
  onSortChange: (v: SortKey) => void
  view: PropertiesViewMode
  onViewChange: (v: PropertiesViewMode) => void
  resultLabel: string
  reducedMotion?: boolean
  propertyTypes?: Array<{ value: string; label: string }>
  propertyStatuses?: Array<{ value: string; label: string }>
  listingModes?: Array<{ value: string; label: string }>
  onClearFilters?: () => void
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)

  const typeOptions = propertyTypes?.length
    ? propertyTypes
    : PROPERTY_TYPES.filter((t) => t !== 'All').map((t) => ({ value: t, label: t }))
  const statusOptions = propertyStatuses?.length
    ? propertyStatuses
    : PROPERTY_STATUSES.filter((s) => s !== 'All').map((s) => ({ value: s, label: s }))
  const modeOptions = listingModes?.length
    ? listingModes
    : [
        { value: 'sale', label: 'Sale' },
        { value: 'rent', label: 'Rent' },
        { value: 'both', label: 'Sale & rent' },
      ]

  const activeCount = useMemo(
    () =>
      countActiveFilters({
        query,
        status,
        type,
        listingMode,
        suburb,
        attention,
        building,
        occupancy,
        sort,
      }),
    [query, status, type, listingMode, suburb, attention, building, occupancy, sort],
  )

  const toggleFilters = () => setFiltersOpen((open) => !open)

  return (
    <div className="mb-4 rounded-2xl border border-primary-100/80 bg-white shadow-[0_4px_16px_-12px_rgba(15,39,68,0.16)]">
      <div className="flex flex-col gap-2 p-2.5 sm:p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-[12rem]" role="search" aria-label="Search properties">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
            <Input
              className="min-h-10 pl-8 text-sm"
              placeholder="Search buildings or units…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              aria-label="Search buildings or units"
            />
          </div>

          <button
            type="button"
            onClick={toggleFilters}
            className={cn(
              'inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              reducedMotion && 'transition-none',
              filtersOpen || activeCount > 0
                ? 'border-primary-200 bg-primary-50 text-primary'
                : 'border-primary-100 bg-white text-ink-600 hover:bg-primary-50/60',
            )}
            aria-expanded={filtersOpen}
            aria-controls="properties-filter-panel"
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
            aria-label="View layout"
          >
            {(
              [
                ['list', List, 'Buildings'],
                ['cards', LayoutGrid, 'Cards'],
                ['map', Map, 'Map'],
              ] as const
            ).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewChange(mode)}
                className={cn(
                  'inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-3',
                  reducedMotion && 'transition-none',
                  view === mode ? 'bg-white text-primary shadow-sm' : 'text-ink-500 hover:text-ink',
                )}
                aria-pressed={view === mode}
                aria-label={label}
                title={label}
              >
                <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <p className="w-full text-xs font-medium tabular text-ink-400 sm:ml-auto sm:w-auto">{resultLabel}</p>
        </div>

        {filtersOpen && (
          <div
            id="properties-filter-panel"
            className={cn(
              'border-t border-primary-100 pt-3',
              !reducedMotion && 'animate-fade-in',
            )}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                className="min-h-11"
                value={building}
                onChange={(e) => onBuildingChange(e.target.value)}
                aria-label="Filter by building"
              >
                <option value="all">All buildings</option>
                {buildings.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
                <option value={STANDALONE_BUILDING_KEY}>Standalone only</option>
              </Select>

              <Select
                className="min-h-11"
                value={occupancy}
                onChange={(e) => onOccupancyChange(e.target.value as OccupancyFilter)}
                aria-label="Filter by unit occupancy"
              >
                <option value="all">All unit statuses</option>
                <option value="VACANT">Vacant</option>
                <option value="OCCUPIED">Occupied</option>
                <option value="UNDER_OFFER">Under offer</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="DRAFT">Draft unit</option>
                <option value="PUBLISHED">Published unit</option>
                <option value="unknown">No unit link</option>
              </Select>

              <Select
                className="min-h-11"
                value={status}
                onChange={(e) => onStatusChange(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="All">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.value === 'Published'
                      ? 'Available (Published)'
                      : s.value === 'Rented'
                        ? 'Occupied (Rented)'
                        : s.label}
                  </option>
                ))}
              </Select>

              <Select
                className="min-h-11"
                value={type}
                onChange={(e) => onTypeChange(e.target.value)}
                aria-label="Filter by type"
              >
                <option value="All">All types</option>
                {typeOptions.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
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
                {modeOptions.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
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
                <option value="building">Sort: Building</option>
                <option value="suburb">Sort: Suburb</option>
                <option value="status">Sort: Status</option>
                <option value="price">Sort: Price / rent</option>
                <option value="attention">Sort: Most attention</option>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
