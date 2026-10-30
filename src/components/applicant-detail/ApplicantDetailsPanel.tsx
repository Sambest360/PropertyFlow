import { useState, type ReactNode } from 'react'
import { Briefcase, IdCard, ShieldCheck } from 'lucide-react'
import type { Application } from '../../types/domain'
import { formatZAR } from '../../data/seed'
import { statusTone } from '../ui'
import { DetailSection, FlatField, FlatFieldGrid } from '../detail/FlatFields'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { Button } from '../ui'
import {
  resolveConsent,
  resolveScreening,
  screeningStatusLabel,
  type ScreeningAsyncStatus,
} from '../../lib/screening'
import { ScreeningGateStatus } from '../screening/ScreeningGateStatus'
import { FieldHelp } from '../onboarding/FieldHelp'
import { SCREENING_MODE_A_COPY } from '../../lib/screening'
import { maskIdNumber } from '../../lib/screening/consentTerms'
import { ICON_STROKE } from './types'

/** T1: an empty applicant field reads "Not provided", not a dash. */
const NOT_PROVIDED = 'Not provided'

/** Personal / screening details — flat text, no nested cards. */
export function ApplicantDetailsPanel({
  application,
  agentName,
  canReview = false,
  checksPanel,
  onCaptureConsent,
  onStartScreening,
  onOverrideScreening,
}: {
  application: Application
  agentName: string | null
  canReview?: boolean
  /** Server-backed checks (ScreeningChecksPanel); shown above the legacy screening record. */
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
  const statusLabel = screeningStatusLabel(screening.status)
  const tone = statusTone(statusLabel)

  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideStatus, setOverrideStatus] = useState<
    Extract<ScreeningAsyncStatus, 'passed' | 'failed' | 'manual_override'>
  >('manual_override')
  const [overrideScore, setOverrideScore] = useState('')
  const [overrideRef, setOverrideRef] = useState('')
  const [busy, setBusy] = useState(false)

  const submitOverride = () => {
    if (!onOverrideScreening || !overrideReason.trim()) return
    const trimmedScore = overrideScore.trim()
    const parsedScore =
      trimmedScore === '' ? undefined : Number.isFinite(Number(trimmedScore)) ? Number(trimmedScore) : undefined
    onOverrideScreening({
      newStatus: overrideStatus,
      reason: overrideReason.trim(),
      score: parsedScore,
      externalReference: overrideRef.trim() ? overrideRef.trim() : undefined,
    })
    setOverrideOpen(false)
    setOverrideReason('')
    setOverrideScore('')
    setOverrideRef('')
  }

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
        title="Screening"
        subtitle="Application screening record and audited manual overrides. Approve does not invent a credit pass."
        actions={<FieldHelp title="Screening" body={SCREENING_MODE_A_COPY} />}
      >
        {application.type === 'Rental' && canReview ? (
          <div className="mb-4">
            <ScreeningGateStatus application={application} />
          </div>
        ) : null}

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-400">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Screening status
            </p>
            <p
              className={`mt-1 text-sm font-semibold ${
                tone === 'success'
                    ? 'text-emerald-700'
                    : tone === 'danger'
                      ? 'text-accent-700'
                      : 'text-ink'
              }`}
            >
              {statusLabel}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              Legacy label: {application.creditCheck}
              {screening.provider ? ` · Provider: ${screening.provider}` : ''}
            </p>
            {screening.summary ? (
              <p className="mt-2 text-sm text-ink-600">{screening.summary}</p>
            ) : null}
            {(screening.score != null || screening.band) && (
              <p className="mt-1 text-sm text-ink-600">
                {screening.band ? `Band: ${screening.band}` : null}
                {screening.band && screening.score != null ? ' · ' : null}
                {screening.score != null ? `Score: ${screening.score}` : null}
              </p>
            )}
            {screening.externalReference ? (
              <p className="mt-1 text-xs text-ink-400 tabular-nums">
                Ref: {screening.externalReference}
              </p>
            ) : null}
            {screening.checkedAt ? (
              <p className="mt-1 text-xs text-ink-400">Checked {screening.checkedAt}</p>
            ) : null}
          </div>
          <div>
            <p className="text-[11px] font-medium text-ink-400">POPIA / NCA consent</p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {consent.granted ? 'Received' : 'Pending'}
            </p>
            {consent.granted ? (
              <p className="mt-1 text-xs text-ink-500">
                {[consent.method, consent.grantedAt, consent.grantedBy]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : (
              <p className="mt-1 text-xs text-ink-500">
                Consent must be captured before screening can start.
              </p>
            )}
            {assignedAgent ? (
              <>
                <p className="mt-4 text-[11px] font-medium text-ink-400">Assigned agent</p>
                <p className="mt-1 text-sm font-semibold text-ink">{assignedAgent}</p>
              </>
            ) : null}
            <p className="mt-1 text-xs text-ink-500">
              Submitted {application.submittedAt} · Updated {application.updatedAt}
            </p>
          </div>
        </div>

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

        {canReview ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-primary-50 pt-4">
            {!consent.granted && onCaptureConsent ? (
              <Button type="button" variant="secondary" size="sm" onClick={onCaptureConsent}>
                Capture consent
              </Button>
            ) : null}
            {consent.granted &&
            screening.status !== 'in_progress' &&
            screening.status !== 'passed' &&
            screening.status !== 'manual_override' &&
            onStartScreening ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await onStartScreening()
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Start screening (mock/manual)
              </Button>
            ) : null}
            {onOverrideScreening ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOverrideOpen((v) => !v)}
              >
                {overrideOpen ? 'Cancel override' : 'Manual bureau record'}
              </Button>
            ) : null}
          </div>
        ) : null}

        {canReview && overrideOpen ? (
          <div className="mt-3 space-y-3 rounded-lg border border-primary-100 bg-primary-50/40 p-3">
            <p className="text-xs text-ink-500">
              Manual bureau record — audited staff entry. Cleared status for
              soft-gate is <strong>passed</strong> or <strong>manual_override</strong>.
            </p>
            <label className="block text-[11px] font-medium text-ink-400">
              Override outcome
              <select
                className="mt-1 w-full rounded-md border border-primary-100 bg-white px-2 py-1.5 text-sm text-ink"
                value={overrideStatus}
                onChange={(e) =>
                  setOverrideStatus(
                    e.target.value as Extract<
                      ScreeningAsyncStatus,
                      'passed' | 'failed' | 'manual_override'
                    >,
                  )
                }
              >
                <option value="manual_override">Manual override (recorded)</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
              </select>
            </label>
            <label className="block text-[11px] font-medium text-ink-400">
              Reason (required for audit)
              <textarea
                className="mt-1 w-full rounded-md border border-primary-100 bg-white px-2 py-1.5 text-sm text-ink"
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Why is the agent recording this mock/manual bureau outcome?"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[11px] font-medium text-ink-400">
                Score (optional staff field)
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border border-primary-100 bg-white px-2 py-1.5 text-sm text-ink"
                  value={overrideScore}
                  onChange={(e) => setOverrideScore(e.target.value)}
                  placeholder="e.g. 720"
                />
              </label>
              <label className="block text-[11px] font-medium text-ink-400">
                External ref (optional)
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-primary-100 bg-white px-2 py-1.5 text-sm text-ink"
                  value={overrideRef}
                  onChange={(e) => setOverrideRef(e.target.value)}
                  placeholder="Staff-recorded bureau / file ref"
                />
              </label>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!overrideReason.trim()}
              onClick={submitOverride}
            >
              Save audited override
            </Button>
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
