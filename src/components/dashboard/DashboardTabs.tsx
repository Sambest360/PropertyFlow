import { cn } from '../ui'

export type DashboardTab<T extends string = string> = {
  id: T
  label: string
  count?: number
}

export function DashboardTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: ReadonlyArray<DashboardTab>
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-primary-100 [scrollbar-width:none]',
        className,
      )}
      role="tablist"
    >
      {tabs.map((t) => {
        const active = value === t.id
        const count = t.count ?? 0
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={cn(
              'min-h-11 shrink-0 cursor-pointer border-b-2 px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-400 hover:text-ink-600',
            )}
          >
            <span className="inline-flex items-center gap-2">
              {t.label}
              {count > 0 && (
                <span
                  className={cn(
                    'inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular',
                    active ? 'bg-primary text-white' : 'bg-accent-50 text-accent',
                  )}
                >
                  {count}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
