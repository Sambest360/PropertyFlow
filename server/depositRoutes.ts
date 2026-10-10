/**
 * Deposit release dual control (follow-up to #80). The only way a deposit
 * moves out of `held`: generic persist never sets status or release_*_by (see
 * upsertDepositHolding).
 *
 * POST /api/trust/deposits/:id/propose-release
 *   held -> release_proposed, release_proposed_by = the actor. Super admin, or
 *   an agency admin (client_admin / agent_admin) of the deposit's agency with
 *   trust.allocate or trust.approve_payout (stored permissions).
 * POST /api/trust/deposits/:id/approve-release
 *   release_proposed -> release_approved, release_approved_by = the actor.
 *   Super admin, or a same-agency agency admin with trust.approve_payout; never
 *   the proposer (two-person rule, checked by user uuid).
 *
 * Each transition is one conditional UPDATE (status, and for approve the
 * proposer, in the WHERE), so a race loses with 409. release_approved is not
 * refunded: paying the money out stays a separate, manual step.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { forbiddenError, type DemoActor } from './actor.js'
import { actorStoredCan, agencyFeId } from './scopeGate.js'
import type { Permission } from '../src/types/domain.js'

type DepositRow = {
  id: string
  client_id: string
  status: string
  release_proposed_by: string | null
  release_approved_by: string | null
  held_cents?: number | string | null
  interest_accrued_cents?: number | string | null
}

const DEPOSIT_ADMIN_ROLES: ReadonlySet<string> = new Set(['client_admin', 'agent_admin'])

export const DEPOSIT_PROPOSE_PERMS: readonly Permission[] = ['trust.allocate', 'trust.approve_payout']
export const DEPOSIT_APPROVE_PERMS: readonly Permission[] = ['trust.approve_payout']

function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

async function loadDeposit(feId: string): Promise<DepositRow> {
  const uuid = await resolveUuid('deposit_holding', feId)
  if (!uuid) throw httpError(404, 'Deposit not found')
  const rows = await query<DepositRow>(
    `SELECT id::text AS id, client_id::text AS client_id, status,
            release_proposed_by::text AS release_proposed_by,
            release_approved_by::text AS release_approved_by,
            held_cents, interest_accrued_cents
       FROM deposit_holdings WHERE id = $1::uuid LIMIT 1`,
    [uuid],
  )
  const row = rows[0]
  if (!row) throw httpError(404, 'Deposit not found')
  return row
}

/** Role + agency + permission. Returns the actor's user uuid. */
async function assertDepositOfficer(
  actor: DemoActor,
  row: DepositRow,
  verb: string,
  perms: readonly Permission[],
): Promise<string> {
  const deny = (why: string) =>
    forbiddenError(`Forbidden: ${actor.role} ${actor.userId} cannot ${verb} deposit release (${why})`)
  if (actor.role !== 'super_admin') {
    if (!DEPOSIT_ADMIN_ROLES.has(actor.role)) throw deny('only an agency admin with trust permission')
    const actorAgency = await agencyFeId(actor.agencyId)
    const rowAgency = await agencyFeId(row.client_id)
    if (!actorAgency || actorAgency !== rowAgency) throw deny('deposit is outside your agency')
    if (!(await actorStoredCan(actor, perms))) throw deny(`missing ${perms.join(' or ')}`)
  }
  const uuid = await resolveUuid('user', actor.userId)
  if (!uuid) throw deny('unknown user')
  return uuid
}

export type DepositTransitionResult = {
  ok: true
  /** Only the fields the transition changed (the client merges them in). */
  deposit: {
    id: string
    status: 'held' | 'release_proposed' | 'release_approved' | 'refunded'
    releaseProposedBy?: string | null
    releaseApprovedBy?: string | null
    refund?: DepositRefundRecord
    updatedAt: string
  }
}

export async function proposeDepositRelease(actor: DemoActor, feId: string): Promise<DepositTransitionResult> {
  const row = await loadDeposit(feId)
  const proposer = await assertDepositOfficer(actor, row, 'propose', DEPOSIT_PROPOSE_PERMS)
  if (row.status !== 'held') {
    throw httpError(409, `Deposit is ${row.status}; only held deposits can propose release`)
  }
  const updated = await query<{ updated_at: Date | string }>(
    `UPDATE deposit_holdings
        SET status = 'release_proposed', release_proposed_by = $2::uuid,
            release_approved_by = NULL, updated_at = NOW()
      WHERE id = $1::uuid AND status = 'held'
      RETURNING updated_at`,
    [row.id, proposer],
  )
  if (!updated[0]) throw httpError(409, 'Deposit changed while proposing; reload and try again')
  return {
    ok: true,
    deposit: {
      id: feId,
      status: 'release_proposed',
      releaseProposedBy: actor.userId,
      releaseApprovedBy: null,
      updatedAt: new Date(updated[0].updated_at).toISOString(),
    },
  }
}

