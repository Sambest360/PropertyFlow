import { useCallback, useEffect, useRef, useState } from 'react'

export function useWizardSteps(opts: {
  totalSteps: number
  storageKey?: string
  initialStep?: number
}) {
  const { totalSteps, storageKey, initialStep = 0 } = opts
  const [stepIndex, setStepIndex] = useState(initialStep)
  const [maxReachableIndex, setMaxReachableIndex] = useState(initialStep)

  useEffect(() => {
    if (!storageKey) return
    try {
      const raw = sessionStorage.getItem(`${storageKey}:step`)
      if (raw != null) {
        const n = Number(raw)
        if (Number.isFinite(n) && n >= 0 && n < totalSteps) {
          setStepIndex(n)
          setMaxReachableIndex(Math.max(n, initialStep))
        }
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, totalSteps, initialStep])

  useEffect(() => {
    if (!storageKey) return
    try {
      sessionStorage.setItem(`${storageKey}:step`, String(stepIndex))
    } catch {
      /* ignore */
    }
  }, [stepIndex, storageKey])

  const goNext = useCallback(() => {
    setStepIndex((i) => {
      const next = Math.min(i + 1, totalSteps - 1)
      setMaxReachableIndex((m) => Math.max(m, next))
      return next
    })
  }, [totalSteps])

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0))
  }, [])

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalSteps) return
      if (index > maxReachableIndex) return
      setStepIndex(index)
    },
    [maxReachableIndex, totalSteps],
  )

  const markReachable = useCallback((index: number) => {
    setMaxReachableIndex((m) => Math.max(m, index))
  }, [])

  const reset = useCallback(() => {
    setStepIndex(initialStep)
    setMaxReachableIndex(initialStep)
    if (storageKey) {
      try {
        sessionStorage.removeItem(`${storageKey}:step`)
        sessionStorage.removeItem(`${storageKey}:draft`)
      } catch {
        /* ignore */
      }
    }
  }, [initialStep, storageKey])

  return {
    stepIndex,
    maxReachableIndex,
    setStepIndex,
    setMaxReachableIndex,
    goNext,
    goBack,
    goTo,
    markReachable,
    reset,
    isFirst: stepIndex === 0,
    isLast: stepIndex === totalSteps - 1,
  }
}

export function useWizardDraft<T extends object>(
  storageKey: string,
  initial: T,
  options?: { omitFromPersist?: (keyof T)[] },
) {
  const omitFromPersist = options?.omitFromPersist ?? []
  const initialRef = useRef(initial)
  initialRef.current = initial

  const [draft, setDraft] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(`${storageKey}:draft`)
      if (raw) {
        const loaded = { ...initialRef.current, ...JSON.parse(raw) } as T
        for (const key of omitFromPersist) {
          loaded[key] = initialRef.current[key]
        }
        return loaded
      }
    } catch {
      /* ignore */
    }
    return initialRef.current
  })

  useEffect(() => {
    try {
      const toPersist = { ...draft }
      for (const key of omitFromPersist) {
        toPersist[key] = initialRef.current[key]
      }
      sessionStorage.setItem(`${storageKey}:draft`, JSON.stringify(toPersist))
    } catch {
      /* ignore */
    }
  }, [draft, omitFromPersist, storageKey])

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(`${storageKey}:draft`)
    } catch {
      /* ignore */
    }
  }, [storageKey])

  return { draft, setDraft, clearDraft }
}
