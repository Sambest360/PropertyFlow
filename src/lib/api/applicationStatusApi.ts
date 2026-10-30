/**
 * PATCH /api/v1/applications/{id}/status — atomic application state machine.
 * APPROVED path: booking collision check → lease row → unit OCCUPIED → invoice → PayFast/Peach checkout.
 */

import type { Unit } from '../../data/infrastructure'
import type {
  Application,
  ApplicationStage,
  PaymentRecord,
  PropertyAsset,
  Tenancy,
  Viewing,
  ViewingSlot,
} from '../../types/domain'
import { STAGE_PROGRESS } from '../workflow'
import { buildApplicationActions, apiStatusFromStage } from './actions'
import type { ActorContext, BuildingStructuralContext, DisplayMetadata, HateoasAction } from './contracts'
import { actorCan } from './contracts'
import { buildDisplayMetadata } from './displayMetadata'
import { buildBuildingContext, resolveDeposit, resolveTotalEntryFees } from './unitsApi'
import type { Building } from '../../data/infrastructure'
import { applicationPassesFicaSoftGate, ficaPackSoftGateMessage } from '../ficaPack'
import {
  applicationPassesScreeningSoftGate,
  screeningSoftGateMessage,
} from '../screening'

export type ApplicationStatusApi =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CREDIT_CHECK'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'LEASED'
  | 'LEASE_SIGNED'

export type PatchApplicationStatusRequest = {
  status: ApplicationStatusApi
  reason?: string
  /** Preferred move-in when approving */
  move_in_date?: string
  /** Payment gateway preference */
  payment_provider?: 'payfast' | 'peach' | 'auto'
}

/**
 * What the approve step hands the UI to start a checkout (open-checkout-real).
 * Only the persisted ledger row ids and their ledger total: no PayFast host,
 * merchant key, signature or url ever lives in the browser. The Pay button
 * sends one of these ids to POST /api/payfast/create, which signs server-side
 * and reads the amount from the ledger row.
 */
export type CheckoutTarget = {
  provider: 'payfast' | 'peach'
  /** First Due row (the deposit). Same id as `invoice.id`. */
  payment_id: string
  /** Every Due row this approval created, deposit first. */
  payment_ids: string[]
  /** Sum of those rows (display only; the server charges the ledger amount). */
  amount_zar: number
}

export type ApprovalSideEffects = {
  lease: Tenancy | null
  payments: PaymentRecord[]
  unit_id: string | null
  unit_status: 'OCCUPIED' | null
  cancelled_viewing_ids: string[]
  cancelled_slot_ids: string[]
  booking_collisions: Array<{ booking_id: string; starts_at: string; visitor_name: string }>
}

export type PatchApplicationStatusSuccess = {
  status: 'SUCCESS'
  httpStatus: 200
  application: Application
  previous_status: string
  api_status: string
  display_metadata: DisplayMetadata
  actions: HateoasAction[]
  building?: BuildingStructuralContext | null
  side_effects: ApprovalSideEffects
  checkout: CheckoutTarget | null
  invoice: {
    id: string
    total_zar: number
    line_items: Array<{ label: string; amount: number }>
    due_date: string
  } | null
  layout: {
    headline: string
    success_state: 'APPROVED_CHECKOUT' | 'CREDIT_CHECK' | 'REJECTED' | 'ADVANCED' | 'LEASED'
    badges: string[]
    next_step_copy: string
  }
}

export type PatchApplicationStatusError = {
  status: 'ERROR'
  /** 502: the durable persistence layer rejected the transition. */
  httpStatus: 400 | 403 | 404 | 409 | 422 | 502
  error: string
  code?:
    | 'NOT_FOUND'
    | 'FORBIDDEN'
    | 'INVALID_TRANSITION'
    | 'BOOKING_COLLISION'
    | 'UNIT_OCCUPIED'
    | 'MISSING_UNIT'
    | 'NO_LANDLORD'
    | 'PERSIST_FAILED'
    | 'FICA_PACK_INCOMPLETE'
    | 'SCREENING_INCOMPLETE'
    | 'LEASE_SIGNATURE_NOT_RECORDED'
}

export type PatchApplicationStatusResult = PatchApplicationStatusSuccess | PatchApplicationStatusError

