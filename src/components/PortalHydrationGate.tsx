/**
 * spec-portal-first-load: while a signed-in API-mode user's own bootstrap has
 * not landed, portals and the workspace dashboard show a skeleton instead of
 * an empty state or cached/seed rows. Not used on the public marketplace or
 * guest pages.
 */
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'
import { isApiEnabled } from '../lib/api/config'

export function isPortalHydrating(params: {
  isAuthenticated: boolean
  apiMode: boolean
  userId: string | null | undefined
  hydratedForUserId: string | null
}): boolean {
  if (!params.isAuthenticated || !params.apiMode) return false
  if (!params.userId || params.userId === 'guest') return false
  return params.hydratedForUserId !== params.userId
}

export function usePortalHydrating(): boolean {
  const { isAuthenticated, user } = useAuth()
  const { hydratedForUserId } = useStore()
  return isPortalHydrating({
    isAuthenticated,
    apiMode: isApiEnabled,
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

export function PortalHydrationGate({ children }: { children: ReactNode }) {
  const hydrating = usePortalHydrating()
  if (hydrating) return <PortalSkeleton />
  return <>{children}</>
}
