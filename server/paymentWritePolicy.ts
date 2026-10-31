/**
 * Slice A: the payment write guard (staff writes through /api/persist).
 *
 * Runs inside assertPersistAllowed, inside the transaction gatedPersist opens
 * for every payment op, so the FOR UPDATE read below holds the row until the
 * writer (writes.ts upsertPayment / deleteEntity) commits. Portal roles never
 * reach it: the tenant's narrow proof-of-payment path (portalWritePolicy.ts)
 * is unchanged, landlords and contractors are refused there.
 *
 * Codes (src/lib/api/persistRefusal.ts has the sentences):
 *   403 PAYMENT_AGENCY_MISMATCH       another agency's row / unit / ledger
 *   403 PAYMENT_APPLICATION_MISMATCH  applicationId / tenancyId not this unit's
 *   403 PAYMENT_PERMISSION_REQUIRED   no effective payments.manage (or out of scope)
 *   409 PAYMENT_TERMINAL              the row is PAID
 *   409 PAYMENT_CANCELLED             the row is CANCELLED
 *   400 PAYMENT_PAID_REFERENCE_REQUIRED, PAYMENT_AMOUNT_REASON_REQUIRED
 * (400 PAYMENT_AMOUNT_REQUIRED is the writer's: a create with no amount.)
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import type { PersistBody } from './writes.js'
import type { DemoActor } from './actor.js'

export type PaymentCode =
  | 'PAYMENT_AGENCY_MISMATCH'
  | 'PAYMENT_APPLICATION_MISMATCH'
  | 'PAYMENT_PERMISSION_REQUIRED'
  | 'PAYMENT_TERMINAL'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_PAID_REFERENCE_REQUIRED'
  | 'PAYMENT_AMOUNT_REASON_REQUIRED'
  | 'PAYMENT_AMOUNT_REQUIRED'

export function paymentError(status: number, code: PaymentCode, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code })
}

/** A PAID or CANCELLED row is final for staff. */
export function terminalPaymentError(status: string | null | undefined): (Error & { status: number; code: string }) | null {
  if (status === 'PAID') return paymentError(409, 'PAYMENT_TERMINAL', 'Conflict: this payment is already marked paid')
  if (status === 'CANCELLED') return paymentError(409, 'PAYMENT_CANCELLED', 'Conflict: this payment was cancelled')
  return null
}

const PAY_STATUS_TO_DB: Record<string, string> = { Due: 'DUE', Paid: 'PAID', Overdue: 'OVERDUE', Cancelled: 'CANCELLED' }
/** Entry rows a role without payments.manage may create on approval (FE labels). */
const ENTRY_TYPES = new Set(['Deposit', 'First Month Rent', 'Sale Deposit'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function strOrNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v)
  return s === '' ? null : s
}
const trimmed = (v: unknown) => (v == null ? '' : String(v).trim())
const present = (d: Record<string, unknown>, k: string) => d[k] != null && d[k] !== ''