export async function approveDepositRelease(actor: DemoActor, feId: string): Promise<DepositTransitionResult> {
  const row = await loadDeposit(feId)
  const approver = await assertDepositOfficer(actor, row, 'approve', DEPOSIT_APPROVE_PERMS)
  if (row.status !== 'release_proposed') {
    throw httpError(409, `Deposit is ${row.status}; only a proposed release can be approved`)
  }
  if (!row.release_proposed_by) {
    throw httpError(409, 'Release has no recorded proposer; dual control cannot be checked')
  }
  if (row.release_proposed_by === approver) {
    throw forbiddenError('Dual control: the proposer cannot approve their own deposit release')
  }
  const updated = await query<{ updated_at: Date | string }>(
    `UPDATE deposit_holdings
        SET status = 'release_approved', release_approved_by = $2::uuid, updated_at = NOW()
      WHERE id = $1::uuid
        AND status = 'release_proposed'
        AND release_proposed_by IS NOT NULL
        AND release_proposed_by <> $2::uuid
      RETURNING updated_at`,
    [row.id, approver],
  )
  if (!updated[0]) throw httpError(409, 'Deposit changed while approving; reload and try again')
  return {
    ok: true,
    deposit: {
      id: feId,
      status: 'release_approved',
      releaseApprovedBy: actor.userId,
      updatedAt: new Date(updated[0].updated_at).toISOString(),
    },
  }
}

/* ------------------------------------------------------------------ */
/* D2: reject, cancel, record refund. Each is one conditional UPDATE   */
/* (409 on a race) plus an append-only event_log row.                  */
/* ------------------------------------------------------------------ */

/** UI / API copy for a recorded refund. Never "Refunded" or "settled". */
export const DEPOSIT_REFUND_RECORDED_LABEL = 'Refund recorded (not bank-confirmed)'

export type DepositRefundDeduction = { reason: string; amountCents: number }
export type DepositRefundRecord = {
  refundedCents: number
  deductions: DepositRefundDeduction[]
  interestCents: number
  heldCents: number
  recordedBy: string
  recordedAt: string
  bankConfirmed: false
  label: typeof DEPOSIT_REFUND_RECORDED_LABEL
}

const LOCKED_STATUSES = ['release_proposed', 'release_approved', 'refunded'] as const
export const DEPOSIT_HELD_LOCKED_STATUSES: readonly string[] = LOCKED_STATUSES

function cents(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function isCentsInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1e12
}

