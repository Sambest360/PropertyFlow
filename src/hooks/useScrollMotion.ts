import { useEffect, useRef, useState, type RefObject } from 'react'

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/** 0–1 progress of how far `el` has scrolled through the viewport. */
export function useScrollProgress(ref: RefObject<HTMLElement | null>, reducedMotion: boolean) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (reducedMotion) {
      setProgress(0)
      return
    }

    let frame = 0
    const update = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const total = Math.max(rect.height, 1)
      const raw = Math.min(1, Math.max(0, -rect.top / total))
      setProgress(raw)
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [ref, reducedMotion])

  return progress
}

/** How far an element has travelled through the viewport (0 = entering, 1 = leaving). */
export function useElementTravel(reducedMotion: boolean) {
  const ref = useRef<HTMLElement | null>(null)
  const [travel, setTravel] = useState(0)

  useEffect(() => {
    if (reducedMotion) {
      setTravel(0.5)
      return
    }

    let frame = 0
    const update = () => {
      frame = 0
      const el = ref.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const view = window.innerHeight || 1
      const mid = rect.top + rect.height / 2
      const raw = 1 - mid / view
      setTravel(Math.min(1, Math.max(0, raw)))
    }

    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [reducedMotion])

  return { ref, travel }
}

export function useInView<T extends HTMLElement>(
  options?: IntersectionObserverInit & { once?: boolean },
) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)
  const once = options?.once ?? true

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.unobserve(el)
        } else if (!once) {
          setInView(false)
        }
      },
      {
        threshold: options?.threshold ?? 0.18,
        rootMargin: options?.rootMargin ?? '0px 0px -8% 0px',
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [once, options?.threshold, options?.rootMargin])

  return { ref, inView }
}

