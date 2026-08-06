import type { ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '../ui'

const ICON_STROKE = 1.6

export function ReportsPageHeader({
  greeting,
  subtitle,
  actions,
}: {
  greeting: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
          {greeting}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">{subtitle}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function ReportTabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div
      className="flex flex-wrap gap-2 border-b border-primary-100 pb-1"
      role="tablist"
      aria-label="Report views"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'min-h-11 cursor-pointer rounded-t-xl px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            active === tab.id
              ? 'bg-primary text-white shadow-sm'
              : 'text-ink-500 hover:bg-primary-50 hover:text-ink',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function ReportSectionCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'rounded-[1.25rem] border border-primary-100/80 bg-white p-5 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]',
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function ReportMetricTile({
  label,
  value,
  trend,
  icon,
  accentClassName = 'bg-primary-50 text-primary',
}: {
  label: string
  value: string
  trend?: number
  icon: ReactNode
  accentClassName?: string
}) {
  const trendUp = trend != null && trend >= 0
  return (
    <div className="flex flex-col items-center gap-3 border-primary-50 px-2 py-1 text-center sm:border-r sm:last:border-r-0">
      <div
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-2xl',
          accentClassName,
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-xs font-medium text-ink-500">{label}</p>
        <p className="mt-1 tabular text-2xl font-semibold tracking-tight text-ink">{value}</p>
        {trend != null ? (
          <p
            className={cn(
              'mt-1 inline-flex items-center gap-0.5 text-xs font-semibold',
              trendUp ? 'text-emerald-700' : 'text-accent-700',
            )}
          >
            {trendUp ? (
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
            )}
            {Math.abs(trend)}%
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function ReportLegendRow({
  items,
}: {
  items: Array<{ label: string; value: string; colorClassName: string }>
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-xs text-ink-600">
          <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', item.colorClassName)} aria-hidden />
          <span>
            {item.label} · <span className="tabular font-semibold text-ink">{item.value}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export function timeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}
