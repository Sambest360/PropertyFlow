import { useEffect, useMemo, useState } from 'react'
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
import type { Application, ApplicationDocument, PropertyAsset } from '../../types/domain'
import type { ApplicantTask } from '../../lib/applicantPortalActions'
import { buildApplicationActions } from '../../lib/api/actions'
import { buildApplicantApplicationActions } from '../../lib/applicantPortalActions'
import type { HateoasAction } from '../../lib/api/contracts'
import {
  getLifecycleMilestones,
  isTerminalWorkflowStatus,
  milestoneVisualState,
  resolveWorkflowStatus,
  workflowBranchOutcomes,
  workflowProgress,
  workflowStageLabel,
  type WorkflowStatusKey,
} from '../../lib/applicationWorkflow'
import { actionNeedsModal, type WorkflowActionCapture } from '../../lib/workflowActionForms'
import { useStore } from '../../context/AppStore'
import { LifecycleStagePanel } from './LifecycleStagePanel'
import { WorkflowActionModal } from './WorkflowActionModal'
import { Badge, Card, cn, statusTone } from '../ui'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { useSuiteAlert } from '../alerts/SuiteAlert'
import { ICON_STROKE } from '../applicant-detail/types'

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
    action.key.includes('DECLINE') ||
    action.key.includes('REJECT') ||
    action.key.includes('CANCEL') ||
    action.key === 'WITHDRAW'
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
    case 'WITHDRAW':
      return Ban
    case 'APPROVE_CREDIT':
    case 'CONDITIONALLY_APPROVE':
    case 'ACTIVATE_TENANCY':
    case 'SUBMIT_APPLICATION':
      return CheckCircle2
    default:
      return CircleDollarSign
  }
}

