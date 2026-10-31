import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { Minus, Plus, X, SlidersHorizontal } from 'lucide-react'
import { AMENITY_FILTER_OPTIONS } from '../lib/propertyFeatures'
import {
  FURNISHING_OPTIONS,
  LEASE_TERM_OPTIONS,
  SALE_DETAIL_OPTIONS,
  amenityOptionsForMode,
  priceBoundsForMode,
  propertyTypesForMode,
} from '../lib/browseFilterModes'
import { Button, cn } from './ui'

export const PROPERTY_TYPES = [
  'House',
  'Apartment',
  'Townhouse',
  'Commercial',
  'Office',
  'Vacant Land',
  'Farm',
  'Student Accommodation',
] as const

export const AMENITY_OPTIONS = AMENITY_FILTER_OPTIONS

export type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'beds-desc' | 'newest'

export type BrowseFilterState = {
  types: string[]
  minPrice: string
  maxPrice: string
  beds: number | null
  baths: number | null
  parking: number | null
  amenities: string[]
  sort: SortOption
  /** Utility / structural tier filters (GET /api/v1/units) */
  loadSheddingFree: boolean
  premiumTier: boolean
  hasBorehole: boolean
  minSolarKw: string
  grading: Array<'P' | 'A' | 'B' | 'C'>
  /** Rent only (src/lib/browseFilterModes.ts) */
  furnishing: string[]
  petsAllowed: boolean
  availableBy: string
  leaseTerms: string[]
  /** Buy only */
  saleDetails: string[]
  minFloorSize: string
}

export const defaultBrowseFilters = (): BrowseFilterState => ({
  types: [],
  minPrice: '',
  maxPrice: '',
  beds: null,
  baths: null,
  parking: null,
  amenities: [],
  sort: 'featured',
  loadSheddingFree: false,
  premiumTier: false,
  hasBorehole: false,
  minSolarKw: '',
  grading: [],
  furnishing: [],
  petsAllowed: false,
  availableBy: '',
  leaseTerms: [],
  saleDetails: [],
  minFloorSize: '',
})

export function countActiveFilters(f: BrowseFilterState): number {
  let n = 0
  if (f.types.length) n += 1
  if (f.minPrice || f.maxPrice) n += 1
  if (f.beds != null) n += 1
  if (f.baths != null) n += 1
  if (f.parking != null) n += 1
  if (f.amenities.length) n += 1
  if (f.sort !== 'featured') n += 1
  if (f.loadSheddingFree) n += 1
  if (f.premiumTier) n += 1
  if (f.hasBorehole) n += 1
  if (f.minSolarKw) n += 1
  if (f.grading.length) n += 1
  if (f.furnishing.length) n += 1
  if (f.petsAllowed) n += 1
  if (f.availableBy) n += 1
  if (f.leaseTerms.length) n += 1
  if (f.saleDetails.length) n += 1
  if (f.minFloorSize) n += 1
  return n
}

function formatCompactZAR(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    const s = m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '')
    return `R${s}m`
  }
  if (n >= 1_000) return `R${Math.round(n / 1_000)}k`
  return `R${n.toLocaleString('en-ZA')}`
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
}

function ChipToggle({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-11 cursor-pointer rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        active
          ? 'bg-primary text-white'
          : 'bg-white text-ink-600 ring-1 ring-primary-200 hover:bg-primary-50',
      )}
    >
      {label}
    </button>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section className="border-b border-primary-100 py-6 last:border-b-0">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-1 text-sm text-ink-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function StepperRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  const display = value == null ? 'Any' : `${value}+`
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value == null}
          onClick={() => onChange(value == null || value <= 1 ? null : value - 1)}
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-primary-200 text-ink-600 transition-colors duration-200 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="w-12 text-center text-sm font-semibold tabular text-ink">{display}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(value == null ? 1 : Math.min(5, value + 1))}
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-primary-200 text-ink-600 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

