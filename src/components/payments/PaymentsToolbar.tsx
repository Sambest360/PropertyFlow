import { LayoutGrid, List, Search } from 'lucide-react'
import { cn, Input, Select } from '../ui'
import {
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  type PaymentAttentionFilter,
  type PaymentSortKey,
  type PaymentStatusFilter,
  type PaymentTypeFilter,
  type PaymentsViewMode,
} from './types'

const ICON_STROKE = 1.6

export function PaymentsToolbar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  type,
  onTypeChange,
  propertyId,
  onPropertyChange,
  properties,
  attention,
  onAttentionChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  resultLabel,
  reducedMotion,
  paymentStatuses,
  paymentTypes,
}: {
  query: string
  onQueryChange: (v: string) => void
  status: PaymentStatusFilter
  onStatusChange: (v: PaymentStatusFilter) => void
  type: PaymentTypeFilter
  onTypeChange: (v: PaymentTypeFilter) => void
  propertyId: string
  onPropertyChange: (v: string) => void
  properties: Array<{ id: string; title: string }>
  attention: PaymentAttentionFilter
  onAttentionChange: (v: PaymentAttentionFilter) => void
  sort: PaymentSortKey
  onSortChange: (v: PaymentSortKey) => void
  view: PaymentsViewMode
  onViewChange: (v: PaymentsViewMode) => void
  resultLabel: string
  reducedMotion?: boolean
  paymentStatuses?: Array<{ value: string; label: string }>
  paymentTypes?: Array<{ value: string; label: string }>
}) {
  const statusOptions = paymentStatuses?.length
    ? paymentStatuses
    : PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))
  const typeOptions = paymentTypes?.length
    ? paymentTypes
    : PAYMENT_TYPES.map((t) => ({ value: t, label: t }))

  return (
    <div className="mb-5 space-y-3 rounded-[1.25rem] border border-primary-100/80 bg-white p-3 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1" role="search" aria-label="Filter this payment list">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          <Input
            className="min-h-11 pl-9 pr-[5.25rem]"
            placeholder="Filter by party, property, payment ID, or type…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Filter this payment list"
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
          value={attention}
          onChange={(e) => onAttentionChange(e.target.value as PaymentAttentionFilter)}
          aria-label="Filter by attention"
        >
          <option value="all">All attention</option>
          <option value="open">Open (due / overdue)</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </Select>

        <Select
          className="min-h-11"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as PaymentStatusFilter)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        <Select
          className="min-h-11"
          value={type}
          onChange={(e) => onTypeChange(e.target.value as PaymentTypeFilter)}
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          {typeOptions.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
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
          onChange={(e) => onSortChange(e.target.value as PaymentSortKey)}
          aria-label="Sort payments"
        >
          <option value="attention">Sort: Most attention</option>
          <option value="due">Sort: Due date</option>
          <option value="amount">Sort: Amount</option>
          <option value="status">Sort: Status</option>
          <option value="property">Sort: Property</option>
          <option value="party">Sort: Party</option>
        </Select>

        <div className="hidden xl:block" aria-hidden />
      </div>

      <p className="text-xs font-medium tabular text-ink-400">{resultLabel}</p>
    </div>
  )
}
