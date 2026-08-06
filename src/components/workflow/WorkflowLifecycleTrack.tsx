import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import type { Application } from '../../types/domain'
import {
  getStageDef,
  resolveWorkflowStatus,
  stageVisualState,
  workflowCategoryLabel,
  workflowProgress,
  workflowStagesByCategory,
  type WorkflowCategory,
} from '../../lib/applicationWorkflow'
import { cn } from '../ui'

const ICON_STROKE = 1.6

function phaseTone(category: WorkflowCategory, active: boolean, done: boolean): string {
  if (active) {
    if (category === 'closure') return 'from-accent to-accent-600'
    if (category === 'tenancy' || category === 'occupancy') return 'from-primary to-brand'
    return 'from-emerald-500 to-primary'
  }
  if (done) return 'from-primary/80 to-primary'
  return 'from-primary-100 to-primary-100'
}

export function WorkflowLifecycleTrack({ application }: { application: Application }) {
  const status = resolveWorkflowStatus(application)
  const grouped = workflowStagesByCategory(application.type)
  const progress = workflowProgress(application.type, status)
  const categories = (Object.keys(grouped) as WorkflowCategory[]).filter((cat) => {
    const stages = grouped[cat]
    if (!stages.length) return false
    const hasCurrent = stages.some((s) => s.key === status)
    const hasCompleted = stages.some(
      (s) => stageVisualState(application.type, status, s.key) === 'completed',
    )
    if (hasCurrent || hasCompleted) return true
    if (cat === 'closure') return true
    const minOrder = stages[0]?.order ?? 0
    const currentOrder = getStageDef(application.type, status)?.order ?? 0
    return minOrder <= currentOrder + 8
  })

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50/80 via-white to-brand-50/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Lifecycle progress</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular text-ink">{progress}%</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            Enquiry
            <span className="text-ink-300">→</span>
            <span className="inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden />
            Application
            <span className="text-ink-300">→</span>
            <span className="inline-flex h-2 w-2 rounded-full bg-brand" aria-hidden />
            Tenancy
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-primary-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-primary to-brand transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((category, catIndex) => {
          const stages = grouped[category].filter((stageDef) => {
            const visual = stageVisualState(application.type, status, stageDef.key)
            return visual !== 'skipped' || stageDef.terminal
          })
          if (!stages.length) return null

          const hasCurrent = stages.some((s) => s.key === status)
          const allCompleted = stages.every(
            (s) =>
              stageVisualState(application.type, status, s.key) === 'completed' ||
              (s.terminal && s.key !== status),
          )
          const phaseDone = !hasCurrent && allCompleted

          return (
            <section
              key={category}
              className={cn(
                'relative overflow-hidden rounded-2xl border p-4 sm:p-5',
                hasCurrent
                  ? 'border-primary-200 bg-white shadow-[0_10px_30px_-20px_rgba(15,39,68,0.25)]'
                  : 'border-primary-100 bg-white/90',
              )}
            >
              {hasCurrent ? (
                <div
                  className={cn(
                    'pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br opacity-20 blur-2xl',
                    phaseTone(category, true, phaseDone),
                  )}
                  aria-hidden
                />
              ) : null}

              <div className="relative flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex h-7 min-w-7 items-center justify-center rounded-full text-[11px] font-bold tabular text-white',
                      hasCurrent
                        ? 'bg-primary'
                        : phaseDone
                          ? 'bg-primary/80'
                          : 'bg-primary-100 text-ink-400',
                    )}
                  >
                    {catIndex + 1}
                  </span>
                  <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-ink">
                    {workflowCategoryLabel(category)}
                  </h3>
                </div>
                {hasCurrent ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={ICON_STROKE} aria-hidden />
                    In progress
                  </span>
                ) : phaseDone ? (
                  <span className="text-[11px] font-semibold text-primary">Complete</span>
                ) : null}
              </div>

              <ol className="relative mt-4 flex gap-0 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {stages.map((stageDef, index) => {
                  const visual = stageVisualState(application.type, status, stageDef.key)
                  const isCurrent = visual === 'current'
                  const isDone = visual === 'completed'
                  const isTerminal = visual === 'terminal' || (stageDef.terminal && stageDef.key === status)

                  return (
                    <li key={stageDef.key} className="flex min-w-[9.5rem] flex-1 flex-col items-stretch">
                      <div className="flex items-center">
                        {index > 0 ? (
                          <div
                            className={cn(
                              'h-0.5 min-w-3 flex-1 rounded-full',
                              isDone || isCurrent ? 'bg-primary' : 'bg-primary-100',
                            )}
                            aria-hidden
                          />
                        ) : (
                          <span className="min-w-0 flex-1" aria-hidden />
                        )}
                        <span
                          className={cn(
                            'relative z-[1] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200',
                            isDone && 'border-primary bg-primary text-white',
                            isCurrent && 'border-primary bg-white text-primary ring-4 ring-primary/15',
                            isTerminal && 'border-accent bg-accent text-white',
                            !isDone && !isCurrent && !isTerminal && 'border-primary-200 bg-white text-ink-300',
                          )}
                        >
                          {isDone ? (
                            <CheckCircle2 className="h-4 w-4" strokeWidth={ICON_STROKE} />
                          ) : isCurrent ? (
                            <Circle className="h-3 w-3 fill-primary text-primary" strokeWidth={ICON_STROKE} />
                          ) : (
                            <Circle className="h-3 w-3" strokeWidth={ICON_STROKE} />
                          )}
                        </span>
                        {index < stages.length - 1 ? (
                          <div
                            className={cn(
                              'h-0.5 min-w-3 flex-1 rounded-full',
                              isDone ? 'bg-primary' : 'bg-primary-100',
                            )}
                            aria-hidden
                          />
                        ) : (
                          <span className="min-w-0 flex-1" aria-hidden />
                        )}
                      </div>
                      <p
                        className={cn(
                          'mt-2 px-1 text-center text-xs leading-snug',
                          isCurrent && 'font-semibold text-primary',
                          isDone && 'font-medium text-ink-700',
                          isTerminal && 'font-semibold text-accent-800',
                          !isCurrent && !isDone && !isTerminal && 'text-ink-400',
                        )}
                      >
                        {stageDef.label}
                      </p>
                    </li>
                  )
                })}
              </ol>
            </section>
          )
        })}
      </div>
    </div>
  )
}
