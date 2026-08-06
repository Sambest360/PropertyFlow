import { CheckCircle2 } from 'lucide-react'
import { Card, cn } from './ui'
import { WORKFLOW_BLURB } from '../lib/workflow'

/** Compact lifecycle explainer used on applications / onboarding surfaces */
export function WorkflowOverview({ items = WORKFLOW_BLURB }: { items?: { title: string; text: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((w) => (
        <Card key={w.title} className="p-3">
          <p className="text-xs font-semibold text-primary">{w.title}</p>
          <p className="mt-1 text-[11px] leading-snug text-ink-500">{w.text}</p>
        </Card>
      ))}
    </div>
  )
}

export function StageRail({
  stages,
  activeIndex,
  current,
  embedded,
}: {
  stages: string[]
  activeIndex?: number
  /** Prefer this over activeIndex when highlighting a named stage */
  current?: string
  /** Render without outer Card / title (for embedding in applicant detail) */
  embedded?: boolean
}) {
  const raw = current != null ? stages.indexOf(current) : -1
  const index =
    activeIndex ?? (raw >= 0 ? raw : undefined)

  const mobileSteps = (
    <ol className="space-y-2 md:hidden">
      {stages.map((s, i) => {
        const done = index != null && i < index
        const isCurrent = index === i
        return (
          <li
            key={s}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2.5',
              isCurrent ? 'border-primary bg-primary-50' : 'border-primary-100 bg-white',
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                done || isCurrent ? 'bg-primary text-white' : 'bg-primary-50 text-primary',
              )}
            >
              {done ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.6} aria-hidden /> : i + 1}
            </div>
            <span className={cn('text-sm', isCurrent ? 'font-semibold text-ink' : 'text-ink-600')}>
              {s}
            </span>
          </li>
        )
      })}
    </ol>
  )

  const body = (
    <div className="hidden min-w-0 items-center gap-1 md:flex">
      {stages.map((s, i) => {
        const done = index != null && i < index
        const isCurrent = index === i
        return (
          <div key={s} className="flex flex-1 items-center gap-1">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                done || isCurrent ? 'bg-primary text-white' : 'bg-primary-50 text-primary'
              }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden /> : i + 1}
            </div>
            <span
              className={`text-[10px] font-medium leading-tight ${
                isCurrent ? 'font-semibold text-ink' : 'text-ink-600'
              }`}
            >
              {s}
            </span>
            {i < stages.length - 1 && <div className="h-px flex-1 bg-primary-100" />}
          </div>
        )
      })}
    </div>
  )

  if (embedded) {
    return (
      <>
        {mobileSteps}
        <div className="hidden overflow-x-auto md:block">{body}</div>
      </>
    )
  }

  return (
    <Card className="overflow-x-auto p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-500">Lifecycle stages</p>
      {mobileSteps}
      {body}
    </Card>
  )
}
