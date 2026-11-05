import { useMemo, useState } from 'react'
import { AssignRoomCard } from '../components/deposit/AssignRoomCard'
import { DepositStepPanel } from '../components/deposit/DepositStepPanel'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { resolveApplicationAgentName } from '../lib/agentDisplay'
import { ensureIngoingInspection } from '../lib/pcr'
import { rolePermissions } from '../lib/permissions'
import { RequirePermission } from '../components/RequirePermission'
import { BackButton } from '../components/BackButton'
import { DashboardTabs } from '../components/dashboard/DashboardTabs'
import { Badge, Card } from '../components/ui'
import { ApplicantDetailHeader } from '../components/applicant-detail/ApplicantDetailHeader'
import { ApplicantOverviewPanel } from '../components/applicant-detail/ApplicantOverviewPanel'
import { ApplicantDetailsPanel } from '../components/applicant-detail/ApplicantDetailsPanel'
import { ApplicantDocumentsPanel } from '../components/applicant-detail/ApplicantDocumentsPanel'
import { ScreeningChecksPanel } from '../components/screening/ScreeningChecksPanel'
import {
  ApplicantResidencesPanel,
  buildPastResidences,
} from '../components/applicant-detail/ApplicantResidencesPanel'
import {
  ApplicantBlocksPanel,
  buildBlockRecords,
} from '../components/applicant-detail/ApplicantBlocksPanel'
import { ApplicantApplicationPanel } from '../components/applicant-detail/ApplicantApplicationPanel'
import { ApplicantHistoryTimeline } from '../components/applicant-detail/ApplicantHistoryTimeline'
import { BlockApplicantModal } from '../components/applicant-detail/BlockApplicantModal'
import {
  DEFAULT_APPLICANT_DETAIL_TAB,
  isApplicantDetailTab,
  type ApplicantDetailTab,
} from '../components/applicant-detail/types'
import { guidedTransitionError, type PatchApplicationStatusResult } from '../lib/api/applicationStatusApi'
import { ApplicationCheckoutCard } from '../components/payments/ApplicationCheckoutCard'
import { AGENT_NO_ROWS_COPY, applicationLedgerRows } from '../lib/payfast/applicationCheckout'
import type { HateoasAction } from '../lib/api/contracts'
import type { WorkflowActionCapture } from '../lib/workflowActionForms'
import type { PropertyEvent } from '../types/domain'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { ApplicationStagesPanel, type StageApproveInput } from '../components/pipeline/ApplicationStagesPanel'
import { useAgencyPipeline } from '../hooks/useApplicationPipeline'
import type { PipelineStage, StageRecord } from '../lib/pipeline/applicationPipeline'
import { getAvailableTransitions, resolveWorkflowStatus, type WorkflowStatusKey } from '../lib/applicationWorkflow'

/**
 * When a pipeline stage is approved, the matching step of the underlying
 * workflow moves on too, if it is the very next step from where the file is.
 */
const STAGE_WORKFLOW_TARGETS: Partial<Record<PipelineStage['kind'], WorkflowStatusKey[]>> = {
  viewing: ['viewing_completed', 'application_started'],
  submitted: ['documents_requested'],
  documents: ['documents_uploaded', 'fica_verification'],
  identity: ['fica_verification', 'employment_verification'],
  deposit: ['deposit_paid', 'deposit_verified'],
  move_in: ['active_tenancy'],
}
const LEASE_SIGNED: ReadonlySet<string> = new Set([
  'tenant_signed', 'landlord_signed', 'deposit_invoice_sent', 'deposit_paid', 'deposit_verified', 'first_rent_paid',
  'rent_verified', 'inspection_scheduled', 'inspection_completed', 'keys_ready', 'keys_handed_over', 'active_tenancy',
])
import { useMarkOpened } from '../context/UnopenedContext'

function isApplicantRelatedEvent(ev: PropertyEvent, applicantName: string, applicationId: string) {
  const hay = `${ev.action} ${(ev.changes ?? []).map((c) => `${c.field} ${c.from} ${c.to}`).join(' ')}`.toLowerCase()
  const name = applicantName.toLowerCase()
  return (
    /applicant|application|stage|document|lease|move-in|key|credit|block/i.test(ev.action) ||
    hay.includes(name) ||
    hay.includes(applicationId.toLowerCase())
  )
}

