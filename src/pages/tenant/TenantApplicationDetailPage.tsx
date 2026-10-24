import { useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { CreditCard, FileText, KeyRound, MapPin, Wallet } from 'lucide-react'
import { useStore, usePublicProperties } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { resolveApplicationAgentName } from '../../lib/agentDisplay'
import { RequirePermission } from '../../components/RequirePermission'
import { PortalSkeleton } from '../../components/PortalHydrationGate'
import { ActionButtonRow } from '../../components/ActionButtonRow'
import { BackButton } from '../../components/BackButton'
import {
  DashboardBreadcrumb,
  DashboardPage,
  SectionBanner,
} from '../../components/dashboard'
import { DashboardTabs } from '../../components/dashboard/DashboardTabs'
import { ApplicantApplicationPanel } from '../../components/applicant-detail/ApplicantApplicationPanel'
import { ApplicantDocumentsPanel } from '../../components/applicant-detail/ApplicantDocumentsPanel'
import { TenantApplicationDetailsForm } from '../../components/tenant/TenantApplicationDetailsForm'
import { TenantCreditConsentPanel } from '../../components/tenant/TenantCreditConsentPanel'
import { screeningApiAvailable } from '../../lib/api/screeningApi'
import { needsCreditConsentTask } from '../../lib/screening/creditConsent'
import { TenantApplicationPaymentsPanel } from '../../components/tenant/TenantApplicationPaymentsPanel'
import { Badge, Button, Card, cn, statusTone } from '../../components/ui'
import { rolePermissions } from '../../lib/permissions'
import { getApplicantTasks } from '../../lib/applicantPortalActions'
import { ownTenancyForApplication } from '../../lib/tenantOccupancy'
import {
  resolveWorkflowStatus,
  workflowProgress,
  workflowStageLabel,
} from '../../lib/applicationWorkflow'
import { buildCheckoutBridge, guidedTransitionError, type PatchApplicationStatusResult } from '../../lib/api/applicationStatusApi'
import { sweetError } from '../../lib/sweetAlert'
import { hideBackendUuid, labelOrReference } from '../../lib/displayIds'
import type { HateoasAction } from '../../lib/api/contracts'
import type { WorkflowActionCapture } from '../../lib/workflowActionForms'
import { formatZAR } from '../../data/seed'

const ICON_STROKE = 1.6
type Tab = 'application' | 'documents' | 'details' | 'payments'

export default function TenantApplicationDetailPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const {
    state,
    hydratedForUserId,
    setDocumentStatus,
    uploadApplicationDocument,
    updateApplication,
    updatePayment,
    advanceApplicationWorkflow,
    captureApplicationScreeningConsent,
  } = useStore()
  const { user, authReady } = useAuth()
  const publicProperties = usePublicProperties()

  const tab = (['application', 'documents', 'details', 'payments'] as const).includes(
    params.get('tab') as Tab,
  )
    ? (params.get('tab') as Tab)
    : 'application'

  const setTab = (next: string) => {
    const sp = new URLSearchParams(params)
    if (next === 'application') sp.delete('tab')
    else sp.set('tab', next)
    setParams(sp, { replace: true })
  }

  const application = state.applications.find((a) => a.id === id)
  const inScope =
    application &&
    (application.applicantUserId === user.id || application.email === user.email)

  const property = useMemo(
    () =>
      application
        ? publicProperties.find((p) => p.id === application.propertyId) ??
          state.properties.find((p) => p.id === application.propertyId) ??
          null
        : null,
    [application, publicProperties, state.properties],
  )

  const agentName = useMemo(() => {
    // P0-agent (R8): one shared resolver — the listing's real assigned agent
    // only. The application row's agent_id is stale-prone (earlier write
    // paths defaulted it); it must never surface as a person here.
    return resolveApplicationAgentName(property, application, state.users)
  }, [application, property, state.users])

  const payments = useMemo(
    () => state.payments.filter((p) => p.applicationId === application?.id),
    [state.payments, application?.id],
  )

  // Fail-closed APP→TN join: own application only (inScope).
  const linkedTenancy = useMemo(
    () =>
      application && inScope
        ? ownTenancyForApplication(state.tenancies, application.id, user)
        : undefined,
    [state.tenancies, application, inScope, user],
  )

  const tasks = useMemo(
    () => (application ? getApplicantTasks(application, payments) : []),
    [application, payments],
  )

  const [flash, setFlash] = useState<PatchApplicationStatusResult | null>(null)

  const actor = useMemo(
    () => ({
      userId: user.id,
      role: user.role,
      agencyId: user.agencyId,
      permissions: rolePermissions[user.role] ?? [],
    }),
    [user],
  )

  const awaitingHydration =
    authReady && user.id !== 'guest' && hydratedForUserId !== user.id

  if (awaitingHydration) {
    return (
      <RequirePermission permission="portal.tenant">
        <PortalSkeleton />
      </RequirePermission>
    )
  }

  if (!application) {
    return (
      <RequirePermission permission="portal.tenant">
        <Card className="p-8 text-center">
          <p className="font-semibold text-ink">Application not found</p>
          <div className="mt-3 flex justify-center">
            <BackButton to="/workspace/portals/tenant/applications" label="Back to applications" />
          </div>
        </Card>
      </RequirePermission>
    )
  }

  if (!inScope) {
    return <Navigate to="/workspace/portals/tenant/applications" replace />
  }

  const workflowStatus = resolveWorkflowStatus(application)
  const progress = workflowProgress(application.type, workflowStatus)

  const runAction = async (action: HateoasAction, capture?: WorkflowActionCapture) => {
    const workflowTarget = action.payload_hint?.workflowStatus as string | undefined
    const effect = action.payload_hint?.effect as string | undefined

    if (workflowTarget && action.key !== 'OPEN_CHECKOUT') {
      const result = await advanceApplicationWorkflow({
        applicationId: application.id,
        actorUserId: user.id,
        targetStatus: workflowTarget as import('../../lib/applicationWorkflow').WorkflowStatusKey,
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
        setFlash(null)
      } else if ('error' in result && result.error) {
        // P0-1 (R4): actionable copy instead of a raw engine error alert.
        void sweetError('Action not available', guidedTransitionError(result))
      }
      return
    }

    if (action.key === 'OPEN_CHECKOUT' || effect === 'open_checkout') {
      const duePayments = payments.filter((p) => p.status === 'Due' || p.status === 'Overdue')
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
          headline: 'PayFast checkout',
          success_state: 'APPROVED_CHECKOUT',
          badges: ['Awaiting Payment'],
          next_step_copy: 'Complete payment, then record your reference on the Payments tab if paying by EFT.',
        },
      })
    }
  }

  const tabs = [
    { id: 'application', label: 'Application', count: tasks.length || undefined },
    { id: 'documents', label: 'Documents', count: application.documents.length },
    { id: 'details', label: 'Your details' },
    { id: 'payments', label: 'Payments', count: payments.length || undefined },
  ]

  return (
    <RequirePermission permission="portal.tenant">
      <DashboardPage>
        <DashboardBreadcrumb
          items={[
            { label: 'Dashboard', to: '/workspace/portals/tenant' },
            { label: 'My applications', to: '/workspace/portals/tenant/applications' },
            { label: labelOrReference(property?.title, application.id, 'Application') },
          ]}
        />

        <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_280px]">
          <Card className="overflow-hidden p-0">
            {property?.images[0] ? (
              <div className="aspect-[21/9] max-h-48 w-full overflow-hidden bg-primary-50">
                <img
                  src={property.images[0]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-semibold text-ink">
                    {labelOrReference(property?.title, application.propertyId, 'Property')}
                  </h1>
                  {property ? (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500">
                      <MapPin className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                      {property.suburb}, {property.city}
                      {property.rent ? ` · ${formatZAR(property.rent)}/mo` : ''}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-400">{hideBackendUuid(application.id)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={statusTone(application.stage)}>{application.stage}</Badge>
                  <ActionButtonRow className="w-auto">
                    <BackButton to="/workspace/portals/tenant/applications" label="All applications" />
                  </ActionButtonRow>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-primary-50">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-ink-500">
                {workflowStageLabel(application.type, workflowStatus)} · {progress}% complete
              </p>
              {property ? (
                <Link
                  to={`/listing/${property.id}`}
                  className="mt-3 inline-flex text-sm font-semibold text-primary"
                >
                  View listing
                </Link>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Agency contact</p>
            <p className="mt-1 font-semibold text-ink">{agentName ?? 'Assigned soon'}</p>
            <p className="mt-1 text-xs text-ink-500">
              {state.agencies.find((a) => a.id === application.agencyId)?.name ?? 'Agency'}
            </p>
            <Link
              to="/workspace/portals/tenant/messages"
              className="mt-3 inline-flex text-sm font-semibold text-primary"
            >
              Message agency
            </Link>
          </Card>
        </div>

        {linkedTenancy ? (
          <Card className="mb-5 p-4" data-testid="tenant-app-linked-tenancy">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">
                  Linked tenancy
                </p>
                <p className="mt-1 font-semibold tabular text-ink">
                  {hideBackendUuid(linkedTenancy.id)}
                </p>
                <p className="mt-0.5 text-sm text-ink-500">
                  {linkedTenancy.startDate}
                  {linkedTenancy.endDate ? ` → ${linkedTenancy.endDate}` : ' · open-ended'}
                  {linkedTenancy.rent ? ` · ${formatZAR(linkedTenancy.rent)}/mo` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge tone={statusTone(linkedTenancy.status)}>{linkedTenancy.status}</Badge>
                {application.stage ? (
                  <Badge tone="neutral">{application.stage}</Badge>
                ) : null}
              </div>
            </div>
            {(linkedTenancy.keyCollection?.location?.trim() ||
              linkedTenancy.keyCollection?.instructions?.trim() ||
              linkedTenancy.leasePdfUrl?.trim()) && (
              <div className="mt-3 flex flex-wrap gap-4 border-t border-primary-50 pt-3 text-sm">
                {linkedTenancy.keyCollection?.location?.trim() ||
                linkedTenancy.keyCollection?.instructions?.trim() ? (
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">
                      <KeyRound className="h-3.5 w-3.5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
                      Keys
                    </p>
                    <p className="mt-1 font-semibold text-ink">
                      {linkedTenancy.keyCollection.location || 'Key collection'}
                    </p>
                    {linkedTenancy.keyCollection.instructions ? (
                      <p className="mt-0.5 text-xs text-ink-500">
                        {linkedTenancy.keyCollection.instructions}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {linkedTenancy.leasePdfUrl?.trim() ? (
                  <a
                    href={linkedTenancy.leasePdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    Lease PDF
                  </a>
                ) : null}
              </div>
            )}
          </Card>
        ) : null}

        {tasks.length > 0 && (
          <SectionBanner
            tone="info"
            text={`${tasks.length} action${tasks.length === 1 ? '' : 's'} needed on this application`}
          />
        )}

        {tasks.length > 0 && (
          <ul className="mb-5 grid gap-2 sm:grid-cols-2">
            {tasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => setTab(task.section === 'application' ? 'application' : task.section)}
                  className={cn(
                    'flex w-full min-h-14 cursor-pointer flex-col rounded-2xl border px-4 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    task.tone === 'primary'
                      ? 'border-primary-200 bg-primary-50/80 hover:bg-primary-50'
                      : 'border-primary-100 bg-white hover:bg-primary-50/40',
                  )}
                >
                  <span className="text-sm font-semibold text-ink">{task.label}</span>
                  <span className="mt-0.5 text-xs text-ink-500">{task.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {flash?.status === 'SUCCESS' && flash.checkout && (
          <Card className="mb-5 border-primary-100 bg-primary-50/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold text-ink">{flash.layout.headline}</p>
                <p className="mt-1 text-sm text-ink-600">{flash.layout.next_step_copy}</p>
              </div>
              <div className="min-w-[240px] rounded-xl border border-primary-100 bg-white p-3 text-sm">
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <CreditCard className="h-4 w-4 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
                  {formatZAR(flash.checkout.amount_zar)}
                </p>
                <Button
                  className="mt-3 min-h-11 w-full cursor-pointer"
                  onClick={() => window.open(flash.checkout!.checkout_url, '_blank', 'noopener')}
                >
                  <Wallet className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
                  Open checkout
                </Button>
              </div>
            </div>
          </Card>
        )}

        <div className="sticky top-0 z-20 -mx-1 mb-5 bg-white/95 px-1 backdrop-blur-md">
          <DashboardTabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        {tab === 'application' && (
          <ApplicantApplicationPanel
            application={application}
            property={property}
            agentName={agentName}
            actor={actor}
            canReview={false}
            applicantMode
            tasks={tasks}
            onRunAction={runAction}
            onSetDocument={(key, next, note) => setDocumentStatus(application.id, key, next, note)}
            onUploadDocument={(key, file) =>
              uploadApplicationDocument(application.id, key, file, {
                userId: user.id,
                name: user.name,
              })
            }
            onSaveDetails={(patch) => updateApplication(application.id, patch)}
          />
        )}

        {tab === 'documents' && (
          <ApplicantDocumentsPanel
            application={application}
            canReview={false}
            isTenant
            onSetDocument={(key, next, note) => setDocumentStatus(application.id, key, next, note)}
            onUploadDocument={(key, file) =>
              uploadApplicationDocument(application.id, key, file, {
                userId: user.id,
                name: user.name,
              })
            }
          />
        )}

        {tab === 'details' && (
          <div className="space-y-5">
            {needsCreditConsentTask(application) ||
            application.creditCheckConsents?.adults?.length ||
            screeningApiAvailable ? (
              <TenantCreditConsentPanel
                application={application}
                onCapture={async (adults) => {
                  const saved = await captureApplicationScreeningConsent(application.id, {
                    grantedBy: user.id,
                    method: 'portal',
                    adults,
                  })
                  if (!saved) throw new Error('consent persist failed')
                }}
              />
            ) : null}
            <TenantApplicationDetailsForm
              application={application}
              onSave={(patch) => updateApplication(application.id, patch)}
              autoSave
            />
          </div>
        )}

        {tab === 'payments' && (
          <TenantApplicationPaymentsPanel
            payments={payments}
            onSubmitProof={(paymentId, input) =>
              updatePayment(paymentId, {
                reference: input.reference,
                notes: input.notes ?? 'Proof submitted by applicant — pending agency verification',
                recordedByUserId: user.id,
                recordedByName: user.name,
              })
            }
            onOpenCheckout={
              workflowStatus === 'deposit_invoice_sent' || workflowStatus === 'deposit_requested'
                ? () =>
                    void runAction({
                      key: 'OPEN_CHECKOUT',
                      label: 'Pay online',
                      method: 'PATCH',
                      href: '',
                      requires: ['portal.tenant'],
                      payload_hint: { effect: 'open_checkout' },
                    })
                : undefined
            }
          />
        )}
      </DashboardPage>
    </RequirePermission>
  )
}
