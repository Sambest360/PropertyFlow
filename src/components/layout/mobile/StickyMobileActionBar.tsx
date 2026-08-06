import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../ui'

/** Fixed bottom action row — sits above workspace bottom nav when both are present. */
export function StickyMobileActionBar({
  children,
  className,
  aboveBottomNav = false,
}: {
  children: ReactNode
  className?: string
  /** Add extra offset when workspace bottom tabs are visible */
  aboveBottomNav?: boolean
}) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className={cn(
        'fixed inset-x-0 z-40 border-t border-primary-100 bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden',
        'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        aboveBottomNav && 'bottom-[calc(3.75rem+env(safe-area-inset-bottom))]',
        !aboveBottomNav && 'bottom-0',
        className,
      )}
    >
      <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row sm:justify-end">{children}</div>
    </div>,
    document.body,
  )
}
