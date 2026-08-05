import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { usePageTour } from '../../hooks/usePageTour'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'
import { cn } from '../ui'

type Rect = { top: number; left: number; width: number; height: number }

const PAD = 10
const CARD_W = 320
const OVERLAY = 'rgba(15, 39, 68, 0.58)'

function measureTarget(selector?: string): Rect | null {
  if (!selector || typeof document === 'undefined') return null
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function spotlightStyle(rect: Rect, compact: boolean): CSSProperties {
  const pad = compact ? PAD + 6 : PAD
  return {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: compact ? 9999 : 14,
    boxShadow: `0 0 0 9999px ${OVERLAY}`,
  }
}

function cardStyle(
  rect: Rect | null,
  placement: PageTourStep['placement'],
): CSSProperties {
  if (!rect || placement === 'center') {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: CARD_W,
      maxWidth: 'calc(100vw - 2rem)',
    }
  }

  const centerX = rect.left + rect.width / 2
  const clampedLeft = Math.min(
    Math.max(16, centerX - CARD_W / 2),
    window.innerWidth - CARD_W - 16,
  )

  if (placement === 'below') {
    return {
      top: rect.top + rect.height + PAD + 16,
      left: clampedLeft,
      width: CARD_W,
      maxWidth: 'calc(100vw - 2rem)',
    }
  }

  return {
    top: Math.max(16, rect.top - PAD - 16),
    left: clampedLeft,
    width: CARD_W,
    maxWidth: 'calc(100vw - 2rem)',
    transform: 'translateY(-100%)',
  }
}

function arrowStyle(
  rect: Rect | null,
  placement: PageTourStep['placement'],
): CSSProperties | null {
  if (!rect || placement === 'center') return null
  const centerX = rect.left + rect.width / 2
  const clampedLeft = Math.min(
    Math.max(16, centerX - CARD_W / 2),
    window.innerWidth - CARD_W - 16,
  )
  const arrowLeft = centerX - clampedLeft - 8

  if (placement === 'below') {
    return { left: Math.min(Math.max(arrowLeft, 20), CARD_W - 36), top: -7 }
  }
  return { left: Math.min(Math.max(arrowLeft, 20), CARD_W - 36), bottom: -7 }
}

type PageTourStep = import('../../lib/pageTips').PageTourStep

export function PageTipWalkthrough() {
  const { user } = useAuth()
  const { step, stepIndex, totalSteps, isFirst, isLast, next, skipAll } = usePageTour()
  const reducedMotion = usePrefersReducedMotion()
  const [targetRect, setTargetRect] = useState<Rect | null>(null)

  useLayoutEffect(() => {
    if (!step) {
      setTargetRect(null)
      return
    }

    const update = () => {
      const el = step.target ? document.querySelector(step.target) : null
      if (el) el.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
      setTargetRect(measureTarget(step.target))
    }
    update()

    const t = window.setTimeout(update, 120)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [step, stepIndex, reducedMotion])

  useEffect(() => {
    if (!step) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [step])

  if (!step || typeof document === 'undefined') return null

  const placement =
    step.placement ?? (step.target && targetRect ? 'below' : 'center')
  const showSpotlight = Boolean(step.target && targetRect)
  const compactSpotlight = Boolean(
    targetRect && (targetRect.width < 72 || targetRect.height < 72),
  )

  const displayTitle =
    isFirst && !step.target && user?.name
      ? `Hello ${user.name.split(/\s+/)[0]},`
      : step.title

  return createPortal(
    <div
      className="fixed inset-0 z-[300]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pf-tour-title"
      aria-describedby="pf-tour-body"
    >
      {!showSpotlight && (
        <div
          className={cn(
            'absolute inset-0 bg-ink/55 backdrop-blur-[3px]',
            !reducedMotion && 'animate-fade-in',
          )}
          aria-hidden
        />
      )}

      {showSpotlight && targetRect && (
        <div
          className="pointer-events-none absolute transition-all duration-300 ease-out"
          style={{
            ...spotlightStyle(targetRect, compactSpotlight),
            backgroundColor: compactSpotlight ? 'rgba(255,255,255,0.98)' : 'transparent',
          }}
          aria-hidden
        />
      )}

      <div
        className={cn(
          'absolute z-[301] rounded-2xl bg-white px-5 py-4 shadow-[0_16px_48px_-8px_rgba(15,39,68,0.32)] transition-all duration-300 ease-out',
          !reducedMotion && 'animate-fade-in',
        )}
        style={cardStyle(showSpotlight ? targetRect : null, placement)}
      >
        {showSpotlight && arrowStyle(targetRect, placement) && (
          <span
            className={cn(
              'absolute h-3.5 w-3.5 rotate-45 bg-white',
              placement === 'below' ? '-top-[7px]' : '-bottom-[7px]',
            )}
            style={arrowStyle(targetRect, placement)!}
            aria-hidden
          />
        )}

        <div className="flex items-start justify-between gap-3">
          <h2 id="pf-tour-title" className="text-[15px] font-bold leading-snug text-ink">
            {displayTitle}
          </h2>
          <span className="shrink-0 pt-0.5 text-xs font-medium tabular-nums text-ink-400">
            {stepIndex + 1}/{totalSteps}
          </span>
        </div>

        <p id="pf-tour-body" className="mt-2 text-sm leading-relaxed text-ink-600">
          {step.body}
        </p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={skipAll}
            className="cursor-pointer text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {isFirst ? 'Nevermind' : 'Skip all'}
          </button>
          <button
            type="button"
            onClick={next}
            className="cursor-pointer rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {isLast ? 'Done' : isFirst ? 'Start' : 'Next tip'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
