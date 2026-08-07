import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ActionButtonRow } from '../../ActionButtonRow'
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
      <ActionButtonRow className="mx-auto max-w-lg">{children}</ActionButtonRow>
    </div>,
    document.body,
  )
}
