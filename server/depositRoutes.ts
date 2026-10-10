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
            release_approved_by::text AS release_approved_by
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
    status: 'release_proposed' | 'release_approved'
    releaseProposedBy?: string
    releaseApprovedBy?: string | null
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
