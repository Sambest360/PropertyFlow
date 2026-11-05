import type { ReactNode } from 'react'
import { Briefcase, IdCard } from 'lucide-react'
import type { Application } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { DetailSection, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { resolveConsent, resolveScreening, type ScreeningAsyncStatus } from '../../lib/screening'
import { maskIdNumber } from '../../lib/screening/consentTerms'

/** T1: an empty applicant field reads "Not provided", not a dash. */
const NOT_PROVIDED = 'Not provided'

/**
 * Personal details plus the credit check / agent review note. Credit checks
 * and the agent review are done off the system; the decision (approve,
 * conditionally approve, decline, each with a reason) is recorded in the workflow.
 */
export function ApplicantDetailsPanel({
  application,
  agentName,
  checksPanel,
}: {
  application: Application
  agentName: string | null
  canReview?: boolean
  /** Server-backed checks (ScreeningChecksPanel). */
  checksPanel?: ReactNode
  onCaptureConsent?: () => void
  onStartScreening?: () => void | Promise<void>
  onOverrideScreening?: (input: {
    newStatus: Extract<ScreeningAsyncStatus, 'passed' | 'failed' | 'manual_override'>
    reason: string
    score?: number | null
    externalReference?: string | null
  }) => void
}) {
  const { label: agentLabel } = useAgentDisplay()
  const assignedAgent = agentLabel(application.agentId, agentName)
  const screening = resolveScreening(application)
  const consent = resolveConsent(application)

  return (
    <div className="space-y-10">
      <DetailSection
        title="Personal details"
        subtitle="Identity and contact on file for this applicant."
      >
        <FlatFieldGrid>
          <FlatField label="Full name" value={application.applicantName} />
          <FlatField label="Email" value={application.email} />
          <FlatField label="Phone" value={application.phone?.trim() || NOT_PROVIDED} />
          <FlatField
            icon={IdCard}
            label="ID / passport"
            value={maskIdNumber(application.idNumberOrPassport) || NOT_PROVIDED}
            tabular
          />
          <FlatField icon={Briefcase} label="Employer" value={application.employerName?.trim() || NOT_PROVIDED} />
          <FlatField label="Job title" value={application.jobTitle?.trim() || NOT_PROVIDED} />
          {!application.employerName?.trim() &&
          !application.jobTitle?.trim() &&
          application.employment?.trim() &&
          application.employment.trim() !== 'To be completed' ? (
            <FlatField label="Employment" value={application.employment.trim()} />
          ) : null}
          <FlatField
            label="Declared income"
            value={application.income ? formatZAR(application.income) : '—'}
            tabular
          />
        </FlatFieldGrid>
      </DetailSection>

      {checksPanel}

      <DetailSection
        title="Credit check & agent review"
        subtitle="These are done off the system. Record the outcome with Approve, Conditionally approve or Decline in the workflow — every decision needs a reason."
      >
        <p className="text-sm text-ink-600">
          POPIA / NCA consent: <span className="font-semibold text-ink">{consent.granted ? 'Received' : 'Not captured in the app'}</span>
        </p>
        {assignedAgent ? (
          <p className="mt-2 text-sm text-ink-600">
            Assigned agent: <span className="font-semibold text-ink">{assignedAgent}</span>
          </p>
        ) : null}
        <p className="mt-1 text-xs text-ink-500">
          Submitted {application.submittedAt} · Updated {application.updatedAt}
        </p>

        {screening.override ? (
          <div className="mt-4 border-t border-primary-50 pt-4">
            <p className="text-[11px] font-medium text-ink-500">Latest override (audited)</p>
            <p className="mt-1 text-sm text-ink-700">
              {screening.override.byName} · {screening.override.at}
            </p>
            <p className="mt-1 text-sm text-ink-600">
              {screening.override.previousStatus} → {screening.override.newStatus}:{' '}
              {screening.override.reason}
            </p>
            {(screening.overrideHistory?.length ?? 0) > 1 ? (
              <p className="mt-1 text-xs text-ink-400">
                {screening.overrideHistory!.length} override(s) on file
              </p>
            ) : null}
          </div>
        ) : null}

        {application.notes?.trim() && (
          <div className="border-t border-primary-50 pt-4">
            <p className="text-[11px] font-medium text-ink-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">
              {application.notes}
            </p>
          </div>
        )}
        {application.blockReason && (
          <div className="border-t border-primary-50 pt-4">
            <p className="text-[11px] font-medium text-accent-700">Block reason</p>
            <p className="mt-1 text-sm text-ink-700">{application.blockReason}</p>
          </div>
        )}
      </DetailSection>
    </div>
  )
}
