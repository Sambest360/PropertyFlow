import { Lightbulb, X } from 'lucide-react'
import { Button, cn } from '../ui'
import { usePageTip } from '../../hooks/usePageTip'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'

const ICON_STROKE = 1.6

export function PageTipBanner({ className }: { className?: string }) {
  const { tip, dismiss } = usePageTip()
  const reducedMotion = usePrefersReducedMotion()

  if (!tip) return null

  return (
    <aside
      role="note"
      aria-label="Page tip"
      className={cn(
        'mb-5 overflow-hidden rounded-[1.25rem] border border-primary-100 bg-primary-50/80 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.12)]',
        !reducedMotion && 'animate-slide-up',
        className,
      )}
    >
      <div className="flex gap-3 border-l-4 border-primary p-4 sm:p-5">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm"
          aria-hidden
        >
          <Lightbulb className="h-5 w-5" strokeWidth={ICON_STROKE} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold tracking-tight text-ink">{tip.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-500">{tip.body}</p>
          <div className="mt-3">
            <Button type="button" size="sm" variant="secondary" onClick={dismiss}>
              Got it
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center self-start rounded-xl text-ink-400 transition-colors duration-200 hover:bg-white/80 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Dismiss tip"
        >
          <X className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
        </button>
      </div>
    </aside>
  )
}
