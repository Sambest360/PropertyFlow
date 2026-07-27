import { cn } from '../ui'

export type DirectoryStatOption<T extends string = string> = {
  id: T
  label: string
  value: string | number
  hint: string
  highlight?: boolean
}

/** Compact KPI chip for admin directories — filters the list, not a dashboard hero. */
export function DirectoryStatCard({
  label,
  value,
  hint,
  active,
  onClick,
  highlight,
  tabular = true,
}: {
  label: string
  value: string | number
  hint: string
  active: boolean
  onClick: () => void
  highlight?: boolean
  tabular?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 cursor-pointer rounded-[1.25rem] border bg-white px-4 py-3.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active || highlight
          ? 'border-primary-200 bg-primary-50/40'
          : 'border-primary-100 hover:border-primary-200',
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</p>
      <p
        className={cn(
          'mt-1 font-display text-xl font-semibold text-ink sm:text-2xl',
          tabular && 'tabular',
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-500">{hint}</p>
    </button>
  )
}

/**
 * Row of filterable KPI chips. Clicking an already-active non-"all" chip clears back to `allId`.
 */
export function DirectoryStatGrid<T extends string>({
  options,
  value,
  onChange,
  allId,
  className,
}: {
  options: ReadonlyArray<DirectoryStatOption<T>>
  value: T
  onChange: (next: T) => void
  /** When set, re-clicking an active non-all chip resets to this id (usually `'all'`). */
  allId?: T
  className?: string
}) {
  return (
    <section className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {options.map((opt) => {
        const active = value === opt.id
        return (
          <DirectoryStatCard
            key={opt.id}
            label={opt.label}
            value={opt.value}
            hint={opt.hint}
            active={active}
            highlight={opt.highlight}
            onClick={() => {
              if (allId != null && active && opt.id !== allId) {
                onChange(allId)
                return
              }
              onChange(opt.id)
            }}
          />
        )
      })}
    </section>
  )
}
