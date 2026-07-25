import { Link } from 'react-router-dom'
import { cn } from '../ui'

export type BreadcrumbItem = {
  label: string
  to?: string
}

export function DashboardBreadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[]
  className?: string
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-sm text-ink-400', className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {item.to && !last ? (
                <Link
                  to={item.to}
                  className="cursor-pointer transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {item.label}
                </Link>
              ) : (
                <span className={cn(last && 'font-medium text-ink')}>{item.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
