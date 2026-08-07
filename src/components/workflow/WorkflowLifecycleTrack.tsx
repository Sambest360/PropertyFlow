import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import type { Application } from '../../types/domain'
import {
  activeCategoryStages,
  activeWorkflowCategory,
  categoryProgress,
  resolveWorkflowStatus,
  stageVisualState,
  workflowCategoryLabel,
  workflowProgress,
  workflowStageLabel,
} from '../../lib/applicationWorkflow'
import { cn } from '../ui'

const ICON_STROKE = 1.6

export function WorkflowLifecycleTrack({ application }: { application: Application }) {
  const status = resolveWorkflowStatus(application)
  const category = activeWorkflowCategory(application)
  const stages = activeCategoryStages(application)
  const phaseProgress = categoryProgress(application)
  const overallProgress = workflowProgress(application.type, status)

  if (!stages.length) return null

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-primary-100 bg-gradient-to-br from-primary-50/80 via-white to-brand-50/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Current phase</p>
            <p className="mt-1 font-display text-xl font-semibold text-ink">
              {workflowCategoryLabel(category)}
            </p>
            <p className="mt-0.5 text-sm text-ink-500">{workflowStageLabel(application.type, status)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Phase progress</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular text-ink">{phaseProgress}%</p>
            <p className="text-[11px] text-ink-400">Overall {overallProgress}%</p>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-primary-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-brand transition-all duration-500 ease-out"
            style={{ width: `${phaseProgress}%` }}
            role="progressbar"
            aria-valuenow={phaseProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${workflowCategoryLabel(category)} progress`}
          />
        </div>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-primary-200 bg-white p-4 shadow-[0_10px_30px_-20px_rgba(15,39,68,0.25)] sm:p-5">
        <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br from-primary/20 to-brand/20 blur-2xl" aria-hidden />

        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-ink">
            {workflowCategoryLabel(category)}
          </h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary">
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={ICON_STROKE} aria-hidden />
            In progress
          </span>
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
    </div>
  )
}
