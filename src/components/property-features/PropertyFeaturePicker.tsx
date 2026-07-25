import { Check } from 'lucide-react'
import {
  FEATURE_CATEGORIES,
  featuresForMode,
  togglePropertyFeature,
  type ListingMode,
} from '../../lib/propertyFeatures'
import { cn } from '../ui'

const ICON_STROKE = 1.6

export function PropertyFeaturePicker({
  value,
  onChange,
  listingMode,
  reducedMotion,
}: {
  value: string[]
  onChange: (next: string[]) => void
  listingMode: ListingMode
  reducedMotion?: boolean
}) {
  const available = featuresForMode(listingMode)
  const byCategory = FEATURE_CATEGORIES.map((cat) => ({
    ...cat,
    features: available.filter((f) => f.category === cat.id),
  })).filter((c) => c.features.length > 0)

  const orphans = value.filter(
    (label) => !available.some((f) => f.label === label) && !available.some((f) => f.label.toLowerCase() === label.toLowerCase()),
  )

  const modeHint =
    listingMode === 'sale'
      ? 'Sale listings show title / bond options. Furnishing is hidden.'
      : listingMode === 'rent'
        ? 'Rental listings include furnishing and lease terms.'
        : 'Sale and rent options are both available for dual listings.'

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Features</p>
        <p className="mt-0.5 text-xs text-ink-500">{modeHint}</p>
        <p className="mt-1 tabular text-xs font-medium text-ink-500">
          {value.length} selected
        </p>
      </div>

      {byCategory.map((cat) => (
        <div key={cat.id}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            {cat.label}
            {cat.id === 'furnishing' ? (
              <span className="ml-1 font-medium normal-case tracking-normal text-ink-400">
                · pick one
              </span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={cat.label}>
            {cat.features.map((feature) => {
              const active = value.includes(feature.label)
              const Icon = feature.icon
              return (
                <button
                  key={feature.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(togglePropertyFeature(value, feature.label, listingMode))}
                  className={cn(
                    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    reducedMotion && 'transition-none',
                    active
                      ? 'border-primary bg-primary text-white shadow-sm'
                      : 'border-primary-100 bg-white text-ink-600 hover:border-primary-200 hover:bg-primary-50',
                  )}
                >
                  {active ? (
                    <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                  ) : (
                    <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={ICON_STROKE} aria-hidden />
                  )}
                  {feature.label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {orphans.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Saved custom tags
          </p>
          <div className="flex flex-wrap gap-2">
            {orphans.map((label) => (
              <button
                key={label}
                type="button"
                aria-pressed
                onClick={() => onChange(value.filter((x) => x !== label))}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl border border-primary bg-primary px-3 py-2 text-sm font-medium text-white transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title="Click to remove"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
