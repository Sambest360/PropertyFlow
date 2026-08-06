import type { ReactNode } from 'react'
import { CalendarDays } from 'lucide-react'
import { cn } from '../ui'

/** Two-column ops layout: list on the left, detail/calendar on the right. */
export function DashboardSplit({
  left,
  right,
  className,
}: {
  left: ReactNode
  right: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]',
        className,
      )}
    >
      <section className="flex min-h-0 min-w-0 flex-col">{left}</section>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto xl:min-h-[36rem] xl:max-h-[calc(100dvh-10rem)]">
        {right}
      </section>
    </div>
  )
}

export function DashboardPage({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('animate-fade-in space-y-5', className)}>{children}</div>
}

export function CalendarToggle({
  open,
  onOpen,
  children,
}: {
  open: boolean
  onOpen: () => void
  children: ReactNode
}) {
  if (open) {
    return <div className="shrink-0">{children}</div>
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[1.25rem] border border-dashed border-primary-200 bg-primary-50/40 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <CalendarDays className="h-4 w-4" strokeWidth={1.6} aria-hidden />
      Show calendar
    </button>
  )
}
