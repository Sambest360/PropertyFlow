import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, Sparkles, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePageTour } from '../../hooks/usePageTour'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'
import { findTipTarget } from '../../lib/pageTips'
import { cn } from '../ui'

type Rect = { top: number; left: number; width: number; height: number }
type Placement = 'above' | 'below' | 'center'

const PAD = 8
const CARD_W = 360
const CARD_H_ESTIMATE = 230
const OVERLAY = 'rgba(15, 39, 68, 0.6)'
/** How long to wait for a step's element to appear before skipping that step. */
const TARGET_WAIT_MS = 2500

function bottomNavInset() {
  if (typeof window === 'undefined') return 0
  return window.innerWidth < 1024 && window.location.pathname.startsWith('/workspace') ? 64 : 0
}

function rectOf(el: Element | null): Rect | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return null
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/** Below when there is room, otherwise above, otherwise centred. */
function choosePlacement(rect: Rect | null, preferred: Placement | undefined): Placement {
  if (!rect || preferred === 'center') return 'center'
  const spaceBelow = window.innerHeight - bottomNavInset() - (rect.top + rect.height)
  const spaceAbove = rect.top
  const need = CARD_H_ESTIMATE + PAD + 20
  const want = preferred ?? 'below'
  if (want === 'below' && spaceBelow >= need) return 'below'
  if (want === 'above' && spaceAbove >= need) return 'above'
  if (spaceBelow >= need) return 'below'
  if (spaceAbove >= need) return 'above'
  return 'center'
}

function cardStyle(rect: Rect | null, placement: Placement): CSSProperties {
  const width = Math.min(CARD_W, window.innerWidth - 32)
  if (!rect || placement === 'center') {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width }
  }
  const centerX = rect.left + rect.width / 2
  const left = Math.min(Math.max(16, centerX - width / 2), window.innerWidth - width - 16)
  if (placement === 'below') return { top: rect.top + rect.height + PAD + 14, left, width }
  return { top: rect.top - PAD - 14, left, width, transform: 'translateY(-100%)' }
}

function arrowLeft(rect: Rect, cardLeft: number): number {
  const centerX = rect.left + rect.width / 2
  return Math.min(Math.max(centerX - cardLeft - 7, 18), Math.min(CARD_W, window.innerWidth - 32) - 32)
}

