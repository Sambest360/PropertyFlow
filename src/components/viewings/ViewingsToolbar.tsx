import { LayoutGrid, List, Search } from 'lucide-react'
import { cn, Input, Select } from '../ui'
import type {
  ViewingKindFilter,
  ViewingSortKey,
  ViewingStatusFilter,
  ViewingsViewMode,
} from './types'

const ICON_STROKE = 1.6

export function ViewingsToolbar({
  query,
  onQueryChange,
  kind,
  onKindChange,
  status,
  onStatusChange,
  propertyId,
  onPropertyChange,
  properties,
  sort,
  onSortChange,
  view,
  onViewChange,
  resultLabel,
  reducedMotion,
}: {
  query: string
  onQueryChange: (v: string) => void
  kind: ViewingKindFilter
  onKindChange: (v: ViewingKindFilter) => void
  status: ViewingStatusFilter
  onStatusChange: (v: ViewingStatusFilter) => void
  propertyId: string
  onPropertyChange: (v: string) => void
  properties: Array<{ id: string; title: string }>
  sort: ViewingSortKey
  onSortChange: (v: ViewingSortKey) => void
  view: ViewingsViewMode
  onViewChange: (v: ViewingsViewMode) => void
  resultLabel: string
  reducedMotion?: boolean
}) {
  return (
    <div className="mb-5 space-y-3 rounded-[1.25rem] border border-primary-100/80 bg-white p-3 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1" role="search" aria-label="Filter viewings">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          <Input
            className="min-h-11 pl-9 pr-[5.25rem]"
            placeholder="Filter by property, applicant, date, or agent…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Filter viewings"
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

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          className="min-h-11"
          value={kind}
          onChange={(e) => onKindChange(e.target.value as ViewingKindFilter)}
          aria-label="Filter by kind"
        >
          <option value="all">All slots & bookings</option>
          <option value="bookings">Bookings only</option>
          <option value="slots">Open slots only</option>
        </Select>

        <Select
          className="min-h-11"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as ViewingStatusFilter)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="Scheduled">Scheduled</option>
          <option value="Open">Open slots</option>
          <option value="Full">Full slots</option>
          <option value="Completed">Completed</option>
          <option value="No-show">No-show</option>
          <option value="Cancelled">Cancelled</option>
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
          onChange={(e) => onSortChange(e.target.value as ViewingSortKey)}
          aria-label="Sort viewings"
        >
          <option value="when">Sort: Date & time</option>
          <option value="property">Sort: Property</option>
          <option value="status">Sort: Status</option>
          <option value="agent">Sort: Agent</option>
        </Select>
      </div>

      <p className="text-xs font-medium tabular text-ink-400">{resultLabel}</p>
    </div>
  )
}
