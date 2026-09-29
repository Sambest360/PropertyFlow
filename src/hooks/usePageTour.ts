import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  arePageTipsDisabled,
  hasPageTipsPreference,
  hasSeenPageTip,
  isTourSessionCooldownActive,
  markPageTipSeen,
  markTourSessionCooldown,
  resolvePageTour,
  setPageTipsPreference,
  subscribeToPageTipsChanges,
  type PageTour,
  type PageTourStep,
} from '../lib/pageTips'

const ANON_USER_ID = 'anon'

export function usePageTour(): {
  tour: PageTour | null
  step: PageTourStep | null
  stepIndex: number
  totalSteps: number
  isFirst: boolean
  isLast: boolean
  next: () => void
  skipAll: () => void
  disableAllTips: () => void
} {
  const { pathname } = useLocation()
  const { user, isImpersonating } = useAuth()
  const [stepIndex, setStepIndex] = useState(0)
  const [skippedLocal, setSkippedLocal] = useState(false)
  // Re-render when tips preferences/seen marks change (e.g. "Show page tips").
  const [, setTipsTick] = useState(0)
  useEffect(
    () =>
      subscribeToPageTipsChanges(() => {
        setTipsTick((t) => t + 1)
        // A reset clears seen marks; drop local skip state so the tour can replay.
        setSkippedLocal(false)
        setStepIndex(0)
      }),
    [],
  )

  const userId = user?.id || ANON_USER_ID
  const tipsAllowed = userId === ANON_USER_ID || hasPageTipsPreference(userId)
  const tipsDisabled = arePageTipsDisabled(userId)

  const tour = useMemo(() => {
    if (isImpersonating || tipsDisabled) return null
    if (!tipsAllowed && userId !== ANON_USER_ID) return null
    return resolvePageTour(pathname, user?.role ?? null)
  }, [pathname, user?.role, isImpersonating, tipsDisabled, tipsAllowed, userId])

  useEffect(() => {
    setStepIndex(0)
    setSkippedLocal(false)
  }, [pathname, tour?.id])

  const alreadySeen = tour ? hasSeenPageTip(userId, tour.id) : true
  const sessionPaused = isTourSessionCooldownActive()
  const activeTour =
    tour && !alreadySeen && !skippedLocal && !sessionPaused ? tour : null
  const totalSteps = activeTour?.steps.length ?? 0
  const step = activeTour?.steps[stepIndex] ?? null
  const isFirst = stepIndex === 0
  const isLast = totalSteps > 0 && stepIndex === totalSteps - 1

  const finish = useCallback(() => {
    if (!tour) return
    markPageTipSeen(userId, tour.id)
    setSkippedLocal(true)
  }, [tour, userId])

  const next = useCallback(() => {
    if (!activeTour) return
    if (stepIndex >= activeTour.steps.length - 1) {
      finish()
      return
    }
    setStepIndex((i) => i + 1)
  }, [activeTour, stepIndex, finish])

  const skipAll = useCallback(() => {
    finish()
  }, [finish])

  const disableAllTips = useCallback(() => {
    if (userId !== ANON_USER_ID) {
      setPageTipsPreference(userId, true)
    }
    if (tour) markPageTipSeen(userId, tour.id)
    else markTourSessionCooldown()
    setSkippedLocal(true)
  }, [tour, userId])

  return {
    tour: activeTour,
    step,
    stepIndex,
    totalSteps,
    isFirst,
    isLast,
    next,
    skipAll,
    disableAllTips,
  }
}
