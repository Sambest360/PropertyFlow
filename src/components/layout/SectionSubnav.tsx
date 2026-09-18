import { NavLink } from 'react-router-dom'
import { cn } from '../ui'

export type SectionSubnavItem = {
  to: string
  label: string
  end?: boolean
}

/** In-page section chrome matching workspace sidebar groups (Trust, Compliance). */
export function SectionSubnav({ items, className }: { items: readonly SectionSubnavItem[]; className?: string }) {
  return (
    <nav
      className={cn(
        'mb-5 flex gap-1 overflow-x-auto border-b border-primary-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      aria-label="Section"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'min-h-11 shrink-0 cursor-pointer border-b-2 px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-400 hover:text-ink-600',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export const TRUST_SUBNAV: SectionSubnavItem[] = [
  { to: '/workspace/trust', label: 'Dashboard', end: true },
  { to: '/workspace/trust/cashbook', label: 'Cashbook' },
  { to: '/workspace/trust/unallocated', label: 'Unallocated' },
  { to: '/workspace/trust/payouts', label: 'Payouts' },
  { to: '/workspace/trust/deposits', label: 'Deposits' },
  { to: '/workspace/trust/arrears', label: 'Arrears' },
]
