import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, ClipboardList, Heart, Home, MessageCircle, Wrench } from 'lucide-react'
import { cn } from '../../components/ui'
import { ACCOUNT_WISHLIST_PATH } from '../../lib/accountRoutes'

const ICON_STROKE = 1.6

type Tab = {
  to: string
  label: string
  icon: typeof Home
  occupancyOnly?: boolean
}

const TABS: Tab[] = [
  { to: '/workspace/portals/tenant', label: 'Home', icon: Home },
  { to: '/workspace/portals/tenant/applications', label: 'Applications', icon: ClipboardList },
  { to: ACCOUNT_WISHLIST_PATH, label: 'Wishlist', icon: Heart },
  { to: '/workspace/portals/tenant/maintenance', label: 'Maintenance', icon: Wrench, occupancyOnly: true },
  { to: '/workspace/portals/tenant/messages', label: 'Messages', icon: MessageCircle, occupancyOnly: true },
  {
    to: '/workspace/portals/tenant/complaints',
    label: 'Complaints',
    icon: AlertTriangle,
    occupancyOnly: true,
  },
]

export function TenantPortalTabs({ occupancyReady }: { occupancyReady: boolean }) {
  const { pathname } = useLocation()
  const visible = TABS.filter((t) => !t.occupancyOnly || occupancyReady)

  return (
    <nav
      aria-label="Tenant portal sections"
      className="flex gap-1 overflow-x-auto rounded-2xl border border-primary-100 bg-white p-1 shadow-sm [scrollbar-width:thin]"
    >
      {visible.map((tab) => {
        const Icon = tab.icon
        const active =
          tab.to === '/workspace/portals/tenant'
            ? pathname === tab.to || pathname === `${tab.to}/`
            : pathname === tab.to || pathname.startsWith(`${tab.to}/`)
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              'inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              active ? 'bg-primary text-white' : 'text-ink-500 hover:bg-primary-50 hover:text-ink',
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