export default function ApplicantDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const {
    state,
    setDocumentStatus,
    uploadApplicationDocument,
    patchApplicationStatus,
    advanceApplicationWorkflow,
    scheduleMoveIn,
    blockApplication,
    addPropertyEvent,
    updateApplication,
    overrideApplicationScreening,
    approveApplication,
    upsertHeldDeposit,
  } = useStore()
  const { user, has } = useAuth()
  const { dealVisible, role } = usePropertyScope()
  const alert = useSuiteAlert()

  const [blockOpen, setBlockOpen] = useState(false)
  const [flash, setFlash] = useState<PatchApplicationStatusResult | null>(null)
  // open-checkout-real: OPEN_CHECKOUT only reveals the pay card over the LIVE
  // ledger rows; nothing is invented (no fallback id, no fallback amount).
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  const application = state.applications.find((a) => a.id === id)
  const pipeline = useAgencyPipeline(application?.agencyId)
  const [stageBusy, setStageBusy] = useState(false)
  useMarkOpened('application', application?.id)
  // Opening the application counts as opening its compliance (document check) item.
  useMarkOpened('compliance', application?.id)

  const tabParam = params.get('tab')
  const tab: ApplicantDetailTab = isApplicantDetailTab(tabParam)
    ? tabParam
    : DEFAULT_APPLICANT_DETAIL_TAB
  const setTab = (next: string) => {
    const sp = new URLSearchParams(params)
    if (next === DEFAULT_APPLICANT_DETAIL_TAB) sp.delete('tab')
    else sp.set('tab', next)
    setParams(sp, { replace: true })
  }

  const actor = useMemo(
    () => ({
      userId: user.id,
      role: user.role,
      agencyId: user.agencyId,
      permissions: rolePermissions[user.role] ?? [],
    }),
    [user],
  )

  const inScope = useMemo(() => {
    if (!application) return false
    if (role === 'tenant') {
      return application.applicantUserId === user.id || application.email === user.email
    }
    return dealVisible(application)
  }, [application, role, user, dealVisible])

  const property = useMemo(
    () =>
      application
        ? state.properties.find((p) => p.id === application.propertyId) ?? null
        : null,
    [application, state.properties],
  )

  const agentsForAgency = useMemo(
    () =>
      application
        ? state.users.filter(
            (u) =>
              u.agencyId === application.agencyId &&
              (u.role === 'agent' || u.role === 'ground_agent' || u.role === 'agent_admin'),
          )
        : [],
    [application, state.users],
  )

  const agentName = useMemo(() => {
    // P0-agent (R8): one shared resolver — the listing's real assigned agent
    // only. The application row's agent_id is stale-prone (earlier write
    // paths defaulted it); it must never surface as a person here.
    return resolveApplicationAgentName(property, application, state.users)
  }, [application, property, state.users])

  const residences = useMemo(() => {
    if (!application) return []
    return buildPastResidences({
      currentApp: application,
      applications: state.applications,
      tenancies: state.tenancies,
      properties: state.properties,
    })
  }, [application, state.applications, state.tenancies, state.properties])

  const blocks = useMemo(() => {
    if (!application) return []
    return buildBlockRecords({
      currentApp: application,
      applications: state.applications,
      properties: state.properties,
    })
  }, [application, state.applications, state.properties])

  const historyEvents = useMemo(() => {
    if (!application) return [] as PropertyEvent[]
    const related = state.propertyEvents.filter(
      (ev) =>
        ev.propertyId === application.propertyId &&
        isApplicantRelatedEvent(ev, application.applicantName, application.id),
    )

    const synthetic: PropertyEvent[] = [
      {
        id: `synth-submit-${application.id}`,
        agencyId: application.agencyId,
        propertyId: application.propertyId,
        actorUserId: application.applicantUserId,
        actorName: application.applicantName,
        action: 'submitted an Application',
        at: application.submittedAt,
        changes: [
          { field: 'Application', from: 'None', to: application.id },
          { field: 'Type', from: 'None', to: application.type },
        ],
      },
    ]

    if (application.updatedAt !== application.submittedAt) {
      synthetic.push({
        id: `synth-stage-${application.id}`,
        agencyId: application.agencyId,
        propertyId: application.propertyId,
        actorUserId: application.agentId,
        actorName: agentName ?? 'Agency',
        action: 'updated the Application',
        at: application.updatedAt,
        changes: [{ field: 'Stage', from: '—', to: application.stage }],
      })
    }

    if (application.stage === 'Blocked' && application.blockedAt) {
      synthetic.push({
        id: `synth-block-${application.id}`,
        agencyId: application.agencyId,
        propertyId: application.propertyId,
        actorUserId: null,
        actorName: agentName ?? 'Agency',
        action: 'blocked an Applicant',
        at: application.blockedAt,
        changes: [
          { field: 'Stage', from: '—', to: 'Blocked' },
          ...(application.blockReason
            ? [{ field: 'Reason', from: '—', to: application.blockReason }]
            : []),
        ],
      })
    }

    const byId = new Map<string, PropertyEvent>()
    for (const ev of [...synthetic, ...related]) byId.set(ev.id, ev)
    return [...byId.values()]
  }, [application, state.propertyEvents, agentName])

  if (!application) {
    return (
      <RequirePermission permission="applications.view">
        <Card className="p-8 text-center">
          <p className="font-semibold text-ink">Applicant not found</p>
          <div className="mt-3 flex justify-center">
            <BackButton to="/workspace/sales/applications" label="Back to applicants" />
          </div>
        </Card>
      </RequirePermission>
    )
  }

  if (!inScope) {
    return <Navigate to="/workspace/sales/applications" replace />
  }

  const canReview = has('applications.review')
  const isTenant = role === 'tenant'

  const logStageChange = (from: string, to: string, action = 'changed the Application stage') => {
    addPropertyEvent({
      agencyId: application.agencyId,
      propertyId: application.propertyId,
      actorUserId: user.id,
      actorName: user.name,
      action,
      changes: [{ field: 'Stage', from, to }],
    })
  }

  const runAction = async (action: HateoasAction, capture?: WorkflowActionCapture) => {
    const workflowTarget = action.payload_hint?.workflowStatus as string | undefined
    const effect = action.payload_hint?.effect as string | undefined
    const status = action.payload_hint?.status
    if (action.key !== 'OPEN_CHECKOUT' && effect !== 'open_checkout') setCheckoutOpen(false)

    if (action.key === 'SCHEDULE_MOVE_IN' && capture?.moveInDate) {
      const prev = application.stage
      const agent = application.agentId
        ? state.users.find((u) => u.id === application.agentId)
        : null
      scheduleMoveIn(application.id, capture.moveInDate, {
        location: capture.keyLocation ?? 'Agency reception',
        instructions:
          capture.notes ?? 'Bring ID and signed lease. Collect keys from reception.',
        contactName: agent?.name ?? 'Agency office',
        contactPhone: agent?.phone ?? '',
      })
      // Mode A: ensure incoming PCR inspection object exists beside occupancy.
      const ensured = ensureIngoingInspection(
        { ...application, moveInDate: capture.moveInDate },
        new Date().toISOString(),
        capture.moveInDate,
      )
      if (ensured.created || ensured.inspection.scheduledOn !== application.pcrInspections?.find((i) => i.kind === 'incoming')?.scheduledOn) {
        updateApplication(application.id, { pcrInspections: ensured.application.pcrInspections })
      }
      logStageChange(prev, 'Move-In Scheduled', 'scheduled move-in')
      setFlash(null)
      return
    }

    if (action.key === 'COMPLETE_KEY_HANDOVER' || effect === 'key_handover') {
      const prev = application.stage
      const result = await advanceApplicationWorkflow({
        applicationId: application.id,
        actorUserId: user.id,
        targetStatus: (workflowTarget ?? 'keys_handed_over') as import('../lib/applicationWorkflow').WorkflowStatusKey,
      })
      if ('application' in result && result.status === 'SUCCESS') {
        logStageChange(prev, result.application.stage, 'completed key handover')
      }
      setFlash(null)
      return
    }

    if (workflowTarget && !status) {
      const prevStage = application.stage
      const result = await advanceApplicationWorkflow({
        applicationId: application.id,
        actorUserId: user.id,
        targetStatus: workflowTarget as import('../lib/applicationWorkflow').WorkflowStatusKey,
        signature: capture
          ? {
              signatureDataUrl: capture.signatureDataUrl,
              method: capture.signatureMethod,
              onBehalfConfirmation: capture.onBehalfConfirmation,
              ectaConsent: capture.ectaConsent,
              signerName: capture.signerName,
            }
          : undefined,
        capture,
      })
      if ('application' in result && result.status === 'SUCCESS') {
        logStageChange(prevStage, result.application.stage)
        if (effect === 'approve' && 'checkout' in result && result.checkout) {
          setFlash(result as PatchApplicationStatusResult)
          return
        }
      } else if ('error' in result && result.error) {
        window.alert(result.error)
      }
      setFlash(null)
      return
    }

    if (action.key === 'OPEN_CHECKOUT' || effect === 'open_checkout') {
      setFlash(null)
      setCheckoutOpen(true)
      return
    }
    if (!status) return
    const prevStage = application.stage
    // P0-approve: the store awaits the durable write and returns ERROR when it
    // fails, so a success flash only shows after the stage is committed.
    const result = await patchApplicationStatus({
      applicationId: application.id,
      actorUserId: user.id,
      request: {
        status: status as 'APPROVED' | 'REJECTED' | 'CREDIT_CHECK' | 'LEASE_SIGNED' | 'UNDER_REVIEW',
        reason: action.payload_hint?.reason,
        payment_provider: 'auto',
      },
    })
    if (result.status === 'SUCCESS') {
      logStageChange(prevStage, result.application.stage)
    }
    setFlash(result)
  }

  const stageRecord = (status: StageRecord['status'], extra: Partial<StageRecord> = {}): StageRecord => ({
    status,
    at: new Date().toISOString(),
    byName: user.name,
    ...extra,
  })

  const leaseSigned = LEASE_SIGNED.has(String(application.workflowStatus ?? ''))
  const depositStage = pipeline.stages.find((s) => s.kind === 'deposit')
  const stageHint = (stage: PipelineStage): string | null => {
    if (stage.kind === 'deposit' && application.depositProof?.status !== 'approved') {
      return 'Approve the proof of payment in the Deposit panel above. That records the deposit in Trust & Banking and approves this stage.'
    }
    if (stage.kind === 'lease' && !leaseSigned) {
      return 'The lease must be signed before this stage can be approved. Generate and send it from the Application tab.'
    }
    if (stage.kind === 'approval') {
      return 'Approving issues the approval to the applicant and creates their lease and invoices.'
    }
    return null
  }

  const approveStage = async (stage: PipelineStage, input: StageApproveInput) => {
    if (stage.kind === 'deposit' && application.depositProof?.status !== 'approved') {
      window.alert('Approve the proof of payment in the Deposit panel first.')
      return
    }
    if (stage.kind === 'lease' && !leaseSigned) {
      window.alert('The lease is not signed yet.')
      return
    }
    setStageBusy(true)
    try {
      const prevStage = application.stage
      if (stage.kind === 'approval') {
        const result = await approveApplication(application.id, { actorUserId: user.id })
        setFlash(result)
        if (result.status !== 'SUCCESS') return
      }
      updateApplication(application.id, {
        stageRecords: {
          ...(application.stageRecords ?? {}),
          [stage.key]: stageRecord('approved', {
            notes: input.notes || undefined,
            checklist: input.ticked.length ? input.ticked : undefined,
            attachments: input.attachments.length ? input.attachments : undefined,
          }),
        },
      })
      const targets = STAGE_WORKFLOW_TARGETS[stage.kind]
      if (targets) {
        const perms = rolePermissions[user.role] ?? []
        const next = getAvailableTransitions(application, perms, true).find((t) => targets.includes(t.to) && (!t.guard || t.guard(application) === true))
        const target = next?.to ?? null
        if (target && target !== resolveWorkflowStatus(application)) {
          const result = await advanceApplicationWorkflow({ applicationId: application.id, actorUserId: user.id, targetStatus: target })
          if ('application' in result && result.status === 'SUCCESS') logStageChange(prevStage, result.application.stage)
        }
      }
      addPropertyEvent({
        agencyId: application.agencyId,
        propertyId: application.propertyId,
        actorUserId: user.id,
        actorName: user.name,
        action: `approved the ${stage.label} stage`,
        changes: [{ field: 'Stage', from: stage.label, to: 'Approved' }],
      })
    } finally {
      setStageBusy(false)
    }
  }

  const declineStage = async (stage: PipelineStage, reason: string) => {
    setStageBusy(true)
    try {
      const prevStage = application.stage
      const result = await patchApplicationStatus({
        applicationId: application.id,
        actorUserId: user.id,
        request: { status: 'REJECTED', reason, payment_provider: 'auto' },
      })
      updateApplication(application.id, {
        declineReason: reason,
        stageRecords: { ...(application.stageRecords ?? {}), [stage.key]: stageRecord('declined', { reason }) },
        ...(result.status === 'SUCCESS' ? {} : { workflowStatus: 'rejected' as WorkflowStatusKey, stage: 'Rejected' }),
      })
      logStageChange(prevStage, 'Rejected', `declined the application at ${stage.label}`)
    } finally {
      setStageBusy(false)
    }
  }

  const reviewDepositProof = async (
    decision: { approve: true; amount: number } | { approve: false; reason: string },
  ): Promise<{ ok: boolean; error?: string }> => {
    const proof = application.depositProof
    if (!proof) return { ok: false, error: 'There is no proof of payment yet.' }
    const now = new Date().toISOString()
    if (decision.approve === false) {
      updateApplication(application.id, {
        depositProof: { ...proof, status: 'declined', declineReason: decision.reason, reviewedAt: now, reviewedByName: user.name },
      })
      return { ok: true }
    }
    const tenancy = state.tenancies.find((t) => t.applicationId === application.id)
    const expected = application.depositRequest?.amount ?? decision.amount
    const held = await upsertHeldDeposit({
      agencyId: application.agencyId,
      actorUserId: user.id,
      occupancyId: tenancy?.id ?? application.id,
      expectedCents: Math.round(expected * 100),
      heldCents: Math.round(decision.amount * 100),
    })
    if (!held.ok) return { ok: false, error: held.error ?? 'Trust & Banking could not record the deposit.' }
    updateApplication(application.id, {
      depositProof: { ...proof, status: 'approved', amount: decision.amount, reviewedAt: now, reviewedByName: user.name, declineReason: undefined },
      stageRecords: depositStage
        ? {
            ...(application.stageRecords ?? {}),
            [depositStage.key]: stageRecord('approved', { notes: `Deposit of R ${decision.amount.toLocaleString('en-ZA')} approved and recorded in Trust & Banking.` }),
          }
        : application.stageRecords,
    })
    const perms = rolePermissions[user.role] ?? []
    const next = getAvailableTransitions(application, perms, true).find((t) => t.to === 'deposit_paid' || t.to === 'deposit_verified')
    if (next) await advanceApplicationWorkflow({ applicationId: application.id, actorUserId: user.id, targetStatus: next.to })
    return { ok: true }
  }

  // C2: staff see this application's rows of the application's own agency.
  const agencyPayments = state.payments.filter((p) => p.agencyId === application.agencyId)
  const checkoutRows = applicationLedgerRows(agencyPayments, {
    applicationId: application.id,
    viewer: { mode: 'agent' },
  })

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
    { id: 'documents', label: 'Documents', count: application.documents.length },
    { id: 'residences', label: 'Residences', count: residences.length },
    { id: 'blocks', label: 'Blocks', count: blocks.length },
    { id: 'application', label: 'Application' },
    { id: 'history', label: 'History', count: historyEvents.length },
  ]

  return (
    <RequirePermission permission="applications.view">
      <div className="animate-fade-in">
        <ApplicantDetailHeader application={application} />

        <div className="sticky top-0 z-20 -mx-1 mb-5 bg-white/95 px-1 backdrop-blur-md">
          <DashboardTabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        {flash?.status === 'SUCCESS' && (
          <Card className="mb-5 border-primary-100 bg-primary-50/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold text-ink">{flash.layout.headline}</p>
                <p className="mt-1 text-sm text-ink-600">{flash.layout.next_step_copy}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {flash.layout.badges.map((b) => (
                    <Badge key={b} tone="brand">
                      {b}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            {flash.checkout && (
              <div className="mt-4">
                {/* C1: only the rows this approval durably saved (payment_ids), read live from the store. */}
                <ApplicationCheckoutCard
                  mode="agent"
                  canPay={has('payments.manage')}
                  rows={applicationLedgerRows(agencyPayments, {
                    applicationId: application.id,
                    viewer: { mode: 'agent' },
                    persistedDueIds: flash.checkout.payment_ids,
                  })}
                />
              </div>
            )}
          </Card>
        )}

        {checkoutOpen && !(flash?.status === 'SUCCESS' && flash.checkout) && (
          <div className="mb-5" data-testid="applicant-checkout">
            {checkoutRows.length > 0 ? (
              <ApplicationCheckoutCard mode="agent" canPay={has('payments.manage')} rows={checkoutRows} />
            ) : (
              <p className="rounded-xl bg-primary-50 px-3 py-2 text-sm text-ink-600">{AGENT_NO_ROWS_COPY}</p>
            )}
          </div>
        )}

        {flash?.status === 'ERROR' && (
          <p role="alert" className="mb-4 rounded-xl bg-accent-50 px-3 py-2 text-sm text-ink">
            {guidedTransitionError(flash)}
          </p>
        )}

        {canReview && !isTenant ? (
          <div className="mb-5">
            <DepositStepPanel
              application={application}
              agency={state.agencies.find((a) => a.id === application.agencyId)}
              depositAmount={Number((property as { deposit?: number } | undefined)?.deposit ?? 0)}
              mode="staff"
              actorName={user.name}
              onSave={(patch) => updateApplication(application.id, patch)}
              onReviewProof={reviewDepositProof}
            />
            <div className="mt-3">
              <AssignRoomCard
                application={application}
                property={property ?? undefined}
                actorName={user.name}
                onSave={(patch) => updateApplication(application.id, patch)}
              />
            </div>
          </div>
        ) : null}

        {tab === 'overview' && !isTenant && (
          <div className="mb-5">
            <ApplicationStagesPanel
              application={application}
              mode={canReview ? 'staff' : 'applicant'}
              busy={stageBusy}
              onApprove={approveStage}
              onDecline={declineStage}
              stageHint={stageHint}
            />
          </div>
        )}
        {tab === 'overview' && (
          <ApplicantOverviewPanel
            application={application}
            property={property}
            agentName={agentName}
            canAssignAgent={canReview && !isTenant}
            agents={agentsForAgency.map((u) => ({ id: u.id, name: u.name }))}
            onAssignAgent={(agentId) => updateApplication(application.id, { agentId })}
          />
        )}
        {tab === 'details' && (
          <ApplicantDetailsPanel
            application={application}
            agentName={agentName}
            canReview={canReview}
            checksPanel={<ScreeningChecksPanel applicationId={application.id} />}
            onOverrideScreening={async ({ newStatus, reason, score, externalReference }) => {
              const result = await overrideApplicationScreening({
                applicationId: application.id,
                actorUserId: user.id,
                newStatus,
                reason,
                score,
                externalReference,
              })
              if (result.ok === false) window.alert(result.error)
            }}
          />
        )}
        {tab === 'documents' && (
          <ApplicantDocumentsPanel
            application={application}
            canReview={canReview}
            isTenant={isTenant}
            onSetDocument={(key, next, note) => setDocumentStatus(application.id, key, next, note)}
            onUploadDocument={(key, file) =>
              uploadApplicationDocument(application.id, key, file, {
                userId: user.id,
                name: user.name,
              })
            }
          />
        )}
        {tab === 'residences' && <ApplicantResidencesPanel items={residences} />}
        {tab === 'blocks' && (
          <ApplicantBlocksPanel
            blocks={blocks}
            canReview={
              canReview &&
              application.stage !== 'Blocked' &&
              application.stage !== 'Active Tenancy'
            }
            onBlock={() => setBlockOpen(true)}
          />
        )}
        {tab === 'application' && (
          <ApplicantApplicationPanel
            application={application}
            property={property}
            agentName={agentName}
            actor={actor}
            canReview={canReview}
            applicantMode={isTenant}
            onRunAction={runAction}
            onSetDocument={(key, status, note) => setDocumentStatus(application.id, key, status, note)}
            onUploadDocument={(key, file) =>
              uploadApplicationDocument(application.id, key, file, {
                userId: user.id,
                name: user.name,
              })
            }
            onSaveDetails={(patch) => updateApplication(application.id, patch)}
          />
        )}
        {tab === 'history' && <ApplicantHistoryTimeline events={historyEvents} />}

        <BlockApplicantModal
          open={blockOpen}
          applicantName={application.applicantName}
          onClose={() => setBlockOpen(false)}
          onConfirm={(reason) => {
            const prevStage = application.stage
            blockApplication(application.id, reason)
            addPropertyEvent({
              agencyId: application.agencyId,
              propertyId: application.propertyId,
              actorUserId: user.id,
              actorName: user.name,
              action: 'blocked an Applicant',
              changes: [
                { field: 'Stage', from: prevStage, to: 'Blocked' },
                { field: 'Reason', from: '—', to: reason },
              ],
            })
            void alert.success({
              title: 'Applicant blocked',
              text: 'Reason recorded. Showings for this property were cancelled.',
            })
            setTab('blocks')
          }}
        />
      </div>
    </RequirePermission>
  )
}
