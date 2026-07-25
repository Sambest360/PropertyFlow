import { cn } from '../ui'

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
