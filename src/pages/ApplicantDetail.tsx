import { useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { CreditCard, Wallet } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { isFieldAgent, rolePermissions } from '../lib/permissions'
import { RequirePermission } from '../components/RequirePermission'
import { DashboardTabs } from '../components/dashboard/DashboardTabs'
import { Badge, Button, Card } from '../components/ui'
import { ApplicantDetailHeader } from '../components/applicant-detail/ApplicantDetailHeader'
import { ApplicantOverviewPanel } from '../components/applicant-detail/ApplicantOverviewPanel'
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
import { BlockApplicantModal } from '../components/applicant-detail/BlockApplicantModal'
import {
  isApplicantDetailTab,
  type ApplicantDetailTab,
} from '../components/applicant-detail/types'
import { buildCheckoutBridge, type PatchApplicationStatusResult } from '../lib/api/applicationStatusApi'
import type { HateoasAction } from '../lib/api/contracts'
import { formatZAR } from '../data/seed'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'

const ICON_STROKE = 1.6

export default function ApplicantDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const {
    state,
    setDocumentStatus,
    patchApplicationStatus,
    scheduleMoveIn,
    completeKeyHandover,
    blockApplication,
    addPropertyEvent,
  } = useStore()
  const { user, has } = useAuth()
  const { scopeAgency, scopeAgent, role } = useAgencyScope()
  const alert = useSuiteAlert()

  const [blockOpen, setBlockOpen] = useState(false)
  const [moveInOpen, setMoveInOpen] = useState(false)
  const [moveInDate, setMoveInDate] = useState('2026-08-01')
  const [keyLoc, setKeyLoc] = useState('Agency reception')
  const [flash, setFlash] = useState<PatchApplicationStatusResult | null>(null)

  const application = state.applications.find((a) => a.id === id)

  const tabParam = params.get('tab')
  const tab: ApplicantDetailTab = isApplicantDetailTab(tabParam) ? tabParam : 'overview'
  const setTab = (next: string) => {
    const sp = new URLSearchParams(params)
    if (next === 'overview') sp.delete('tab')
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
    if (!scopeAgency(application.agencyId)) return false
    if (isFieldAgent(role) && !scopeAgent(application.agentId)) return false
    return true
  }, [application, role, user, scopeAgency, scopeAgent])

  const property = useMemo(
    () =>
      application
        ? state.properties.find((p) => p.id === application.propertyId) ?? null
        : null,
    [application, state.properties],
  )

  const agentName = useMemo(() => {
    if (!application?.agentId) return null
    return state.users.find((u) => u.id === application.agentId)?.name ?? null
  }, [application, state.users])

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

  if (!application) {
    return (
      <RequirePermission permission="applications.view">
        <Card className="p-8 text-center">
          <p className="font-semibold text-ink">Applicant not found</p>
          <Link
            to="/workspace/sales/applications"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            Back to applicants
          </Link>
        </Card>
      </RequirePermission>
    )
  }

  if (!inScope) {
    return <Navigate to="/workspace/sales/applications" replace />
  }

  const canReview = has('applications.review')
  const isTenant = role === 'tenant'

  const runAction = (action: HateoasAction) => {
    const status = action.payload_hint?.status
    if (action.key === 'COMPLETE_KEY_HANDOVER') {
      completeKeyHandover(application.id)
      setFlash(null)
      return
    }
    if (action.key === 'OPEN_CHECKOUT') {
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
    const result = patchApplicationStatus({
      applicationId: application.id,
      actorUserId: user.id,
      request: {
        status: status as 'APPROVED' | 'REJECTED' | 'CREDIT_CHECK' | 'LEASE_SIGNED' | 'UNDER_REVIEW',
        reason: action.payload_hint?.reason,
        payment_provider: 'auto',
      },
    })
    setFlash(result)
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents', count: application.documents.length },
    { id: 'residences', label: 'Residences', count: residences.length },
    { id: 'blocks', label: 'Blocks', count: blocks.length },
    { id: 'application', label: 'Application' },
  ]

  return (
    <RequirePermission permission="applications.view">
      <div className="animate-fade-in">
        <ApplicantDetailHeader
          application={application}
          propertyTitle={property?.title ?? application.propertyId}
          isBlocked={blocks.length > 0}
          canReview={canReview}
          onBlock={() => setBlockOpen(true)}
        />

        <DashboardTabs tabs={tabs} value={tab} onChange={setTab} className="mb-5" />

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
            {flash.error}
          </p>
        )}

        {tab === 'overview' && (
          <ApplicantOverviewPanel
            application={application}
            property={property}
            agentName={agentName}
          />
        )}
        {tab === 'documents' && (
          <ApplicantDocumentsPanel
            application={application}
            canReview={canReview}
            isTenant={isTenant}
            onSetDocument={(key, next) => setDocumentStatus(application.id, key, next)}
          />
        )}
        {tab === 'residences' && <ApplicantResidencesPanel items={residences} />}
        {tab === 'blocks' && <ApplicantBlocksPanel blocks={blocks} />}
        {tab === 'application' && (
          <ApplicantApplicationPanel
            application={application}
            property={property}
            agentName={agentName}
            actor={actor}
            canReview={canReview}
            moveInOpen={moveInOpen}
            moveInDate={moveInDate}
            keyLoc={keyLoc}
            onMoveInDate={setMoveInDate}
            onKeyLoc={setKeyLoc}
            onRunAction={runAction}
            onOpenMoveIn={() => setMoveInOpen(true)}
            onConfirmMoveIn={() => {
              const agent = application.agentId
                ? state.users.find((u) => u.id === application.agentId)
                : null
              scheduleMoveIn(application.id, moveInDate, {
                location: keyLoc,
                instructions: 'Bring ID and signed lease. Collect keys from reception.',
                contactName: agent?.name ?? 'Agency office',
                contactPhone: agent?.phone ?? '',
              })
              setMoveInOpen(false)
            }}
          />
        )}

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
