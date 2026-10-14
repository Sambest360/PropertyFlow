import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import {
  hasPageTipsPreference,
  resolvePageTour,
  setPageTipsPreference,
} from '../../lib/pageTips'
import { tenantHasApprovedOccupancy } from '../../lib/tenantOccupancy'

/** Silently default page tips on before the first walkthrough (no blocking modal — E2E P13). */
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

  useEffect(() => {
    if (!authReady || !isAuthenticated || isImpersonating || !uid || uid === 'guest') return
    if (!tourOnPage || hasPageTipsPreference(uid)) return
    setPageTipsPreference(uid, false)
  }, [authReady, isAuthenticated, isImpersonating, uid, tourOnPage])

  return null
}
