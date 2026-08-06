import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePrefersReducedMotion } from '../../../hooks/useScrollMotion'
import { cn } from '../../ui'

const ICON_STROKE = 1.6

/** Full-viewport overlay for map, filters, etc. */
export function FullScreenSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-white lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-primary-100 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-ink-500 transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Close"
        >
          <X className="h-5 w-5" strokeWidth={ICON_STROKE} />
        </button>
      </header>
      <div className={cn('min-h-0 flex-1 overflow-hidden', !reducedMotion && 'animate-fade-in')}>
        {children}
      </div>
      {footer ? (
        <footer className="shrink-0 border-t border-primary-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {footer}
        </footer>
      ) : null}
    </div>,
    document.body,
  )
}
