import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, cn } from '../ui'

const ICON_STROKE = 1.6

export const DEFAULT_PAGE_SIZE = 8

export function paginate<T>(items: T[], page: number, pageSize = DEFAULT_PAGE_SIZE) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return {
    page: safePage,
    totalPages,
    total,
    pageSize,
    start,
    end: Math.min(start + pageSize, total),
    items: items.slice(start, start + pageSize),
  }
}

export function ListPagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  className,
  label = 'items',
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
  className?: string
  label?: string
}) {
  if (total <= pageSize) return null
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div
      className={cn(
        'mt-4 flex flex-col gap-3 border-t border-primary-100 pt-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="text-xs tabular text-ink-500">
        Showing {start}–{end} of {total} {label}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11 min-w-11"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        </Button>
        <span className="min-w-[4.5rem] text-center text-sm tabular text-ink-600">
          {page} / {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          className="min-h-11 min-w-11"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        </Button>
      </div>
    </div>
  )
}
