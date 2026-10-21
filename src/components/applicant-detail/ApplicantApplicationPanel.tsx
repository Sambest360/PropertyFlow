import type { Application, ApplicationDocument, PropertyAsset } from '../../types/domain'
import type { ApplicantTask } from '../../lib/applicantPortalActions'
import type { HateoasAction } from '../../lib/api/contracts'
import type { WorkflowActionCapture } from '../../lib/workflowActionForms'
import { ProviderBadge } from '../integrations/ProviderBadge'
import { ViewingEvidenceBadge } from '../applications/ViewingEvidenceBadge'
import { ApplicationLifecycleHub } from '../workflow/ApplicationLifecycleHub'

/** Workflow hub — lifecycle is the central application experience. */
export function ApplicantApplicationPanel({
  application,
  property,
  agentName,
  actor,
  canReview,
  applicantMode,
  tasks,
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
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <ProviderBadge kind="screening" />
        <ProviderBadge kind="esign" />
        <ViewingEvidenceBadge evidence={application.viewingEvidence} />
      </div>
    <ApplicationLifecycleHub
      application={application}
      property={property}
      agentName={agentName}
      actor={actor}
      canReview={canReview}
      applicantMode={applicantMode}
      tasks={tasks}
      onRunAction={onRunAction}
      onSetDocument={onSetDocument}
      onUploadDocument={onUploadDocument}
      onSaveDetails={onSaveDetails}
    />
    </>
  )
}
