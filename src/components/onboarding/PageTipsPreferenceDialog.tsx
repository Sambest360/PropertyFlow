import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import {
  hasPageTipsPreference,
  resolvePageTour,
  setPageTipsPreference,
  subscribeToPageTipsChanges,
} from '../../lib/pageTips'
import { tenantHasApprovedOccupancy } from '../../lib/tenantOccupancy'
import { cn } from '../ui'

export function PageTipsPreferenceDialog() {
  const { user, isAuthenticated, authReady, isImpersonating } = useAuth()
  const { state } = useStore()
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(false)
  // Stay in sync when tips preferences change elsewhere (e.g. walkthrough toggle).
  const [, setStorageTick] = useState(0)
  useEffect(() => subscribeToPageTipsChanges(() => setStorageTick((t) => t + 1)), [])

  const uid = user?.id

  const tenantOccupancyReady = useMemo(() => {
    if (!user || user.role !== 'tenant') return true
    return tenantHasApprovedOccupancy(state.applications, state.tenancies, user)
  }, [user, state.applications, state.tenancies])

  const tourOnPage = useMemo(
    () => resolvePageTour(pathname, user?.role ?? null, { tenantOccupancyReady }),
    [pathname, user?.role, tenantOccupancyReady],
  )

  if (!authReady || !isAuthenticated || isImpersonating || !uid || uid === 'guest') {
    return null
  }

  // Ask once before the first walkthrough — not on /workspace redirects with no tour.
  if (dismissed || hasPageTipsPreference(uid) || !tourOnPage) return null

  if (typeof document === 'undefined') return null

  const choose = (disabled: boolean) => {
    setPageTipsPreference(uid, disabled)
    setDismissed(true)
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[320] flex items-center justify-center bg-ink/55 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pf-tips-pref-title"
      aria-describedby="pf-tips-pref-body"
    >
      <div
        className={cn(
          'w-full max-w-md rounded-2xl bg-white px-6 py-5 shadow-[0_16px_48px_-8px_rgba(15,39,68,0.32)]',
          'animate-fade-in',
        )}
      >
        <h2 id="pf-tips-pref-title" className="text-lg font-bold text-ink">
          Show page tips?
        </h2>
        <p id="pf-tips-pref-body" className="mt-2 text-sm leading-relaxed text-ink-600">
          Letkaya can walk you through key areas with short spotlight tips when you visit them
          for the first time. You can turn this off anytime from any tip.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => choose(true)}
            className="cursor-pointer rounded-full border border-primary-100 px-5 py-2.5 text-sm font-semibold text-ink-600 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            No thanks, turn off
          </button>
          <button
            type="button"
            onClick={() => choose(false)}
            className="cursor-pointer rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Show tips
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
