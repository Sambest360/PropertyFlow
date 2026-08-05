import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CircleHelp } from 'lucide-react'
import { cn } from '../ui'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'

const ICON_STROKE = 1.6
const CARD_W = 280

type FieldHelpProps = {
  title: string
  body: string
  learnMoreHref?: string
  learnMoreLabel?: string
  className?: string
}

export function FieldHelp({
  title,
  body,
  learnMoreHref,
  learnMoreLabel = 'Learn more',
  className,
}: FieldHelpProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const titleId = useId()
  const reducedMotion = usePrefersReducedMotion()

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null)
      return
    }

    const update = () => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!r) return
      const left = Math.min(
        Math.max(12, r.left + r.width / 2 - CARD_W / 2),
        window.innerWidth - CARD_W - 12,
      )
      setPos({ top: r.top - 12, left })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex min-h-6 min-w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-400 transition-colors duration-200 hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
          className,
        )}
      >
        <CircleHelp className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
      </button>

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close help"
              className="fixed inset-0 z-[250] cursor-default bg-transparent"
              onClick={() => setOpen(false)}
            />
            <div
              id={titleId}
              role="tooltip"
              className={cn(
                'fixed z-[251] w-[280px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-primary-100 bg-white px-4 py-3.5 shadow-[0_12px_40px_-8px_rgba(15,39,68,0.28)]',
                !reducedMotion && 'animate-fade-in',
              )}
              style={{
                top: pos.top,
                left: pos.left,
                transform: 'translateY(-100%)',
              }}
            >
              <span
                className="absolute -bottom-[6px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-primary-100 bg-white"
                aria-hidden
              />
              <p className="text-sm font-bold text-ink">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{body}</p>
              <div className="mt-4 flex items-center justify-between gap-2">
                {learnMoreHref ? (
                  <a
                    href={learnMoreHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {learnMoreLabel}
                  </a>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  Got it
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}

export function FormLabel({
  children,
  help,
  className,
}: {
  children: ReactNode
  help?: { title: string; body: string; learnMoreHref?: string }
  className?: string
}) {
  return (
    <div className={cn('mb-2 flex items-center gap-1.5', className)}>
      <p className="text-sm font-medium text-ink">{children}</p>
      {help ? <FieldHelp title={help.title} body={help.body} learnMoreHref={help.learnMoreHref} /> : null}
    </div>
  )
}
