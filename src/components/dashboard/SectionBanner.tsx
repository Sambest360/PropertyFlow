import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '../ui'

export function SectionBanner({
  text,
  tone = 'warning',
  trailing,
  className,
}: {
  text: string
  tone?: 'warning' | 'danger' | 'info'
  trailing?: ReactNode
  className?: string
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm',
        tone === 'danger' && 'border-accent-100 bg-accent-50 text-accent-800',
        tone === 'warning' && 'border-primary-100 bg-primary-50 text-ink',
        tone === 'info' && 'border-primary-100 bg-primary-50 text-primary-800',
        className,
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.6} aria-hidden />
      <p className="min-w-0 flex-1 font-medium">{text}</p>
      {trailing}
    </div>
  )
}
