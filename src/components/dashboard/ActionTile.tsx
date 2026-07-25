import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { cn } from '../ui'

export function ActionTile({
  to,
  title,
  blurb,
  className,
}: {
  to: string
  title: string
  blurb: string
  className?: string
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex min-h-11 cursor-pointer items-start justify-between gap-3 rounded-2xl border border-primary-100 bg-white p-4 transition-all duration-200 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      <div>
        <p className="font-semibold text-ink group-hover:text-primary">{title}</p>
        <p className="mt-1 text-xs text-ink-500">{blurb}</p>
      </div>
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-400 transition duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  )
}