export function toCents(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** The status the save asks for, in DB terms; null when the payload leaves it out. */
export function requestedPaymentStatus(d: Record<string, unknown>): string | null {
  if (!present(d, 'status')) return null
  return PAY_STATUS_TO_DB[String(d.status)] ?? 'DUE'
}

/** writes.ts unitIdFromProperty in uuid space: FE property / unit id, or a raw uuid. */
async function unitUuidFor(propertyId: string): Promise<string | null> {
  return (await resolveUuid('property', propertyId)) ?? (await resolveUuid('unit', propertyId))
}

type StoredPayment = {
  status: string
  amount: string
  notes: string | null
  reference: string | null
  due_date: string
  client_id: string
}

/** Policy read of the stored row, locked until the transaction ends. */
async function lockStoredPayment(uuid: string): Promise<StoredPayment | null> {
  const rows = await query<StoredPayment>(
    `SELECT status, amount::text AS amount, notes, reference, due_date::text AS due_date, client_id::text AS client_id
       FROM payments WHERE id = $1::uuid FOR UPDATE`,
    [uuid],
  )
  return rows[0] ?? null
}

export type PaymentCreateFacts = {
  /** FE property id to scope the create on (the unit the writer will write), or null. */
  propertyId: string | null
  applicationFe: string | null
}

/**
 * A1 create checks, in uuid space, on what the writer will write. Throws
 * PAYMENT_AGENCY_MISMATCH / PAYMENT_APPLICATION_MISMATCH; returns the FE
 * property to scope on.
 */
export async function enforcePaymentCreateScope(
  actor: DemoActor,
  data: Record<string, unknown>,
  deps: { fePropertyFromUnit: (unitUuid: string) => Promise<string | null> },
): Promise<PaymentCreateFacts> {
  const deny = (code: PaymentCode, why: string) =>
    paymentError(403, code, `Forbidden: ${actor.role} ${actor.userId} cannot create payment (${why})`)
  const agencyRaw = strOrNull(data.agencyId) ?? strOrNull(data.clientId)
  const agencyUuid = agencyRaw ? await resolveUuid('agency', agencyRaw) : null
  if (!agencyUuid) throw deny('PAYMENT_AGENCY_MISMATCH', 'agency does not resolve')

  const propertyRaw = strOrNull(data.propertyId)
  let unitUuid: string | null = null
  let propertyId: string | null = null
  if (propertyRaw) {
    const resolved = await unitUuidFor(propertyRaw)
    const unit = resolved && UUID_RE.test(resolved)
      ? (await query<{ client_id: string }>(`SELECT client_id::text AS client_id FROM units WHERE id = $1::uuid`, [resolved]))[0]
      : undefined
    if (!unit) throw deny('PAYMENT_AGENCY_MISMATCH', 'property is not a unit')
    if (unit.client_id !== agencyUuid) throw deny('PAYMENT_AGENCY_MISMATCH', "agency is not the unit's agency")
    unitUuid = resolved
    propertyId = (await deps.fePropertyFromUnit(resolved!)) ?? propertyRaw
  } else if (actor.role !== 'super_admin') {
    const actorAgency = actor.agencyId ? await resolveUuid('agency', actor.agencyId) : null
    if (!actorAgency || actorAgency !== agencyUuid) throw deny('PAYMENT_AGENCY_MISMATCH', "not the actor's agency")
  }

  const applicationFe = strOrNull(data.applicationId)
  if (applicationFe) {
    const appUuid = await resolveUuid('application', applicationFe)
    const app = appUuid && UUID_RE.test(appUuid)
      ? (await query<{ client_id: string; unit_id: string | null; applicant_id: string | null }>(
          `SELECT client_id::text AS client_id, unit_id::text AS unit_id, applicant_id::text AS applicant_id FROM applications WHERE id = $1::uuid`,
          [appUuid],
        ))[0]
      : undefined
    if (!app) throw deny('PAYMENT_APPLICATION_MISMATCH', 'application does not resolve')
    if (app.client_id !== agencyUuid) throw deny('PAYMENT_APPLICATION_MISMATCH', "application is another agency's")
    if (unitUuid && app.unit_id !== unitUuid) throw deny('PAYMENT_APPLICATION_MISMATCH', 'application is on another unit')
    const partyRaw = strOrNull(data.partyUserId)
    if (partyRaw) {
      const party = await resolveUuid('user', partyRaw)
      if (!party || party !== app.applicant_id) throw deny('PAYMENT_APPLICATION_MISMATCH', 'payer is not the applicant')
    }
  }

  const tenancyRaw = strOrNull(data.tenancyId)
  if (tenancyRaw) {
    const leaseUuid = await resolveUuid('tenancy', tenancyRaw)
    if (leaseUuid && UUID_RE.test(leaseUuid)) {
      const lease = (await query<{ client_id: string; unit_id: string }>(
        `SELECT client_id::text AS client_id, unit_id::text AS unit_id FROM leases WHERE id = $1::uuid`,
        [leaseUuid],
      ))[0]
      if (!lease || lease.client_id !== agencyUuid) throw deny('PAYMENT_APPLICATION_MISMATCH', "lease is not this agency's")
    }
  }
  return { propertyId, applicationFe }
}

/**
 * MUST 6: the coded refusal when canWriteEntity says no. Another agency's row
 * (stored agency, else the payload's) is PAYMENT_AGENCY_MISMATCH; the actor's
 * own agency but out of scope is PAYMENT_PERMISSION_REQUIRED.
 */
export async function paymentNotAllowedError(
  actor: DemoActor,
  body: PersistBody,
  rowAgency: string | null,
): Promise<Error & { status: number; code: string }> {
  const rowUuid = rowAgency ? await resolveUuid('agency', rowAgency) : null
  const actorUuid = actor.agencyId ? await resolveUuid('agency', actor.agencyId) : null
  const msg = `Forbidden: ${actor.role} ${actor.userId} cannot ${body.action} payment ${body.id}`
  if (!rowUuid || rowUuid !== actorUuid) return paymentError(403, 'PAYMENT_AGENCY_MISMATCH', `${msg} (another agency's payment)`)
  return paymentError(403, 'PAYMENT_PERMISSION_REQUIRED', `${msg} (out of scope)`)
}

/**
 * A2-A5, after the scope check passed. `canWriteApplication` is the scope
 * check for the named application (the ground-agent exception).
 */
export async function enforcePaymentWritePolicy(
  actor: DemoActor,
  body: PersistBody,
  deps: {
    canManage: () => Promise<boolean>
    canWriteApplication: (applicationFe: string) => Promise<boolean>
    existing: boolean
  },
): Promise<void> {
  const data = body.data ?? {}
  const permissionError = () =>
    paymentError(403, 'PAYMENT_PERMISSION_REQUIRED', `Forbidden: ${actor.role} ${actor.userId} cannot ${body.action} payment ${body.id} (payments.manage)`)
  const uuid = await resolveUuid('payment', body.id)
  const stored = uuid && UUID_RE.test(uuid) ? await lockStoredPayment(uuid) : null

  if (body.action === 'delete') {
    if (!stored) return // gone already: the writer stays idempotent
    if (!(await deps.canManage())) throw permissionError()
    const terminal = terminalPaymentError(stored.status)
    if (terminal) throw terminal
    return
  }

  if (!stored) {
    if (await deps.canManage()) {
      enforceMarkPaidEvidence(null, data)
      return
    }
    // A2 exception: a new approval entry row on an application the actor may write.
    const status = requestedPaymentStatus(data)
    const applicationFe = strOrNull(data.applicationId)
    const ok =
      ENTRY_TYPES.has(String(data.type ?? '')) &&
      (status === null || status === 'DUE') &&
      !present(data, 'paidAt') &&
      !present(data, 'paidAmount') &&
      !present(data, 'method') &&
      !!applicationFe &&
      !!strOrNull(data.partyUserId) &&
      (await deps.canWriteApplication(applicationFe))
    if (!ok) throw permissionError()
    return
  }

  if (!(await deps.canManage())) throw permissionError()
  const terminal = terminalPaymentError(stored.status)
  if (terminal) throw terminal
  enforceMarkPaidEvidence(stored, data)
  const fromCents = toCents(stored.amount)
  const toCentsValue = toCents(data.amount)
  if (toCentsValue !== null && toCentsValue !== fromCents && !trimmed(data.amountChangeReason)) {
    throw paymentError(400, 'PAYMENT_AMOUNT_REASON_REQUIRED', 'Bad request: give a reason for changing the amount')
  }
}

/** A3: marking paid needs a reference (typed or stored) or a typed note that is new. */
function enforceMarkPaidEvidence(stored: StoredPayment | null, data: Record<string, unknown>): void {
  const next = requestedPaymentStatus(data) ?? stored?.status ?? 'DUE'
  if (next !== 'PAID' || stored?.status === 'PAID') return
  const reference = trimmed(data.reference) || trimmed(stored?.reference)
  const notes = trimmed(data.notes)
  if (reference) return
  if (notes && notes !== trimmed(stored?.notes)) return
  throw paymentError(400, 'PAYMENT_PAID_REFERENCE_REQUIRED', 'Bad request: add the reference or a note to mark this paid')
}