function PriceRangeSlider({
  mode,
  minPrice,
  maxPrice,
  onChange,
  hint,
}: {
  mode: string
  minPrice: string
  maxPrice: string
  onChange: (min: string, max: string) => void
  hint?: string
}) {
  const id = useId()
  const bounds = priceBoundsForMode(mode)
  const minVal = minPrice ? Math.min(Number(minPrice), bounds.max) : bounds.min
  const maxVal = maxPrice ? Math.min(Number(maxPrice), bounds.max) : bounds.max

  const toStored = (n: number, edge: 'min' | 'max') => {
    if (edge === 'min' && n <= bounds.min) return ''
    if (edge === 'max' && n >= bounds.max) return ''
    return String(n)
  }

  const setMin = (n: number) => {
    const next = Math.min(n, maxVal - bounds.step)
    onChange(toStored(Math.max(bounds.min, next), 'min'), maxPrice)
  }

  const setMax = (n: number) => {
    const next = Math.max(n, minVal + bounds.step)
    onChange(minPrice, toStored(Math.min(bounds.max, next), 'max'))
  }

  const leftPct = ((minVal - bounds.min) / (bounds.max - bounds.min)) * 100
  const rightPct = ((maxVal - bounds.min) / (bounds.max - bounds.min)) * 100

  const per = mode === 'rent' ? '/mo' : ''
  const minLabel = minPrice ? `${formatCompactZAR(minVal)}${per}` : 'Any'
  const maxLabel = maxPrice ? `${formatCompactZAR(maxVal)}${per}` : 'Any+'

  return (
    <div>
      <p className="text-sm text-ink-500">{hint ?? 'Drag to set your budget'}</p>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Min</p>
          <p className="mt-0.5 text-xl font-semibold tabular text-ink">{minLabel}</p>
        </div>
        <div className="pb-1 text-ink-300" aria-hidden>
          —
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Max</p>
          <p className="mt-0.5 text-xl font-semibold tabular text-ink">{maxLabel}</p>
        </div>
      </div>

      <div className="relative mt-6 h-11 touch-none select-none">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary-100" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${leftPct}%`, width: `${Math.max(0, rightPct - leftPct)}%` }}
        />

        <label className="sr-only" htmlFor={`${id}-min`}>
          Minimum price
        </label>
        <input
          id={`${id}-min`}
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={minVal}
          onChange={(e) => setMin(Number(e.target.value))}
          className="pf-range-thumb absolute inset-0 z-[3] w-full cursor-pointer appearance-none bg-transparent"
          style={{ zIndex: minVal > bounds.max - bounds.step * 4 ? 5 : 3 }}
        />

        <label className="sr-only" htmlFor={`${id}-max`}>
          Maximum price
        </label>
        <input
          id={`${id}-max`}
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={bounds.step}
          value={maxVal}
          onChange={(e) => setMax(Number(e.target.value))}
          className="pf-range-thumb absolute inset-0 z-[4] w-full cursor-pointer appearance-none bg-transparent"
        />
      </div>

      <div className="mt-1 flex justify-between text-xs tabular text-ink-400">
        <span>{formatCompactZAR(bounds.min)}</span>
        <span>{formatCompactZAR(bounds.max)}+</span>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-ink-500">Quick picks</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange('', '')}
            className={cn(
              'min-h-11 cursor-pointer rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              !minPrice && !maxPrice
                ? 'bg-primary text-white'
                : 'bg-white text-ink-600 ring-1 ring-primary-200 hover:bg-primary-50',
            )}
          >
            Any
          </button>
          {bounds.presets.map((p) => {
            const active = maxPrice === String(p) && !minPrice
            return (
              <button
                key={p}
                type="button"
                onClick={() => onChange('', String(p))}
                className={cn(
                  'min-h-11 cursor-pointer rounded-full px-3.5 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  active
                    ? 'bg-primary text-white'
                    : 'bg-white text-ink-600 ring-1 ring-primary-200 hover:bg-primary-50',
                )}
              >
                Up to {formatCompactZAR(p)}
                {mode === 'rent' ? '/mo' : ''}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

type Props = {
  open: boolean
  onClose: () => void
  value: BrowseFilterState
  onApply: (next: BrowseFilterState) => void
  resultCount: number
  getCount?: (draft: BrowseFilterState) => number
  priceHint?: string
  mode?: string
}

export function BrowseFiltersPanel({
  open,
  onClose,
  value,
  onApply,
  resultCount,
  getCount,
  priceHint,
  mode = 'all',
}: Props) {
  const [draft, setDraft] = useState(value)
  // Start from the applied filters on the opening render, so a draft left over
  // from another section (e.g. a rent budget) never shows, even for a frame.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(value)
  }

  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const liveCount = getCount ? getCount(draft) : resultCount

  if (!open) return null

  const toggleType = (t: string) => {
    setDraft((d) => ({
      ...d,
      types: d.types.includes(t) ? d.types.filter((x) => x !== t) : [...d.types, t],
    }))
  }

  const toggleAmenity = (a: string) => {
    setDraft((d) => ({
      ...d,
      amenities: d.amenities.includes(a) ? d.amenities.filter((x) => x !== a) : [...d.amenities, a],
    }))
  }

  const toggleIn = (key: 'furnishing' | 'leaseTerms' | 'saleDetails', v: string) => {
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(v) ? d[key].filter((x) => x !== v) : [...d[key], v],
    }))
  }

  const isRent = mode === 'rent'
  const isBuy = mode === 'buy'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close filters"
        className="absolute inset-0 cursor-pointer bg-ink/40 transition-opacity duration-200"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="browse-filters-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-primary-100 px-5 py-4">
          <h2 id="browse-filters-title" className="font-display text-xl font-semibold text-ink">
            {isRent ? 'Rental filters' : isBuy ? 'Filters for buyers' : 'Filters'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-ink-500 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          <Section title="Property type" hint="Select one or more">
            <div className="flex flex-wrap gap-2">
              {propertyTypesForMode(mode).map((t) => (
                <ChipToggle key={t} label={t} active={draft.types.includes(t)} onClick={() => toggleType(t)} />
              ))}
            </div>
          </Section>

          <Section title={isRent ? 'Monthly rent' : isBuy ? 'Purchase price' : 'Price range'}>
            <PriceRangeSlider
              mode={mode}
              minPrice={draft.minPrice}
              maxPrice={draft.maxPrice}
              hint={priceHint}
              onChange={(minPrice, maxPrice) => setDraft((d) => ({ ...d, minPrice, maxPrice }))}
            />
          </Section>

          <Section title="Rooms & parking" hint="Minimums — Any means no limit">
            <div className="divide-y divide-primary-50 rounded-2xl border border-primary-100 px-4">
              <StepperRow label="Bedrooms" value={draft.beds} onChange={(beds) => setDraft((d) => ({ ...d, beds }))} />
              <StepperRow label="Bathrooms" value={draft.baths} onChange={(baths) => setDraft((d) => ({ ...d, baths }))} />
              <StepperRow
                label="Parking bays"
                value={draft.parking}
                onChange={(parking) => setDraft((d) => ({ ...d, parking }))}
              />
            </div>
          </Section>

          {isBuy && (
            <Section title="Floor size" hint="Minimum size of the home">
              <div className="flex flex-wrap gap-2">
                {(['', '80', '120', '200', '300', '500'] as const).map((m) => (
                  <ChipToggle
                    key={m || 'any'}
                    label={m ? `${m}+ m²` : 'Any'}
                    active={draft.minFloorSize === m}
                    onClick={() => setDraft((d) => ({ ...d, minFloorSize: m }))}
                  />
                ))}
              </div>
            </Section>
          )}

          {isBuy && (
            <Section title="Ownership & sale" hint="Must include all selected">
              <div className="flex flex-wrap gap-2">
                {SALE_DETAIL_OPTIONS.map((o) => (
                  <ChipToggle
                    key={o}
                    label={o}
                    active={draft.saleDetails.includes(o)}
                    onClick={() => toggleIn('saleDetails', o)}
                  />
                ))}
              </div>
            </Section>
          )}

          {isRent && (
            <Section title="Move-in date" hint="Homes available on or before this date">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  aria-label="Available by"
                  value={draft.availableBy}
                  onChange={(e) => setDraft((d) => ({ ...d, availableBy: e.target.value }))}
                  className="min-h-11 rounded-xl border border-primary-100 bg-white px-3 text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                {draft.availableBy && (
                  <ChipToggle label="Any date" active={false} onClick={() => setDraft((d) => ({ ...d, availableBy: '' }))} />
                )}
              </div>
            </Section>
          )}

          {isRent && (
            <Section title="Furnishing" hint="Any of the selected">
              <div className="flex flex-wrap gap-2">
                {FURNISHING_OPTIONS.map((o) => (
                  <ChipToggle
                    key={o}
                    label={o}
                    active={draft.furnishing.includes(o)}
                    onClick={() => toggleIn('furnishing', o)}
                  />
                ))}
              </div>
            </Section>
          )}

          {isRent && (
            <Section title="Lease & pets" hint="Must include all selected">
              <div className="flex flex-wrap gap-2">
                <ChipToggle
                  label="Pets allowed"
                  active={draft.petsAllowed}
                  onClick={() => setDraft((d) => ({ ...d, petsAllowed: !d.petsAllowed }))}
                />
                {LEASE_TERM_OPTIONS.map((o) => (
                  <ChipToggle
                    key={o}
                    label={o}
                    active={draft.leaseTerms.includes(o)}
                    onClick={() => toggleIn('leaseTerms', o)}
                  />
                ))}
              </div>
            </Section>
          )}

          <Section
            title="Utility & structural tier"
            hint="Maps to GET /api/v1/units geospatial & green filters"
          >
            <div className="flex flex-wrap gap-2">
              <ChipToggle
                label="Load-shedding free"
                active={draft.loadSheddingFree}
                onClick={() => setDraft((d) => ({ ...d, loadSheddingFree: !d.loadSheddingFree }))}
              />
              <ChipToggle
                label="Premium tier"
                active={draft.premiumTier}
                onClick={() => setDraft((d) => ({ ...d, premiumTier: !d.premiumTier }))}
              />
              <ChipToggle
                label="Borehole"
                active={draft.hasBorehole}
                onClick={() => setDraft((d) => ({ ...d, hasBorehole: !d.hasBorehole }))}
              />
              {(['P', 'A', 'B', 'C'] as const).map((g) => (
                <ChipToggle
                  key={g}
                  label={`Grade ${g}`}
                  active={draft.grading.includes(g)}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      grading: d.grading.includes(g)
                        ? d.grading.filter((x) => x !== g)
                        : [...d.grading, g],
                    }))
                  }
                />
              ))}
            </div>
            <div className="mt-4">
              <label className="text-sm font-medium text-ink">Min solar capacity (kW)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={draft.minSolarKw}
                onChange={(e) => setDraft((d) => ({ ...d, minSolarKw: e.target.value }))}
                placeholder="e.g. 3"
                className="mt-2 w-full min-h-11 rounded-xl border border-primary-100 bg-white px-3 text-sm tabular outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </Section>

          <Section title="Amenities" hint="Must include all selected">
            <div className="flex flex-wrap gap-2">
              {amenityOptionsForMode(mode).map((a) => (
                <ChipToggle key={a} label={a} active={draft.amenities.includes(a)} onClick={() => toggleAmenity(a)} />
              ))}
            </div>
          </Section>

          <Section title="Sort by">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['featured', 'Recommended'],
                  ['newest', 'Newest'],
                  ['price-asc', isRent ? 'Rent: low to high' : 'Price: low to high'],
                  ['price-desc', isRent ? 'Rent: high to low' : 'Price: high to low'],
                  ['beds-desc', 'Most bedrooms'],
                ] as const
              ).map(([sid, label]) => (
                <ChipToggle
                  key={sid}
                  label={label}
                  active={draft.sort === sid}
                  onClick={() => setDraft((d) => ({ ...d, sort: sid }))}
                />
              ))}
            </div>
          </Section>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-primary-100 bg-white px-5 py-4">
          <button
            type="button"
            className="min-h-11 cursor-pointer text-sm font-semibold text-ink underline-offset-2 transition-colors duration-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => setDraft(defaultBrowseFilters())}
          >
            Clear all
          </button>
          <Button
            type="button"
            className="min-h-11 cursor-pointer px-6"
            onClick={() => {
              onApply(draft)
              onClose()
            }}
          >
            Show {liveCount} {liveCount === 1 ? 'home' : 'homes'}
          </Button>
        </div>
      </div>
    </div>
  )
}

