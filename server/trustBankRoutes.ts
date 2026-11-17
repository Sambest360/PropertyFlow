/**
 * Trust account vs bank: the checks a cashbook needs before it can be trusted.
 *
 * GET  /api/trust/reconciliation?asOf=YYYY-MM-DD[&agencyId=]
 *   Ledger balance as at asOf, summed in SQL over every non-reversed row (the
 *   bootstrap only ships the latest 400), plus unallocated receipts and the
 *   last recorded reconciliation.
 * POST /api/trust/reconciliation { asOf, bankBalanceCents }
 *   Records bank closing balance vs ledger as an append-only event_log row.
 * POST /api/trust/existing-partner-ids { partnerTxnIds }
 *   Which of these import keys the agency already has, so a re-imported bank
 *   statement older than the bootstrap window is not booked twice.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { isUuid, resolveUuid } from './entityMap.js'
import { forbiddenError, type DemoActor } from './actor.js'
import { actorStoredCan } from './scopeGate.js'
import type { Permission } from '../src/types/domain.js'

const VIEW_PERMS: readonly Permission[] = ['trust.view']
const RECORD_PERMS: readonly Permission[] = ['trust.allocate', 'trust.import_csv']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_KEYS = 5000

function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

/** The agency's clients.id the actor may act on; super admin names it. */
async function agencyUuidFor(
  actor: DemoActor,
  perms: readonly Permission[],
  agencyParam: unknown,
): Promise<string> {
  if (!(await actorStoredCan(actor, perms))) {
    throw forbiddenError(`Forbidden: ${actor.role} ${actor.userId} lacks ${perms.join(' or ')}`)
  }
  const agencyRef = actor.role === 'super_admin' ? agencyParam : actor.agencyId
  if (typeof agencyRef !== 'string' || !agencyRef) throw httpError(400, 'agencyId is required')
  const uuid = (await resolveUuid('agency', agencyRef)) ?? (isUuid(agencyRef) ? agencyRef : null)
  if (!uuid) throw httpError(404, 'Agency not found')
  return uuid
}

function asOfOf(v: unknown): string {
  if (typeof v !== 'string' || !DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw httpError(400, 'asOf must be YYYY-MM-DD')
  }
  return v
}

async function ledgerAsOf(clientId: string, asOf: string) {
  const rows = await query<{ balance: string; unallocated_count: string; unallocated_cents: string }>(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE -amount_cents END), 0)::text AS balance,
            COUNT(*) FILTER (WHERE status = 'unallocated' AND direction = 'in')::text AS unallocated_count,
            COALESCE(SUM(amount_cents) FILTER (WHERE status = 'unallocated' AND direction = 'in'), 0)::text AS unallocated_cents
       FROM trust_transactions
      WHERE client_id = $1::uuid AND status <> 'reversed' AND value_date <= $2::date`,
    [clientId, asOf],
  )
  const r = rows[0]
  return {
    ledgerBalanceCents: Number(r?.balance ?? 0),
    unallocatedCount: Number(r?.unallocated_count ?? 0),
    unallocatedCents: Number(r?.unallocated_cents ?? 0),
  }
}

export type RecordedReconciliation = {
  asOf: string
  bankBalanceCents: number
  ledgerBalanceCents: number
  differenceCents: number
  recordedAt: string
}

async function lastReconciliation(clientId: string): Promise<RecordedReconciliation | null> {
  const rows = await query<{ payload: unknown; created_at: Date | string }>(
    `SELECT payload, created_at FROM event_log
      WHERE client_id = $1::uuid AND event_type = 'trust_bank_reconciliation'
      ORDER BY created_at DESC LIMIT 1`,
    [clientId],
  )
  const row = rows[0]
  if (!row) return null
  const p = (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) as Record<string, unknown>
  return {
    asOf: String(p.asOf ?? ''),
    bankBalanceCents: Number(p.bankBalanceCents ?? 0),
    ledgerBalanceCents: Number(p.ledgerBalanceCents ?? 0),
    differenceCents: Number(p.differenceCents ?? 0),
    recordedAt: new Date(row.created_at).toISOString(),
  }
}

export async function getTrustReconciliation(actor: DemoActor, asOfRaw: unknown, agencyParam: unknown) {
  const clientId = await agencyUuidFor(actor, VIEW_PERMS, agencyParam)
  const asOf = asOfOf(asOfRaw)
  return { asOf, ...(await ledgerAsOf(clientId, asOf)), last: await lastReconciliation(clientId) }
}

export async function recordTrustReconciliation(actor: DemoActor, body: Record<string, unknown>) {
  const clientId = await agencyUuidFor(actor, RECORD_PERMS, body.agencyId)
  const asOf = asOfOf(body.asOf)
  const bank = body.bankBalanceCents
  if (typeof bank !== 'number' || !Number.isInteger(bank) || Math.abs(bank) > 1e13) {
    throw httpError(400, 'bankBalanceCents must be a whole number of cents')
  }
  const ledger = await ledgerAsOf(clientId, asOf)
  const actorUuid = (await resolveUuid('user', actor.userId)) ?? (isUuid(actor.userId) ? actor.userId : null)
  const recorded: RecordedReconciliation = {
    asOf,
    bankBalanceCents: bank,
    ledgerBalanceCents: ledger.ledgerBalanceCents,
    differenceCents: bank - ledger.ledgerBalanceCents,
    recordedAt: new Date().toISOString(),
  }
  await query(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, $2::uuid, 'trust_bank_reconciliation', 'trust_account', NULL, $3::uuid, $4::jsonb, NOW())`,
    [randomUUID(), clientId, actorUuid, JSON.stringify({ ...recorded, ...ledger, actorUserId: actorUuid })],
  )
  return { ok: true as const, reconciliation: recorded }
}

export async function existingPartnerTxnIds(actor: DemoActor, body: Record<string, unknown>) {
  const clientId = await agencyUuidFor(actor, RECORD_PERMS, body.agencyId)
  const ids = body.partnerTxnIds
  if (!Array.isArray(ids) || ids.length > MAX_KEYS || !ids.every((x) => typeof x === 'string')) {
    throw httpError(400, `partnerTxnIds must be up to ${MAX_KEYS} strings`)
  }
  if (ids.length === 0) return { existing: [] as string[] }
  const rows = await query<{ partner_txn_id: string }>(
    `SELECT DISTINCT partner_txn_id FROM trust_transactions
      WHERE client_id = $1::uuid AND partner_txn_id = ANY($2::text[])`,
    [clientId, ids],
  )
  return { existing: rows.map((r) => r.partner_txn_id) }
}
