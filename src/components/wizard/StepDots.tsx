import { cn } from '../ui'

export function StepDots({
  step,
  total,
  labels,
  maxReachable,
  onStepSelect,
}: {
  step: number
  total: number
  labels?: string[]
  maxReachable?: number
  onStepSelect?: (step: number) => void
}) {
  const reachable = maxReachable ?? step
  return (
    <ol className="mb-1 flex flex-wrap gap-2">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        const locked = n > reachable
        const clickable = Boolean(onStepSelect) && !locked && !active
        return (
          <li key={n}>
            <button
              type="button"
              disabled={locked || !onStepSelect || active}
              onClick={() => {
                if (!clickable || !onStepSelect) return
                onStepSelect(n)
              }}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active && 'cursor-default border-primary bg-primary text-white',
                done && !active && 'cursor-pointer border-primary-200 bg-primary-50 text-primary hover:bg-primary-100',
                locked && 'cursor-not-allowed border-primary-100 bg-white text-ink-400',
                !active && !done && !locked && 'cursor-pointer border-primary-100 bg-white text-ink-500 hover:bg-primary-50',
              )}
            >
              <span className="tabular">{n}</span>
              {labels?.[i] ? <span>{labels[i]}</span> : null}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