async function logDepositEvent(
  row: DepositRow,
  actorUuid: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, $2::uuid, $3, 'deposit_holding', $4::uuid, $5::uuid, $6::jsonb, NOW())`,
    [randomUUID(), row.client_id, eventType, row.id, actorUuid, JSON.stringify({ ...payload, actorUserId: actorUuid })],
  )
}

function iso(v: Date | string): string {
  return new Date(v).toISOString()
}

/** POST /:id/reject-release {reason}: release_proposed -> held. */
export async function rejectDepositRelease(
  actor: DemoActor,
  feId: string,
  body: Record<string, unknown>,
): Promise<DepositTransitionResult> {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 1 || reason.length > 500) {
    throw httpError(400, 'A reason of 1 to 500 characters is required to reject a release')
  }
  const row = await loadDeposit(feId)
  const approver = await assertDepositOfficer(actor, row, 'reject', DEPOSIT_APPROVE_PERMS)
  if (row.status !== 'release_proposed') {
    throw httpError(409, `Deposit is ${row.status}; only a proposed release can be rejected`)
  }
  if (row.release_proposed_by === approver) {
    throw forbiddenError('Dual control: the proposer cannot reject their own deposit release; cancel it instead')
  }
  const at = new Date().toISOString()
  const updated = await query<{ updated_at: Date | string }>(
    `UPDATE deposit_holdings
        SET status = 'held', release_proposed_by = NULL, release_approved_by = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'rejectedBy', ($2::uuid)::text, 'rejectedAt', $3::text, 'rejectReason', $4::text),
            updated_at = NOW()
      WHERE id = $1::uuid AND status = 'release_proposed'
        AND release_proposed_by IS DISTINCT FROM $2::uuid
      RETURNING updated_at`,
    [row.id, approver, at, reason],
  )
  if (!updated[0]) throw httpError(409, 'Deposit changed while rejecting; reload and try again')
  await logDepositEvent(row, approver, 'deposit_release_rejected', {
    from: 'release_proposed',
    to: 'held',
    reason,
  })
  return {
    ok: true,
    deposit: { id: feId, status: 'held', releaseProposedBy: null, releaseApprovedBy: null, updatedAt: iso(updated[0].updated_at) },
  }
}

/** POST /:id/cancel-release: release_proposed | release_approved -> held. */
export async function cancelDepositRelease(
  actor: DemoActor,
  feId: string,
  body: Record<string, unknown>,
): Promise<DepositTransitionResult> {
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
  const row = await loadDeposit(feId)
  const officer = await assertDepositOfficer(actor, row, 'cancel', DEPOSIT_PROPOSE_PERMS)
  if (row.status !== 'release_proposed' && row.status !== 'release_approved') {
    throw httpError(409, `Deposit is ${row.status}; only a proposed or approved release can be cancelled`)
  }
  if (officer !== row.release_proposed_by && actor.role !== 'super_admin') {
    // Not the proposer: must be a same-agency trust approver.
    if (!(await actorStoredCan(actor, DEPOSIT_APPROVE_PERMS))) {
      throw forbiddenError('Only the proposer or a trust approver in the same agency can cancel this release')
    }
  }
  const from = row.status
  const at = new Date().toISOString()
  const updated = await query<{ updated_at: Date | string }>(
    `UPDATE deposit_holdings
        SET status = 'held', release_proposed_by = NULL, release_approved_by = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'cancelledBy', ($2::uuid)::text, 'cancelledAt', $3::text, 'cancelReason', $4::text),
            updated_at = NOW()
      WHERE id = $1::uuid AND status = $5
      RETURNING updated_at`,
    [row.id, officer, at, reason, from],
  )
  if (!updated[0]) throw httpError(409, 'Deposit changed while cancelling; reload and try again')
  await logDepositEvent(row, officer, 'deposit_release_cancelled', { from, to: 'held', reason })
  return {
    ok: true,
    deposit: { id: feId, status: 'held', releaseProposedBy: null, releaseApprovedBy: null, updatedAt: iso(updated[0].updated_at) },
  }
}

/** Validate a refund split. Returns the cleaned split or throws 400. */
export function validateRefundSplit(
  body: Record<string, unknown>,
  heldCents: number,
): { refundedCents: number; deductions: DepositRefundDeduction[]; interestCents: number } {
  const bad = (m: string) => httpError(400, m)
  const { refundedCents, interestCents } = body
  if (!isCentsInt(refundedCents)) throw bad('refundedCents must be a whole number of cents, 0 or more')
  if (!isCentsInt(interestCents)) throw bad('interestCents must be a whole number of cents, 0 or more')
  const raw = body.deductions ?? []
  if (!Array.isArray(raw) || raw.length > 50) throw bad('deductions must be a list (at most 50 lines)')
  const deductions: DepositRefundDeduction[] = raw.map((d, i) => {
    const line = (d ?? {}) as Record<string, unknown>
    const reason = typeof line.reason === 'string' ? line.reason.trim() : ''
    if (!reason) throw bad(`Deduction ${i + 1} needs a reason`)
    if (reason.length > 200) throw bad(`Deduction ${i + 1} reason is over 200 characters`)
    if (!isCentsInt(line.amountCents) || line.amountCents === 0) {
      throw bad(`Deduction ${i + 1} amountCents must be a whole number of cents above 0`)
    }
    return { reason, amountCents: line.amountCents }
  })
  const deducted = deductions.reduce((sum, d) => sum + d.amountCents, 0)
  if (refundedCents + deducted !== heldCents + interestCents) {
    throw bad(
      `Refund split does not balance: refunded ${refundedCents} + deductions ${deducted} must equal held ${heldCents} + interest ${interestCents}`,
    )
  }
  return { refundedCents, deductions, interestCents }
}

/**
 * POST /:id/refund {refundedCents, deductions[{reason, amountCents}], interestCents}:
 * release_approved -> refunded. Records only; no money moves. A second person:
 * never the approver of the release.
 */
export async function recordDepositRefund(
  actor: DemoActor,
  feId: string,
  body: Record<string, unknown>,
): Promise<DepositTransitionResult> {
  const row = await loadDeposit(feId)
  const recorder = await assertDepositOfficer(actor, row, 'record refund for', DEPOSIT_APPROVE_PERMS)
  if (row.status !== 'release_approved') {
    throw httpError(409, `Deposit is ${row.status}; a refund can only be recorded after release is approved`)
  }
  if (!row.release_approved_by) {
    throw httpError(409, 'Release has no recorded approver; the second-person check cannot be made')
  }
  if (row.release_approved_by === recorder) {
    throw forbiddenError('Dual control: the approver cannot also record the refund; a second person must')
  }
  const heldCents = cents(row.held_cents)
  const split = validateRefundSplit(body, heldCents)
  const refund: DepositRefundRecord = {
    ...split,
    heldCents,
    recordedBy: actor.userId,
    recordedAt: new Date().toISOString(),
    bankConfirmed: false,
    label: DEPOSIT_REFUND_RECORDED_LABEL,
  }
  const updated = await query<{ updated_at: Date | string }>(
    `UPDATE deposit_holdings
        SET status = 'refunded',
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
              'refund', $3::jsonb, 'refundedBy', ($2::uuid)::text, 'refundedAt', $4::text),
            updated_at = NOW()
      WHERE id = $1::uuid AND status = 'release_approved'
        AND release_approved_by IS DISTINCT FROM $2::uuid
      RETURNING updated_at`,
    [row.id, recorder, JSON.stringify(refund), refund.recordedAt],
  )
  if (!updated[0]) throw httpError(409, 'Deposit changed while recording the refund; reload and try again')
  await logDepositEvent(row, recorder, 'deposit_refund_recorded', {
    from: 'release_approved',
    to: 'refunded',
    reason: DEPOSIT_REFUND_RECORDED_LABEL,
    refund,
  })
  return { ok: true, deposit: { id: feId, status: 'refunded', refund, updatedAt: iso(updated[0].updated_at) } }
}