export function PageTipWalkthrough() {
  const { user } = useAuth()
  const { step, stepIndex, totalSteps, isFirst, isLast, next, back, skipAll, disableAllTips } = usePageTour()
  const reducedMotion = usePrefersReducedMotion()
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [waiting, setWaiting] = useState(false)
  const nextRef = useRef(next)
  nextRef.current = next

  // Find the element (waiting for it to render), scroll it into view and keep
  // the highlight glued to it while the page scrolls or resizes.
  useLayoutEffect(() => {
    setTargetRect(null)
    if (!step?.target) {
      setWaiting(false)
      return
    }
    let el: Element | null = null
    let cancelled = false
    const started = Date.now()
    setWaiting(true)

    const measure = () => {
      if (!cancelled) setTargetRect(rectOf(el))
    }
    const locate = () => {
      if (cancelled) return
      el = findTipTarget(step.target)
      if (el && rectOf(el)) {
        setWaiting(false)
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
        measure()
        window.setTimeout(measure, 350)
        return
      }
      if (Date.now() - started > TARGET_WAIT_MS) {
        // The element is not on this screen (hidden by role or layout): skip the step.
        setWaiting(false)
        nextRef.current()
        return
      }
      window.setTimeout(locate, 120)
    }
    locate()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelled = true
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, stepIndex, reducedMotion])

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') skipAll()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      else if (e.key === 'ArrowLeft' && !isFirst) back()
    },
    [skipAll, next, back, isFirst],
  )

  useEffect(() => {
    if (!step) return
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onKey])

  if (!step || typeof document === 'undefined') return null
  if (waiting && !targetRect) return null

  const showSpotlight = Boolean(step.target && targetRect)
  const placement = choosePlacement(showSpotlight ? targetRect : null, step.placement)
  const style = cardStyle(showSpotlight ? targetRect : null, placement)
  const displayTitle = step.title

  return createPortal(
    <div className="fixed inset-0 z-[300]" role="dialog" aria-modal="true" aria-labelledby="pf-tour-title" aria-describedby="pf-tour-body">
      {showSpotlight && targetRect ? (
        <div
          className="pointer-events-none absolute rounded-xl transition-all duration-300 ease-out"
          style={{
            top: targetRect.top - PAD,
            left: targetRect.left - PAD,
            width: targetRect.width + PAD * 2,
            height: targetRect.height + PAD * 2,
            boxShadow: `0 0 0 9999px ${OVERLAY}`,
          }}
          aria-hidden
        >
          <div className="pf-tip-ring absolute inset-0 rounded-xl border-[3px] border-primary" />
        </div>
      ) : (
        <div className={cn('absolute inset-0 bg-ink/55 backdrop-blur-[2px]', !reducedMotion && 'animate-fade-in')} aria-hidden />
      )}

      <div
        className={cn(
          'absolute z-[301] rounded-2xl border border-primary-100 bg-white px-5 py-4 shadow-[0_20px_60px_-10px_rgba(15,39,68,0.45)] transition-all duration-300 ease-out',
          !reducedMotion && 'animate-fade-in',
        )}
        style={style}
      >
        {showSpotlight && targetRect && placement !== 'center' ? (
          <span
            className={cn('absolute h-3.5 w-3.5 rotate-45 border-primary-100 bg-white', placement === 'below' ? '-top-[7px] border-l border-t' : '-bottom-[7px] border-b border-r')}
            style={{ left: arrowLeft(targetRect, Number(style.left ?? 0)) }}
            aria-hidden
          />
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {step.isNew ? (
              <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                <Sparkles className="h-3 w-3" aria-hidden /> New
              </span>
            ) : null}
            <h2 id="pf-tour-title" className="text-base font-bold leading-snug text-ink">
              {displayTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={skipAll}
            aria-label="Close tips for this page"
            className="-mr-1 rounded-full p-1 text-ink-400 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {isFirst && !step.target && user?.name ? (
          <p className="mt-1 text-sm font-medium text-ink-500">Hi {user.name.split(/\s+/)[0]} 👋</p>
        ) : null}
        <p id="pf-tour-body" className="mt-2 text-sm leading-relaxed text-ink-600">
          {step.body}
        </p>
        {step.bullets?.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-600">
            {step.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: totalSteps }, (_, i) => (
            <span key={i} className={cn('h-1.5 rounded-full transition-all', i === stepIndex ? 'w-5 bg-primary' : 'w-1.5 bg-primary-200')} />
          ))}
          <span className="ml-auto text-xs font-medium tabular-nums text-ink-400">
            {stepIndex + 1} of {totalSteps}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          {isFirst ? (
            <button type="button" onClick={skipAll} className="cursor-pointer text-sm font-semibold text-primary hover:underline">
              Skip
            </button>
          ) : (
            <button type="button" onClick={back} className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-primary hover:underline">
              <ChevronLeft className="h-4 w-4" aria-hidden /> Back
            </button>
          )}
          <button
            type="button"
            onClick={next}
            autoFocus
            className="cursor-pointer rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {isLast ? 'Done' : isFirst ? 'Show me' : 'Next'}
          </button>
        </div>
        {user?.id && user.id !== 'guest' ? (
          <button
            type="button"
            onClick={disableAllTips}
            className="mt-3 cursor-pointer text-xs font-medium text-ink-400 underline-offset-2 hover:text-ink-600 hover:underline"
          >
            Turn off tips everywhere (switch back on from Help)
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