type TriggerProps = {
  filters: BrowseFilterState
  onOpen: () => void
  onClear: () => void
  onRemoveType: (t: string) => void
  onRemoveAmenity: (a: string) => void
  onClearPrice: () => void
  onClearBeds: () => void
  onClearBaths: () => void
  onClearParking: () => void
  onClearSort: () => void
  onClearUtility?: () => void
  /** Clears a mode-only filter (furnishing, move-in date, floor size, …). */
  onPatch?: (patch: Partial<BrowseFilterState>) => void
  mode?: string
}

export function BrowseFiltersBar({
  filters,
  onOpen,
  onClear,
  onRemoveType,
  onRemoveAmenity,
  onClearPrice,
  onClearBeds,
  onClearBaths,
  onClearParking,
  onClearSort,
  onClearUtility,
  onPatch,
  mode = 'all',
}: TriggerProps) {
  const active = countActiveFilters(filters)

  const chips = useMemo(() => {
    const items: { key: string; label: string; onRemove: () => void }[] = []
    filters.types.forEach((t) => items.push({ key: `type-${t}`, label: t, onRemove: () => onRemoveType(t) }))
    if (filters.minPrice || filters.maxPrice) {
      const min = filters.minPrice ? formatCompactZAR(Number(filters.minPrice)) : 'Any'
      const max = filters.maxPrice ? formatCompactZAR(Number(filters.maxPrice)) : 'Any+'
      const per = mode === 'rent' ? '/mo' : ''
      items.push({ key: 'price', label: `${min} – ${max}${per}`, onRemove: onClearPrice })
    }
    if (filters.beds != null) items.push({ key: 'beds', label: `${filters.beds}+ beds`, onRemove: onClearBeds })
    if (filters.baths != null) items.push({ key: 'baths', label: `${filters.baths}+ baths`, onRemove: onClearBaths })
    if (filters.parking != null)
      items.push({ key: 'parking', label: `${filters.parking}+ parking`, onRemove: onClearParking })
    const patch = onPatch ?? (() => undefined)
    if (filters.minFloorSize)
      items.push({ key: 'floor', label: `${filters.minFloorSize}+ m²`, onRemove: () => patch({ minFloorSize: '' }) })
    filters.saleDetails.forEach((o) =>
      items.push({
        key: `sale-${o}`,
        label: o,
        onRemove: () => patch({ saleDetails: filters.saleDetails.filter((x) => x !== o) }),
      }),
    )
    if (filters.availableBy)
      items.push({
        key: 'available',
        label: `Available by ${formatShortDate(filters.availableBy)}`,
        onRemove: () => patch({ availableBy: '' }),
      })
    if (filters.furnishing.length)
      items.push({ key: 'furnishing', label: filters.furnishing.join(' / '), onRemove: () => patch({ furnishing: [] }) })
    if (filters.petsAllowed) items.push({ key: 'pets', label: 'Pets allowed', onRemove: () => patch({ petsAllowed: false }) })
    filters.leaseTerms.forEach((o) =>
      items.push({
        key: `lease-${o}`,
        label: o,
        onRemove: () => patch({ leaseTerms: filters.leaseTerms.filter((x) => x !== o) }),
      }),
    )
    filters.amenities.forEach((a) =>
      items.push({ key: `amenity-${a}`, label: a, onRemove: () => onRemoveAmenity(a) }),
    )
    if (
      filters.loadSheddingFree ||
      filters.premiumTier ||
      filters.hasBorehole ||
      filters.minSolarKw ||
      filters.grading.length
    ) {
      const bits: string[] = []
      if (filters.loadSheddingFree) bits.push('Load-shedding free')
      if (filters.premiumTier) bits.push('Premium')
      if (filters.hasBorehole) bits.push('Borehole')
      if (filters.minSolarKw) bits.push(`≥${filters.minSolarKw} kW`)
      if (filters.grading.length) bits.push(`Grade ${filters.grading.join('/')}`)
      items.push({
        key: 'utility',
        label: bits.join(' · '),
        onRemove: onClearUtility ?? (() => undefined),
      })
    }
    if (filters.sort !== 'featured') {
      const sortLabels: Record<SortOption, string> = {
        featured: 'Recommended',
        newest: 'Newest',
        'price-asc': mode === 'rent' ? 'Rent ↑' : 'Price ↑',
        'price-desc': mode === 'rent' ? 'Rent ↓' : 'Price ↓',
        'beds-desc': 'Most beds',
      }
      items.push({ key: 'sort', label: sortLabels[filters.sort], onRemove: onClearSort })
    }
    return items
  }, [
    filters,
    onRemoveType,
    onRemoveAmenity,
    onClearPrice,
    onClearBeds,
    onClearBaths,
    onClearParking,
    onClearSort,
    onClearUtility,
    onPatch,
    mode,
  ])

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          active > 0
            ? 'bg-primary text-white ring-primary'
            : 'bg-white text-ink ring-primary-200 hover:bg-primary-50',
        )}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filters
        {active > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs tabular">
            {active}
          </span>
        )}
      </button>

      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={c.onRemove}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-primary-50 px-3.5 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary-100 transition-colors duration-200 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {c.label}
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ))}

      {active > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 cursor-pointer px-1 text-xs font-semibold text-ink-500 underline-offset-2 transition-colors duration-200 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
