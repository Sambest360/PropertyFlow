import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from './useScrollMotion'

type ScrollChromeOptions = {
  /** Absolute Y where header always returns */
  topReveal?: number
  /** Cumulative down-scroll (px) required to hide */
  hideAfter?: number
  /** Cumulative up-scroll (px) required to show */
  showAfter?: number
  /** Ignore scroll events this long after a visibility flip (ms) */
  cooldownMs?: number
  /** Y past which search counts as scrolled */
  scrolledAt?: number
  /** Y under which search leaves scrolled state (hysteresis) */
  unscrolledAt?: number
}

/**
 * Stable scroll chrome for the workspace shell.
 * Uses directional accumulation + cooldown so mid-page trackpad
 * bounce / layout shift cannot flicker the top bar.
 */
export function useScrollChrome({
  topReveal = 48,
  hideAfter = 28,
  showAfter = 20,
  cooldownMs = 360,
  scrolledAt = 40,
  unscrolledAt = 12,
}: ScrollChromeOptions = {}) {
  const reducedMotion = usePrefersReducedMotion()
  const [scrolled, setScrolled] = useState(false)
  const [topHeaderVisible, setTopHeaderVisible] = useState(true)

  const lastY = useRef(0)
  const accum = useRef(0)
  const visibleRef = useRef(true)
  const scrolledRef = useRef(false)
  const lockedUntil = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    if (reducedMotion) {
      setScrolled(false)
      setTopHeaderVisible(true)
      visibleRef.current = true
      scrolledRef.current = false
      return
    }

    lastY.current = window.scrollY

    const applyVisible = (next: boolean, now: number) => {
      if (visibleRef.current === next) return
      visibleRef.current = next
      setTopHeaderVisible(next)
      lockedUntil.current = now + cooldownMs
      accum.current = 0
    }

    const applyScrolled = (next: boolean) => {
      if (scrolledRef.current === next) return
      scrolledRef.current = next
      setScrolled(next)
    }

    const update = () => {
      ticking.current = false
      const now = performance.now()
      const y = Math.max(0, window.scrollY)
      const delta = y - lastY.current
      lastY.current = y

      if (y >= scrolledAt) applyScrolled(true)
      else if (y <= unscrolledAt) applyScrolled(false)

      if (y <= topReveal) {
        accum.current = 0
        applyVisible(true, now)
        return
      }

      if (now < lockedUntil.current) return
      if (delta === 0) return

      // Reverse direction resets the accumulator
      if ((delta > 0 && accum.current < 0) || (delta < 0 && accum.current > 0)) {
        accum.current = 0
      }
      accum.current += delta

      if (accum.current >= hideAfter) {
        applyVisible(false, now)
      } else if (accum.current <= -showAfter) {
        applyVisible(true, now)
      }
    }

    const onScroll = () => {
      if (ticking.current) return
      ticking.current = true
      window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [reducedMotion, topReveal, hideAfter, showAfter, cooldownMs, scrolledAt, unscrolledAt])

  return { scrolled, topHeaderVisible, reducedMotion }
}
