import { CheckCircle2 } from 'lucide-react'
import { Card } from './ui'
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

  const body = (
    <div className="flex min-w-[720px] items-center gap-1">
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
    return <div className="overflow-x-auto">{body}</div>
  }

  return (
    <Card className="overflow-x-auto p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-500">Lifecycle stages</p>
      {body}
    </Card>
  )
}
