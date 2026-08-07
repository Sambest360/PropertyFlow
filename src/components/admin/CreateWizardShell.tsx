import type { ReactNode } from 'react'
import { ActionButtonRow } from '../ActionButtonRow'
import { cn } from '../ui'
import { StepDots } from '../wizard/StepDots'
import { StickyMobileActionBar } from '../layout/mobile/StickyMobileActionBar'

export type WizardStepMeta = {
  id: string
  label: string
  /** Short guidance shown in the side rail for this step. */
  tip: string
}

/**
 * Full-width create layout: sticky side stepper + instructions on desktop,
 * horizontal StepDots on mobile.
 *
 * Steps are clickable up to `maxReachableIndex` (inclusive). Future steps stay
 * locked until the user completes the current step via Continue.
 */
export function CreateWizardShell({
  title,
  subtitle,
  steps,
  stepIndex,
  maxReachableIndex,
  onStepSelect,
  tip,
  children,
  footer,
  aside,
  preview,
}: {
  title: string
  subtitle?: string
  steps: WizardStepMeta[]
  /** 0-based index into `steps`. */
  stepIndex: number
  /** Highest step index the user may jump to (usually furthest completed). Defaults to stepIndex. */
  maxReachableIndex?: number
  /** Called when a reachable step is clicked. */
  onStepSelect?: (index: number) => void
  /** Override tip; defaults to steps[stepIndex].tip */
  tip?: string
  children: ReactNode
  footer: ReactNode
  /** Optional extra content under the tip (e.g. live role blurb). */
  aside?: ReactNode
  /** Sticky live preview panel (desktop xl+). */
  preview?: ReactNode
}) {
  const activeTip = tip ?? steps[stepIndex]?.tip ?? ''
  const labels = steps.map((s) => s.label)
  const reachable = maxReachableIndex ?? stepIndex

  function handleSelect(i: number) {
    if (!onStepSelect) return
    if (i > reachable) return
    if (i === stepIndex) return
    onStepSelect(i)
  }

  return (
    <div
      className={cn(
        'grid gap-6',
        preview
          ? 'lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)_minmax(16rem,20rem)] lg:gap-8'
          : 'lg:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)] lg:gap-8',
      )}
    >
      {/* Side rail — desktop */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
          </div>

          <ol
            className="space-y-0.5 border-l border-primary-100"
            aria-label="Progress"
            data-tip-target="wizard-steps"
          >
            {steps.map((s, i) => {
              const active = i === stepIndex
              const done = i < stepIndex
              const locked = i > reachable
              const clickable = Boolean(onStepSelect) && !locked && !active
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={locked || !onStepSelect}
                    onClick={() => handleSelect(i)}
                    aria-current={active ? 'step' : undefined}
                    aria-disabled={locked || undefined}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 border-l-2 py-2 pl-3 -ml-px text-left text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                      active && 'border-l-primary bg-primary-50/60 font-semibold text-primary',
                      done && !active && 'border-l-primary/40 text-ink-600',
                      locked && 'border-l-transparent text-ink-400',
                      !locked && !active && !done && 'border-l-transparent text-ink-500',
                      clickable && 'cursor-pointer hover:bg-primary-50/40 hover:text-ink',
                      locked && 'cursor-not-allowed',
                      !onStepSelect && 'cursor-default',
                    )}
                  >
                    <span className="w-4 shrink-0 tabular text-xs font-semibold">{i + 1}</span>
                    <span>{s.label}</span>
                  </button>
                </li>
              )
            })}
          </ol>

          <div
            className="rounded-lg border border-primary-100 bg-primary-50/50 p-4"
            data-tip-target="wizard-step-tip"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              This step
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{activeTip}</p>
            {aside}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 space-y-4 pb-24 lg:pb-0">
        {/* Mobile title + dots */}
        <div className="lg:hidden">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
          <div className="mt-4" data-tip-target="wizard-steps">
            <StepDots
              step={stepIndex + 1}
              total={steps.length}
              labels={labels}
              maxReachable={reachable + 1}
              onStepSelect={onStepSelect ? (n) => handleSelect(n - 1) : undefined}
            />
          </div>
          <p
            className="mt-3 rounded-lg border border-primary-100 bg-primary-50/50 px-3 py-2 text-sm text-ink-600"
            data-tip-target="wizard-step-tip"
          >
            {activeTip}
          </p>
        </div>

        <div
          className="rounded-xl border border-primary-100/80 bg-white p-5 sm:p-6"
          data-tip-target="wizard-form"
        >
          {children}
          <ActionButtonRow className="mt-6 hidden border-t border-primary-100 pt-4 lg:flex">
            {footer}
          </ActionButtonRow>
        </div>

        {preview ? (
          <div className="lg:hidden" data-tip-target="wizard-preview-mobile">
            {preview}
          </div>
        ) : null}
      </div>

      <StickyMobileActionBar aboveBottomNav className="lg:hidden">
        {footer}
      </StickyMobileActionBar>

      {preview ? (
        <aside className="hidden lg:block" data-tip-target="wizard-preview">
          <div className="sticky top-20">{preview}</div>
        </aside>
      ) : null}
    </div>
  )
}

export const WIZARD_ICON_STROKE = 1.6
