import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  hasSeenPageTip,
  markPageTipSeen,
  resolvePageTour,
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
} {
  const { pathname } = useLocation()
  const { user, isImpersonating } = useAuth()
  const [stepIndex, setStepIndex] = useState(0)
  const [skippedLocal, setSkippedLocal] = useState(false)

  const userId = user?.id || ANON_USER_ID

  const tour = useMemo(() => {
    if (isImpersonating) return null
    return resolvePageTour(pathname, user?.role ?? null)
  }, [pathname, user?.role, isImpersonating])

  useEffect(() => {
    setStepIndex(0)
    setSkippedLocal(false)
  }, [pathname, tour?.id])

  const alreadySeen = tour ? hasSeenPageTip(userId, tour.id) : true
  const activeTour = tour && !alreadySeen && !skippedLocal ? tour : null
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

  return {
    tour: activeTour,
    step,
    stepIndex,
    totalSteps,
    isFirst,
    isLast,
    next,
    skipAll,
  }
}