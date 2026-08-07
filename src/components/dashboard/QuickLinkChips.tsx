import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../ui'

export type QuickLinkChip = {
  to: string
  label: string
  icon?: ReactNode
  tone?: 'primary' | 'accent'
}

export function QuickLinkChips({
  items,
  className,
}: {
  items: QuickLinkChip[]
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:grid-cols-3', className)}>
      {items.map((item) => (
        <Link
          key={item.to + item.label}
          to={item.to}
          className={cn(
            'inline-flex min-h-11 w-full shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-medium whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            item.tone === 'accent'
              ? 'bg-accent-50 text-accent-800 hover:bg-accent-100'
              : 'bg-primary-50 text-primary hover:bg-primary-100',
          )}
        >
          {item.icon}
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </div>
  )
}
