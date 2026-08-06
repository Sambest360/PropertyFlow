import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Paperclip } from 'lucide-react'
import { Badge, cn } from '../ui'
import { AvatarStack, type AvatarPerson } from './AvatarStack'
import { formatShortDate } from './formatShortDate'

export type OpsListItemData = {
  id: string
  title: string
  meta: string
  date: string
  badge: string
  badgeTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'accent'
  photos?: number
  people?: AvatarPerson[]
  /** Shows the blue “new” rail until the user opens this item */
  unread?: boolean
}

const DEFAULT_LIMIT = 5

export function OpsListItem({
  item,
  active,
  onSelect,
}: {
  item: OpsListItemData
  active?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex w-full cursor-pointer items-start gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active
          ? 'border-primary-100 shadow-[0_12px_28px_-18px_rgba(11,99,200,0.45)]'
          : 'border-primary-100/80 hover:border-primary-200 hover:shadow-sm',
      )}
    >
      {item.unread && (
        <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-primary" aria-hidden />
      )}
      <div className="min-w-0 flex-1 pl-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
          <Badge tone={item.badgeTone ?? 'neutral'}>{item.badge}</Badge>
        </div>
        <p className="mt-1 truncate text-xs text-ink-500">{item.meta}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <AvatarStack people={item.people ?? []} />
          {(item.photos ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-400">
              <Paperclip className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
              <span className="tabular">{item.photos}</span>
            </span>
          )}
        </div>
      </div>
      <time className="shrink-0 text-xs tabular text-ink-400">{formatShortDate(item.date)}</time>
    </button>
  )
}

export function OpsList({
  items,
  activeId,
  onSelect,
  empty,
  limit = DEFAULT_LIMIT,
  showMoreTo,
  showMoreLabel = 'Show more',
}: {
  items: OpsListItemData[]
  activeId?: string | null
  onSelect: (id: string) => void
  empty?: ReactNode
  /** Max items before “Show more” (default 5) */
  limit?: number
  showMoreTo?: string
  showMoreLabel?: string
}) {
  const visible = items.slice(0, limit)
  const hasMore = items.length > limit

  return (
    <ul className="space-y-2">
      {visible.map((item) => (
        <li key={item.id}>
          <OpsListItem
            item={item}
            active={activeId === item.id}
            onSelect={() => onSelect(item.id)}
          />
        </li>
      ))}
      {items.length === 0 && (
        <li className="rounded-2xl border border-dashed border-primary-100 px-4 py-10 text-center text-sm text-ink-500">
          {empty ?? 'Nothing in this queue.'}
        </li>
      )}
      {hasMore && showMoreTo && (
        <li>
          <Link
            to={showMoreTo}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 px-4 text-sm font-semibold text-primary transition-colors duration-200 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {showMoreLabel}
            <span className="tabular text-ink-400">+{items.length - limit}</span>
            <ArrowRight className="h-4 w-4" strokeWidth={1.6} aria-hidden />
          </Link>
        </li>
      )}
    </ul>
  )
}
