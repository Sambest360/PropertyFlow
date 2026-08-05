import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  hasSeenPageTip,
  markPageTipSeen,
  resolvePageTip,
  type PageTipContent,
} from '../lib/pageTips'

const ANON_USER_ID = 'anon'

export function usePageTip(): {
  tip: PageTipContent | null
  dismiss: () => void
} {
  const { pathname } = useLocation()
  const { user, isImpersonating } = useAuth()
  const [dismissedLocal, setDismissedLocal] = useState(false)

  const userId = user?.id || ANON_USER_ID

  useEffect(() => {
    setDismissedLocal(false)
  }, [pathname])

  const tip = useMemo(() => {
    if (isImpersonating) return null
    return resolvePageTip(pathname, user?.role ?? null)
  }, [pathname, user?.role, isImpersonating])

  const alreadySeen = tip ? hasSeenPageTip(userId, tip.id) : true

  const visibleTip = tip && !alreadySeen && !dismissedLocal ? tip : null

  const dismiss = useCallback(() => {
    if (!tip) return
    markPageTipSeen(userId, tip.id)
    setDismissedLocal(true)
  }, [tip, userId])

  return { tip: visibleTip, dismiss }
}
