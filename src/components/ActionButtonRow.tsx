import clsx from 'clsx'
import type { ReactNode } from 'react'

/** Right-aligned action button group. Children in order: Primary → Secondary → Destructive → Back. */
export function ActionButtonRow({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('flex w-full flex-wrap items-center justify-end gap-2', className)}>
      {children}
    </div>
  )
}
