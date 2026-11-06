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
import { Badge, Button, Card, Input } from '../components/ui'
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
import { sweetWarning } from '../lib/sweetAlert'
import { openApplicationDocumentFile } from '../lib/applicationDocumentFile'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { ApplicationStagesPanel, type StageApproveInput } from '../components/pipeline/ApplicationStagesPanel'
import { useAgencyPipeline } from '../hooks/useApplicationPipeline'
import type { PipelineStage, StageRecord } from '../lib/pipeline/applicationPipeline'
import { workflowProgress, workflowStageLabel, type WorkflowStatusKey } from '../lib/applicationWorkflow'
import { STATUS_AFTER_APPROVAL, currentStage, effectiveStageRecords } from '../lib/pipeline/stageProgress'
import { applicationPassesScreeningSoftGate } from '../lib/screening'
import { findInspection } from '../lib/pcr'
import { LeaseSignCard } from '../components/lease/LeaseSignCard'
import { IdentityDocRows } from '../components/pipeline/IdentityDocRows'
import { Link } from 'react-router-dom'
import type { Application } from '../types/domain'

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
    notify,
    issueLeasePackage,
    updateTenancy,
    markPaymentPaid,
    updatePayment,
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
  const [moveInDraft, setMoveInDraft] = useState<string | null>(null)
  const [depositDraft, setDepositDraft] = useState<string | null>(null)
  const [keyPlaceDraft, setKeyPlaceDraft] = useState<string | null>(null)
  useMarkOpened('application', application?.id)
  // Opening the application counts as opening its compliance (document check) item.
  useMarkOpened('compliance', application?.id)

  const tabParam = params.get('tab')
  const askedTab: ApplicantDetailTab = isApplicantDetailTab(tabParam)
    ? tabParam
    : DEFAULT_APPLICANT_DETAIL_TAB
  // Rentals (staff): the stages on Overview are the application, so there is no separate Application tab.
  const tab: ApplicantDetailTab =
    askedTab === 'application' && application?.type === 'Rental' && has('applications.review') ? 'overview' : askedTab
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

  const linkedTenancy = state.tenancies.find((t) => t.applicationId === application.id && t.status !== 'Ended') ?? null
  const incomingPcr = findInspection(application, 'incoming')
  // No landlord on file: the agency is the lessor, so only the tenant signs.
  const hasLandlordBlock = Boolean(linkedTenancy?.eSign?.landlord)
  const landlordSigned = !hasLandlordBlock || linkedTenancy?.eSign?.landlord?.status === 'signed'
  const leaseBothSigned = linkedTenancy?.eSign?.tenant?.status === 'signed' && landlordSigned
  const tellApplicant = (title: string, body: string) => {
    if (!application.applicantUserId) return
    notify({ userId: application.applicantUserId, agencyId: application.agencyId, title, body, link: `/workspace/portals/tenant/applications/${application.id}` })
  }

  /** Save the stage decision (with any earlier progress filled in) and move the old status on. */
  const saveStageApproval = async (
    stage: PipelineStage,
    records: Record<string, StageRecord>,
    record: StageRecord,
    nextStatus?: WorkflowStatusKey,
  ): Promise<boolean> => {
    const ok = await updateApplication(application.id, {
      stageRecords: { ...records, [stage.key]: record },
      ...(nextStatus
        ? {
            workflowStatus: nextStatus,
            stage: workflowStageLabel(application.type, nextStatus) as Application['stage'],
            progress: workflowProgress(application.type, nextStatus),
          }
        : {}),
    })
    if (!ok) return false
    addPropertyEvent({
      agencyId: application.agencyId,
      propertyId: application.propertyId,
      actorUserId: user.id,
      actorName: user.name,
      action: `approved the ${stage.label} stage`,
      changes: [{ field: 'Stage', from: stage.label, to: 'Approved' }],
    })
    return true
  }

  const approveBlocked = (stage: PipelineStage): string | null => {
    if (stage.kind === 'approval') {
      const missing = ['id', 'address', 'fica'].filter((k) => !['uploaded', 'verified'].includes(application.documents.find((d) => d.key === k)?.status ?? ''))
      if (missing.length) return 'Upload the identity documents below first.'
    }
    if (stage.kind === 'lease') {
      if (!linkedTenancy) return 'The lease is created when the application is approved.'
      if (!linkedTenancy.eSign?.envelopeId) return 'Send the lease to the tenant first.'
      if (!leaseBothSigned) {
        const waiting = [
          linkedTenancy.eSign?.tenant?.status !== 'signed' ? 'the tenant' : null,
          !landlordSigned ? 'the landlord' : null,
        ].filter(Boolean)
        return `Waiting for ${waiting.join(' and ')} to sign.`
      }
    }
    if (stage.kind === 'move_in') {
      if (!incomingPcr) return 'Set the move-in date to open the move-in inspection.'
      if (!incomingPcr.staffSignature) return 'Complete the move-in inspection and sign it off as the agency.'
      if (!incomingPcr.tenantSignature) return 'Waiting for the tenant to sign the move-in inspection.'
    }
    return null
  }

  const approveStage = async (stage: PipelineStage, input: StageApproveInput) => {
    const blockedBy = approveBlocked(stage)
    if (blockedBy) return void (await sweetWarning('Not yet', blockedBy))
    setStageBusy(true)
    try {
      const record = stageRecord('approved', {
        notes: input.notes || undefined,
        checklist: input.ticked.length ? input.ticked : undefined,
        attachments: input.attachments.length ? input.attachments : undefined,
      })
      // Approving the documents confirms them as checked.
      const verifyKeys = stage.kind === 'approval' ? ['id', 'address', 'fica'] : (stage.requiredDocs ?? [])
      for (const key of verifyKeys) {
        // One at a time: each save must finish before the next one starts.
        if (application.documents.find((d) => d.key === key)?.status === 'uploaded') await setDocumentStatus(application.id, key, 'verified')
      }
      if ((stage.kind === 'credit_check' || stage.kind === 'approval') && !applicationPassesScreeningSoftGate(application)) {
        // The credit check is done outside the system: approving it is the record.
        await overrideApplicationScreening({
          applicationId: application.id,
          actorUserId: user.id,
          newStatus: 'passed',
          reason: input.notes || 'Credit check done outside the system and approved in the application stages.',
        })
      }
      if (stage.kind === 'approval') {
        // Let the document checks and the credit check record above land first.
        await new Promise((r) => setTimeout(r, 60))
        const result = await approveApplication(application.id, { actorUserId: user.id })
        setFlash(result)
        if (result.status !== 'SUCCESS') return
        updateApplication(application.id, { stageRecords: { ...input.records, [stage.key]: record } })
        tellApplicant(
          'Your application was approved',
          'Good news: your rental application was approved. Open your application to accept the offer, then pay the deposit and sign your lease.',
        )
        addPropertyEvent({
          agencyId: application.agencyId,
          propertyId: application.propertyId,
          actorUserId: user.id,
          actorName: user.name,
          action: 'approved the application',
          changes: [{ field: 'Stage', from: stage.label, to: 'Approved' }],
        })
        return
      }
      if (stage.kind === 'deposit') {
        await approveDeposit(input.records, input.notes)
        return
      }
      if (stage.kind === 'lease') {
        if (!(await saveStageApproval(stage, input.records, record, 'inspection_scheduled'))) return
        tellApplicant('Your lease is signed', 'Your lease is signed by everyone. Next: the move-in inspection and your keys.')
        return
      }
      if (stage.kind === 'move_in') {
        if (!(await saveStageApproval(stage, input.records, record, 'active_tenancy'))) return
        if (linkedTenancy && linkedTenancy.status !== 'Active') updateTenancy(linkedTenancy.id, { status: 'Active' })
        tellApplicant('Welcome home', 'Your move-in is complete and your tenancy is active. Your tenant portal has your lease, payments and maintenance.')
        return
      }
      await saveStageApproval(stage, input.records, record, STATUS_AFTER_APPROVAL[stage.kind])
    } finally {
      setStageBusy(false)
    }
  }

  const declineStage = async (stage: PipelineStage, reason: string) => {
    if (stage.kind === 'deposit') {
      declineDeposit(reason)
      return
    }
    setStageBusy(true)
    try {
      const prevStage = application.stage
      const records = effectiveStageRecords(pipeline, application)
      const result = await patchApplicationStatus({
        applicationId: application.id,
        actorUserId: user.id,
        request: { status: 'REJECTED', reason, payment_provider: 'auto' },
      })
      const saved = await updateApplication(application.id, {
        declineReason: reason,
        stageRecords: { ...records, [stage.key]: stageRecord('declined', { reason }) },
        ...(result.status === 'SUCCESS' ? {} : { workflowStatus: 'rejected' as WorkflowStatusKey, stage: 'Rejected' }),
      })
      if (!saved && result.status !== 'SUCCESS') return
      tellApplicant('Your application was declined', `Your rental application was declined. Reason: ${reason}`)
      logStageChange(prevStage, 'Rejected', `declined the application at ${stage.label}`)
    } finally {
      setStageBusy(false)
    }
  }

  const depositStage = pipeline.stages.find((s) => s.kind === 'deposit')
  // The deposit invoice raised on approval; the tenant may upload proof on it (Payments) or on the Deposit step.
  const depositPayments = state.payments.filter(
    (p) => p.applicationId === application.id && (p.type === 'Deposit' || p.type === 'Sale Deposit') && p.status !== 'Cancelled',
  )
  const depositProofFiles = [
    ...(application.depositProof && application.depositProof.status !== 'declined'
      ? [{ name: application.depositProof.name, mimeType: application.depositProof.mimeType, dataUrl: application.depositProof.dataUrl, at: application.depositProof.uploadedAt }]
      : []),
    ...depositPayments.flatMap((p) => (p.attachments ?? []).map((a) => ({ name: a.name, mimeType: a.mimeType, dataUrl: a.dataUrl, at: a.uploadedAt }))),
  ]
  const depositDefault =
    depositPayments[0]?.amount ?? application.depositRequest?.amount ?? application.depositProof?.amount ?? Number((property as { deposit?: number } | undefined)?.deposit ?? 0)
  const depositAmountText = depositDraft ?? (depositDefault ? String(depositDefault) : '')

  /** Approve the deposit: held in Trust & Banking, invoice marked paid, stage approved. */
  const approveDeposit = async (records: Record<string, StageRecord>, notes: string): Promise<boolean> => {
    const amount = Number(depositAmountText)
    if (!Number.isFinite(amount) || amount <= 0) {
      await sweetWarning('Amount needed', 'Enter the deposit amount that reached the account.')
      return false
    }
    const occupancyId = linkedTenancy?.id ?? application.id
    // Approving again (e.g. after a failed save) updates the same register row.
    const existingHolding = state.depositHoldings.find(
      (d) => d.occupancyId === occupancyId && (d.status === 'held' || d.status === 'expected'),
    )
    const held = await upsertHeldDeposit({
      agencyId: application.agencyId,
      actorUserId: user.id,
      occupancyId,
      ...(existingHolding ? { depositId: existingHolding.id } : {}),
      expectedCents: Math.round((depositDefault || amount) * 100),
      heldCents: Math.round(amount * 100),
    })
    if (!held.ok) {
      await sweetWarning('Not saved', held.error ?? 'Trust & Banking could not record the deposit.')
      return false
    }
    for (const p of depositPayments) {
      if (p.status !== 'Paid') {
        markPaymentPaid(p.id, { method: 'EFT', paidAmount: amount, notes: 'Deposit approved in the application stages.', recordedByUserId: user.id, recordedByName: user.name })
      }
    }
    if (application.depositProof) {
      updateApplication(application.id, {
        depositProof: { ...application.depositProof, status: 'approved', amount, reviewedAt: new Date().toISOString(), reviewedByName: user.name, declineReason: undefined },
      })
    }
    if (depositStage) {
      await saveStageApproval(
        depositStage,
        records,
        stageRecord('approved', { notes: notes || `Deposit of R ${amount.toLocaleString('en-ZA')} received and recorded in Trust & Banking.` }),
        STATUS_AFTER_APPROVAL.deposit,
      )
    }
    tellApplicant('Deposit received', 'Your deposit was received. Next: your lease, which you can read and sign in the app.')
    return true
  }

  /** Decline the deposit proof: the tenant uploads a new one (the application carries on). */
  const declineDeposit = (reason: string) => {
    const now = new Date().toISOString()
    if (application.depositProof) {
      updateApplication(application.id, {
        depositProof: { ...application.depositProof, status: 'declined', declineReason: reason, reviewedAt: now, reviewedByName: user.name },
      })
    }
    for (const p of depositPayments) {
      if (p.status !== 'Paid' && p.attachments?.length) {
        updatePayment(p.id, { attachments: [], notes: `Proof of payment declined: ${reason}. Please upload a new one.` })
      }
    }
    tellApplicant('Proof of payment declined', `Your deposit proof of payment was declined: ${reason}. Please upload a new one.`)
  }
  const sendLease = async () => {
    if (!linkedTenancy) return
    setStageBusy(true)
    try {
      const res = await issueLeasePackage(linkedTenancy.id, { userId: user.id, name: user.name })
      if (!res.ok) return void (await sweetWarning('The lease was not sent', res.error ?? 'Try again.'))
      await updateApplication(application.id, {
        workflowStatus: 'lease_sent',
        stage: workflowStageLabel(application.type, 'lease_sent') as Application['stage'],
        progress: workflowProgress(application.type, 'lease_sent'),
      })
      tellApplicant('Your lease is ready to sign', 'Your lease agreement is ready. Open your application to read it, download it and sign it in the app.')
    } finally {
      setStageBusy(false)
    }
  }

  const moveInDate = moveInDraft ?? application.moveInDate ?? linkedTenancy?.startDate ?? ''
  const keyPlace = keyPlaceDraft ?? application.keyCollection?.location ?? ''
  const setMoveInDate = setMoveInDraft
  const setKeyPlace = setKeyPlaceDraft
  const saveMoveIn = () => {
    if (!moveInDate) return
    const agent = application.agentId ? state.users.find((u) => u.id === application.agentId) : null
    scheduleMoveIn(application.id, moveInDate, {
      location: keyPlace.trim() || 'Agency office',
      instructions: 'Bring your ID. We walk through the move-in inspection together, then you collect your keys.',
      contactName: agent?.name ?? 'Agency office',
      contactPhone: agent?.phone ?? '',
    })
    const ensured = ensureIngoingInspection({ ...application, moveInDate }, new Date().toISOString(), moveInDate)
    updateApplication(application.id, { pcrInspections: ensured.application.pcrInspections })
  }

  const stageBody = (stage: PipelineStage) => {
    if (stage.kind === 'approval') {
      return (
        <div className="space-y-2">
          <IdentityDocRows
            application={application}
            onUpload={(key, file) => uploadApplicationDocument(application.id, key, file, { userId: user.id, name: user.name })}
          />
          <p className="text-sm text-ink-600">
            Approving creates the lease and the deposit and rent invoices, and emails the applicant to accept the offer.
          </p>
        </div>
      )
    }
    if (stage.kind === 'deposit') {
      return (
        <div className="space-y-3">
          {application.offerResponse?.status === 'accepted' ? (
            <p className="text-sm text-emerald-700">The applicant accepted the offer on {new Date(application.offerResponse.at).toLocaleDateString('en-ZA')}.</p>
          ) : (
            <p className="text-sm text-amber-800">Waiting for the applicant to accept the offer. You can send the deposit details now.</p>
          )}
          <div className="space-y-2 rounded-xl border border-primary-100 bg-white p-3">
            <p className="text-sm font-semibold text-ink">Proof of payment</p>
            {depositProofFiles.length ? (
              <ul className="space-y-1">
                {depositProofFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                    {f.at ? <span className="text-xs text-ink-500">{new Date(f.at).toLocaleDateString('en-ZA')}</span> : null}
                    <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={() => openApplicationDocumentFile(f)}>
                      View
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-amber-800">No proof uploaded yet. Approve only once you have confirmed the money is in the account.</p>
            )}
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-ink-500">Amount received (R)</span>
              <Input type="number" className="w-48" value={depositAmountText} onChange={(e) => setDepositDraft(e.target.value)} />
            </label>
            <p className="text-xs text-ink-500">Approve records the deposit as held in Trust &amp; Banking and marks the deposit invoice paid. Decline asks the tenant for a new proof.</p>
          </div>
          <DepositStepPanel
            application={application}
            agency={state.agencies.find((a) => a.id === application.agencyId)}
            depositAmount={Number((property as { deposit?: number } | undefined)?.deposit ?? 0)}
            mode="staff"
            actorName={user.name}
            onSave={(patch) => updateApplication(application.id, patch)}
            alwaysShow
          />
          <AssignRoomCard
            application={application}
            property={property ?? undefined}
            actorName={user.name}
            onSave={(patch) => updateApplication(application.id, patch)}
          />
        </div>
      )
    }
    if (stage.kind === 'lease') {
      if (!linkedTenancy) return <p className="text-sm text-ink-600">The lease is created when the application is approved.</p>
      return (
        <div className="space-y-3">
          {!linkedTenancy.eSign?.envelopeId ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary-100 bg-white p-3">
              <p className="min-w-0 flex-1 text-sm text-ink-600">The lease is ready. Send it to the tenant to read and sign.</p>
              <Button size="sm" disabled={stageBusy} onClick={() => void sendLease()}>
                Send lease to the tenant
              </Button>
            </div>
          ) : (
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              <li className="rounded-xl border border-primary-100 bg-white px-3 py-2">
                Tenant: <strong>{linkedTenancy.eSign?.tenant?.status === 'signed' ? 'Signed' : 'Not signed yet'}</strong>
              </li>
              <li className="rounded-xl border border-primary-100 bg-white px-3 py-2">
                Landlord:{' '}
                <strong>{!hasLandlordBlock ? 'Not needed (the agency is the lessor)' : landlordSigned ? 'Signed' : 'Not signed yet'}</strong>
              </li>
            </ul>
          )}
          <LeaseSignCard tenancy={linkedTenancy} party={hasLandlordBlock ? 'landlord' : 'tenant'} title="Lease agreement" staff />
        </div>
      )
    }
    if (stage.kind === 'move_in') {
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold text-ink-500">Move-in date</span>
              <Input type="date" value={moveInDate} onChange={(e) => setMoveInDate(e.target.value)} />
            </label>
            <label className="min-w-0 flex-1 text-sm">
              <span className="mb-1 block text-xs font-semibold text-ink-500">Where to collect the keys</span>
              <Input value={keyPlace} placeholder="e.g. Agency office, 12 Main Road" onChange={(e) => setKeyPlace(e.target.value)} />
            </label>
            <Button size="sm" variant="secondary" disabled={!moveInDate} onClick={saveMoveIn}>
              {application.moveInDate ? 'Update move-in' : 'Save move-in date'}
            </Button>
          </div>
          {incomingPcr ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary-100 bg-white p-3 text-sm">
              <span className="min-w-0 flex-1">
                Move-in inspection: agency{' '}
                <strong>{incomingPcr.staffSignature ? 'signed' : 'not signed yet'}</strong>, tenant{' '}
                <strong>{incomingPcr.tenantSignature ? 'signed' : 'not signed yet'}</strong>
              </span>
              <Link to={`/workspace/sales/applications/${application.id}/inspection`} className="font-semibold text-primary hover:underline">
                Open the inspection
              </Link>
            </div>
          ) : null}
          <p className="text-xs text-ink-500">You complete and sign the inspection first; the tenant then signs it in their portal.</p>
        </div>
      )
    }
    return null
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
    // Rentals: the stages on Overview are the application; the Application tab is for purchases.
    ...(application.type === 'Rental' && !isTenant ? [] : [{ id: 'application', label: 'Application' }]),
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

        {(tab === 'overview' || (tab === 'application' && application.type === 'Rental')) && !isTenant && canReview && (
          <div className="mb-5">
            <ApplicationStagesPanel
              application={application}
              busy={stageBusy}
              onApprove={approveStage}
              onDecline={declineStage}
              stageBody={stageBody}
              approveBlocked={approveBlocked}
              onUploadDocument={(key, file) => uploadApplicationDocument(application.id, key, file, { userId: user.id, name: user.name })}
            />
            {linkedTenancy?.eSign?.envelopeId && currentStage(pipeline, application).index > pipeline.stages.filter((s) => s.enabled).findIndex((s) => s.kind === 'lease') ? (
              <div className="mt-4">
                <LeaseSignCard tenancy={linkedTenancy} party={linkedTenancy.eSign?.landlord ? 'landlord' : 'tenant'} title="Lease agreement" staff />
              </div>
            ) : null}
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
        {tab === 'application' && (application.type !== 'Rental' || isTenant || !canReview) && (
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
