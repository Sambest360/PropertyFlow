import {
  Ban,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileSignature,
  GitBranch,
  KeyRound,
  ShieldCheck,
  Upload,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Application, PropertyAsset } from '../../types/domain'
import { Badge, Button, Card, Input, cn, statusTone } from '../ui'
import { buildApplicationActions } from '../../lib/api/actions'
import type { HateoasAction } from '../../lib/api/contracts'
import {
  getStageDef,
  resolveWorkflowStatus,
  stageVisualState,
  workflowBranchOutcomes,
  workflowCategoryLabel,
  workflowProgress,
  workflowStageLabel,
  workflowStagesByCategory,
  type WorkflowCategory,
} from '../../lib/applicationWorkflow'
import { ICON_STROKE } from './types'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'

function WorkflowLifecycleMap({
  application,
}: {
  application: Application
}) {
  const status = resolveWorkflowStatus(application)
  const grouped = workflowStagesByCategory(application.type)
  const categories = (Object.keys(grouped) as WorkflowCategory[]).filter(
    (cat) => grouped[cat].length > 0,
  )

  return (
    <div className="space-y-4">
      {categories.map((category) => {
        const stages = grouped[category]
        const hasCurrent = stages.some((s) => s.key === status)
        const hasCompleted = stages.some(
          (s) => stageVisualState(application.type, status, s.key) === 'completed',
        )
        if (!hasCurrent && !hasCompleted && category !== 'closure') {
          const minOrder = stages[0]?.order ?? 0
          const currentOrder = getStageDef(application.type, status)?.order ?? 0
          if (minOrder > currentOrder + 5) return null
        }

        return (
          <section
            key={category}
            className={cn(
              'rounded-2xl border p-3 sm:p-4',
              hasCurrent ? 'border-primary-200 bg-primary-50/50' : 'border-primary-100 bg-white',
            )}
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {workflowCategoryLabel(category)}
            </h3>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {stages.map((stageDef) => {
                const visual = stageVisualState(application.type, status, stageDef.key)
                if (visual === 'skipped' && !stageDef.terminal) return null
                const isCurrent = visual === 'current'
                const isDone = visual === 'completed'
                const isTerminal = stageDef.terminal && stageDef.key === status
                return (
                  <li
                    key={stageDef.key}
                    className={cn(
                      'flex min-h-11 items-start gap-2 rounded-xl px-2.5 py-2 text-sm',
                      isCurrent && 'bg-white ring-1 ring-primary-200',
                      isTerminal && 'bg-accent-50 ring-1 ring-accent-200',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                        isDone && 'bg-primary text-white',
                        isCurrent && 'bg-primary text-white ring-2 ring-primary-100',
                        isTerminal && 'bg-accent text-white',
                        !isDone && !isCurrent && !isTerminal && 'border border-primary-200 bg-white text-ink-400',
                      )}
                      aria-hidden
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} />
                      ) : (
                        '·'
                      )}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          'block font-medium leading-snug',
                          isCurrent && 'text-primary',
                          isTerminal && 'text-accent-800',
                          !isCurrent && !isTerminal && 'text-ink-600',
                        )}
                      >
                        {stageDef.label}
                      </span>
                      {stageDef.parallel ? (
                        <span className="mt-0.5 block text-[10px] text-ink-400">May run in parallel</span>
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}

function BranchOutcomesPanel({ application }: { application: Application }) {
  const status = resolveWorkflowStatus(application)
  const outcomes = workflowBranchOutcomes(application.type)
  const currentTerminal = getStageDef(application.type, status)?.terminal

  return (
    <Card className="border-primary-100 bg-white p-4">
      <div className="flex items-start gap-2">
        <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold text-ink">Alternate outcomes</h3>
          <p className="mt-1 text-xs text-ink-500">
            Applications can exit the happy path at several points — withdraw, reject, cancel, or renew.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {outcomes.map((o) => {
              const active = status === o.key
              return (
                <li
                  key={o.key}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-xs',
                    active ? 'border-accent-200 bg-accent-50 text-accent-900' : 'border-primary-100 text-ink-600',
                  )}
                >
                  <span className="font-semibold">{o.label}</span>
                  <span className="mt-0.5 block text-ink-500">{o.description}</span>
                </li>
              )
            })}
          </ul>
          {currentTerminal ? (
            <p className="mt-3 text-xs font-medium text-accent-800">
              This file is at a terminal stage: {workflowStageLabel(application.type, status)}.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
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
  if (
    action.key === 'OPEN_CHECKOUT' ||
    action.key === 'ISSUE_DEPOSIT_INVOICE' ||
    action.key === 'APPROVE_CREDIT' ||
    action.key === 'COMPLETE_KEY_HANDOVER' ||
    action.key === 'ACTIVATE_TENANCY'
  ) {
    return 'primary'
  }
  if (
    action.key === 'DECLINE_INCOME' ||
    action.key === 'REJECT_APPLICATION' ||
    action.key === 'DECLINE_CREDIT' ||
    action.key === 'LANDLORD_REJECTED' ||
    action.key === 'CANCEL_NO_DEPOSIT'
  ) {
    return 'danger'
  }
  return 'secondary'
}

function actionIcon(action: HateoasAction): LucideIcon {
  switch (action.key) {
    case 'COMPLETE_KEY_HANDOVER':
    case 'SCHEDULE_MOVE_IN':
    case 'HANDOVER_KEYS':
    case 'KEYS_READY':
      return KeyRound
    case 'MARK_LEASE_SIGNED':
    case 'GENERATE_LEASE':
    case 'SEND_LEASE':
    case 'TENANT_SIGNED':
    case 'LANDLORD_SIGNED':
    case 'SIGN_SALE_AGREEMENT':
      return FileSignature
    case 'START_CREDIT_CHECK':
    case 'START_FICA':
    case 'VERIFY_EMPLOYMENT':
    case 'VERIFY_INCOME':
      return ShieldCheck
    case 'UPLOAD_DOCS':
      return Upload
    case 'OPEN_CHECKOUT':
    case 'ISSUE_DEPOSIT_INVOICE':
    case 'CONFIRM_DEPOSIT':
      return Wallet
    case 'DECLINE_INCOME':
    case 'REJECT_APPLICATION':
    case 'DECLINE_CREDIT':
    case 'WITHDRAW':
      return Ban
    case 'APPROVE_CREDIT':
    case 'CONDITIONALLY_APPROVE':
    case 'ACTIVATE_TENANCY':
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
  const hints: Record<string, string> = {
    UPLOAD_DOCS: 'All required files received — advance to screening',
    START_FICA: 'Verify identity against FICA requirements',
    START_CREDIT_CHECK: 'Run bureau check with POPIA consent',
    VERIFY_DEPOSIT: 'Finance confirms cleared deposit funds',
    VERIFY_RENT: 'Finance clears first month rental payment',
    ISSUE_DEPOSIT_INVOICE: 'Create deposit invoice and reserve the unit',
    OPEN_CHECKOUT: 'Collect deposit via PayFast / Peach',
    SCHEDULE_MOVE_IN: 'Book ingoing condition inspection',
    COMPLETE_KEY_HANDOVER: 'Confirm keys collected — activate tenancy',
    REJECT_APPLICATION: 'Decline after manual review',
    WITHDRAW: 'Applicant cancelled the application',
  }
  return hints[action.key] ?? 'Continue this application workflow'
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

/** Workflow + lifecycle — personal details live on the Details tab. */
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
  const { label: agentLabel } = useAgentDisplay()
  const assignedAgent = agentLabel(application.agentId, agentName)
  const workflowStatus = resolveWorkflowStatus(application)
  const progress = workflowProgress(application.type, workflowStatus)
  const actions = sortWorkflowActions(
    buildApplicationActions({
      application,
      actor: actor as Parameters<typeof buildApplicationActions>[0]['actor'],
    }),
  )

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary-100 p-0">
        <div className="border-b border-primary-100 bg-primary-50/50 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">Lifecycle</h2>
          <p className="mt-1 text-sm text-ink-500">
            {application.type === 'Purchase'
              ? 'South African purchase workflow — offer through transfer and registration'
              : 'South African rental workflow — enquiry through tenancy and closure'}
            {property ? ` · ${property.title}` : ''}.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <dl className="grid gap-4 sm:grid-cols-4">
            <Meta label="Stage" value={workflowStageLabel(application.type, workflowStatus)} />
            <Meta label="Status code" value={workflowStatus} tabular />
            {assignedAgent ? <Meta label="Agent" value={assignedAgent} /> : null}
            <Meta label="Progress" value={`${progress}%`} tabular />
          </dl>

          <WorkflowLifecycleMap application={application} />

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

      <BranchOutcomesPanel application={application} />

      {canReview && (
        <Card className="overflow-hidden border-primary-100 p-0">
          <div className="border-b border-primary-100 bg-primary-50/50 px-5 py-4">
            <h2 className="font-display text-lg font-semibold text-ink">Workflow actions</h2>
            <p className="mt-1 text-sm text-ink-500">
              Valid next steps from{' '}
              <span className="font-medium text-ink">{workflowStageLabel(application.type, workflowStatus)}</span>.
            </p>
          </div>

          <div className="space-y-2 p-4 sm:p-5">
            {actions.map((action) => {
              const visual = actionVisual(action)
              const Icon = visual.Icon
              const hint = actionHint(action)
              return (
                <button
                  key={`${action.key}-${action.payload_hint?.workflowStatus ?? ''}`}
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
              <p className="text-sm text-ink-500">
                No actions available at this stage
                {getStageDef(application.type, workflowStatus)?.terminal ? ' (file closed).' : '.'}
              </p>
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
                Confirm move-in inspection
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
