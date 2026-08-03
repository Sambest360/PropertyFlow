import type { ReactNode } from 'react'
import { cn } from '../ui'

export function WizardSectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-4', className)}>
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
