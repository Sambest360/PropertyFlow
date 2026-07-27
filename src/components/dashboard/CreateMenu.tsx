import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, Plus } from 'lucide-react'
import { currentReturnPath, withReturnTo } from '../../lib/returnTo'
import { Button } from '../ui'

export type CreateMenuItem = { to: string; label: string }

export function CreateMenu({ items }: { items: CreateMenuItem[] }) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const returnHere = currentReturnPath(location.pathname, location.search)

  return (
    <div className="relative">
      <Button
        type="button"
        className="min-h-11 gap-1.5 rounded-2xl"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Plus className="h-4 w-4" strokeWidth={1.6} aria-hidden />
        Create
        <ChevronDown className="h-3.5 w-3.5 opacity-70" strokeWidth={1.6} aria-hidden />
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-primary-100 bg-white py-1 shadow-lg shadow-ink/10">
          {items.map((item) => (
            <Link
              key={`${item.label}-${item.to}`}
              to={withReturnTo(item.to, returnHere)}
              onClick={() => setOpen(false)}
              className="flex min-h-11 w-full cursor-pointer items-center px-3 text-sm text-ink transition-colors duration-150 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function FilterClearHint({
  label,
  onClear,
}: {
  label: string
  onClear: () => void
}) {
  return (
    <p className="text-xs text-ink-400">
      Filter: <span className="font-semibold text-ink">{label}</span>
      <button
        type="button"
        className="ml-2 inline-flex min-h-11 cursor-pointer items-center px-1 font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onClear}
      >
        Clear
      </button>
    </p>
  )
}

export function DashboardCalendarShell({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-primary-100 bg-white shadow-[0_18px_40px_-24px_rgba(15,39,68,0.35)]">
      {children}
    </div>
  )
}

/** Reset list selection when the active tab changes. */
export function useResetOnTabChange(tab: string, reset: () => void) {
  useEffect(() => {
    reset()
  }, [tab, reset])
}
