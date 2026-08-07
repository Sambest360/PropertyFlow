import type { Application, AppNotification, AppUser, PropertyAsset, SuiteAlertAction, SuiteAlertResource } from '../types/domain'
import { resolveWorkflowStatus, workflowStageLabel } from './applicationWorkflow'
import { isApplicantAcceptanceStatus, siblingApplications } from './applicantPortalActions'

export type AcceptanceNotificationInput = {
  accepted: Application
  property: PropertyAsset | undefined
  applications: readonly Application[]
  users: readonly AppUser[]
  notify: (input: Omit<AppNotification, 'id' | 'at' | 'read'> & { silent?: boolean }) => void
  emitSuiteEvent: (input: {
    agencyId: string | null
    resource: SuiteAlertResource
    action: SuiteAlertAction
    title: string
    body: string
    link?: string
    actorUserId?: string | null
    includeActor?: boolean
  }) => void
}

/** Notify other agencies (and the applicant) when this person is accepted elsewhere. */
export function notifyAcceptedElsewhere(input: AcceptanceNotificationInput): void {
  const status = resolveWorkflowStatus(input.accepted)
  if (!isApplicantAcceptanceStatus(status)) return

  const others = siblingApplications(input.applications, input.accepted)
  if (!others.length) return

  const acceptedLabel =
    input.property?.title ?? workflowStageLabel(input.accepted.type, status)

  for (const other of others) {
    const staffToNotify = input.users.filter(
      (u) =>
        u.active &&
        u.agencyId === other.agencyId &&
        (u.id === other.agentId ||
          u.role === 'client_admin' ||
          u.role === 'agent_admin' ||
          u.role === 'ground_agent'),
    )

    for (const staff of staffToNotify) {
      input.notify({
        userId: staff.id,
        agencyId: other.agencyId,
        title: 'Applicant accepted elsewhere',
        body: `${input.accepted.applicantName} was accepted at ${acceptedLabel}. Their application for your listing may no longer proceed.`,
        link: `/workspace/sales/applications/${encodeURIComponent(other.id)}`,
        resource: 'applicant',
        action: 'updated',
        silent: staff.id !== other.agentId,
      })
    }

    input.emitSuiteEvent({
      agencyId: other.agencyId,
      resource: 'applicant',
      action: 'updated',
      title: 'Applicant accepted elsewhere',
      body: `${input.accepted.applicantName} secured another property (${acceptedLabel}). Review application ${other.id}.`,
      link: `/workspace/sales/applications/${encodeURIComponent(other.id)}`,
    })
  }

  if (input.accepted.applicantUserId) {
    for (const other of others) {
      input.notify({
        userId: input.accepted.applicantUserId!,
        agencyId: other.agencyId,
        title: 'Update on your other application',
        body: `You were accepted at ${acceptedLabel}. Your application for another property is still open — the agency has been notified.`,
        link: `/workspace/portals/tenant/applications/${encodeURIComponent(other.id)}`,
        resource: 'applicant',
        action: 'updated',
        silent: true,
      })
    }
  }
}
