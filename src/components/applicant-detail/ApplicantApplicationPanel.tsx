import {
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileSignature,
  KeyRound,
  ShieldCheck,
  Upload,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Application, ApplicationStage, PropertyAsset } from '../../types/domain'
import { Badge, Button, Card, Input, cn, statusTone } from '../ui'
import { APPLICATION_STAGES } from '../../lib/workflow'
import { buildApplicationActions } from '../../lib/api/actions'
import type { HateoasAction } from '../../lib/api/contracts'
import { ICON_STROKE } from './types'

function ApplicationLifecycleRail({
  stages,
  current,
}: {
  stages: ApplicationStage[]
  current: ApplicationStage
}) {
  const index = Math.max(0, stages.indexOf(current))

  return (
    <nav
      aria-label="Application lifecycle"
      className="overflow-x-auto rounded-2xl border border-primary-100 bg-primary-50/40 p-4 [scrollbar-width:thin]"
    >
      <ol className="flex min-w-[46rem] items-start">
        {stages.map((stage, i) => {
          const done = i < index
          const isCurrent = i === index
          const upcoming = i > index
          return (
            <li key={stage} className="relative flex min-w-0 flex-1 flex-col items-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 right-1/2 top-4 h-0.5 -translate-y-1/2',
                    i <= index ? 'bg-primary' : 'bg-primary-100',
                  )}
                />
              )}
              {i < stages.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-1/2 right-0 top-4 h-0.5 -translate-y-1/2',
                    i < index ? 'bg-primary' : 'bg-primary-100',
                  )}
                />
              )}

              <span
                className={cn(
                  'relative z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors duration-200',
                  done && 'bg-primary text-white',
                  isCurrent && 'bg-primary text-white ring-4 ring-primary-100',
                  upcoming && 'border-2 border-primary-200 bg-white text-ink-400',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                ) : (
                  <span className="tabular">{i + 1}</span>
                )}
              </span>
              <span
                className={cn(
                  'mt-2 max-w-[4.75rem] text-center text-[10px] font-medium leading-snug',
                  isCurrent && 'font-semibold text-primary',
                  done && 'text-ink-600',
                  upcoming && 'text-ink-400',
                )}
              >
                {stage}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

type ActionVisual = {
  Icon: LucideIcon
  className: string
  iconWrap: string
  showChevron: boolean
}

function resolveTone(action: HateoasAction): NonNullable<HateoasAction['tone']> {
  if (action.tone) return action.tone
  if (action.key === 'OPEN_CHECKOUT' || action.key === 'APPROVE_CREDIT' || action.key === 'COMPLETE_KEY_HANDOVER') {
    return 'primary'
  }
  if (action.key === 'DECLINE_INCOME' || action.key === 'REJECT_APPLICATION') return 'danger'
  return 'secondary'
}

function actionIcon(action: HateoasAction): LucideIcon {
  switch (action.key) {
    case 'COMPLETE_KEY_HANDOVER':
    case 'SCHEDULE_MOVE_IN':
      return KeyRound
    case 'MARK_LEASE_SIGNED':
      return FileSignature
    case 'START_CREDIT_CHECK':
      return ShieldCheck
    case 'UPLOAD_DOCS':
      return Upload
    case 'OPEN_CHECKOUT':
      return Wallet
    case 'DECLINE_INCOME':
    case 'REJECT_APPLICATION':
      return Ban
    case 'APPROVE_CREDIT':
      return CheckCircle2
    default:
      return CircleDollarSign
  }
}

function actionVisual(action: HateoasAction): ActionVisual {
  const tone = resolveTone(action)
  const Icon = actionIcon(action)
  if (tone === 'primary') {
    return {
      Icon,
      className:
        'border-primary bg-primary text-white hover:bg-primary-600 focus-visible:ring-primary shadow-sm shadow-primary/20',
      iconWrap: 'bg-white/20 text-white',
      showChevron: true,
    }
  }
  if (tone === 'danger') {
    return {
      Icon,
      className:
        'border-accent-200 bg-accent-50/80 text-accent-800 hover:bg-accent-100 focus-visible:ring-accent',
      iconWrap: 'bg-accent text-white',
      showChevron: false,
    }
  }
  return {
    Icon,
    className:
      'border-primary-100 bg-white text-ink hover:border-primary-200 hover:bg-primary-50/70 focus-visible:ring-primary',
    iconWrap: 'bg-primary-100 text-primary',
    showChevron: true,
  }
}

function actionHint(action: HateoasAction): string {
  switch (action.key) {
    case 'UPLOAD_DOCS':
      return 'Attach ID, proof of income, and supporting files'
    case 'START_CREDIT_CHECK':
      return 'Run screening before approve or decline'
    case 'APPROVE_CREDIT':
      return 'Advance to deposit / payment request'
    case 'DECLINE_INCOME':
      return 'Notify the applicant and close this path'
    case 'MARK_LEASE_SIGNED':
      return 'Record the signed lease on file'
    case 'SCHEDULE_MOVE_IN':
      return 'Set move-in date and key collection'
    case 'COMPLETE_KEY_HANDOVER':
      return 'Confirm keys collected — start tenancy'
    case 'OPEN_CHECKOUT':
      return 'Collect deposit to unlock the lease step'
    case 'REJECT_APPLICATION':
      return action.confirm ?? 'End this application'
    default:
      return 'Continue this application workflow'
  }
}

