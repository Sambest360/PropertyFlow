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
 * proposer, in the WHERE), so a race loses with 409. Each runs with its
 * event_log audit row in one transaction (D2). release_approved is not
 * refunded: paying the money out stays a separate, manual step.
 */
import { randomUUID } from 'node:crypto'
import { query, withTransaction, clientQuery } from './db.js'
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
  const updatedAt = await transitionWithAudit(
    row,
    proposer,
    `UPDATE deposit_holdings
        SET status = 'release_proposed', release_proposed_by = $2::uuid,
            release_approved_by = NULL, updated_at = NOW()
      WHERE id = $1::uuid AND status = 'held'
      RETURNING updated_at`,
    [row.id, proposer],
    'Deposit changed while proposing; reload and try again',
    'deposit_release_proposed',
    { from: 'held', to: 'release_proposed', reason: null },
  )
  return {
    ok: true,
    deposit: {
      id: feId,
      status: 'release_proposed',
      releaseProposedBy: actor.userId,
      releaseApprovedBy: null,
      updatedAt: iso(updatedAt),
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
  const updatedAt = await transitionWithAudit(
    row,
    approver,
    `UPDATE deposit_holdings
        SET status = 'release_approved', release_approved_by = $2::uuid, updated_at = NOW()
      WHERE id = $1::uuid
        AND status = 'release_proposed'
        AND release_proposed_by IS NOT NULL
        AND release_proposed_by <> $2::uuid
      RETURNING updated_at`,
    [row.id, approver],
    'Deposit changed while approving; reload and try again',
    'deposit_release_approved',
    { from: 'release_proposed', to: 'release_approved', reason: null },
  )
  return {
    ok: true,
    deposit: {
      id: feId,
      status: 'release_approved',
      releaseApprovedBy: actor.userId,
      updatedAt: iso(updatedAt),
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
  /** Interest is entered by staff, not checked against accrued interest. */
  interestEnteredBy: string
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

/**
 * Run the conditional status UPDATE and its event_log audit row in ONE
 * transaction. No row updated -> 409; an audit insert failure rolls the status
 * back. Who / when / reason / refund split live in event_log only.
 */
async function transitionWithAudit(
  row: DepositRow,
  actorUuid: string,
  updateSql: string,
  params: unknown[],
  conflictMessage: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<Date | string> {
  return withTransaction(async (client) => {
    const updated = await clientQuery<{ updated_at: Date | string }>(client, updateSql, params)
    if (!updated[0]) throw httpError(409, conflictMessage)
    await clientQuery(
      client,
      `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
       VALUES ($1::uuid, $2::uuid, $3, 'deposit_holding', $4::uuid, $5::uuid, $6::jsonb, NOW())`,
      [
        randomUUID(),
        row.client_id,
        eventType,
        row.id,
        actorUuid,
        JSON.stringify({ ...payload, actorUserId: actorUuid, at: new Date().toISOString() }),
      ],
    )
    return updated[0].updated_at
  })
}

/** Latest recorded refund per deposit uuid, from event_log rows (bootstrap read-back). */
export function latestRefundBySubject(
  rows: Array<{ id?: unknown; subject_id?: unknown; payload?: unknown; created_at?: unknown }>,
): Map<string, Record<string, unknown>> {
  const out = new Map<string, { at: number; id: string; refund: Record<string, unknown> }>()
  for (const r of rows) {
    const payload = (typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload) as
      | { refund?: Record<string, unknown> }
      | null
    if (!r.subject_id || !payload?.refund) continue
    const at = new Date(String(r.created_at ?? 0)).getTime() || 0
    const id = String(r.id ?? '')
    const prev = out.get(String(r.subject_id))
    // Newest wins; equal timestamps break on the event id (deterministic).
    if (!prev || at > prev.at || (at === prev.at && id > prev.id)) {
      out.set(String(r.subject_id), { at, id, refund: payload.refund })
    }
  }
  return new Map([...out].map(([k, v]) => [k, v.refund]))
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
  if (reason.length < 3 || reason.length > 500) {
    throw httpError(400, 'A reason of 3 to 500 characters is required to reject a release')
  }
  const row = await loadDeposit(feId)
  const approver = await assertDepositOfficer(actor, row, 'reject', DEPOSIT_APPROVE_PERMS)
  if (row.status !== 'release_proposed') {
    throw httpError(409, `Deposit is ${row.status}; only a proposed release can be rejected`)
  }
  if (row.release_proposed_by === approver) {
    throw forbiddenError('Dual control: the proposer cannot reject their own deposit release; cancel it instead')
  }
  const updatedAt = await transitionWithAudit(
    row,
    approver,
    `UPDATE deposit_holdings
        SET status = 'held', release_proposed_by = NULL, release_approved_by = NULL, updated_at = NOW()
      WHERE id = $1::uuid AND status = 'release_proposed'
        AND release_proposed_by IS DISTINCT FROM $2::uuid
      RETURNING updated_at`,
    [row.id, approver],
    'Deposit changed while rejecting; reload and try again',
    'deposit_release_rejected',
    { from: 'release_proposed', to: 'held', reason, rejectedBy: actor.userId },
  )
  return {
    ok: true,
    deposit: { id: feId, status: 'held', releaseProposedBy: null, releaseApprovedBy: null, updatedAt: iso(updatedAt) },
  }
}

/** POST /:id/cancel-release: release_proposed | release_approved -> held. Proposer or super admin only. */
export async function cancelDepositRelease(
  actor: DemoActor,
  feId: string,
  body: Record<string, unknown>,
): Promise<DepositTransitionResult> {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length > 500) throw httpError(400, 'A cancel reason can be at most 500 characters')
  const row = await loadDeposit(feId)
  const officer = await assertDepositOfficer(actor, row, 'cancel', DEPOSIT_PROPOSE_PERMS)
  if (row.status !== 'release_proposed' && row.status !== 'release_approved') {
    throw httpError(409, `Deposit is ${row.status}; only a proposed or approved release can be cancelled`)
  }
  // Spec: only the proposer or a super admin may cancel.
  if (actor.role !== 'super_admin' && officer !== row.release_proposed_by) {
    throw forbiddenError('Only the proposer or a super admin can cancel this release')
  }
  const from = row.status
  const updatedAt = await transitionWithAudit(
    row,
    officer,
    `UPDATE deposit_holdings
        SET status = 'held', release_proposed_by = NULL, release_approved_by = NULL, updated_at = NOW()
      WHERE id = $1::uuid AND status = $2
      RETURNING updated_at`,
    [row.id, from],
    'Deposit changed while cancelling; reload and try again',
    'deposit_release_cancelled',
    { from, to: 'held', reason, cancelledBy: actor.userId },
  )
  return {
    ok: true,
    deposit: { id: feId, status: 'held', releaseProposedBy: null, releaseApprovedBy: null, updatedAt: iso(updatedAt) },
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
    interestEnteredBy: actor.userId,
    recordedBy: actor.userId,
    recordedAt: new Date().toISOString(),
    bankConfirmed: false,
    label: DEPOSIT_REFUND_RECORDED_LABEL,
  }
  const updatedAt = await transitionWithAudit(
    row,
    recorder,
    `UPDATE deposit_holdings
        SET status = 'refunded', updated_at = NOW()
      WHERE id = $1::uuid AND status = 'release_approved'
        AND release_approved_by IS DISTINCT FROM $2::uuid
      RETURNING updated_at`,
    [row.id, recorder],
    'Deposit changed while recording the refund; reload and try again',
    'deposit_refund_recorded',
    { from: 'release_approved', to: 'refunded', reason: DEPOSIT_REFUND_RECORDED_LABEL, refund },
  )
  return { ok: true, deposit: { id: feId, status: 'refunded', refund, updatedAt: iso(updatedAt) } }
}
