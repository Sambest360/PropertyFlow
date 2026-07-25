import { groupFeaturesForDisplay } from '../../lib/propertyFeatures'
import { cn } from '../ui'

const ICON_STROKE = 1.6

export function PropertyFeaturesDisplay({
  amenities,
  className,
  compact,
}: {
  amenities: string[]
  className?: string
  /** Dense chip row for cards / overview headers */
  compact?: boolean
}) {
  if (amenities.length === 0) {
    return (
      <p className={cn('text-sm text-ink-500', className)}>No features listed yet.</p>
    )
  }

  if (compact) {
    const groups = groupFeaturesForDisplay(amenities)
    const flat = groups.flatMap((g) => g.items)
    return (
      <ul className={cn('flex flex-wrap gap-2', className)} aria-label="Property features">
        {flat.map(({ label, icon: Icon }) => (
          <li
            key={label}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary-100 bg-primary-50/80 px-3 py-1.5 text-xs font-medium text-ink"
          >
            <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    )
  }

  const groups = groupFeaturesForDisplay(amenities)

  return (
    <div className={cn('space-y-5', className)}>
      {groups.map((group) => (
        <section key={group.category} aria-labelledby={`feat-${group.category}`}>
          <h3
            id={`feat-${group.category}`}
            className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400"
          >
            {group.categoryLabel}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {group.items.map(({ label, icon: Icon }) => (
              <li
                key={label}
                className="flex min-h-11 items-center gap-3 rounded-2xl border border-primary-100 bg-white px-3 py-2.5 text-sm text-ink"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                  <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                </span>
                <span className="font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