const API_TO_STAGE: Record<string, ApplicationStage> = {
  DRAFT: 'Started',
  SUBMITTED: 'Documents Submitted',
  PENDING: 'Under Review',
  UNDER_REVIEW: 'Under Review',
  CREDIT_CHECK: 'Credit Check',
  APPROVED: 'Awaiting Payment',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  LEASED: 'Active Tenancy',
  LEASE_SIGNED: 'Lease Signed',
}

const ALLOWED: Record<string, string[]> = {
  // P0-1 (R3): Allow APPROVED from "Application started" for legacy apps and
  // agency authority approval without requiring full submission first.
  // P0-1 (R4): the workflow engine labels its start stage 'Application
  // started' (not the legacy 'Started'), and normalizeApplication rewrites
  // stage labels on load — so both spellings must be accepted or Approve on
  // any round-tripped application 422s with exactly
  // "Cannot transition from Application started to APPROVED".
  Started: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  'Application started': ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  // P0-3 (E2E #2): guest-submitted apps land here; staff Approve / Reject /
  // Move-to-review must be available straight from Submitted.
  'Application submitted': ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  // P0-1 (R4): fresh create-your-own applications persist at stage
  // 'Documents Pending' (see submitApplication) — staff must be able to
  // Approve straight from here without an intermediate submit flicker.
  'Documents Pending': ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  // P0-1 (R4): engine-label aliases. normalizeApplication rewrites legacy
  // stage labels to the workflow engine's wording on load; every normalized
  // state must keep the same transitions its legacy label had.
  'Documents requested': ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  'Documents uploaded': ['UNDER_REVIEW', 'CREDIT_CHECK', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  'Viewing scheduled': ['UNDER_REVIEW', 'CREDIT_CHECK', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  'Viewing completed': ['UNDER_REVIEW', 'CREDIT_CHECK', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  'Agent review': ['CREDIT_CHECK', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  'Credit check': ['APPROVED', 'REJECTED', 'UNDER_REVIEW'],
  'Conditionally approved': ['APPROVED', 'LEASE_SIGNED', 'REJECTED'],
  'Deposit invoice issued': ['APPROVED', 'LEASE_SIGNED', 'REJECTED', 'WITHDRAWN'],
  // P0-approve (R10): APPROVED here serves the lease-recovery flow — an
  // application already past approval with NO durable lease (stuck 71%). The
  // workflow template gates the 'Approve & create lease' action to lease-less
  // apps only (RECOVER_APPROVE + leaseExists gate in getAvailableTransitions);
  // the re-run is idempotent — upsertTenancy dedupes on application_id.
  'Lease signed by tenant': ['LEASED'],
  'Lease signed by landlord': ['LEASED'],
  'Move-in inspection scheduled': ['LEASED'],
  'Active tenancy': [],
  'Documents Submitted': ['UNDER_REVIEW', 'CREDIT_CHECK', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  'Viewing Booked': ['UNDER_REVIEW', 'CREDIT_CHECK', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  'Under Review': ['CREDIT_CHECK', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  'Credit Check': ['APPROVED', 'REJECTED', 'UNDER_REVIEW'],
  Approved: ['APPROVED', 'LEASE_SIGNED', 'REJECTED'],
  'Awaiting Payment': ['LEASE_SIGNED', 'REJECTED', 'WITHDRAWN'],
  'Deposit Paid': ['LEASE_SIGNED', 'REJECTED'],
  'Lease Signed': ['LEASED'],
  'Move-In Scheduled': ['LEASED'],
  'Keys Handed Over': ['LEASED'],
  'Active Tenancy': [],
  Rejected: [],
  Withdrawn: [],
}

/**
 * P0-1 (R4): turn a raw transition error into the staff member's next action.
 * The lifecycle engine and this stage machine label the same state slightly
 * differently, so an actionable hint is safer than leaking the raw mismatch.
 */
export function guidedTransitionError(result: PatchApplicationStatusError): string {
  if (result.code === 'FICA_PACK_INCOMPLETE') {
    return `${result.error} Open the Documents / FICA pack panel and verify ID, proof of address, and FICA declaration (staff action — not live bureau).`
  }
  if (result.code === 'SCREENING_INCOMPLETE') {
    return `${result.error} Open Screening details: capture POPIA consent, run mock screening or record an audited manual override (in-app — not live TPN).`
  }
  if (result.code === 'INVALID_TRANSITION') {
    const lower = (result.error ?? '').toLowerCase()
    if (lower.includes('application started') || lower.includes('documents pending') || lower.includes('application submitted')) {
      return `${result.error}. Mark the application as submitted first (or ask the applicant to submit it from their portal), then approve from the submitted status.`
    }
    return `${result.error}. Open the application's lifecycle panel and take the suggested next step shown there.`
  }
  return result.error
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function findBookingCollisions(params: {
  unitId: string | null | undefined
  propertyId: string
  viewings: Viewing[]
  slots: ViewingSlot[]
}): ApprovalSideEffects['booking_collisions'] {
  const collisions: ApprovalSideEffects['booking_collisions'] = []
  for (const v of params.viewings) {
    if (v.propertyId !== params.propertyId) continue
    if (v.status !== 'Scheduled') continue
    collisions.push({
      booking_id: v.id,
      starts_at: `${v.date}T${v.time}:00`,
      visitor_name: v.applicantName,
    })
  }
  return collisions
}

/**
 * Pure state-machine transition. Caller persists returned side_effects into the store.
 */
export function patchApplicationStatus(params: {
  application: Application | undefined
  property?: PropertyAsset
  unit?: Unit
  building?: Building
  viewings: Viewing[]
  slots: ViewingSlot[]
  /** Existing leases on the unit (active / pending) */
  existingTenancies: Tenancy[]
  request: PatchApplicationStatusRequest
  actor: ActorContext
  now?: Date
}): PatchApplicationStatusResult {
  const { application, property, unit, building, request, actor } = params
  const now = params.now ?? new Date()

  if (!application) {
    return { status: 'ERROR', httpStatus: 404, error: 'Application not found', code: 'NOT_FOUND' }
  }
  if (!actorCan(actor, 'applications.review') && request.status !== 'WITHDRAWN') {
    return { status: 'ERROR', httpStatus: 403, error: 'Insufficient permissions', code: 'FORBIDDEN' }
  }

  const allowed = ALLOWED[application.stage] ?? []
  if (!allowed.includes(request.status) && request.status !== apiStatusFromStage(application.stage)) {
    return {
      status: 'ERROR',
      httpStatus: 422,
      error: `Cannot transition from ${application.stage} to ${request.status}`,
      code: 'INVALID_TRANSITION',
    }
  }

  const nextStage = API_TO_STAGE[request.status] ?? application.stage
  const previous = application.stage

  // Non-approval transitions — lightweight advance
  if (request.status !== 'APPROVED') {
    const nextApp: Application = {
      ...application,
      stage: nextStage,
      progress: STAGE_PROGRESS[nextStage] ?? application.progress,
      creditCheck:
        request.status === 'CREDIT_CHECK'
          ? 'In Progress'
          : request.status === 'REJECTED'
            ? application.creditCheck === 'In Progress'
              ? 'Failed'
              : application.creditCheck
            : application.creditCheck,
      notes:
        request.status === 'REJECTED' && request.reason
          ? `${application.notes}\nDeclined: ${request.reason}`.trim()
          : application.notes,
      updatedAt: now.toISOString().slice(0, 10),
    }

    const successState =
      request.status === 'REJECTED'
        ? 'REJECTED'
        : request.status === 'CREDIT_CHECK'
          ? 'CREDIT_CHECK'
          : request.status === 'LEASED' || request.status === 'LEASE_SIGNED'
            ? 'LEASED'
            : 'ADVANCED'

    return {
      status: 'SUCCESS',
      httpStatus: 200,
      application: nextApp,
      previous_status: previous,
      api_status: request.status,
      display_metadata: buildDisplayMetadata({
        updatedAt: now.toISOString(),
        createdAt: application.submittedAt,
        statusLabel: nextStage,
        now,
      }),
      actions: buildApplicationActions({
        application: nextApp,
        actor,
      }),
      building: building ? buildBuildingContext(building, unit?.amenities ?? property?.amenities ?? []) : null,
      side_effects: {
        lease: null,
        payments: [],
        unit_id: null,
        unit_status: null,
        cancelled_viewing_ids: [],
        cancelled_slot_ids: [],
        booking_collisions: [],
      },
      checkout: null,
      invoice: null,
      layout: {
        headline:
          request.status === 'REJECTED'
            ? 'Application declined'
            : request.status === 'CREDIT_CHECK'
              ? 'Credit check started'
              : `Moved to ${nextStage}`,
        success_state: successState,
        badges: [nextStage],
        next_step_copy:
          request.status === 'CREDIT_CHECK'
            ? 'Await bureau response, then approve or decline.'
            : request.status === 'REJECTED'
              ? 'Applicant has been notified.'
              : 'Continue the lease workflow from the actions panel.',
      },
    }
  }

  // ——— APPROVED atomic path ———
  // DQ-C2 Mode A: soft-gate lease creation on verified id+address+fica pack
  // (staff-managed in-app — not live bureau).
  if (!applicationPassesFicaSoftGate(application)) {
    return {
      status: 'ERROR',
      httpStatus: 422,
      error: ficaPackSoftGateMessage(application.documents) ?? 'FICA pack incomplete',
      code: 'FICA_PACK_INCOMPLETE',
    }
  }
  // DQ-C3 Mode A: soft-gate until screening passed or audited manual_override
  // (mock/manual — not live TPN). Approve must never invent Passed.
  if (!applicationPassesScreeningSoftGate(application)) {
    return {
      status: 'ERROR',
      httpStatus: 422,
      error: screeningSoftGateMessage(application) ?? 'Screening incomplete',
      code: 'SCREENING_INCOMPLETE',
    }
  }

  const unitId = application.unitId ?? property?.unitId ?? unit?.id ?? null
  if (application.type === 'Rental' && !unitId && !property) {
    return {
      status: 'ERROR',
      httpStatus: 422,
      error: 'Cannot approve rental without a linked unit',
      code: 'MISSING_UNIT',
    }
  }

  if (unit?.statusKey === 'OCCUPIED') {
    return {
      status: 'ERROR',
      httpStatus: 409,
      error: 'Unit is already occupied — resolve the existing lease first',
      code: 'UNIT_OCCUPIED',
    }
  }

  const activeLease = params.existingTenancies.find(
    (t) =>
      t.propertyId === application.propertyId &&
      (t.status === 'Active' || t.status === 'Pending Move-In') &&
      t.applicationId !== application.id,
  )
  if (activeLease && application.type === 'Rental') {
    return {
      status: 'ERROR',
      httpStatus: 409,
      error: `Booking collision: unit already has lease ${activeLease.id} (${activeLease.tenantName})`,
      code: 'BOOKING_COLLISION',
    }
  }

  // P0-approve (R8): the lease row must carry a real landlord — the DB FK on
  // leases.landlord_id rejects an empty id (HTTP 409) and a NULL one violates
  // the NOT NULL contract. Resolve from the listing's owner, falling back to
  // the building's owner (the same chain Make live / listing detail use). If
  // neither has an owner, approve fails fast here — never half-approve into a
  // lease that cannot commit.
  const leaseLandlordId =
    property?.landlordId?.trim() || building?.landlordId?.trim() || ''
  if (application.type === 'Rental' && !leaseLandlordId) {
    return {
      status: 'ERROR',
      httpStatus: 422,
      error: 'This listing has no owner assigned — assign the landlord before approving.',
      code: 'NO_LANDLORD',
    }
  }

  const collisions = findBookingCollisions({
    unitId,
    propertyId: application.propertyId,
    viewings: params.viewings,
    slots: params.slots,
  })

  const rent = unit?.rent ?? property?.rent ?? 0
  const price = unit?.price ?? property?.price ?? 0
  const deposit =
    application.type === 'Rental'
      ? resolveDeposit(
          unit ??
            ({
              listingType: 'rent',
              rent,
              price: null,
            } as Unit),
          property,
        ) ?? rent * 2
      : Math.round(price * 0.1)
  const firstMonth = application.type === 'Rental' ? rent : Math.round(price * 0.05)
  const totalEntry =
    application.type === 'Rental'
      ? (resolveTotalEntryFees(
          unit ?? ({ listingType: 'rent', rent, price: null } as Unit),
          property,
        ) ?? deposit + firstMonth)
      : deposit

  const due = new Date(now)
  due.setDate(due.getDate() + 5)
  const dueDate = due.toISOString().slice(0, 10)

  const payments: PaymentRecord[] = [
    {
      id: uid('PAY'),
      agencyId: application.agencyId,
      propertyId: application.propertyId,
      applicationId: application.id,
      tenancyId: null,
      partyName: application.applicantName,
      partyUserId: application.applicantUserId,
      type: application.type === 'Rental' ? 'Deposit' : 'Sale Deposit',
      amount: deposit,
      status: 'Due',
      dueDate,
      paidAt: null,
      method: null,
      landlordVisible: true,
    },
  ]
  if (application.type === 'Rental' && firstMonth > 0) {
    payments.push({
      id: uid('PAY'),
      agencyId: application.agencyId,
      propertyId: application.propertyId,
      applicationId: application.id,
      tenancyId: null,
      partyName: application.applicantName,
      partyUserId: application.applicantUserId,
      type: 'First Month Rent',
      amount: firstMonth,
      status: 'Due',
      dueDate,
      paidAt: null,
      method: null,
      landlordVisible: true,
    })
  }

  const lease: Tenancy | null =
    application.type === 'Rental'
      ? {
          id: uid('TN'),
          agencyId: application.agencyId,
          propertyId: application.propertyId,
          landlordId: leaseLandlordId || property?.landlordId || building?.landlordId || '',
          agentId: application.agentId,
          applicationId: application.id,
          tenantUserId: application.applicantUserId,
          tenantName: application.applicantName,
          tenantEmail: application.email,
          startDate: request.move_in_date ?? now.toISOString().slice(0, 10),
          endDate: null,
          rent,
          deposit,
          rentDueDay: 1,
          status: 'Pending Move-In',
          keyCollection: {
            location: 'Agency office',
            instructions: 'Awaiting payment confirmation',
            contactName: 'Agent',
            contactPhone: '',
          },
        }
      : null

  if (lease) {
    payments.forEach((p) => {
      p.tenancyId = lease.id
    })
  }

  const cancelledViewings = collisions.map((c) => c.booking_id)
  const cancelledSlots = params.slots
    .filter((s) => s.propertyId === application.propertyId && s.status === 'Open')
    .map((s) => s.id)

  const lineItems = payments.map((p) => ({ label: p.type, amount: p.amount }))
  const provider: CheckoutTarget['provider'] = request.payment_provider === 'peach' ? 'peach' : 'payfast'

  // open-checkout-real: the checkout points at the real ledger rows created
  // above (persisted by the store before it reports SUCCESS), never at an
  // invented invoice id, and carries no gateway url, key or signature.
  const checkout: CheckoutTarget = {
    provider,
    payment_id: payments[0].id,
    payment_ids: payments.map((p) => p.id),
    amount_zar: payments.reduce((sum, p) => sum + p.amount, 0),
  }

  // Invent-kill: approve must not invent a credit pass — screening status stays as-is.
  // DQ-C2 Mode A: do not invent verified FICA pack (id/address/fica) either —
  // staff verify those rows explicitly; lease/move-in soft-gate reads real status.
  // DQ-C3 Mode A: screening cleared only via mock ingest or audited override — never by this click.
  const nextApp: Application = {
    ...application,
    stage: 'Awaiting Payment',
    progress: STAGE_PROGRESS['Awaiting Payment'],
    documents: application.documents.map((d) => ({ ...d })),
    updatedAt: now.toISOString().slice(0, 10),
  }

  const buildingCtx = building
    ? buildBuildingContext(building, unit?.amenities ?? property?.amenities ?? [])
    : null

  const badges = ['Approved', 'Awaiting Payment']
  if (buildingCtx?.is_load_shedding_free) badges.push('Load-shedding free')
  if (buildingCtx?.is_premium_tier) badges.push('Premium tier')
  if (collisions.length) badges.push(`${collisions.length} viewings closed`)

  return {
    status: 'SUCCESS',
    httpStatus: 200,
    application: nextApp,
    previous_status: previous,
    api_status: 'APPROVED',
    display_metadata: buildDisplayMetadata({
      updatedAt: now.toISOString(),
      createdAt: application.submittedAt,
      statusLabel: 'Awaiting Payment',
      primaryAmount: totalEntry,
      primarySuffix: ' due',
      secondaryAmount: deposit,
      secondarySuffix: ' deposit',
      now,
    }),
    actions: buildApplicationActions({
      application: nextApp,
      actor,
    }),
    building: buildingCtx,
    side_effects: {
      lease,
      payments,
      unit_id: unitId,
      unit_status: application.type === 'Rental' ? 'OCCUPIED' : null,
      cancelled_viewing_ids: cancelledViewings,
      cancelled_slot_ids: cancelledSlots,
      booking_collisions: collisions,
    },
    checkout,
    invoice: {
      id: payments[0].id,
      total_zar: checkout.amount_zar,
      line_items: lineItems,
      due_date: dueDate,
    },
    layout: {
      headline: 'Application approved — checkout ready',
      success_state: 'APPROVED_CHECKOUT',
      badges,
      next_step_copy:
        'Lease draft created and unit reserved. The applicant pays the deposit from their portal (PayFast).',
    },
  }
}
