import { useState } from 'react'
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
import { Badge, Card, cn, statusTone } from '../ui'
import { buildApplicationActions } from '../../lib/api/actions'
import type { HateoasAction } from '../../lib/api/contracts'
import {
  getStageDef,
  resolveWorkflowStatus,
  workflowBranchOutcomes,
  workflowProgress,
  workflowStageLabel,
} from '../../lib/applicationWorkflow'
import { actionNeedsModal, type WorkflowActionCapture } from '../../lib/workflowActionForms'
import { WorkflowLifecycleTrack } from '../workflow/WorkflowLifecycleTrack'
import { WorkflowActionModal } from '../workflow/WorkflowActionModal'
import { ICON_STROKE } from './types'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { useSuiteAlert } from '../alerts/SuiteAlert'

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
          <p className="mt-1 text-xs text-ink-500">
            Applications can exit the happy path — withdraw, reject, cancel, or renew.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {outcomes.map((o) => {
              const active = status === o.key
              return (
                <li
                  key={o.key}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-xs transition-colors duration-200',
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
    UPLOAD_DOCS: 'Upload FICA and income docs — confirm when complete',
    START_FICA: 'Verify identity against FICA requirements',
    START_CREDIT_CHECK: 'Run bureau check with POPIA consent',
    VERIFY_DEPOSIT: 'Finance confirms cleared deposit funds',
    VERIFY_RENT: 'Finance clears first month rental payment',
    TENANT_SIGNED: 'Capture tenant digital signature on lease',
    LANDLORD_SIGNED: 'Capture landlord signature on lease',
    SCHEDULE_MOVE_IN: 'Book ingoing condition inspection + keys',
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
  onRunAction,
  onSetDocument,
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
  onRunAction: (action: HateoasAction, capture?: WorkflowActionCapture) => void
  onSetDocument?: (key: string, status: ApplicationDocument['status']) => void
}) {
  const alert = useSuiteAlert()
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

  const [modalAction, setModalAction] = useState<HateoasAction | null>(null)
  const [modalBusy, setModalBusy] = useState(false)

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

  const handleModalConfirm = async (capture: WorkflowActionCapture) => {
    if (!modalAction) return
    setModalBusy(true)
    try {
      onRunAction(modalAction, capture)
      setModalAction(null)
    } finally {
      setModalBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary-100 p-0">
        <div className="border-b border-primary-100 bg-gradient-to-r from-primary-50/70 via-white to-brand-50/40 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-ink">Lifecycle</h2>
          <p className="mt-1 text-sm text-ink-500">
            {application.type === 'Purchase'
              ? 'South African purchase workflow — offer through transfer and registration'
              : 'South African rental workflow — enquiry through tenancy and closure'}
            {property ? ` · ${property.title}` : ''}.
          </p>
        </div>

        <div className="space-y-5 p-5">
          <dl className="grid gap-4 rounded-2xl border border-primary-100 bg-white p-4 sm:grid-cols-4">
            <Meta label="Stage" value={workflowStageLabel(application.type, workflowStatus)} />
            <Meta label="Status code" value={workflowStatus} tabular mono />
            {assignedAgent ? <Meta label="Agent" value={assignedAgent} /> : null}
            <Meta label="Progress" value={`${progress}%`} tabular />
          </dl>

          <WorkflowLifecycleTrack application={application} />

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(application.stage)}>{application.stage}</Badge>
            <span className="text-xs text-ink-500">{application.type}</span>
          </div>

          {application.keyCollection ? (
            <div className="rounded-xl border border-primary-100 bg-primary-50/60 p-3 text-sm">
              <p className="font-semibold text-ink">
                <KeyRound className="mr-1 inline h-4 w-4 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
                Key collection
              </p>
              <p className="mt-1 text-ink-600">{application.keyCollection.location}</p>
              <p className="text-ink-500">{application.keyCollection.instructions}</p>
            </div>
          ) : null}
        </div>
      </Card>

      <BranchOutcomesPanel application={application} />

      {canReview ? (
        <Card className="overflow-hidden border-primary-100 p-0">
          <div className="border-b border-primary-100 bg-primary-50/50 px-5 py-4">
            <h2 className="font-display text-lg font-semibold text-ink">Workflow actions</h2>
            <p className="mt-1 text-sm text-ink-500">
              Valid next steps from{' '}
              <span className="font-medium text-ink">{workflowStageLabel(application.type, workflowStatus)}</span>.
              Steps may require confirmation, signatures, or document uploads.
            </p>
          </div>

          <div className="space-y-2 p-4 sm:p-5">
            {actions.map((action) => {
              const visual = actionVisual(action)
              const Icon = visual.Icon
              const hint = actionHint(action)
              const needsCapture = actionNeedsModal(action.key)
              return (
                <button
                  key={`${action.key}-${action.payload_hint?.workflowStatus ?? ''}`}
                  type="button"
                  className={cn(
                    'flex w-full min-h-12 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                    visual.className,
                  )}
                  onClick={() => void handleActionClick(action)}
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
                      {needsCapture ? `${hint} · opens capture form` : hint}
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
            {!actions.length ? (
              <p className="text-sm text-ink-500">
                No actions available at this stage
                {getStageDef(application.type, workflowStatus)?.terminal ? ' (file closed).' : '.'}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      <WorkflowActionModal
        open={modalAction != null}
        action={modalAction}
        application={application}
        busy={modalBusy}
        onClose={() => setModalAction(null)}
        onConfirm={handleModalConfirm}
        onSetDocument={onSetDocument}
      />
    </div>
  )
}

function Meta({
  label,
  value,
  tabular,
  mono,
}: {
  label: string
  value: string
  tabular?: boolean
  mono?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 text-sm font-semibold text-ink',
          tabular && 'tabular-nums',
          mono && 'font-mono text-xs font-medium text-ink-600',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