function ActionButton({
  action,
  onClick,
}: {
  action: HateoasAction
  onClick: () => void
}) {
  const tone = resolveTone(action)
  const Icon = actionIcon(action)
  const needsCapture = actionNeedsModal(action.key)

  return (
    <button
      type="button"
      className={cn(
        'flex w-full min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        tone === 'primary' &&
          'border-primary bg-primary text-white hover:bg-primary-600 focus-visible:ring-primary shadow-sm shadow-primary/20',
        tone === 'danger' &&
          'border-accent-200 bg-accent-50/80 text-accent-800 hover:bg-accent-100 focus-visible:ring-accent',
        tone !== 'primary' &&
          tone !== 'danger' &&
          'border-primary-100 bg-white text-ink hover:border-primary-200 hover:bg-primary-50/70 focus-visible:ring-primary',
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          tone === 'primary' && 'bg-white/20 text-white',
          tone === 'danger' && 'bg-accent text-white',
          tone !== 'primary' && tone !== 'danger' && 'bg-primary-100 text-primary',
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{action.label}</span>
        {needsCapture ? (
          <span
            className={cn(
              'mt-0.5 block text-xs font-medium',
              tone === 'primary' ? 'text-white/80' : 'text-ink-500',
            )}
          >
            Opens capture form
          </span>
        ) : null}
      </span>
      {tone === 'primary' ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-white/80" strokeWidth={ICON_STROKE} aria-hidden />
      ) : null}
    </button>
  )
}

function BranchOutcomesPanel({ application }: { application: Application }) {
  const status = resolveWorkflowStatus(application)
  const outcomes = workflowBranchOutcomes(application.type)

  return (
    <Card className="border-primary-100 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <GitBranch className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm font-semibold text-ink">Alternate outcomes</h3>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {outcomes.map((o) => {
              const active = status === o.key
              return (
                <li
                  key={o.key}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-xs',
                    active ? 'border-accent-200 bg-accent-50 text-accent-900' : 'border-primary-100 text-ink-600',
                  )}
                >
                  <span className="font-semibold">{o.label}</span>
                  <span className="mt-0.5 block text-ink-500">{o.description}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </Card>
  )
}

export function ApplicationLifecycleHub({
  application,
  property,
  agentName,
  actor,
  canReview,
  applicantMode,
  tasks = [],
  onRunAction,
  onSetDocument,
  onUploadDocument,
  onSaveDetails,
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
  applicantMode?: boolean
  tasks?: ApplicantTask[]
  onRunAction: (action: HateoasAction, capture?: WorkflowActionCapture) => void
  onSetDocument?: (key: string, status: ApplicationDocument['status'], note?: string) => void
  onUploadDocument?: (
    key: string,
    file: { name: string; mimeType: string; dataUrl: string },
  ) => void
  onSaveDetails?: (patch: Partial<Application>) => void
}) {
  const alert = useSuiteAlert()
  // P0-approve (R10): lease truth straight from the store — the RECOVER_APPROVE
  // action ('Approve & create lease') may only appear when this application has
  // no lease row. Server-authoritative on hydration: the durable lease fetch is
  // the same source Confirm-deposit flows already trust.
  const { state } = useStore()
  const hasLease = state.tenancies.some((t) => t.applicationId === application.id)
  const { label: agentLabel } = useAgentDisplay()
  const assignedAgent = agentLabel(application.agentId, agentName)
  const workflowStatus = resolveWorkflowStatus(application)
  const progress = workflowProgress(application.type, workflowStatus)
  const milestones = getLifecycleMilestones(application.type)

  const [selectedStage, setSelectedStage] = useState<WorkflowStatusKey>(workflowStatus)
  const [modalAction, setModalAction] = useState<HateoasAction | null>(null)
  const [modalBusy, setModalBusy] = useState(false)

  useEffect(() => {
    setSelectedStage(workflowStatus)
  }, [workflowStatus])

  const actions = useMemo(() => {
    const raw = applicantMode
      ? buildApplicantApplicationActions({
          application,
          permissions: actor.permissions as import('../../types/domain').Permission[],
        })
      : buildApplicationActions({
          application,
          actor: actor as Parameters<typeof buildApplicationActions>[0]['actor'],
          leaseExists: hasLease,
        })
    const toneRank: Record<string, number> = { primary: 0, secondary: 1, ghost: 2, danger: 3 }
    return [...raw].sort(
      (a, b) =>
        (toneRank[resolveTone(a)] ?? 1) - (toneRank[resolveTone(b)] ?? 1) ||
        a.label.localeCompare(b.label),
    )
  }, [application, applicantMode, actor, hasLease])

  const handleActionClick = async (action: HateoasAction) => {
    if (actionNeedsModal(action.key)) {
      setModalAction(action)
      return
    }
    if (action.confirm) {
      const ok = await alert.confirm({
        title: action.label,
        text: action.confirm,
        confirmLabel: action.label,
        tone: resolveTone(action) === 'danger' ? 'danger' : 'info',
      })
      if (!ok) return
    }
    onRunAction(action)
  }

  const handleModalConfirm = (capture: WorkflowActionCapture) => {
    if (!modalAction) return
    setModalBusy(true)
    try {
      onRunAction(modalAction, capture)
      setModalAction(null)
    } finally {
      setModalBusy(false)
    }
  }

  const actionButtons = actions.map((action) => (
    <ActionButton key={`${action.key}-${action.payload_hint?.workflowStatus ?? ''}`} action={action} onClick={() => void handleActionClick(action)} />
  ))

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary-100 p-0">
        <div className="border-b border-primary-100 bg-gradient-to-r from-primary-50/70 via-white to-brand-50/40 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">
            {applicantMode ? 'Application progress' : 'Lifecycle'}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {applicantMode
              ? `Track every step of your ${application.type === 'Purchase' ? 'purchase' : 'rental'} application`
              : `Track this ${application.type === 'Purchase' ? 'purchase' : 'rental'} application`}
            {property ? ` for ${property.title}` : ''}.
          </p>
        </div>

        <div className="space-y-5 p-5">
          <dl className="grid gap-4 rounded-2xl border border-primary-100 bg-white p-4 sm:grid-cols-4">
            <Meta label="Current status" value={workflowStageLabel(application.type, workflowStatus)} />
            <Meta label="Progress" value={`${progress}%`} tabular />
            {assignedAgent ? <Meta label="Agent" value={assignedAgent} /> : null}
            <Meta label="Type" value={application.type} />
          </dl>

          {tasks.length > 0 ? (
            <div className="rounded-2xl border border-primary-200 bg-primary-50/60 p-4">
              <p className="text-sm font-semibold text-ink">Actions required</p>
              <ul className="mt-2 space-y-1">
                {tasks.map((t) => (
                  <li key={t.id} className="text-sm text-ink-600">
                    · {t.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Your journey</h3>
            <ol className="mt-3 flex gap-1 overflow-x-auto pb-2 [scrollbar-width:thin]">
              {milestones.map((m) => {
                const visual = milestoneVisualState(application.type, workflowStatus, m.key)
                const selected = selectedStage === m.key
                const isCurrent = visual === 'current'
                const isDone = visual === 'completed'

                return (
                  <li key={m.key} className="min-w-[7.5rem] flex-1">
                    <button
                      type="button"
                      onClick={() => setSelectedStage(m.key)}
                      className={cn(
                        'flex w-full cursor-pointer flex-col items-center rounded-xl border px-2 py-2.5 text-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        selected && 'border-primary bg-primary-50 ring-2 ring-primary/20',
                        !selected && isCurrent && 'border-primary-200 bg-white',
                        !selected && isDone && 'border-primary-100 bg-white',
                        !selected && !isCurrent && !isDone && 'border-primary-100 bg-primary-50/30 opacity-80',
                      )}
                      aria-current={isCurrent ? 'step' : undefined}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                          isDone && 'bg-primary text-white',
                          isCurrent && 'bg-white text-primary ring-2 ring-primary',
                          !isDone && !isCurrent && 'bg-primary-100 text-ink-400',
                        )}
                      >
                        {isDone ? '✓' : milestones.indexOf(m) + 1}
                      </span>
                      <span
                        className={cn(
                          'mt-1.5 text-[11px] font-semibold leading-tight',
                          isCurrent && 'text-primary',
                          isDone && 'text-ink-700',
                          !isCurrent && !isDone && 'text-ink-400',
                        )}
                      >
                        {m.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(application.stage)}>{application.stage}</Badge>
          </div>
        </div>
      </Card>

      <LifecycleStagePanel
        application={application}
        stageKey={selectedStage}
        applicantMode={Boolean(applicantMode)}
        canReview={canReview}
        actions={selectedStage === workflowStatus ? actions : []}
        actionButtons={selectedStage === workflowStatus ? actionButtons : null}
        onSetDocument={onSetDocument}
        onUploadDocument={onUploadDocument}
        onSaveDetails={onSaveDetails}
      />

      {isTerminalWorkflowStatus(application.type, workflowStatus) ? (
        <BranchOutcomesPanel application={application} />
      ) : null}

      <WorkflowActionModal
        open={modalAction != null}
        action={modalAction}
        application={application}
        busy={modalBusy}
        onClose={() => setModalAction(null)}
        onConfirm={handleModalConfirm}
        onSetDocument={onSetDocument ? (key, status) => onSetDocument(key, status) : undefined}
        onUploadDocument={onUploadDocument}
      />
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
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className={cn('mt-0.5 text-sm font-semibold text-ink', tabular && 'tabular-nums')}>{value}</dd>
    </div>
  )
}
