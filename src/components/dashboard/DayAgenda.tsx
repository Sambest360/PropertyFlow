import type { ReactNode } from 'react'
import { Badge, cn } from '../ui'

export type DayAgendaItem = {
  id: string
  title: string
  meta: string
  badge: string
  badgeTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent'
  icon?: ReactNode
  tone?: 'primary' | 'accent'
}

export function DayAgenda({
  heading,
  items,
  empty = 'No events on this day.',
  onSelect,
  className,
}: {
  heading?: string
  items: DayAgendaItem[]
  empty?: string
  onSelect?: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col rounded-[1.25rem] border border-primary-100 bg-white p-4', className)}>
      {heading ? (
        <div className="mb-3 shrink-0">
          <h3 className="text-sm font-semibold text-ink">{heading}</h3>
        </div>
      ) : null}
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto [scrollbar-width:thin]">
        {items.map((item) => {
          const body = (
            <>
            {item.icon && (
              <span
                className={cn(
                  'mt-0.5 shrink-0 [&_svg]:h-4 [&_svg]:w-4',
                  item.tone === 'accent' ? 'text-accent' : 'text-primary',
                )}
              >
                {item.icon}
              </span>
            )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{item.title}</p>
                <p className="truncate text-xs text-ink-500">{item.meta}</p>
              </div>
              <Badge tone={item.badgeTone ?? 'neutral'} className="shrink-0">
                {item.badge}
              </Badge>
            </>
          )
          return (
            <li key={item.id}>
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    'flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    item.tone === 'accent'
                      ? 'bg-accent-50/70 hover:bg-accent-50'
                      : 'bg-primary-50/60 hover:bg-primary-50',
                  )}
                >
                  {body}
                </button>
              ) : (
                <div
                  className={cn(
                    'flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm',
                    item.tone === 'accent' ? 'bg-accent-50/70' : 'bg-primary-50/60',
                  )}
                >
                  {body}
                </div>
              )}
            </li>
          )
        })}
        {items.length === 0 && (
          <li className="py-6 text-center text-sm text-ink-500">{empty}</li>
        )}
      </ul>
    </div>
  )
}
