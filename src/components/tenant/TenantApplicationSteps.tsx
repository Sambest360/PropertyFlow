/**
 * The applicant's steps, in the agency's order, with what to do now:
 * accept the offer once approved, pay the deposit and confirm it, read and
 * sign the lease, then sign the move-in inspection. Steps that need both
 * sides only move on once both have done their part.
 */
import { useState } from 'react'
import { CheckCircle2, Circle, KeyRound, XCircle } from 'lucide-react'
import type { Agency, Application, PropertyAsset, Tenancy } from '../../types/domain'
import { useAgencyPipeline } from '../../hooks/useApplicationPipeline'
import { applicationStopped, currentStage } from '../../lib/pipeline/stageProgress'
import type { PipelineStage } from '../../lib/pipeline/applicationPipeline'
import { findInspection } from '../../lib/pcr'
import { DepositStepPanel } from '../deposit/DepositStepPanel'
import { LeaseSignCard } from '../lease/LeaseSignCard'
import { TenantPcrSignOff } from '../pcr/TenantPcrSignOff'
import { Badge, Button, Card, Textarea, cn } from '../ui'
import { useStore } from '../../context/AppStore'

/** What each step means for the applicant. */
const TENANT_COPY: Record<string, string> = {
  viewing: 'You viewed the property.',
  submitted: 'Your agent checks your application.',
  documents: 'Upload your payslips, bank statements and other supporting documents.',
  identity: 'Upload your ID, proof of address and FICA declaration.',
  credit_check: 'Your agent runs a credit check (with your consent).',
  agent_review: 'Your agent reviews your application.',
  approval: 'The agency decides on your application.',
  deposit: 'Accept the offer, pay the deposit and upload your proof of payment.',
  lease: 'Read your lease, download it if you like, and sign it in the app.',
  move_in: 'On move-in day you check the inspection report and sign it, then collect your keys.',
  custom: 'Your agent completes this step.',
}

