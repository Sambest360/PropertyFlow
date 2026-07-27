import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { cn } from '../ui'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'

export function MobileDrawer({
  open,
  onClose,
  title,
  side = 'left',
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  side?: 'left' | 'right'
  children: ReactNode
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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-ink/40 transition-opacity duration-200"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        className={cn(
          'absolute inset-y-0 flex w-[min(100%,20rem)] flex-col overflow-y-auto bg-white p-4 shadow-2xl shadow-ink/20',
          side === 'right' ? 'right-0' : 'left-0',
          !reducedMotion && 'animate-slide-up',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-base font-semibold text-ink">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full text-ink-500 transition-colors duration-200 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
