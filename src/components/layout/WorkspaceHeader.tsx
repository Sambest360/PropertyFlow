import { Link, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNavCollapsed } from '../../hooks/useNavCollapsed'
import { WORKSPACE_INSET } from './workspaceInset'
import { BrandLogo } from './BrandLogo'
import { MobileDrawer } from './MobileDrawer'
import { RoleSwitcher } from './RoleSwitcher'
import { SpotlightSearch } from './SpotlightSearch'
import { useWorkspaceNav, WorkspaceMobileNav } from './WorkspaceNav'
import { NotificationBell } from '../notifications/NotificationBell'
import { cn } from '../ui'

const ICON_STROKE = 1.6

function welcomeName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'there'
  if (parts.length === 1) return parts[0]
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() ?? ''
  return `${parts[0]} ${lastInitial}.`
}

/** Main-column admin header — hides on scroll; side nav stays in the shell */
export function WorkspaceHeader({
  spotlightPinned = false,
  topHidden = false,
}: {
  /** When true, desktop search lives in the shell — don't duplicate it here */
  spotlightPinned?: boolean
  /** Hide welcome / actions while scrolling */
  topHidden?: boolean
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [navCollapsed] = useNavCollapsed()
  const { roleLabel, user, logout } = useAuth()
  const nav = useWorkspaceNav()
  const { pathname } = useLocation()
  const isDashboard = pathname === '/workspace' || pathname === '/workspace/'

  const dateLabel = new Intl.DateTimeFormat('en-ZA', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  const compact = navCollapsed
  /** Welcome + date only on the dashboard home */
  const showWelcome = isDashboard && !topHidden && !compact
  /** Notifications sit in the welcome row on dashboard; elsewhere use the corner cluster */
  const showCornerActions = topHidden || compact || !isDashboard
  /** Reserve space under the fixed spotlight when the welcome row is not present */
  const reserveSpotlight = spotlightPinned && !showWelcome

  return (
    <>
      <header
        className={cn(
          'sticky top-0 z-30 bg-white/95 backdrop-blur-md transition-[background-color] duration-200',
          topHidden && 'bg-transparent backdrop-blur-none',
        )}
      >
        {/* Mobile: logo + menu — keep hamburger reachable while scrolled */}
        <div className={`flex flex-col gap-3 py-4 lg:hidden ${WORKSPACE_INSET}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-2xl border border-primary-100 bg-white text-ink transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </button>
            {!topHidden && <BrandLogo to="/workspace" size="sm" />}
            <div className="ml-auto">
              <NotificationBell />
            </div>
          </div>
          <SpotlightSearch minimized={topHidden} />
        </div>

        {/* Desktop expanded: welcome + actions — dashboard only */}
        {showWelcome && (
          <div
            className={cn(
              'hidden flex-col gap-4 py-5 lg:flex lg:flex-row lg:items-center lg:gap-8 lg:py-6',
              WORKSPACE_INSET,
            )}
          >
            <div className="min-w-0 flex-1 lg:max-w-none lg:basis-[240px] lg:flex-none">
              <h1 className="truncate text-[1.35rem] font-bold tracking-tight text-ink sm:text-[1.5rem]">
                Welcome, {welcomeName(user.name)}
              </h1>
              <p className="mt-1 text-sm font-medium text-ink-400">{dateLabel}</p>
            </div>

            {!spotlightPinned && (
              <div className="w-full max-w-2xl flex-1 lg:mx-auto">
                <SpotlightSearch />
              </div>
            )}
            {spotlightPinned && (
              <div className="hidden h-12 max-w-2xl flex-1 lg:mx-auto lg:block" aria-hidden />
            )}

            <div className="flex items-center gap-2.5 self-end lg:ml-auto lg:shrink-0 lg:self-auto">
              <NotificationBell />
              <RoleSwitcher variant="avatar" />
            </div>
          </div>
        )}

        {/* Compact / scrolled / non-dashboard: keep notifications + role reachable */}
        {showCornerActions && (
          <div className="absolute right-4 top-3 z-40 hidden items-center gap-2 lg:flex">
            <NotificationBell />
            <RoleSwitcher variant="avatar" />
          </div>
        )}

        {reserveSpotlight && (
          <div className="hidden h-[3.75rem] lg:block" aria-hidden />
        )}
      </header>

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} title="Menu" side="left">
        <div className="mb-5 px-1">
          <BrandLogo to="/workspace" size="sm" />
          <p className="mt-3 text-sm text-ink-500">{roleLabel}</p>
          <div className="mt-3">
            <RoleSwitcher variant="full" />
          </div>
        </div>
        <WorkspaceMobileNav items={nav} onNavigate={() => setMobileOpen(false)} />
        <div className="mt-6 space-y-1 border-t border-primary-100 pt-4">
          <Link
            to="/workspace/admin"
            onClick={() => setMobileOpen(false)}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-500 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Help
          </Link>
          <Link
            to="/"
            onClick={() => {
              setMobileOpen(false)
              void logout()
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
