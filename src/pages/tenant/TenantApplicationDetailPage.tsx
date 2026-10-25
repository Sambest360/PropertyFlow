import { useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowRight, CheckCircle2, CreditCard, FileText, Home, KeyRound, MapPin, MessageSquare, Wallet } from 'lucide-react'
import { useStore, usePublicProperties } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { resolveApplicationAgentName } from '../../lib/agentDisplay'
import { RequirePermission } from '../../components/RequirePermission'
import { PortalSkeleton } from '../../components/PortalHydrationGate'
import { ActionButtonRow } from '../../components/ActionButtonRow'
import { BackButton } from '../../components/BackButton'
import { DashboardBreadcrumb, DashboardPage } from '../../components/dashboard'
import { DashboardTabs } from '../../components/dashboard/DashboardTabs'
import { ApplicationLifecycleHub } from '../../components/workflow/ApplicationLifecycleHub'
import { ApplicantDocumentsPanel } from '../../components/applicant-detail/ApplicantDocumentsPanel'
import { TenantApplicationDetailsForm } from '../../components/tenant/TenantApplicationDetailsForm'
import { TenantCreditConsentPanel } from '../../components/tenant/TenantCreditConsentPanel'
import { screeningApiAvailable } from '../../lib/api/screeningApi'
import { needsCreditConsentTask } from '../../lib/screening/creditConsent'
import { TenantApplicationPaymentsPanel } from '../../components/tenant/TenantApplicationPaymentsPanel'
import { Badge, Button, Card, statusTone } from '../../components/ui'
import { rolePermissions } from '../../lib/permissions'
import { getApplicantTasks } from '../../lib/applicantPortalActions'
import { ownTenancyForApplication } from '../../lib/tenantOccupancy'
import {
  getLifecycleMilestones,
  getStageRequirements,
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
type Tab = 'overview' | 'documents' | 'details' | 'payments' | 'tenancy'

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

  const tab = (['overview', 'documents', 'details', 'payments', 'tenancy'] as const).includes(
    params.get('tab') as Tab,
  )
    ? (params.get('tab') as Tab)
    : 'overview'

  const setTab = (next: string) => {
    const sp = new URLSearchParams(params)
    if (next === 'overview') sp.delete('tab')
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

  const milestones = getLifecycleMilestones(application.type, application)
  const stepIndex = Math.max(0, milestones.findIndex((m) => m.key === workflowStatus))
  const onMilestone = milestones.some((m) => m.key === workflowStatus)
  const stageLabel = workflowStageLabel(application.type, workflowStatus)
  const waitingNote = getStageRequirements(workflowStatus)?.waitingLabel ?? null
  const nextTask = tasks[0] ?? null
  const docsToUpload = application.documents.filter(
    (d) => d.status === 'required' || d.status === 'rejected',
  ).length
  const paymentsDue = payments.filter((p) => p.status === 'Due' || p.status === 'Overdue').length
  const detailsTasks = tasks.filter((t) => t.section === 'details').length
  const agencyName = state.agencies.find((a) => a.id === application.agencyId)?.name ?? 'Agency'
  const typeLabel = application.type === 'Purchase' ? 'Purchase offer' : 'Rental application'
  const fmtDate = (iso?: string) =>
    iso && !Number.isNaN(Date.parse(iso))
      ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      : '—'

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents', count: docsToUpload || undefined },
    { id: 'details', label: 'Your details', count: detailsTasks || undefined },
    { id: 'payments', label: 'Payments', count: paymentsDue || undefined },
    ...(linkedTenancy ? [{ id: 'tenancy', label: 'Tenancy' }] : []),
  ]

  const goToTask = (section: string) => setTab(section === 'application' ? 'overview' : section)

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

        {/* Header — same shape as the staff property page */}
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {property?.images[0] ? (
              <img
                src={property.images[0]}
                alt=""
                className="h-20 w-20 shrink-0 rounded-2xl object-cover sm:h-24 sm:w-24"
              />
            ) : null}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
                  {labelOrReference(property?.title, application.propertyId, 'Property')}
                </h1>
                <Badge tone={statusTone(application.stage)}>{stageLabel}</Badge>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-500">
                <span>{typeLabel}</span>
                {property ? (
                  <>
                    <span aria-hidden>·</span>
                    <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
                    <span>
                      {property.suburb}, {property.city}
                    </span>
                  </>
                ) : null}
                {property?.rent ? (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tabular">{formatZAR(property.rent)}/mo</span>
                  </>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs text-ink-400">Reference {hideBackendUuid(application.id)}</p>
            </div>
          </div>
          <ActionButtonRow className="sm:w-auto">
            {property ? (
              <Link to={`/listing/${property.id}`}>
                <Button variant="secondary" className="min-h-11 cursor-pointer">
                  <Home className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  View listing
                </Button>
              </Link>
            ) : null}
            <Link to="/workspace/portals/tenant/messages">
              <Button variant="secondary" className="min-h-11 cursor-pointer">
                <MessageSquare className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Message agent
              </Button>
            </Link>
            <BackButton to="/workspace/portals/tenant/applications" label="All applications" />
          </ActionButtonRow>
        </div>

        {/* Where it stands, and the one thing to do next */}
        <Card className="mb-5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                {onMilestone ? `Step ${stepIndex + 1} of ${milestones.length}` : 'Status'}
              </p>
              <p className="mt-0.5 font-display text-lg font-semibold text-ink">{stageLabel}</p>
              <div className="mt-3 h-2 max-w-xl overflow-hidden rounded-full bg-primary-50">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              {waitingNote ? <p className="mt-2 text-sm text-ink-500">{waitingNote}</p> : null}
            </div>
            {nextTask ? (
              <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-4 lg:w-96">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                  Your next step{tasks.length > 1 ? ` · ${tasks.length} to do` : ''}
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">{nextTask.label}</p>
                <p className="mt-0.5 text-xs text-ink-500">{nextTask.detail}</p>
                <Button className="mt-3 min-h-11 cursor-pointer" onClick={() => goToTask(nextTask.section)}>
                  Do this now
                  <ArrowRight className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 lg:w-96">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={ICON_STROKE} aria-hidden />
                <p className="text-sm text-ink-600">
                  Nothing for you to do right now. We&apos;ll notify you when the agency needs something.
                </p>
              </div>
            )}
          </div>
        </Card>

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

        {tab === 'overview' && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5">
              {tasks.length > 1 ? (
                <Card className="p-5">
                  <h2 className="font-display text-base font-semibold text-ink">To do</h2>
                  <ul className="mt-3 divide-y divide-primary-50">
                    {tasks.map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          onClick={() => goToTask(task.section)}
                          className="flex min-h-14 w-full cursor-pointer items-center gap-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-ink">{task.label}</span>
                            <span className="block text-xs text-ink-500">{task.detail}</span>
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              <ApplicationLifecycleHub
                application={application}
                property={property}
                agentName={agentName}
                actor={actor}
                canReview={false}
                applicantMode
                compact
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
            </div>

            <aside className="space-y-5">
              <Card className="p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Your agent</p>
                <p className="mt-1 font-semibold text-ink">{agentName ?? 'Being assigned'}</p>
                <p className="text-sm text-ink-500">{agencyName}</p>
                <Link
                  to="/workspace/portals/tenant/messages"
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary"
                >
                  <MessageSquare className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Send a message
                </Link>
              </Card>
              <Card className="p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Application</p>
                <dl className="mt-2 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">Type</dt>
                    <dd className="font-medium text-ink">{typeLabel}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">Submitted</dt>
                    <dd className="font-medium text-ink">{fmtDate(application.submittedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">Last update</dt>
                    <dd className="font-medium text-ink">{fmtDate(application.updatedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-500">Documents</dt>
                    <dd className="font-medium text-ink">
                      {application.documents.length - docsToUpload} of {application.documents.length} in
                    </dd>
                  </div>
                </dl>
              </Card>
            </aside>
          </div>
        )}

        {tab === 'tenancy' && linkedTenancy ? (
          <Card className="p-5" data-testid="tenant-app-linked-tenancy">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">Your tenancy</p>
                <p className="mt-1 text-sm text-ink-600">
                  {fmtDate(linkedTenancy.startDate)}
                  {linkedTenancy.endDate ? ` → ${fmtDate(linkedTenancy.endDate)}` : ' · open-ended'}
                  {linkedTenancy.rent ? ` · ${formatZAR(linkedTenancy.rent)}/mo` : ''}
                </p>
              </div>
              <Badge tone={statusTone(linkedTenancy.status)}>{linkedTenancy.status}</Badge>
            </div>
            {linkedTenancy.keyCollection?.location?.trim() || linkedTenancy.keyCollection?.instructions?.trim() ? (
              <div className="mt-4 border-t border-primary-50 pt-4 text-sm">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-400">
                  <KeyRound className="h-3.5 w-3.5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
                  Key collection
                </p>
                <p className="mt-1 font-semibold text-ink">{linkedTenancy.keyCollection.location || 'Key collection'}</p>
                {linkedTenancy.keyCollection.instructions ? (
                  <p className="mt-0.5 text-xs text-ink-500">{linkedTenancy.keyCollection.instructions}</p>
                ) : null}
              </div>
            ) : null}
            {linkedTenancy.leasePdfUrl?.trim() ? (
              <a
                href={linkedTenancy.leasePdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <FileText className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Open lease PDF
              </a>
            ) : null}
          </Card>
        ) : null}

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
