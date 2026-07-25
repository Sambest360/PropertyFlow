import { Link, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../ui'
import { pathMatches } from './navigation'

export function NavDropdown({
  label,
  children,
}: {
  label: string
  children: { to: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const ref = useRef<HTMLDivElement>(null)
  const isActive = children.some((c) => pathMatches(pathname, c.to))

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition',
          open || isActive ? 'bg-primary text-white' : 'text-ink-500 hover:bg-primary-50 hover:text-ink',
        )}
      >
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 min-w-[200px] overflow-hidden rounded-2xl border border-primary-100 bg-white py-1 shadow-lg shadow-ink/10 animate-fade-in">
          {children.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className={cn(
                'block px-4 py-2.5 text-sm font-medium transition',
                pathMatches(pathname, c.to) ? 'bg-primary text-white' : 'text-ink-600 hover:bg-primary-50',
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
