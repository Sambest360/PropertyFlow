import type { ReactNode } from 'react'
import type { Application, ApplicationDocument } from '../../types/domain'
import type { HateoasAction } from '../../lib/api/contracts'
import {
  documentsForStage,
  getStageRequirements,
  milestoneVisualState,
  resolveWorkflowStatus,
  workflowStageLabel,
  type WorkflowStatusKey,
} from '../../lib/applicationWorkflow'
import { ApplicationDocumentRow } from '../applicant-detail/ApplicationDocumentRow'
import { ActionButtonRow } from '../ActionButtonRow'
import { TenantApplicationDetailsForm } from '../tenant/TenantApplicationDetailsForm'
import { Badge, Card, cn } from '../ui'
import { formatLeadTime } from '../../lib/leadLifecycle'
import { FicaPackGateStatus } from '../fica/FicaPackGateStatus'
import { ScreeningGateStatus } from '../screening/ScreeningGateStatus'
import { PcrGateStatus } from '../pcr/PcrGateStatus'
import { FICA_PACK_KEYS } from '../../lib/ficaPack'

const EARLY_DETAIL_STAGES: WorkflowStatusKey[] = ['application_started', 'application_submitted']

export function LifecycleStagePanel({
  application,
  stageKey,
  applicantMode,
  canReview,
  actions,
  actionButtons,
  onSetDocument,
  onUploadDocument,
  onSaveDetails,
}: {
  application: Application
  stageKey: WorkflowStatusKey
  applicantMode: boolean
  canReview: boolean
  actions: HateoasAction[]
  actionButtons: ReactNode | null
  onSetDocument?: (key: string, status: ApplicationDocument['status'], note?: string) => void
  onUploadDocument?: (
    key: string,
    file: { name: string; mimeType: string; dataUrl: string },
  ) => void
  onSaveDetails?: (patch: Partial<Application>) => void
}) {
  const currentStatus = resolveWorkflowStatus(application)
  const visual = milestoneVisualState(application.type, currentStatus, stageKey)
  const requirements = getStageRequirements(stageKey)
  const stageDocs = documentsForStage(application, stageKey)
  const stageEvents = (application.workflowEvents ?? []).filter((e) => e.stage === stageKey)

  const isCurrent = visual === 'current'
  const isCompleted = visual === 'completed'
  const isFuture = visual === 'upcoming'

  const waitingCopy = isFuture
    ? requirements?.futureLabel ?? `After earlier steps complete, ${workflowStageLabel(application.type, stageKey).toLowerCase()} will begin.`
    : requirements?.waitingLabel ?? workflowStageLabel(application.type, stageKey)

  const actorLabel =
    requirements?.actor === 'applicant'
      ? 'Your action'
      : requirements?.actor === 'agent'
        ? 'Agency action'
        : requirements?.actor === 'system'
          ? 'System processing'
          : 'Shared step'

  const showDetailsForm =
    applicantMode &&
    onSaveDetails &&
    EARLY_DETAIL_STAGES.includes(stageKey) &&
    (isCurrent || stageKey === 'application_started')

  const canUploadDocs = applicantMode && isCurrent
  const canReviewDocs = canReview && (isCurrent || isCompleted)

  return (
    <Card className="overflow-hidden border-primary-100 p-0">
      <div
        className={cn(
          'border-b px-5 py-4',
          isCurrent && 'border-primary-200 bg-primary-50/70',
          isCompleted && 'border-primary-100 bg-white',
          isFuture && 'border-primary-100 bg-primary-50/30',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {isCurrent ? 'Current status' : isCompleted ? 'Completed stage' : 'Upcoming'}
            </p>
            <h3 className="mt-1 font-display text-lg font-semibold text-ink">
              {workflowStageLabel(application.type, stageKey)}
            </h3>
            <p className="mt-1 text-sm text-ink-600">{waitingCopy}</p>
          </div>
          <div className="text-right">
            <Badge tone={isCurrent ? 'brand' : isCompleted ? 'success' : 'neutral'}>{actorLabel}</Badge>
            {requirements?.etaDays && isCurrent ? (
              <p className="mt-2 text-xs text-ink-500">Est. {requirements.etaDays} business day(s)</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {canReview &&
        !applicantMode &&
        (stageKey === 'fica_verification' ||
          stageDocs.some((d) => (FICA_PACK_KEYS as readonly string[]).includes(d.key))) ? (
          <FicaPackGateStatus documents={application.documents} />
        ) : null}

        {canReview &&
        !applicantMode &&
        application.type === 'Rental' &&
        (stageKey === 'credit_check' ||
          stageKey === 'agent_review' ||
          stageKey === 'landlord_review' ||
          stageKey === 'conditionally_approved' ||
          stageKey === 'lease_generated' ||
          stageKey === 'lease_sent') ? (
          <ScreeningGateStatus application={application} />
        ) : null}

        {canReview &&
        !applicantMode &&
        application.type === 'Rental' &&
        (stageKey === 'inspection_scheduled' ||
          stageKey === 'inspection_completed' ||
          stageKey === 'keys_ready' ||
          stageKey === 'keys_handed_over' ||
          stageKey === 'active_tenancy' ||
          stageKey === 'move_out_inspection' ||
          stageKey === 'deposit_refunded') ? (
          <PcrGateStatus application={application} />
        ) : null}

        {showDetailsForm ? (
          <TenantApplicationDetailsForm application={application} onSave={onSaveDetails} autoSave />
        ) : null}

        {stageDocs.length > 0 ? (
          <section>
            <h4 className="text-sm font-semibold text-ink">Documents</h4>
            <p className="mt-0.5 text-xs text-ink-500">
              {canUploadDocs
                ? 'Upload each item below — your file saves immediately.'
                : canReviewDocs
                  ? 'Review and approve each document independently.'
                  : 'Documents for this stage.'}
            </p>
            <ul className="mt-3 space-y-2">
              {stageDocs.map((doc) => (
                <ApplicationDocumentRow
                  key={doc.key}
                  doc={doc}
                  canUpload={Boolean(canUploadDocs && onUploadDocument)}
                  canReview={Boolean(canReviewDocs && onSetDocument)}
                  onUpload={(file) => onUploadDocument?.(doc.key, file)}
                  onSetStatus={(status, note) => onSetDocument?.(doc.key, status, note)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {isCurrent && actions.length > 0 ? (
          <section>
            <h4 className="text-sm font-semibold text-ink">
              {applicantMode && !canReview ? 'Actions required' : 'Workflow actions'}
            </h4>
            <ActionButtonRow className="mt-2">{actionButtons}</ActionButtonRow>
          </section>
        ) : null}

        {isCurrent && actions.length === 0 && !stageDocs.length && !showDetailsForm ? (
          <p className="text-sm text-ink-500">No actions required at this step — waiting on the next party.</p>
        ) : null}

        {stageEvents.length > 0 ? (
          <section>
            <h4 className="text-sm font-semibold text-ink">History</h4>
            <ul className="mt-2 space-y-2">
              {stageEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-ink">{ev.summary}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {ev.actorName ?? 'System'} · {formatLeadTime(ev.at, 'relative')}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : isCompleted ? (
          <p className="text-sm text-ink-500">
            This stage was completed
            {application.updatedAt ? ` · last updated ${formatLeadTime(application.updatedAt)}` : ''}.
          </p>
        ) : null}
      </div>
    </Card>
  )
}
