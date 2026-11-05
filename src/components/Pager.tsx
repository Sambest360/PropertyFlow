/**
 * Paging for any in-memory list, so long lists show a page at a time instead
 * of scrolling forever. usePaged slices the list; <Pager {...paged} /> draws
 * the controls (hidden when everything fits on one page).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ListPagination, paginate } from './property-detail/ListPagination'

export const LIST_PAGE_SIZE = 20

export function usePaged<T>(items: readonly T[], pageSize = LIST_PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const lenRef = useRef(items.length)
  // Back to page 1 when a filter or search changes how many rows there are.
  useEffect(() => {
    if (lenRef.current !== items.length) {
      lenRef.current = items.length
      setPage(1)
    }
  }, [items.length])
  const p = useMemo(() => paginate(items as T[], page, pageSize), [items, page, pageSize])
  return { page: p.page, totalPages: p.totalPages, total: p.total, pageSize, pageItems: p.items, setPage }
}

export function Pager({
  page,
  totalPages,
  total,
  pageSize,
  setPage,
  label,
  className,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  setPage: (n: number) => void
  label?: string
  className?: string
}) {
  return (
    <ListPagination
      page={page}
      totalPages={totalPages}
      total={total}
      pageSize={pageSize}
      label={label}
      className={className}
      onPageChange={(n) => {
        setPage(n)
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
      }}
    />
  )
}
