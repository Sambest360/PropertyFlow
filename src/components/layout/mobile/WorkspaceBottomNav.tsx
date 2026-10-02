import { Link, useLocation } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useAuth } from '../../../context/AuthContext'
import { useStore } from '../../../context/AppStore'
import { signOutAndRedirect } from '../../../lib/auth/signOut'
import { tenantHasApprovedOccupancy } from '../../../lib/tenantOccupancy'
import { resolveWorkspaceBottomNavTabs } from '../../../lib/workspaceBottomNav'
import { MobileDrawer } from '../MobileDrawer'
import { BrandLogo } from '../BrandLogo'
import { RoleSwitcher } from '../RoleSwitcher'
import { useWorkspaceNav, WorkspaceMobileNav } from '../WorkspaceNav'
import { cn } from '../../ui'

const ICON_STROKE = 1.6

function resolveDashboardTo(role: string, has: (p: import('../../../types/domain').Permission) => boolean): string {
  if (role === 'contractor' && has('portal.contractor')) return '/workspace/portals/contractor'
  if (role === 'landlord' && has('portal.owner')) return '/workspace/portals/owner'
  if (role === 'tenant' && has('portal.tenant')) return '/workspace/portals/tenant'
  return '/workspace'
}

export function WorkspaceBottomNav() {
  const { pathname } = useLocation()
  const { has, hasAny, role, roleLabel, user, logout } = useAuth()
  const { state } = useStore()
  const nav = useWorkspaceNav()
  const [moreOpen, setMoreOpen] = useState(false)

  const dashboardTo = useMemo(() => {
    if (role === 'tenant' && has('portal.tenant')) {
      return tenantHasApprovedOccupancy(state.applications, state.tenancies, user)
        ? '/workspace/portals/tenant'
        : '/workspace/portals/tenant/applications'
    }
    return resolveDashboardTo(role, has)
  }, [role, has, state.applications, state.tenancies, user])

  const tabs = useMemo(
    () => resolveWorkspaceBottomNavTabs({ has, hasAny, role, dashboardTo }),
    [has, hasAny, role, dashboardTo],
  )

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-primary-100 bg-white/95 backdrop-blur-md lg:hidden"
        aria-label="Workspace shortcuts"
        style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = tab.action === 'more' ? moreOpen : tab.isActive(pathname)

            if (tab.action === 'more') {
              return (
                <li key={tab.id} className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    className={cn(
                      'flex min-h-11 w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      active ? 'text-primary' : 'text-ink-400 hover:text-ink-600',
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                    <span>{tab.label}</span>
                  </button>
                </li>
              )
            }

            return (
              <li key={tab.id} className="min-w-0 flex-1">
                <Link
                  to={tab.to!}
                  className={cn(
                    'flex min-h-11 w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    active ? 'text-primary' : 'text-ink-400 hover:text-ink-600',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                  <span className="truncate max-w-full">{tab.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <MobileDrawer open={moreOpen} onClose={() => setMoreOpen(false)} title="Menu" side="left">
        <div className="mb-5 px-1">
          <BrandLogo to="/workspace" size="sm" />
          <p className="mt-3 text-sm text-ink-500">{roleLabel}</p>
          <div className="mt-3">
            <RoleSwitcher variant="full" />
          </div>
        </div>
        <WorkspaceMobileNav items={nav} onNavigate={() => setMoreOpen(false)} />
        <div className="mt-6 space-y-1 border-t border-primary-100 pt-4">
          <Link
            to="/workspace/help"
            onClick={() => setMoreOpen(false)}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-500 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Help
          </Link>
          <Link
            to="/login"
            onClick={(e) => {
              e.preventDefault()
              setMoreOpen(false)
              void signOutAndRedirect(logout)
            }}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-500 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Sign out
          </Link>
        </div>
      </MobileDrawer>
    </>
  )
}
