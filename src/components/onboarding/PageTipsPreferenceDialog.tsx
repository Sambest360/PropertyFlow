import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import { ensurePageTipsPreferenceForFirstVisit, resolvePageTour } from '../../lib/pageTips'
import { tenantHasApprovedOccupancy } from '../../lib/tenantOccupancy'

/** Silently records first-visit tips preference (no blocking modal — FW-05 / E2E P13). */
export function PageTipsPreferenceDialog() {
  const { user, isAuthenticated, authReady, isImpersonating } = useAuth()
  const { state } = useStore()
  const { pathname } = useLocation()

  const uid = user?.id

  const tenantOccupancyReady = useMemo(() => {
    if (!user || user.role !== 'tenant') return true
    return tenantHasApprovedOccupancy(state.applications, state.tenancies, user)
  }, [user, state.applications, state.tenancies])

  const tourOnPage = useMemo(
    () => resolvePageTour(pathname, user?.role ?? null, { tenantOccupancyReady }),
    [pathname, user?.role, tenantOccupancyReady],
  )

  // Run synchronously before sibling PageTipWalkthrough renders (useEffect was too late for
  // the legacy modal and could flash the walkthrough on first paint).
  if (authReady && isAuthenticated && !isImpersonating && uid) {
    ensurePageTipsPreferenceForFirstVisit(uid, Boolean(tourOnPage))
  }

  return null
}
