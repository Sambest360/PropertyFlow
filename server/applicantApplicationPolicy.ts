/**
 * Applicant writes on their own application (tenant, and a contractor who is
 * also an applicant). Angela / Jim #80 (c3f25ac): no silent strip of their
 * changes; every refused change is a 403 with a code.
 *
 * Workflow (checked against the STORED status; the server derives and stores
 * workflowStatus, stage, progress and the DB status for every allowed move):
 *   create                           -> application_submitted (rental) or
 *                                       offer_submitted (purchase); never null
 *   documents_requested              -> documents_uploaded (all docs uploaded)
 *   offer_started                    -> offer_submitted
 *   any OPEN state                   -> withdrawn
 *   eSign mirror                     -> lease_generated / lease_sent /
 *                                       tenant_signed / landlord_signed, only
 *                                       the status derived from the stored
 *                                       lease envelope linked to this
 *                                       application, and only forward
 * Anything else: 403 APPLICATION_TRANSITION_FORBIDDEN. Sending the stored
 * values back unchanged (the client always sends the whole row) is no change.
 *
 * OPEN: a non-terminal stage before the template's first `legal` stage
 * (rental: lease_generated, purchase: sale_agreement_signed), i.e. no lease /
 * sale agreement yet. Derived from the shared template (applicantOpenStatuses).
 *
 * Locked fields (403 APPLICATION_FIELD_LOCKED when changed, dropped when sent
 * back unchanged):
 *   applicantUserId  update: must stay themselves (no re-resolve by email)
 *   keyCollection    staff sets it (scheduleMoveIn); no tenant flow writes it
 *   viewingSlotId    tenant flow: booking a viewing for their application
 *                    (bookViewingSlot) - allowed only for a slot they hold a
 *                    live booking on
 * Documents: status and review fields (reviewedBy, reviewedAt,
 * rejectedReason, note, lookedAt) keep the stored values; a new upload (file
 * differs from the stored one) is set to `uploaded` by the server with the
 * review fields cleared; stored documents missing from the payload are kept.
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { forbiddenError, type DemoActor } from './actor.js'
import {
  getWorkflowTemplate,
  getStageDef,
  resolveWorkflowStatus,
  workflowProgress,
  workflowStageLabel,
  type WorkflowStatusKey,
} from '../src/lib/applicationWorkflow.js'
import { allDocsUploaded } from '../src/lib/workflow.js'
import { hasAllAdultCreditConsents } from '../src/lib/screening/creditConsent.js'
import { lockDocumentReviewFields } from '../src/lib/lockDocumentReviewFields.js'
import type { Application, ApplicationDocument } from '../src/types/domain.js'

export const APPLICATION_TRANSITION_FORBIDDEN = 'APPLICATION_TRANSITION_FORBIDDEN'
export const APPLICATION_FIELD_LOCKED = 'APPLICATION_FIELD_LOCKED'
/** eSign mirror ahead of the stored lease envelope (signature not saved yet). */
export const LEASE_SIGNATURE_NOT_RECORDED = 'LEASE_SIGNATURE_NOT_RECORDED'

type AppType = Application['type']
type Row = Record<string, unknown>

/** Initial workflow status of an applicant-created application. */
export function applicantCreateStatus(type: AppType): WorkflowStatusKey {
  return type === 'Purchase' ? 'offer_submitted' : 'application_submitted'
}

/** Server-derived DB status (applications.status) for each applicant move target. */
const DB_STATUS_FOR: Partial<Record<WorkflowStatusKey, string>> = {
  application_submitted: 'SUBMITTED',
  offer_submitted: 'SUBMITTED',
  documents_uploaded: 'UNDER_REVIEW',
  withdrawn: 'WITHDRAWN',
}

/** DB status -> workflow status, for legacy rows with no stored workflow_status / stage. */
const WORKFLOW_FROM_DB_STATUS: Record<string, WorkflowStatusKey> = {
  DRAFT: 'application_started',
  SUBMITTED: 'application_submitted',
  UNDER_REVIEW: 'agent_review',
  CREDIT_CHECK: 'credit_check',
  APPROVED: 'conditionally_approved',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  LEASED: 'active_tenancy',
}

export const ESIGN_MIRROR_STATUSES: ReadonlySet<string> = new Set([
  'lease_generated',
  'lease_sent',
  'tenant_signed',
  'landlord_signed',
])

/**
 * Mirror of src/lib/lease/pipeline.ts workflowStatusFromESign (that module
 * pulls the PDF generator, so the server bundle does not load it; pinned by a
 * test).
 */
