/**
 * spec-portal-first-load: while a signed-in API-mode user's own bootstrap has
 * not landed, portals and the workspace dashboard show a skeleton instead of
 * an empty state or cached/seed rows. Not used on the public marketplace or
 * guest pages.
 */
import { useCallback, useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'
import { bootstrapActorKey, isBootstrapFetchInFlight } from '../lib/bootstrapCoord'
import { isApiEnabled, isSupabaseMode } from '../lib/api/config'
import { portalHydrationUserId } from '../lib/clientCache'
import { hasPortfolioSnapshotForUser } from '../lib/portfolioSnapshot'
import { PropertyLoader } from './loading/PropertyLoader'

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
  if (params.hydratedForUserId === sessionUserId) return false
  if (hasPortfolioSnapshotForUser(sessionUserId)) return false
  return true
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
      <div className="flex justify-center py-4">
        <PropertyLoader size="md" label="Loading your workspace…" />
      </div>
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

export function PortalLoadError({
  onRetry,
  retrying = false,
}: {
  onRetry: () => void
  retrying?: boolean
}) {
  return (
    <div data-testid="portal-load-error" role="alert" className="space-y-3 p-4">
      <p className="text-sm text-ink">We couldn't load your workspace. Check your connection and try again.</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        {retrying ? 'Trying again…' : 'Try again'}
      </button>
    </div>
  )
}

type PortalUser = { id: string; role: string; agencyId: string | null | undefined }

export function portalHydrationBootstrapActor(user: PortalUser | null | undefined) {
  return user?.id && user.id !== 'guest'
    ? { userId: user.id, role: user.role, agencyId: user.agencyId }
    : undefined
}

/** Returns null when a bootstrap for this actor is already in flight. */
export function planPortalHydrationRetry(user: PortalUser | null | undefined) {
  const actor = portalHydrationBootstrapActor(user)
  if (isBootstrapFetchInFlight(bootstrapActorKey(actor))) return null
  return actor
}

function PortalHydrationErrorPanel({
  user,
  refreshBootstrap,
}: {
  user: PortalUser | null | undefined
  refreshBootstrap: (actor: undefined | { userId: string; role: string; agencyId?: string | null }, opts: { force: boolean }) => Promise<unknown>
}) {
  const [retrying, setRetrying] = useState(false)
  const onRetry = useCallback(() => {
    const actor = planPortalHydrationRetry(user)
    if (actor === null) return
    setRetrying(true)
    void refreshBootstrap(actor, { force: true }).finally(() => setRetrying(false))
  }, [refreshBootstrap, user])
  return <PortalLoadError onRetry={onRetry} retrying={retrying} />
}

export function PortalHydrationGate({ children }: { children: ReactNode }) {
  const hydrating = usePortalHydrating()
  const { user } = useAuth()
  const { hydrationFailed, refreshBootstrap } = useStore()
  if (hydrating && hydrationFailed) {
    return <PortalHydrationErrorPanel user={user} refreshBootstrap={refreshBootstrap} />
  }
  if (hydrating) return <PortalSkeleton />
  return <>{children}</>
}
