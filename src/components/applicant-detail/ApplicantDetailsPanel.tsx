import { Briefcase, IdCard, ShieldCheck } from 'lucide-react'
import type { Application } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { statusTone } from '../ui'
import { DetailSection, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { ICON_STROKE } from './types'

/** Personal / screening details — flat text, no nested cards. */
export function ApplicantDetailsPanel({
  application,
  agentName,
}: {
  application: Application
  agentName: string | null
}) {
  const { label: agentLabel } = useAgentDisplay()
  const assignedAgent = agentLabel(application.agentId, agentName)
  return (
    <div className="space-y-10">
      <DetailSection
        title="Personal details"
        subtitle="Identity and contact on file for this applicant."
      >
        <FlatFieldGrid>
          <FlatField label="Full name" value={application.applicantName} />
          <FlatField label="Email" value={application.email} />
          <FlatField label="Phone" value={application.phone || '—'} />
          <FlatField
            icon={IdCard}
            label="ID / passport"
            value={application.idNumberOrPassport || '—'}
            tabular
          />
          <FlatField icon={Briefcase} label="Employment" value={application.employment || '—'} />
          <FlatField
            label="Declared income"
            value={application.income ? formatZAR(application.income) : '—'}
            tabular
          />
        </FlatFieldGrid>
      </DetailSection>

      <DetailSection
        title="Screening"
        subtitle="Credit posture, consent, and notes agents should know before proceeding."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Credit check
            </p>
            <p
              className={`mt-1 text-sm font-semibold ${
                statusTone(application.creditCheck) === 'warning'
                  ? 'text-amber-700'
                  : statusTone(application.creditCheck) === 'success'
                    ? 'text-emerald-700'
                    : statusTone(application.creditCheck) === 'danger'
                      ? 'text-accent-700'
                      : 'text-ink'
              }`}
            >
              {application.creditCheck}
            </p>
            <p className="mt-1 text-sm text-ink-500">
              POPIA consent: {application.creditConsent ? 'Received' : 'Pending'}
            </p>
          </div>
          <div>
            {assignedAgent ? (
              <>
                <p className="text-[11px] font-medium text-ink-400">Assigned agent</p>
                <p className="mt-1 text-sm font-semibold text-ink">{assignedAgent}</p>
              </>
            ) : null}
            <p className="mt-1 text-xs text-ink-500">
              Submitted {application.submittedAt} · Updated {application.updatedAt}
            </p>
          </div>
        </div>
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