export function workflowStatusFromStoredESign(eSign: unknown): WorkflowStatusKey | null {
  const e = asRow(eSign)
  if (!e) return null
  switch (e.status) {
    case 'generated':
      return 'lease_generated'
    case 'sent':
      return 'lease_sent'
    case 'partially_signed':
      return asRow(e.tenant)?.status === 'signed' ? 'tenant_signed' : 'lease_sent'
    case 'completed':
      return e.landlord ? 'landlord_signed' : 'tenant_signed'
    default:
      return null
  }
}

/** Status derived from the eSign envelope of the lease linked to this application. */
export async function storedLeaseESignStatus(applicationUuid: string): Promise<WorkflowStatusKey | null> {
  const rows = await query<{ esign: unknown }>(
    `SELECT metadata->'eSign' AS esign FROM leases WHERE application_id = $1::uuid
      ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
    [applicationUuid],
  )
  return workflowStatusFromStoredESign(rows[0]?.esign)
}

export function stageOrder(type: AppType, status: WorkflowStatusKey): number {
  return getStageDef(type, status)?.order ?? -1
}

/** Non-terminal stages before the first legal stage of the template. */
export function applicantOpenStatuses(type: AppType): ReadonlySet<WorkflowStatusKey> {
  const stages = getWorkflowTemplate(type).stages
  const firstLegal = Math.min(...stages.filter((s) => s.category === 'legal').map((s) => s.order))
  return new Set(stages.filter((s) => !s.terminal && s.order < firstLegal).map((s) => s.key))
}

/** Allowed applicant (from -> to) for an existing application, excluding the eSign mirror. */
export function applicantMoveAllowed(type: AppType, from: WorkflowStatusKey, to: WorkflowStatusKey): boolean {
  if (from === 'documents_requested' && to === 'documents_uploaded') return true
  if (from === 'offer_started' && to === 'offer_submitted') return true
  if (to === 'withdrawn') return applicantOpenStatuses(type).has(from)
  return false
}

function coded(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(forbiddenError(`Forbidden: ${message}`), { code })
}
const transitionError = (m: string) => coded(APPLICATION_TRANSITION_FORBIDDEN, m)
const lockedError = (m: string) => coded(APPLICATION_FIELD_LOCKED, m)

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function asRow(v: unknown): Row | null {
  if (typeof v === 'string') {
    try {
      return asRow(JSON.parse(v))
    } catch {
      return null
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null
}

/** Order-insensitive JSON for comparing a sent object with the stored one. */
function stable(v: unknown): string {
  if (v == null) return 'null'
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (typeof v === 'object') {
    const o = v as Row
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}

/** The workflow status a payload asks for (workflowStatus, else a stage label). */
function requestedStatus(type: AppType, data: Row): WorkflowStatusKey | undefined {
  const wf = str(data.workflowStatus)
  if (wf) return wf as WorkflowStatusKey
  const stage = str(data.stage)
  if (!stage) return undefined
  const byLabel = getWorkflowTemplate(type).stages.find((s) => s.label === stage)?.key
  return byLabel ?? resolveWorkflowStatus({ type, stage, workflowStatus: undefined } as never)
}

function setDerived(data: Row, type: AppType, to: WorkflowStatusKey): void {
  data.workflowStatus = to
  data.stage = workflowStageLabel(type, to)
  data.progress = workflowProgress(type, to)
  const db = DB_STATUS_FOR[to]
  if (db) data.status = db
  else delete data.status // eSign mirror: applications.status is kept (writer)
}

function dropWorkflowFields(data: Row): void {
  for (const k of ['workflowStatus', 'stage', 'status', 'progress']) delete data[k]
}

/** stage / status in the payload must agree with `to` (or be absent). */
function assertConsistent(data: Row, type: AppType, accept: readonly WorkflowStatusKey[], what: string): void {
  const stage = str(data.stage)
  if (stage) {
    const fromStage = requestedStatus(type, { stage })
    const ok = accept.some((to) => fromStage === to || stage === workflowStageLabel(type, to))
    if (!ok) throw transitionError(`${what}: stage "${stage}" does not match ${accept.join(' / ')}`)
  }
  const status = str(data.status)
  if (status) {
    const norm = status.toUpperCase().replace(/\s+/g, '_')
    const ok = accept.some((to) => norm === DB_STATUS_FOR[to] || norm === to.toUpperCase())
    if (!ok) throw transitionError(`${what}: status "${status}" does not match ${accept.join(' / ')}`)
  }
}

export { lockDocumentReviewFields } from '../src/lib/lockDocumentReviewFields.js'

export type StoredApplication = {
  status: string | null
  application_type: string | null
  metadata: unknown
  uploaded_docs_json: unknown
}

async function loadStored(uuid: string): Promise<StoredApplication | null> {
  const rows = await query<StoredApplication>(
    `SELECT status, application_type, metadata, uploaded_docs_json FROM applications WHERE id = $1::uuid`,
    [uuid],
  )
  return rows[0] ?? null
}

export function storedWorkflowStatus(type: AppType, row: StoredApplication): WorkflowStatusKey {
  const meta = asRow(row.metadata) ?? {}
  const wf = str(meta.workflow_status)
  if (wf) return wf as WorkflowStatusKey
  if (str(meta.stage)) {
    const fromStage = requestedStatus(type, { stage: meta.stage })
    if (fromStage) return fromStage
  }
  return WORKFLOW_FROM_DB_STATUS[String(row.status ?? '').toUpperCase()] ?? applicantCreateStatus(type)
}

async function actorEmail(actor: DemoActor): Promise<string | null> {
  const uuid = await resolveUuid('user', actor.userId)
  if (!uuid) return null
  const rows = await query<{ email: string | null }>(`SELECT email FROM users WHERE id = $1::uuid`, [uuid])
  const e = rows[0]?.email
  return typeof e === 'string' && e ? e.trim().toLowerCase() : null
}

/** viewingSlotId may point only at a slot the actor holds a live booking on. */
async function assertOwnSlotBooking(actor: DemoActor, slotFe: string): Promise<void> {
  const slot = await resolveUuid('viewing_slot', slotFe)
  const email = await actorEmail(actor)
  if (!slot || !email) throw lockedError(`viewingSlotId ${slotFe}: no booking of yours on that slot`)
  const rows = await query<{ n: number | string }>(
    `SELECT COUNT(*)::int AS n FROM bookings
      WHERE slot_id = $1::uuid AND LOWER(visitor_email) = $2 AND UPPER(COALESCE(status, '')) <> 'CANCELLED'`,
    [slot, email],
  )
  if (!Number(rows[0]?.n ?? 0)) throw lockedError(`viewingSlotId ${slotFe}: no booking of yours on that slot`)
}

/** Agency records on the application; an applicant's write never sets them. */
const AGENCY_ONLY_FIELDS = ['pcrInspections', 'purchaseClosing'] as const

/** Locked non-workflow fields: unchanged -> dropped, changed -> 403. */
async function enforceLockedFields(actor: DemoActor, data: Row, meta: Row | null): Promise<void> {
  // The applicant's client sends its whole copy back; drop (not refuse) these.
  for (const k of AGENCY_ONLY_FIELDS) delete data[k]
  if (Object.prototype.hasOwnProperty.call(data, 'applicantUserId')) {
    const sent = data.applicantUserId
    if (sent != null && sent !== '' && sent !== actor.userId) {
      throw lockedError('applicantUserId cannot be changed')
    }
    delete data.applicantUserId
  }
  if (Object.prototype.hasOwnProperty.call(data, 'keyCollection')) {
    if (stable(data.keyCollection) !== stable(meta?.keyCollection ?? null)) {
      throw lockedError('keyCollection is set by the agency')
    }
    delete data.keyCollection
  }
  if (Object.prototype.hasOwnProperty.call(data, 'viewingSlotId')) {
    const sent = str(data.viewingSlotId) ?? null
    const prev = str(meta?.viewingSlotId) ?? null
    if (sent === prev || sent === null) {
      // Unchanged, or no slot: nothing to write (a slot is cleared by staff).
      if (sent === null && prev !== null) throw lockedError('viewingSlotId is cleared by the agency')
      delete data.viewingSlotId
    } else {
      await assertOwnSlotBooking(actor, sent)
    }
  }
}

/**
 * Applicant application write (body.data mutated in place). `existing` is
 * whether the gate found a stored row.
 */
export async function enforceApplicantApplicationWrite(
  actor: DemoActor,
  feId: string,
  data: Row,
  existing: boolean,
): Promise<void> {
  // Their own contact details may be edited; a blank value keeps the stored
  // one (the agency needs a way to reach the applicant).
  for (const k of ['email', 'phone']) {
    if (Object.prototype.hasOwnProperty.call(data, k) && !str(data[k])) delete data[k]
  }

  if (!existing) {
    const type: AppType = str(data.type)?.toLowerCase().startsWith('p') ? 'Purchase' : 'Rental'
    const initial = applicantCreateStatus(type)
    // The client files every new application as application_submitted.
    const accept: WorkflowStatusKey[] = [...new Set<WorkflowStatusKey>([initial, 'application_submitted'])]
    const asked = requestedStatus(type, data)
    if (asked && !accept.includes(asked)) {
      throw transitionError(`a new application starts at ${initial}, not ${asked}`)
    }
    assertConsistent(data, type, accept, 'new application')
    if (data.keyCollection != null) throw lockedError('keyCollection is set by the agency')
    delete data.keyCollection
    for (const k of AGENCY_ONLY_FIELDS) delete data[k]
    const slot = str(data.viewingSlotId)
    if (slot) await assertOwnSlotBooking(actor, slot)
    setDerived(data, type, initial)
    if (Array.isArray(data.documents)) data.documents = lockDocumentReviewFields(data.documents, [])
    // The viewing gate runs once, in the write itself (upsertApplication ->
    // viewingEvidenceForNewApplication), on the applicant's resolved account
    // uuid, and fails closed. No pre-check here: it would duplicate that
    // decision with a second, weaker copy.
    return
  }

  const uuid = await resolveUuid('application', feId)
  const row = uuid ? await loadStored(uuid) : null
  if (!uuid || !row) {
    // Mapped but not readable: refuse rather than guess the stored status.
    throw transitionError(`application ${feId} could not be read`)
  }
  const type: AppType = String(row.application_type ?? '').toUpperCase() === 'PURCHASE' ? 'Purchase' : 'Rental'
  const meta = asRow(row.metadata)
  await enforceLockedFields(actor, data, meta)
  const docsJson = asRow(row.uploaded_docs_json) ?? {}
  const storedDocs = Array.isArray(docsJson.documents) ? (docsJson.documents as Row[]) : []
  if (Array.isArray(data.documents)) data.documents = lockDocumentReviewFields(data.documents, storedDocs)

  const from = storedWorkflowStatus(type, row)
  const asked = requestedStatus(type, data)

  if (!asked || asked === from) {
    const status = str(data.status)
    if (status) {
      const norm = status.toUpperCase().replace(/\s+/g, '_')
      if (norm !== String(row.status ?? '').toUpperCase() && norm !== from.toUpperCase()) {
        throw transitionError(`status "${status}" cannot be set by the applicant`)
      }
    }
    if (asked && str(data.stage)) assertConsistent({ stage: data.stage }, type, [from], 'unchanged workflow')
    dropWorkflowFields(data) // unchanged: the writer keeps the stored values
    return
  }

  if (ESIGN_MIRROR_STATUSES.has(asked)) {
    const fromLease = await storedLeaseESignStatus(uuid)
    if (fromLease !== asked) {
      throw coded(LEASE_SIGNATURE_NOT_RECORDED, `${asked} is not what the stored lease envelope shows (${fromLease ?? 'none'})`)
    }
    assertConsistent({ stage: data.stage }, type, [asked, from], `eSign mirror ${from} -> ${asked}`)
    if (stageOrder(type, asked) <= stageOrder(type, from)) {
      // Already past this point (e.g. deposit invoice issued): nothing to mirror.
      dropWorkflowFields(data)
      return
    }
    setDerived(data, type, asked)
    return
  }

  if (!applicantMoveAllowed(type, from, asked)) {
    throw transitionError(`an applicant cannot move an application from ${from} to ${asked}`)
  }
  if (asked === 'documents_uploaded') {
    const docs = (Array.isArray(data.documents) ? data.documents : storedDocs) as ApplicationDocument[]
    if (!docs.length || !allDocsUploaded(docs)) {
      throw transitionError('documents_uploaded needs every document uploaded')
    }
  }
  assertConsistent(data, type, [asked], `${from} -> ${asked}`)
  setDerived(data, type, asked)
}

/** Terminal stages: a staff save may always set them, and a stored terminal stage never unlocks a later stage. */
const STAFF_UNGATED_TERMINAL: ReadonlySet<string> = new Set(['rejected', 'cancelled', 'withdrawn', 'closed', 'refunded', 'deposit_refunded'])

/**
 * CR10 gate (Jim's spec): the staff application save runs the same
 * stored-envelope check applicants and landlords get, for EVERY stage at or
 * after tenant_signed (order from the workflow's stage list):
 *  - order above landlord_signed, or landlord_signed itself: needs landlord_signed;
 *  - tenant_signed: needs tenant_signed;
 *  - earlier stages and terminal stages: nothing.
 * Skipped when the STORED workflow_status is already at or past the required
 * stage (an already-advanced application, e.g. a lease that predates e-sign,
 * keeps saving). Otherwise the stored lease envelope must show at least the
 * required stage, else 409 LEASE_SIGNATURE_NOT_RECORDED before any write.
 */
export async function enforceStaffSignedStageMove(body: { resource: string; action: string; id: string; data?: Row }): Promise<void> {
  if (body.resource !== 'application' || body.action === 'delete') return
  const data = (body.data ?? {}) as Row
  const type: AppType = String(data.type ?? '').toLowerCase() === 'purchase' ? 'Purchase' : 'Rental'
  const asked = requestedStatus(type, data)
  if (!asked) return
  if (STAFF_UNGATED_TERMINAL.has(asked)) return
  const tenantOrder = stageOrder(type, 'tenant_signed')
  const landlordOrder = stageOrder(type, 'landlord_signed')
  if (tenantOrder < 0 || landlordOrder < 0) return // template without lease signing
  const askedOrder = stageOrder(type, asked)
  let required: WorkflowStatusKey | null = null
  if (askedOrder >= landlordOrder) required = 'landlord_signed'
  else if (askedOrder >= tenantOrder) required = 'tenant_signed'
  if (!required) return
  const requiredOrder = stageOrder(type, required)
  const uuid = await resolveUuid('application', body.id)
  if (uuid) {
    const rows = await query<{ workflow_status: string | null }>(
      `SELECT metadata->>'workflow_status' AS workflow_status FROM applications WHERE id = $1::uuid`,
      [uuid],
    )
    const stored = rows[0]?.workflow_status
    // Terminal stages sort above every active stage, so a stored terminal
    // stage (rejected, withdrawn, ...) never counts as "already past".
    if (stored && !STAFF_UNGATED_TERMINAL.has(stored) && stageOrder(type, stored as WorkflowStatusKey) >= requiredOrder) return
  }
  const fromLease = uuid ? await storedLeaseESignStatus(uuid) : null
  if (fromLease && stageOrder(type, fromLease) >= requiredOrder) return
  // A lease with no landlord part (pipeline.ts skips it without a landlord id)
  // reads back as tenant_signed; its raw stored status 'completed' meets
  // landlord_signed here (only in this gate).
  if (uuid && required === 'landlord_signed') {
    const raw = await query<{ esign: unknown }>(
      `SELECT metadata->'eSign' AS esign FROM leases WHERE application_id = $1::uuid
        ORDER BY updated_at DESC NULLS LAST LIMIT 1`,
      [uuid],
    )
    if (asRow(raw[0]?.esign)?.status === 'completed') return
  }
  throw Object.assign(
    coded(LEASE_SIGNATURE_NOT_RECORDED, `${asked} needs ${required} on the stored lease envelope (it shows ${fromLease ?? 'none'})`),
    { status: 409 },
  )
}

/** Staff transition into credit_check requires every adult NCA consent on file. */
export async function enforceStaffCreditCheckConsent(body: {
  resource: string
  action: string
  id: string
  data?: Row
}): Promise<void> {
  if (body.resource !== 'application' || body.action === 'delete') return
  const data = (body.data ?? {}) as Row
  const type: AppType = str(data.type)?.toLowerCase().startsWith('p') ? 'Purchase' : 'Rental'
  if (type !== 'Rental') return
  const asked = requestedStatus(type, data)
  if (asked !== 'credit_check') return
  const uuid = await resolveUuid('application', body.id)
  if (!uuid) return
  const stored = await loadStored(uuid)
  if (!stored) return
  const meta = asRow(stored.metadata) ?? {}
  const docsJson = asRow(stored.uploaded_docs_json) ?? {}
  const incomingConsents = data.creditCheckConsents ?? docsJson.creditCheckConsents
  const app = {
    type: 'Rental' as const,
    applicantName: str(meta.applicant_name) ?? 'Applicant',
    idNumberOrPassport: str(meta.id_number_or_passport) ?? '',
    creditCheckConsents: incomingConsents as Application['creditCheckConsents'],
    creditConsent: typeof docsJson.creditConsent === 'boolean' ? docsJson.creditConsent : false,
    screeningConsent:
      meta.screeningConsent && typeof meta.screeningConsent === 'object'
        ? (meta.screeningConsent as Application['screeningConsent'])
        : undefined,
  } as Application
  if (!hasAllAdultCreditConsents(app)) {
    throw transitionError('credit_check requires POPIA / NCA consent for every adult on the application')
  }
}
