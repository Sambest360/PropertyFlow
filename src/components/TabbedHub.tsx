import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { cn } from '../components/ui'

export type HubTab = { to: string; label: string; end?: boolean }

export function TabbedHub({
  title,
  subtitle,
  tabs,
}: {
  title: string
  subtitle: string
  tabs: HubTab[]
}) {
  const { pathname } = useLocation()

  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
      </div>

      <div className="mb-6 overflow-x-auto rounded-2xl border border-primary-100 bg-white p-1.5">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => {
            const active = tab.end
              ? pathname === tab.to
              : pathname === tab.to || pathname.startsWith(`${tab.to}/`)
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={cn(
                  'rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors',
                  active ? 'bg-primary text-white' : 'text-ink-500 hover:bg-primary-50 hover:text-ink',
                )}
              >
                {tab.label}
              </NavLink>
            )
          })}
        </div>
      </div>

      <Outlet />
    </div>
  )
}
