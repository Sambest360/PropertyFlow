import { Outlet, useLocation } from 'react-router-dom'
import { MarketplaceFooter } from './layout/MarketplaceFooter'
import { MarketplaceHeader } from './layout/MarketplaceHeader'
import { BrandLogo } from './layout/BrandLogo'
import { SpotlightSearch } from './layout/SpotlightSearch'
import { WorkspaceHeader } from './layout/WorkspaceHeader'
import { useWorkspaceNav, WorkspaceSidebar } from './layout/WorkspaceNav'
import { WORKSPACE_CONTENT_TOP, WORKSPACE_INSET } from './layout/workspaceInset'
import { NotificationToastHost } from './notifications/NotificationBell'
import { ImpersonationBanner } from './admin/ImpersonationBanner'
import { OnboardingLayer } from './onboarding/OnboardingLayer'
import { WorkspaceBottomNav } from './layout/mobile/WorkspaceBottomNav'
import { useNavCollapsed } from '../hooks/useNavCollapsed'
import { useScrollChrome } from '../hooks/useScrollChrome'
import { usePrefersReducedMotion } from '../hooks/useScrollMotion'
import { cn } from './ui'
import { useMarketplaceDataRefresh } from '../hooks/useMarketplaceDataRefresh'
import { useWorkspaceDataRefresh } from '../hooks/useWorkspaceDataRefresh'

/** Collapsed rail width — keep in sync with WorkspaceSidebar */
const RAIL_WIDTH = '4.5rem'

export function MarketplaceShell() {
  useMarketplaceDataRefresh()
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-ink">
      <OnboardingLayer />
      <MarketplaceHeader />
      <main className="min-w-0 flex-1 overflow-x-hidden">
        <Outlet />
      </main>
      <MarketplaceFooter />
    </div>
  )
}

/** Admin shell — full white background; header and pages share the same left edge */
export function WorkspaceShell() {
  useWorkspaceDataRefresh()
  const nav = useWorkspaceNav()
  const { pathname } = useLocation()
  const reducedMotion = usePrefersReducedMotion()
  const [navCollapsed] = useNavCollapsed()
  const { scrolled, topHeaderVisible, reducedMotion: reduceMotion } = useScrollChrome()
  const chromeCompact = !topHeaderVisible

  return (
    <div className="relative flex min-h-screen bg-white text-ink">
      <OnboardingLayer />
      <NotificationToastHost />
      <WorkspaceSidebar items={nav} brandMuted={chromeCompact} />

      {/* Bridging logo — soft / translucent while scrolled */}
      {navCollapsed && (
        <div
          className={cn(
            'pointer-events-none fixed top-4 z-40 hidden -translate-x-[28%] lg:block',
            reduceMotion ? 'transition-opacity duration-150' : 'transition-opacity duration-300',
            chromeCompact ? 'opacity-40' : 'opacity-100',
          )}
          style={{ left: RAIL_WIDTH }}
        >
          <BrandLogo to="/workspace" size="md" tone="bridge" className="pointer-events-auto" />
        </div>
      )}

      {/* Search minimize follows absolute scroll — not header visibility — to avoid flicker */}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-50 hidden justify-center px-6 lg:flex"
        data-tip-target="workspace-search"
      >
        <SpotlightSearch minimized={scrolled} className="mx-auto" />
      </div>

      <div className="relative z-0 flex min-w-0 flex-1 flex-col bg-white">
        <ImpersonationBanner />
        <WorkspaceHeader spotlightPinned topHidden={chromeCompact} />
        <main className={`min-w-0 flex-1 overflow-x-hidden pb-24 ${WORKSPACE_CONTENT_TOP} lg:pb-8 ${WORKSPACE_INSET}`}>
          <div
            key={pathname}
            className={reducedMotion ? 'w-full' : 'w-full animate-workspace-page'}
          >
            <Outlet />
          </div>
        </main>
      </div>
      <WorkspaceBottomNav />
    </div>
  )
}