export function TenantApplicationSteps({
  application,
  tenancy,
  property,
  agency,
  user,
  onSave,
  onOpenDocuments,
}: {
  application: Application
  tenancy: Tenancy | null
  property: PropertyAsset | null
  agency: Agency | undefined
  user: { id: string; name: string }
  onSave: (patch: Partial<Application>) => void | Promise<unknown>
  onOpenDocuments: () => void
}) {
  const pipeline = useAgencyPipeline(application.agencyId)
  const stages = pipeline.stages.filter((s) => s.enabled)
  const { index: at, records } = currentStage(pipeline, application)
  const stopped = applicationStopped(application, records) || application.offerResponse?.status === 'declined'

  return (
    <Card className="space-y-4 p-4 sm:p-5" data-testid="tenant-application-steps">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">Your steps</h2>
        {stopped ? <Badge tone="danger">Closed</Badge> : at >= stages.length ? <Badge tone="success">Complete</Badge> : <Badge tone="info">Step {at + 1} of {stages.length}</Badge>}
      </div>
      {stopped ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {application.offerResponse?.status === 'declined'
            ? 'You declined the offer. Your agent has been told.'
            : `This application was declined.${application.declineReason ? ` Reason: ${application.declineReason}` : ''}`}
        </p>
      ) : null}
      <ol className="space-y-2">
        {stages.map((s, i) => {
          const done = records[s.key]?.status === 'approved'
          const now = !stopped && i === at
          return (
            <li key={s.key} className={cn('rounded-xl border px-3 py-3', now ? 'border-primary bg-primary-50/40' : 'border-primary-100')}>
              <div className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
                ) : records[s.key]?.status === 'declined' ? (
                  <XCircle className="h-5 w-5 text-rose-600" aria-hidden />
                ) : (
                  <Circle className={cn('h-5 w-5', now ? 'text-primary' : 'text-ink-300')} aria-hidden />
                )}
                <span className={cn('font-semibold', now ? 'text-ink' : 'text-ink-600')}>{s.label}</span>
                {done ? <span className="text-xs text-ink-500">Done</span> : now ? <Badge tone="warning">Now</Badge> : null}
              </div>
              {now ? (
                <div className="mt-2 space-y-3 pl-7">
                  <p className="text-sm text-ink-600">{TENANT_COPY[s.kind] ?? s.description}</p>
                  <StepAction
                    stage={s}
                    application={application}
                    tenancy={tenancy}
                    property={property}
                    agency={agency}
                    user={user}
                    onSave={onSave}
                    onOpenDocuments={onOpenDocuments}
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
      {!stopped && at >= stages.length ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Your tenancy is active. Welcome home.</p>
      ) : null}
    </Card>
  )
}

function StepAction({
  stage,
  application,
  tenancy,
  property,
  agency,
  user,
  onSave,
  onOpenDocuments,
}: {
  stage: PipelineStage
  application: Application
  tenancy: Tenancy | null
  property: PropertyAsset | null
  agency: Agency | undefined
  user: { id: string; name: string }
  onSave: (patch: Partial<Application>) => void | Promise<unknown>
  onOpenDocuments: () => void
}) {
  if (stage.kind === 'documents' || stage.kind === 'identity') {
    const missing = (stage.requiredDocs ?? []).filter((k) => {
      const st = application.documents.find((d) => d.key === k)?.status
      return st !== 'uploaded' && st !== 'verified'
    })
    if (!missing.length) return <p className="text-sm text-ink-500">Everything is uploaded. Your agent is checking it.</p>
    const names = missing.map((k) => application.documents.find((d) => d.key === k)?.label ?? k)
    return (
      <div className="space-y-2">
        <p className="text-sm text-ink">Still needed: {names.join(', ')}.</p>
        <Button size="sm" onClick={onOpenDocuments}>Upload documents</Button>
      </div>
    )
  }
  if (stage.kind === 'deposit') {
    if (!application.offerResponse) return <OfferAnswer application={application} onSave={onSave} applicantName={user.name} />
    return (
      <DepositStepPanel
        application={application}
        agency={agency}
        depositAmount={Number((property as { deposit?: number } | null)?.deposit ?? 0)}
        mode="tenant"
        actorName={user.name}
        onSave={onSave}
      />
    )
  }
  if (stage.kind === 'lease') {
    if (!tenancy?.eSign?.envelopeId) return <p className="text-sm text-ink-500">Your agent is preparing your lease. We&apos;ll email you when it is ready to sign.</p>
    return (
      <div className="space-y-2">
        <LeaseSignCard tenancy={tenancy} party="tenant" title="Your lease agreement" />
        {tenancy.eSign?.tenant?.status === 'signed' && tenancy.eSign?.landlord?.status !== 'signed' ? (
          <p className="text-sm text-ink-500">You have signed. Waiting for the landlord to sign.</p>
        ) : null}
      </div>
    )
  }
  if (stage.kind === 'move_in') {
    const pcr = findInspection(application, 'incoming')
    return (
      <div className="space-y-3">
        {application.moveInDate ? (
          <p className="flex items-start gap-2 text-sm text-ink">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              Move-in on <strong>{application.moveInDate}</strong>
              {application.keyCollection?.location ? <> · keys at <strong>{application.keyCollection.location}</strong></> : null}.
            </span>
          </p>
        ) : (
          <p className="text-sm text-ink-500">Your agent will confirm your move-in date.</p>
        )}
        {pcr?.staffSignature ? (
          <TenantPcrSignOff application={application} tenantName={user.name || application.applicantName} tenantUserId={user.id} onSave={onSave} />
        ) : (
          <p className="text-sm text-ink-500">Your agent completes the move-in inspection first, then you check it and sign it here.</p>
        )}
      </div>
    )
  }
  return <p className="text-sm text-ink-500">Nothing for you to do. We&apos;ll email you when there is.</p>
}

/** After approval: the applicant accepts the offer (and goes on to the deposit) or declines it. */
function OfferAnswer({
  application,
  applicantName,
  onSave,
}: {
  application: Application
  applicantName: string
  onSave: (patch: Partial<Application>) => void | Promise<unknown>
}) {
  const { notify } = useStore()
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const answer = async (status: 'accepted' | 'declined') => {
    setBusy(true)
    try {
      await onSave({ offerResponse: { status, at: new Date().toISOString(), reason: status === 'declined' ? reason.trim() : undefined } })
      if (application.agentId) {
        notify({
          userId: application.agentId,
          agencyId: application.agencyId,
          title: status === 'accepted' ? 'Offer accepted' : 'Offer declined',
          body:
            status === 'accepted'
              ? `${applicantName} accepted the offer. Next: the deposit.`
              : `${applicantName} declined the offer: ${reason.trim()}`,
          link: `/workspace/sales/applications/${application.id}`,
        })
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
      <p className="text-sm font-semibold text-emerald-900">Your application was approved. Do you accept the offer?</p>
      {declining ? (
        <div className="space-y-2">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you declining? (your agent sees this)" />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={busy || !reason.trim()} onClick={() => void answer('declined')}>
              Decline the offer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeclining(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void answer('accepted')}>
            Accept
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      )}
    </div>
  )
}
