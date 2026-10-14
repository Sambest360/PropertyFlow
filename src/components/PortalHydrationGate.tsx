/**
 * spec-portal-first-load: while a signed-in API-mode user's own bootstrap has
 * not landed, portals and the workspace dashboard show a skeleton instead of
 * an empty state or cached/seed rows. Not used on the public marketplace or
 * guest pages.
 */
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'
import { isApiEnabled, isSupabaseMode } from '../lib/api/config'
import { portalHydrationUserId } from '../lib/clientCache'

export { portalHydrationUserId }

export function isPortalHydrating(params: {
  isAuthenticated: boolean
  liveMode: boolean
  userId: string | null | undefined
  hydratedForUserId: string | null
}): boolean {
  if (!params.isAuthenticated || !params.liveMode) return false
  const sessionUserId = portalHydrationUserId(params.isAuthenticated, params.userId)
  if (!sessionUserId) return false
  return params.hydratedForUserId !== sessionUserId
}

export function usePortalHydrating(): boolean {
  const { isAuthenticated, user } = useAuth()
  const { hydratedForUserId } = useStore()
  return isPortalHydrating({
    isAuthenticated,
    liveMode: isApiEnabled || isSupabaseMode,
    userId: user?.id,
    hydratedForUserId,
  })
}

export function PortalSkeleton() {
  return (
    <div data-testid="portal-skeleton" aria-busy="true" aria-label="Loading your workspace" className="space-y-4 p-4">
      <div className="h-8 w-1/3 animate-pulse rounded-md bg-surface-muted" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-muted" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-lg bg-surface-muted" />
    </div>
  )
}

export function PortalLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="portal-load-error" role="alert" className="space-y-3 p-4">
      <p className="text-sm text-ink">We couldn't load your workspace. Check your connection and try again.</p>
      <button type="button" onClick={onRetry} className="rounded-md border px-3 py-1.5 text-sm">
        Try again
      </button>
    </div>
  )
}

export function PortalHydrationGate({ children }: { children: ReactNode }) {
  const hydrating = usePortalHydrating()
  const { user } = useAuth()
  const { hydrationFailed, refreshBootstrap } = useStore()
  if (hydrating && hydrationFailed) {
    return (
      <PortalLoadError
        onRetry={() => {
          const actor =
            user?.id && user.id !== 'guest'
              ? { userId: user.id, role: user.role, agencyId: user.agencyId }
              : undefined
          void refreshBootstrap(actor, { force: true, full: true })
        }}
      />
    )
  }
  if (hydrating) return <PortalSkeleton />
  return <>{children}</>
}