const TONE_SORT: Record<NonNullable<HateoasAction['tone']>, number> = {
  primary: 0,
  secondary: 1,
  ghost: 2,
  danger: 3,
}

function sortWorkflowActions(actions: HateoasAction[]): HateoasAction[] {
  return [...actions].sort(
    (a, b) => TONE_SORT[resolveTone(a)] - TONE_SORT[resolveTone(b)] || a.label.localeCompare(b.label),
  )
}

/** Workflow + lifecycle only — personal details live on the Details tab. */
export function ApplicantApplicationPanel({
  application,
  property,
  agentName,
  actor,
  canReview,
  moveInOpen,
  moveInDate,
  keyLoc,
  onMoveInDate,
  onKeyLoc,
  onRunAction,
  onConfirmMoveIn,
  onOpenMoveIn,
}: {
  application: Application
  property: PropertyAsset | null
  agentName: string | null
  actor: {
    userId: string
    role: string
    agencyId: string | null
    permissions: string[]
  }
  canReview: boolean
  moveInOpen: boolean
  moveInDate: string
  keyLoc: string
  onMoveInDate: (v: string) => void
  onKeyLoc: (v: string) => void
  onRunAction: (action: HateoasAction) => void
  onConfirmMoveIn: () => void
  onOpenMoveIn: () => void
}) {
  const actions = sortWorkflowActions(
    buildApplicationActions({
      applicationId: application.id,
      stage: application.stage,
      creditCheck: application.creditCheck,
      creditConsent: application.creditConsent,
      actor: actor as Parameters<typeof buildApplicationActions>[0]['actor'],
    }),
  )

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary-100 p-0">
        <div className="border-b border-primary-100 bg-primary-50/50 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">Lifecycle</h2>
          <p className="mt-1 text-sm text-ink-500">
            Where this application sits in the screening-to-move-in path
            {property ? ` for ${property.title}` : ''}.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Meta label="Stage" value={application.stage} />
            <Meta label="Agent" value={agentName ?? 'Unassigned'} />
            <Meta label="Progress" value={`${application.progress}%`} tabular />
          </dl>

          <ApplicationLifecycleRail
            stages={[...APPLICATION_STAGES]}
            current={application.stage}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(application.stage)}>{application.stage}</Badge>
            <span className="text-xs text-ink-500">{application.type}</span>
          </div>

          {application.keyCollection && (
            <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-3 text-sm">
              <p className="font-semibold text-ink">
                <KeyRound className="mr-1 inline h-4 w-4 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
                Key collection
              </p>
              <p className="mt-1 text-ink-600">{application.keyCollection.location}</p>
              <p className="text-ink-500">{application.keyCollection.instructions}</p>
            </div>
          )}
        </div>
      </Card>

      {canReview && (
        <Card className="overflow-hidden border-primary-100 p-0">
          <div className="border-b border-primary-100 bg-primary-50/50 px-5 py-4">
            <h2 className="font-display text-lg font-semibold text-ink">Workflow actions</h2>
            <p className="mt-1 text-sm text-ink-500">Advance or resolve this application.</p>
          </div>

          <div className="space-y-2 p-4 sm:p-5">
            {actions.map((action) => {
              const visual = actionVisual(action)
              const Icon = visual.Icon
              const hint = actionHint(action)
              return (
                <button
                  key={action.key}
                  type="button"
                  className={cn(
                    'flex w-full min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                    visual.className,
                  )}
                  onClick={() => {
                    if (action.key === 'SCHEDULE_MOVE_IN') {
                      onOpenMoveIn()
                      return
                    }
                    if (action.confirm && !window.confirm(action.confirm)) return
                    onRunAction(action)
                  }}
                >
                  <span
                    className={cn(
                      'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      visual.iconWrap,
                    )}
                    aria-hidden
                  >
                    <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{action.label}</span>
                    <span
                      className={cn(
                        'mt-0.5 block text-xs font-medium',
                        resolveTone(action) === 'primary' ? 'text-white/80' : 'text-ink-500',
                        resolveTone(action) === 'danger' && 'text-accent-700/80',
                      )}
                    >
                      {hint}
                    </span>
                  </span>
                  {visual.showChevron ? (
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 shrink-0',
                        resolveTone(action) === 'primary' ? 'text-white/80' : 'text-ink-400',
                      )}
                      strokeWidth={ICON_STROKE}
                      aria-hidden
                    />
                  ) : null}
                </button>
              )
            })}
            {!actions.length && (
              <p className="text-sm text-ink-500">No actions available at this stage.</p>
            )}
          </div>

          {moveInOpen && (
            <div className="mx-5 mb-5 space-y-2 rounded-2xl border border-primary-100 bg-primary-50/60 p-3">
              <Input
                type="date"
                className="min-h-11"
                value={moveInDate}
                onChange={(e) => onMoveInDate(e.target.value)}
              />
              <Input
                className="min-h-11"
                value={keyLoc}
                onChange={(e) => onKeyLoc(e.target.value)}
                placeholder="Key collection location"
              />
              <Button className="min-h-11 w-full" onClick={onConfirmMoveIn}>
                Confirm move-in
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function Meta({
  label,
  value,
  tabular,
}: {
  label: string
  value: string
  tabular?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-ink-400">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-semibold text-ink', tabular && 'tabular')}>{value}</dd>
    </div>
  )
}
