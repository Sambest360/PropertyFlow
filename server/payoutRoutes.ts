/**
 * Payout dual control (Jim #80 B5). The only way a payout instruction moves
 * past `proposed`: generic persist creates proposals only (see
 * enforceTrustWritePolicy / upsertPayoutInstruction).
 *
 * POST /api/trust/payouts/:id/approve
 *   proposed | pending_approval -> approved. The approver must be a super admin
 *   or an agency admin (client_admin / agent_admin) of the payout's agency with
 *   trust.approve_payout (from their stored permissions), must not be the
 *   proposer and must not be the payee. Landlords, tenants, contractors and
 *   field agents never approve.
 * POST /api/trust/payouts/:id/submit
 *   approved -> submitted (settled_at / partner_payout_id stay NULL: submitted
 *   is not settled). Same role / agency / permission rule.
 *
 * Each transition is one conditional UPDATE (status + proposer checked in the
 * WHERE), so two concurrent requests cannot both move the same row.
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { forbiddenError, type DemoActor } from './actor.js'
import { actorStoredCan, agencyFeId } from './scopeGate.js'

type PayoutRow = {
  id: string
  client_id: string
  status: string
  proposed_by: string | null
  approved_by: string | null
  payee_id: string | null
}

const PAYOUT_ADMIN_ROLES: ReadonlySet<string> = new Set(['client_admin', 'agent_admin'])

function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

async function loadPayout(feId: string): Promise<PayoutRow> {
  const uuid = await resolveUuid('payout_instruction', feId)
  if (!uuid) throw httpError(404, 'Payout instruction not found')
  const rows = await query<PayoutRow>(
    `SELECT id::text AS id, client_id::text AS client_id, status,
            proposed_by::text AS proposed_by, approved_by::text AS approved_by, payee_id
       FROM payout_instructions WHERE id = $1::uuid LIMIT 1`,
    [uuid],
  )
  const row = rows[0]
  if (!row) throw httpError(404, 'Payout instruction not found')
  return row
}

/** Role + agency + trust.approve_payout. Returns the actor's user uuid. */
async function assertPayoutOfficer(actor: DemoActor, row: PayoutRow, verb: string): Promise<string> {
  const deny = (why: string) =>
    forbiddenError(`Forbidden: ${actor.role} ${actor.userId} cannot ${verb} payout (${why})`)
  if (actor.role !== 'super_admin') {
    if (!PAYOUT_ADMIN_ROLES.has(actor.role)) throw deny('only an agency admin with trust.approve_payout')
    const actorAgency = await agencyFeId(actor.agencyId)
    const rowAgency = await agencyFeId(row.client_id)
    if (!actorAgency || actorAgency !== rowAgency) throw deny('payout is outside your agency')
    if (!(await actorStoredCan(actor, ['trust.approve_payout']))) throw deny('missing trust.approve_payout')
  }
  const uuid = await resolveUuid('user', actor.userId)
  if (!uuid) throw deny('unknown user')
  if (row.payee_id && (row.payee_id === actor.userId || row.payee_id === uuid)) {
    throw deny('the payee cannot move their own payout')
  }
  return uuid
}

export type PayoutTransitionResult = {
  ok: true
  /** Only the fields the transition changed (the client merges them in). */
  instruction: {
    id: string
    status: 'approved' | 'submitted'
    approvedBy?: string
    submittedAt?: string
    settledAt?: null
    partnerPayoutId?: null
    updatedAt: string
  }
}

export async function approvePayout(actor: DemoActor, feId: string): Promise<PayoutTransitionResult> {
  const row = await loadPayout(feId)
  const approver = await assertPayoutOfficer(actor, row, 'approve')
  if (!row.proposed_by) {
    throw httpError(409, 'Payout has no recorded proposer; dual control cannot be checked')
  }
  if (row.proposed_by === approver) {
    throw forbiddenError('Dual control: the proposer cannot approve their own payout')
  }
  if (row.status !== 'proposed' && row.status !== 'pending_approval') {
    throw httpError(409, `Payout is ${row.status}; only proposed payouts can be approved`)
  }
  const updated = await query<{ updated_at: Date | string }>(
    `UPDATE payout_instructions
        SET status = 'approved', approved_by = $2::uuid, updated_at = NOW()
      WHERE id = $1::uuid
        AND status IN ('proposed', 'pending_approval')
        AND proposed_by IS NOT NULL
        AND proposed_by <> $2::uuid
      RETURNING updated_at`,
    [row.id, approver],
  )
  if (!updated[0]) throw httpError(409, 'Payout changed while approving; reload and try again')
  return {
    ok: true,
    instruction: {
      id: feId,
      status: 'approved',
      approvedBy: actor.userId,
      updatedAt: new Date(updated[0].updated_at).toISOString(),
    },
  }
}

export async function submitPayout(actor: DemoActor, feId: string): Promise<PayoutTransitionResult> {
  const row = await loadPayout(feId)
  await assertPayoutOfficer(actor, row, 'submit')
  if (row.status !== 'approved' || !row.approved_by) {
    throw httpError(409, 'Payout must be approved before submission')
  }
  const updated = await query<{ submitted_at: Date | string; updated_at: Date | string }>(
    `UPDATE payout_instructions
        SET status = 'submitted', submitted_at = NOW(), settled_at = NULL,
            partner_payout_id = NULL, updated_at = NOW()
      WHERE id = $1::uuid AND status = 'approved' AND approved_by IS NOT NULL
      RETURNING submitted_at, updated_at`,
    [row.id],
  )
  if (!updated[0]) throw httpError(409, 'Payout changed while submitting; reload and try again')
  return {
    ok: true,
    instruction: {
      id: feId,
      status: 'submitted',
      submittedAt: new Date(updated[0].submitted_at).toISOString(),
      settledAt: null,
      partnerPayoutId: null,
      updatedAt: new Date(updated[0].updated_at).toISOString(),
    },
  }
}
