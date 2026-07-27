import { Children, isValidElement, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../ui'

const ICON_STROKE = 1.6

/** Static detail section — no card shadow / nested layers. */
export function DetailSection({
  title,
  subtitle,
  children,
  className,
  actions,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
  actions?: ReactNode
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/**
 * Stacks detail sections with hairline dividers.
 * Mobile: horizontal rules between sections.
 * Desktop (columns >= 2): vertical border on columns after the first.
 */
export function DetailStack({
  children,
  columns = 1,
  className,
}: {
  children: ReactNode
  columns?: 1 | 2
  className?: string
}) {
  const items = Children.toArray(children).filter(isValidElement)
  return (
    <div
      className={cn(
        'grid gap-0',
        columns === 2 && 'lg:grid-cols-2',
        className,
      )}
    >
      {items.map((child, i) => (
        <div
          key={child.key ?? i}
          className={cn(
            i > 0 && 'mt-8 border-t border-primary-100 pt-8',
            columns === 2 && i > 0 && 'lg:mt-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8',
            columns === 2 && i === 0 && 'lg:pr-8',
          )}
        >
          {child}
        </div>
      ))}
    </div>
  )
}

/** Label + value for readable static info — no bordered box. */
export function FlatField({
  label,
  value,
  icon: Icon,
  tabular,
}: {
  label: string
  value: string
  icon?: LucideIcon
  tabular?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
        {Icon ? <Icon className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden /> : null}
        {label}
      </dt>
      <dd className={cn('mt-0.5 text-sm font-semibold text-ink', tabular && 'tabular')}>{value}</dd>
    </div>
  )
}

export function FlatFieldGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {children}
    </dl>
  )
}
