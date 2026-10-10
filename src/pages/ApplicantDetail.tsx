import { useMemo, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { CreditCard, Wallet } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { resolveApplicationAgentName } from '../lib/agentDisplay'
import { ensureIngoingInspection } from '../lib/pcr'
import { rolePermissions } from '../lib/permissions'
import { RequirePermission } from '../components/RequirePermission'
import { BackButton } from '../components/BackButton'
import { DashboardTabs } from '../components/dashboard/DashboardTabs'
import { Badge, Button, Card } from '../components/ui'
import { ApplicantDetailHeader } from '../components/applicant-detail/ApplicantDetailHeader'
import { ApplicantOverviewPanel } from '../components/applicant-detail/ApplicantOverviewPanel'
import { ApplicantDetailsPanel } from '../components/applicant-detail/ApplicantDetailsPanel'
import { ApplicantDocumentsPanel } from '../components/applicant-detail/ApplicantDocumentsPanel'
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
import { buildCheckoutBridge, guidedTransitionError, type PatchApplicationStatusResult } from '../lib/api/applicationStatusApi'
import type { HateoasAction } from '../lib/api/contracts'
import type { WorkflowActionCapture } from '../lib/workflowActionForms'
import type { PropertyEvent } from '../types/domain'
import { formatZAR } from '../data/seed'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'

const ICON_STROKE = 1.6

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
    captureApplicationScreeningConsent,
    startApplicationScreening,
    overrideApplicationScreening,
  } = useStore()
  const { user, has } = useAuth()
  const { dealVisible, role } = usePropertyScope()
  const alert = useSuiteAlert()

  const [blockOpen, setBlockOpen] = useState(false)
  const [flash, setFlash] = useState<PatchApplicationStatusResult | null>(null)

  const application = state.applications.find((a) => a.id === id)

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
              signerName: capture.signerName,
            }
          : undefined,
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
      const duePayments = state.payments.filter(
        (p) => p.applicationId === application.id && p.status === 'Due',
      )
      const amount = duePayments.reduce((sum, p) => sum + p.amount, 0) || (property?.rent ?? 0) * 3
      const checkout = buildCheckoutBridge({
        application,
        propertyTitle: property?.title ?? 'Property',
        amountZar: amount,
        paymentId: duePayments[0]?.id ?? `PAY-checkout-${application.id}`,
        provider: 'payfast',
      })
      setFlash({
        status: 'SUCCESS',
        httpStatus: 200,
        application,
        previous_status: application.stage,
        api_status: 'APPROVED',
        display_metadata: {
          updated_relative: 'Checkout ready',
          status_label: 'Awaiting Payment',
          primary_amount_label: formatZAR(amount),
          timezone: 'Africa/Johannesburg',
        },
        actions: [],
        side_effects: {
          lease: null,
          payments: [],
          unit_id: null,
          unit_status: null,
          cancelled_viewing_ids: [],
          cancelled_slot_ids: [],
          booking_collisions: [],
        },
        checkout,
        invoice: {
          id: checkout.payment_id,
          total_zar: amount,
          line_items: duePayments.map((p) => ({ label: p.type, amount: p.amount })),
          due_date: duePayments[0]?.dueDate ?? new Date().toISOString().slice(0, 10),
        },
        layout: {
          headline: 'PayFast checkout bridge',
          success_state: 'APPROVED_CHECKOUT',
          badges: ['Awaiting Payment'],
          next_step_copy: 'Complete payment to unlock lease signing and move-in.',
        },
      })
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
              {flash.checkout && (
                <div className="min-w-[240px] rounded-xl border border-primary-100 bg-white p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold text-ink">
                    <CreditCard className="h-4 w-4 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
                    Checkout
                  </p>
                  <p className="mt-2 tabular text-lg font-bold">
                    {formatZAR(flash.checkout.amount_zar)}
                  </p>
                  <Button
                    className="mt-3 min-h-11 w-full"
                    onClick={() => window.open(flash.checkout!.checkout_url, '_blank', 'noopener')}
                  >
                    <Wallet className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                    Open checkout
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}

        {flash?.status === 'ERROR' && (
          <p role="alert" className="mb-4 rounded-xl bg-accent-50 px-3 py-2 text-sm text-ink">
            {guidedTransitionError(flash)}
          </p>
        )}

        {tab === 'overview' && (
          <ApplicantOverviewPanel
            application={application}
            property={property}
            agentName={agentName}
          />
        )}
        {tab === 'details' && (
          <ApplicantDetailsPanel
            application={application}
            agentName={agentName}
            canReview={canReview}
            onCaptureConsent={() =>
              captureApplicationScreeningConsent(application.id, {
                grantedBy: user.id,
                method: 'staff',
                note: 'Staff-recorded POPIA consent',
              })
            }
            onStartScreening={async () => {
              const result = await startApplicationScreening({
                applicationId: application.id,
                actorUserId: user.id,
              })
              if (result.ok === false) window.alert(result.error)
            }}
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
