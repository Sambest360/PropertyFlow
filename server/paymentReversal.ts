/**
 * Admin reversal and reopen of a payment row, and its staff history
 * (spec-admin-reversal.md v1.3, Step 1; plan v2 + delta, Jim's sign-off).
 *
 *   POST /api/payments/:id/reverse   PAID      -> DUE (paid fields cleared)
 *   POST /api/payments/:id/reopen    CANCELLED -> DUE
 *   GET  /api/payments/:id/history   staff only
 *
 * One transaction per write: row lock, scope and permission on the STORED
 * row, idempotency by requestId, status and staleness checks, the guarded
 * UPDATE, best-effort notices inside savepoints, one event_log row. Admin
 * emails go out after COMMIT. Nothing is deleted. No migration.
 */
import type { Context, Hono } from 'hono'
import { afterCommit, databaseConfigured, databaseConfigError, query, withTransaction } from './db.js'
import { resolveUuid, resolveFrontendId, isUuid } from './entityMap.js'
import type { DemoActor } from './actor.js'
import { actorRequiredError } from './actor.js'
import { resolveRequestActor } from './requestActor.js'
import { agencyFeId, enrichActor } from './scopeGate.js'
import { resolveSessionUser } from './auth.js'
import { ensureNotificationEmailColumns } from './notificationMailer.js'
import { sendTemplateEmail } from './email/templates.js'
import { effectiveCan, normalizeStoredPermissions } from '../src/lib/permissions.js'
import type { Permission, Role } from '../src/types/domain.js'

/* ------------------------------- constants ------------------------------- */

export const REVERSE_REASON_KINDS = ['WRONG_ROW', 'PAYMENT_BOUNCED', 'NOT_RECEIVED', 'OTHER'] as const
export const REOPEN_REASON_KINDS = ['CANCELLED_BY_MISTAKE', 'STILL_OWED', 'OTHER'] as const
export type ReversalAction = 'reverse' | 'reopen'

export const REASON_KIND_LABELS: Record<string, string> = {
  WRONG_ROW: 'Wrong payment row',
  PAYMENT_BOUNCED: 'Payment bounced',
  NOT_RECEIVED: 'Money not received',
  CANCELLED_BY_MISTAKE: 'Cancelled by mistake',
  STILL_OWED: 'Still owed',
  OTHER: 'Other',
}

export const HISTORY_EVENT_TYPES = [
  'payment_marked_paid',
  'payment_amount_changed',
  'payment_cancelled_by_staff',
  'payment_reversed_by_admin',
  'payment_reopened',
  'payment_cancelled_by_reversal',
] as const

const REASON_MIN = 10
const REASON_MAX = 500
const TICKET_MIN = 5
const TICKET_MAX = 120
const TZ = 'Africa/Johannesburg'
const TENANT_LINK = '/workspace/portals/tenant/payments'
const IMPERSONATED_ID_RE = /^[\w-]{1,64}$/

/* --------------------------------- errors -------------------------------- */

export type ReversalError = Error & { status: number; code: string; extra?: Record<string, unknown> }

export function reversalError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
): ReversalError {
  return Object.assign(new Error(message), { status, code, extra })
}

const notFound = () => reversalError(404, 'PAYMENT_NOT_FOUND', 'This payment could not be found.')
const noPermission = () =>
  reversalError(403, 'PAYMENT_REVERSAL_PERMISSION_REQUIRED', 'Only an agency principal or office admin can do this.')

/* ------------------------------ pure helpers ----------------------------- */

/** Trimmed reason with line breaks collapsed to spaces and other control characters removed; null when outside 10-500. */
export function normaliseReason(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').replace(/ {2,}/g, ' ').trim()
  if (text.length < REASON_MIN || text.length > REASON_MAX) return null
  return text
}

/** Support ticket reference: 5-120 characters after trimming, no format check. */
export function normaliseTicket(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (t.length < TICKET_MIN || t.length > TICKET_MAX) return null
  return t
}

/** Roles that may reverse or reopen (rule 1). super_admin is the break-glass path. */
export function reversalRoleAllowed(role: Role): boolean {
  return role === 'client_admin' || role === 'agent_admin' || role === 'super_admin'
}

/** Roles that may read the history (staff; tenants, landlords and contractors never). */
export function historyRoleAllowed(role: Role): boolean {
  return role === 'client_admin' || role === 'agent_admin' || role === 'ground_agent' || role === 'agent' || role === 'super_admin'
}

export type ParsedReversalBody = {
  reasonKind: string
  reason: string
  /** Reason as stored in the audit: `[Support <ref>] <reason>` for break-glass. */
  storedReason: string
  supportTicketRef: string | null
  expectedUpdatedAt: string | null
  requestId: string
  clearReference: boolean
  acknowledgeEarlierMonth: boolean
}

export function parseReversalBody(
  action: ReversalAction,
  body: Record<string, unknown>,
  breakGlass: boolean,
): ParsedReversalBody {
  const kinds: readonly string[] = action === 'reverse' ? REVERSE_REASON_KINDS : REOPEN_REASON_KINDS
  const reasonKind = typeof body.reasonKind === 'string' ? body.reasonKind : ''
  if (!kinds.includes(reasonKind)) {
    throw reversalError(400, 'PAYMENT_REVERSAL_REASON_KIND_INVALID', 'Pick a reason from the list.')
  }
  const reason = normaliseReason(body.reason)
  if (!reason) throw reversalError(400, 'PAYMENT_REVERSAL_REASON_REQUIRED', 'Add a reason of at least 10 characters.')
  let supportTicketRef: string | null = null
  if (breakGlass) {
    supportTicketRef = normaliseTicket(body.supportTicketRef)
    if (!supportTicketRef) throw reversalError(400, 'PAYMENT_REVERSAL_TICKET_REQUIRED', 'Add the support ticket reference.')
  }
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : ''
  if (!isUuid(requestId)) {
    throw reversalError(400, 'PAYMENT_REVERSAL_REQUEST_ID_INVALID', 'Something went wrong. Close the dialog and try again.')
  }
  return {
    reasonKind,
    reason,
    storedReason: supportTicketRef ? `[Support ${supportTicketRef}] ${reason}` : reason,
    supportTicketRef,
    expectedUpdatedAt: typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null,
    requestId,
    clearReference: action === 'reverse' && body.clearReference === true,
    acknowledgeEarlierMonth: action === 'reverse' && body.acknowledgeEarlierMonth === true,
  }
}

/** YYYY-MM of an instant in SAST. */
export function monthKeySast(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}

/** YYYY-MM-DD of an instant in SAST. */
export function dateSast(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** The received date is in an earlier calendar month than today, both read in SAST. */
export function isEarlierMonthSast(paidAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!paidAt) return false
  const d = paidAt instanceof Date ? paidAt : new Date(paidAt)
  if (Number.isNaN(d.getTime())) return false
  return monthKeySast(d) < monthKeySast(now)
}

/** "October 2026" for an instant in SAST. */
export function monthLabelSast(d: Date): string {
  return new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, month: 'long', year: 'numeric' }).format(d)
}

export function formatRand(amount: number): string {
  return `R ${Number(amount).toFixed(2)}`
}

const TYPE_WORDS: Record<string, string> = {
  RENT: 'rent',
  FIRST_MONTH_RENT: 'first month rent',
  DEPOSIT: 'deposit',
  SALE_DEPOSIT: 'sale deposit',
  COMMISSION: 'commission',
  REFUND: 'refund',
  OTHER: 'other',
}
export function paymentTypeWords(dbType: string): string {
  return TYPE_WORDS[dbType] ?? dbType.toLowerCase().replace(/_/g, ' ')
}

export type NoticeFacts = { paymentType: string; amount: number; dueDate: string }

/** Tenant notice (section 10). The free-text reason is never part of it. */
export function tenantNoticeText(action: ReversalAction, reasonKind: string, f: NoticeFacts): { title: string; body: string } {
  const type = paymentTypeWords(f.paymentType)
  if (action === 'reopen') {
    return {
      title: 'Payment reopened',
      body: `Your agency reopened your ${type} payment of ${formatRand(f.amount)} due on ${f.dueDate}. Please pay the agency, then upload your proof of payment.`,
    }
  }
  if (reasonKind === 'PAYMENT_BOUNCED') {
    return {
      title: 'Payment returned',
      body: `The payment of ${formatRand(f.amount)} was returned by the bank. Please pay again and upload your proof.`,
    }
  }
  return {
    title: 'Payment record corrected',
    body: `Your agency corrected the record of your ${type} payment. It now shows as due. If you have already paid, upload your proof of payment or contact your agency.`,
  }
}

/** Agency admin notice (section 10A). No free-text reason, no reference. */
export function adminNoticeText(
  action: ReversalAction,
  reasonKind: string,
  f: NoticeFacts & { actorName: string; label: string },
): { title: string; body: string } {
  const verb = action === 'reverse' ? 'reversed' : 'reopened'
  return {
    title: 'Payment record changed',
    body: `${f.actorName} ${verb} the ${paymentTypeWords(f.paymentType)} payment of ${formatRand(f.amount)} (due ${f.dueDate}) for ${f.label}: ${REASON_KIND_LABELS[reasonKind] ?? reasonKind}.`,
  }
}

export function referenceLast4(ref: string | null | undefined): string | null {
  if (!ref) return null
  const t = String(ref).trim()
  return t ? t.slice(-4) : null
}

/* ------------------------- audit payload allow-lists ---------------------- */

/** Spec 5.4 (reverse, Step 1 = mode REVERSE). Optional keys are only written when present. */
export const REVERSE_PAYLOAD_KEYS = {
  required: [
    'previousStatus', 'newStatus', 'mode', 'reasonKind', 'reason', 'acknowledgedEarlierMonth', 'tenantNotified',
    'adminsNotified', 'markedPaidEventId', 'originalAmountCents', 'restoredAmountCents', 'originalPaidAmountCents',
    'originalPaidAt', 'originalMethod', 'originalReferenceLast4', 'referenceCleared', 'originalRecordedBy',
    'balancePaymentId', 'balanceAction', 'requestId', 'actorRole',
  ],
  optional: ['supportTicketRef', 'impersonatedUserId'],
} as const

/** Spec 5.5 (reopen). */
export const REOPEN_PAYLOAD_KEYS = {
  required: [
    'previousStatus', 'newStatus', 'reasonKind', 'reason', 'cancelledEventId', 'amountCents', 'dueDate',
    'tenantNotified', 'adminsNotified', 'requestId', 'actorRole',
  ],
  optional: ['supportTicketRef', 'impersonatedUserId'],
} as const

/** Keep only allow-listed keys; a required key that is missing (undefined) is a bug and throws. */
export function allowListPayload(
  keys: { required: readonly string[]; optional: readonly string[] },
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys.required) {
    if (input[k] === undefined) throw new Error(`payment reversal: audit key ${k} missing`)
    out[k] = input[k]
  }
  for (const k of keys.optional) {
    if (input[k] !== undefined && input[k] !== null) out[k] = input[k]
  }
  return out
}

const cents = (v: string | number | null | undefined): number | null => (v == null ? null : Math.round(Number(v) * 100))

/* --------------------- SEAM(slice-a): effective permission ---------------- */

function permissionList(v: unknown): Permission[] | null {
  return Array.isArray(v) && v.length ? (v.filter((p) => typeof p === 'string') as Permission[]) : null
}

/**
 * // SEAM(slice-a): local copy of main's resolveActorUsersManage
 * (server/scopeGate.ts:1101-1132 at 9e1d072) with 'payments.manage'.
 * Slice A adds resolveActorEffectiveCan(actor, permission)
 * (slice-a scopeGate.ts:1114). At the fresh head after Slice A merges this
 * copy is deleted and the call below becomes
 * resolveActorEffectiveCan(actor, 'payments.manage'). Uses the exported
 * agencyFeId in place of main's private agencyFe (same result).
 */
export async function actorCanManagePayments(actor: DemoActor): Promise<boolean> {
  if (actor.role === 'super_admin') return true
  const agency = await agencyFeId(actor.agencyId)
  let agencyEnabled: Permission[] | null = null
  if (agency) {
    const clientUuid = await resolveUuid('agency', agency)
    if (clientUuid) {
      const rows = await query<{ enabled: unknown; version: unknown }>(
        `SELECT settings->'enabledPermissions' AS enabled, settings->'permissionsVersion' AS version
           FROM clients WHERE id = $1::uuid LIMIT 1`,
        [clientUuid],
      )
      agencyEnabled = normalizeStoredPermissions(permissionList(rows[0]?.enabled), rows[0]?.version)
    }
  }
  let userEnabled: Permission[] | null = null
  const userUuid = await resolveUuid('user', actor.userId)
  if (userUuid) {
    const rows = await query<{ enabled: unknown; version: unknown }>(
      `SELECT metadata->'enabledPermissions' AS enabled, metadata->'permissionsVersion' AS version
         FROM users WHERE id = $1::uuid LIMIT 1`,
      [userUuid],
    )
    userEnabled = normalizeStoredPermissions(permissionList(rows[0]?.enabled), rows[0]?.version)
  }
  return effectiveCan(actor.role, 'payments.manage', agencyEnabled, userEnabled)
}
// END SEAM(slice-a)

/* ------------------------------ actor context ----------------------------- */

export type ReversalActor = {
  /** The actor whose role and agency apply (the impersonated user while impersonating). */
  actor: DemoActor
  /** A super_admin session (direct or impersonating): break-glass, section 2.1. */
  breakGlass: boolean
  /** The real actor's user uuid (the super_admin while impersonating). */
  realUserUuid: string | null
  actorRole: Role
  impersonatedUserId: string | null
}

async function reversalActor(c: Context): Promise<ReversalActor> {
  const raw = await resolveRequestActor(c, null)
  if (!raw) throw actorRequiredError()
  const actor = await enrichActor(raw)
  const session = await resolveSessionUser(c).catch(() => null)
  const sessionSuper = session?.role === 'super_admin'
  const breakGlass = actor.role === 'super_admin' || sessionSuper
  let impersonatedUserId: string | null = null
  if (sessionSuper && session && raw.userId !== session.frontendId && raw.userId !== session.id) {
    impersonatedUserId = IMPERSONATED_ID_RE.test(raw.userId) ? raw.userId : null
  }
  const realUserUuid = sessionSuper && session ? session.id : await resolveUuid('user', actor.userId)
  return {
    actor,
    breakGlass,
    realUserUuid: realUserUuid && isUuid(realUserUuid) ? realUserUuid : null,
    actorRole: breakGlass ? 'super_admin' : actor.role,
    impersonatedUserId,
  }
}

/** Rule 1 + rule 3 (effective payments.manage). Break-glass skips both; the agency rule is applied on the stored row. */
async function assertMayChange(ra: ReversalActor): Promise<void> {
  if (ra.breakGlass) return
  if (!reversalRoleAllowed(ra.actor.role)) throw noPermission()
  if (!(await actorCanManagePayments(ra.actor))) throw noPermission()
}

/* --------------------------------- rows ---------------------------------- */

type PaymentRow = {
  id: string
  client_id: string
  unit_id: string | null
  lease_id: string | null
  application_id: string | null
  party_user_id: string | null
  party_name: string
  payment_type: string
  amount: string
  paid_amount: string | null
  status: string
  due_date: string
  paid_at: Date | null
  method: string | null
  reference: string | null
  recorded_by: string | null
  updated_at: Date
}

const ROW_COLUMNS = `id::text AS id, client_id::text AS client_id, unit_id::text AS unit_id, lease_id::text AS lease_id,
  application_id::text AS application_id, party_user_id::text AS party_user_id, party_name, payment_type,
  amount::text AS amount, paid_amount::text AS paid_amount, status, to_char(due_date, 'YYYY-MM-DD') AS due_date,
  paid_at, method, reference, recorded_by::text AS recorded_by, updated_at`

const STATUS_FE: Record<string, string> = { DUE: 'Due', PAID: 'Paid', OVERDUE: 'Overdue', CANCELLED: 'Cancelled' }

async function paymentView(feId: string, r: PaymentRow) {
  return {
    id: feId,
    status: STATUS_FE[r.status] ?? r.status,
    amount: Number(r.amount),
    paidAmount: r.paid_amount != null ? Number(r.paid_amount) : null,
    paidAt: r.paid_at ? dateSast(r.paid_at) : null,
    method: r.method,
    reference: r.reference,
    dueDate: r.due_date,
    updatedAt: r.updated_at.toISOString(),
  }
}

async function assertSameAgency(ra: ReversalActor, row: PaymentRow): Promise<void> {
  if (ra.breakGlass) return
  const rowAgency = await agencyFeId(row.client_id)
  const actorAgency = await agencyFeId(ra.actor.agencyId)
  // Another agency's row (or an actor with no agency) reads as not found.
  if (!actorAgency || rowAgency !== actorAgency) throw notFound()
}

async function lockRow(uuid: string): Promise<PaymentRow | null> {
  const rows = await query<PaymentRow>(`SELECT ${ROW_COLUMNS} FROM payments WHERE id = $1::uuid FOR UPDATE`, [uuid])
  return rows[0] ?? null
}

async function userName(uuid: string | null): Promise<string> {
  if (!uuid) return 'An admin'
  const rows = await query<{ name: string }>(
    `SELECT TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS name FROM users WHERE id = $1::uuid`,
    [uuid],
  )
  return rows[0]?.name || 'An admin'
}

async function unitOrPartyLabel(row: PaymentRow): Promise<string> {
  if (row.unit_id) {
    const rows = await query<{ label: string | null }>(
      `SELECT COALESCE(NULLIF(title, ''), 'Unit ' || unit_number::text) AS label FROM units WHERE id = $1::uuid`,
      [row.unit_id],
    )
    if (rows[0]?.label) return rows[0].label
  }
  return row.party_name
}

type AdminTarget = { id: string; email: string; first_name: string | null }

async function agencyAdminTargets(clientId: string, excludeUuid: string | null, breakGlass: boolean): Promise<AdminTarget[]> {
  return query<AdminTarget>(
    `SELECT id::text AS id, email, first_name FROM users
      WHERE client_id = $1::uuid AND role = 'AGENCY_ADMIN' AND active = TRUE
        AND ($2::boolean OR $3::uuid IS NULL OR id <> $3::uuid)
      ORDER BY id`,
    [clientId, breakGlass, excludeUuid],
  )
}

/** Notices this feature writes are never picked up by the notification mailer (10.1). */
const NOTICE_INSERT = `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type, emailed_at, email_status)
  VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'payment', $6, NOW(), 'off')`

async function tenantNotice(row: PaymentRow, action: ReversalAction, reasonKind: string): Promise<boolean> {
  if (!row.party_user_id) return false
  const text = tenantNoticeText(action, reasonKind, { paymentType: row.payment_type, amount: Number(row.amount), dueDate: row.due_date })
  await query('SAVEPOINT tenant_notice')
  try {
    await query(NOTICE_INSERT, [row.client_id, row.party_user_id, text.title, text.body, TENANT_LINK, action === 'reverse' ? 'reversed' : 'reopened'])
    await query('RELEASE SAVEPOINT tenant_notice')
    return true
  } catch {
    await query('ROLLBACK TO SAVEPOINT tenant_notice')
    console.warn(`payment reversal: tenant notice failed payment=${row.id}`)
    return false
  }
}

async function adminNotices(row: PaymentRow, targets: AdminTarget[], text: { title: string; body: string }, link: string, action: ReversalAction): Promise<number> {
  if (!targets.length) return 0
  await query('SAVEPOINT admin_notice')
  try {
    for (const t of targets) {
      await query(NOTICE_INSERT, [row.client_id, t.id, text.title, text.body, link, action === 'reverse' ? 'reversed' : 'reopened'])
    }
    await query('RELEASE SAVEPOINT admin_notice')
    return targets.length
  } catch {
    await query('ROLLBACK TO SAVEPOINT admin_notice')
    console.warn(`payment reversal: admin notice failed payment=${row.id}`)
    return 0
  }
}

function queueAdminEmails(
  paymentUuid: string,
  targets: AdminTarget[],
  body: string,
  earlierMonth: Date | null,
  link: string,
): void {
  if (!targets.length) return
  afterCommit(async () => {
    for (const t of targets) {
      try {
        const r = await sendTemplateEmail('payment_record_changed', {
          to: t.email,
          name: t.first_name ?? undefined,
          userId: t.id,
          body,
          statementMonth: earlierMonth ? monthLabelSast(earlierMonth) : null,
          link,
        })
        if (!r.sent && !/^No email provider|^preview$/.test((r as { reason?: string }).reason ?? '')) {
          console.warn(`payment reversal: admin email failed payment=${paymentUuid}`)
        }
      } catch {
        console.warn(`payment reversal: admin email failed payment=${paymentUuid}`)
      }
    }
  })
}

async function findReplay(uuid: string, requestId: string): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM event_log
      WHERE subject_type = 'payment' AND subject_id = $1::uuid
        AND event_type IN ('payment_reversed_by_admin', 'payment_reopened')
        AND payload->>'requestId' = $2
      ORDER BY created_at LIMIT 1`,
    [uuid, requestId],
  )
  return rows[0]?.id ?? null
}

async function latestEventId(uuid: string, type: string): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM event_log WHERE subject_type = 'payment' AND subject_id = $1::uuid AND event_type = $2
      ORDER BY created_at DESC LIMIT 1`,
    [uuid, type],
  )
  return rows[0]?.id ?? null
}

function assertFresh(expected: string | null, stored: Date): void {
  const ms = expected ? new Date(expected).getTime() : NaN
  if (!Number.isFinite(ms) || ms !== stored.getTime()) {
    throw reversalError(409, 'PAYMENT_STALE', 'Someone changed this payment. Refresh and try again.')
  }
}

/* ------------------------------- the writes ------------------------------- */

export type ReversalResult = { ok: true; payment: Awaited<ReturnType<typeof paymentView>>; auditEventId: string; replay?: boolean }

export async function runReversal(
  ra: ReversalActor,
  action: ReversalAction,
  feId: string,
  body: Record<string, unknown>,
  now: Date = new Date(),
): Promise<ReversalResult> {
  await assertMayChange(ra)
  const input = parseReversalBody(action, body, ra.breakGlass)
  const uuid = await resolveUuid('payment', feId)
  if (!uuid) throw notFound()
  // 10.1: outside the transaction, memoised, idempotent (ALTER ... IF NOT EXISTS).
  await ensureNotificationEmailColumns()

  return withTransaction(async () => {
    const row = await lockRow(uuid)
    if (!row) throw notFound()
    await assertSameAgency(ra, row)

    const replay = await findReplay(uuid, input.requestId)
    if (replay) return { ok: true as const, payment: await paymentView(feId, row), auditEventId: replay, replay: true }

    if (action === 'reverse' && row.status !== 'PAID') {
      throw reversalError(409, 'PAYMENT_NOT_PAID', 'This payment is no longer marked paid. Refresh to see it.')
    }
    if (action === 'reopen' && row.status !== 'CANCELLED') {
      throw reversalError(409, 'PAYMENT_NOT_CANCELLED', 'This payment is no longer cancelled. Refresh to see it.')
    }
    assertFresh(input.expectedUpdatedAt, row.updated_at)

    const earlierMonth = action === 'reverse' && isEarlierMonthSast(row.paid_at, now)
    if (earlierMonth && !input.acknowledgeEarlierMonth) {
      throw reversalError(
        400,
        'PAYMENT_REVERSAL_ACK_REQUIRED',
        'Tick the box to confirm you understand the owner statement will change.',
      )
    }

    if (action === 'reopen') {
      const others = await query<{ id: string }>(
        `SELECT id::text AS id FROM payments
          WHERE client_id = $1::uuid AND id <> $2::uuid AND status <> 'CANCELLED'
            AND (($3::uuid IS NOT NULL AND lease_id = $3::uuid AND payment_type = $4 AND due_date = $5::date)
              OR ($6::uuid IS NOT NULL AND application_id = $6::uuid AND payment_type = $4))
          ORDER BY created_at LIMIT 5`,
        [row.client_id, uuid, row.lease_id, row.payment_type, row.due_date, row.application_id],
      )
      if (others.length) {
        const otherPayments = await Promise.all(others.map(async (o) => (await resolveFrontendId('payment', o.id)) ?? o.id))
        throw reversalError(
          409,
          'PAYMENT_REOPEN_DUPLICATE_ROW',
          'Another payment already covers this. Open it instead of reopening this one.',
          { otherPayments },
        )
      }
    }

    const updated =
      action === 'reverse'
        ? await query<PaymentRow>(
            `UPDATE payments
                SET status = 'DUE', paid_at = NULL, paid_amount = NULL, method = NULL, recorded_by = NULL,
                    reference = CASE WHEN $2::boolean THEN NULL ELSE reference END, updated_at = NOW()
              WHERE id = $1::uuid AND status = 'PAID'
              RETURNING ${ROW_COLUMNS}`,
            [uuid, input.clearReference],
          )
        : await query<PaymentRow>(
            `UPDATE payments SET status = 'DUE', updated_at = NOW()
              WHERE id = $1::uuid AND status = 'CANCELLED'
              RETURNING ${ROW_COLUMNS}`,
            [uuid],
          )
    const saved = updated[0]
    if (!saved) throw reversalError(409, 'PAYMENT_STALE', 'Someone changed this payment. Refresh and try again.')

    const tenantNotified = await tenantNotice(row, action, input.reasonKind)
    const targets = await agencyAdminTargets(row.client_id, ra.realUserUuid, ra.breakGlass)
    const adminText = adminNoticeText(action, input.reasonKind, {
      paymentType: row.payment_type,
      amount: Number(row.amount),
      dueDate: row.due_date,
      actorName: await userName(ra.realUserUuid),
      label: await unitOrPartyLabel(row),
    })
    const adminLink = `/workspace/operations/payments/${feId}`
    const adminsNotified = await adminNotices(row, targets, adminText, adminLink, action)

    const common = {
      reasonKind: input.reasonKind,
      reason: input.storedReason,
      tenantNotified,
      adminsNotified,
      supportTicketRef: input.supportTicketRef ?? undefined,
      requestId: input.requestId,
      actorRole: ra.actorRole,
      impersonatedUserId: ra.impersonatedUserId ?? undefined,
    }
    const payload =
      action === 'reverse'
        ? allowListPayload(REVERSE_PAYLOAD_KEYS, {
            ...common,
            previousStatus: row.status,
            newStatus: saved.status,
            mode: 'REVERSE',
            acknowledgedEarlierMonth: earlierMonth ? input.acknowledgeEarlierMonth : false,
            markedPaidEventId: await latestEventId(uuid, 'payment_marked_paid'),
            originalAmountCents: cents(row.amount),
            restoredAmountCents: null,
            originalPaidAmountCents: cents(row.paid_amount),
            originalPaidAt: row.paid_at ? dateSast(row.paid_at) : null,
            originalMethod: row.method ? row.method.slice(0, 40) : null,
            originalReferenceLast4: referenceLast4(row.reference),
            referenceCleared: input.clearReference && Boolean(row.reference),
            originalRecordedBy: row.recorded_by,
            balancePaymentId: null,
            balanceAction: 'NONE',
          })
        : allowListPayload(REOPEN_PAYLOAD_KEYS, {
            ...common,
            previousStatus: row.status,
            newStatus: saved.status,
            cancelledEventId: await latestEventId(uuid, 'payment_cancelled_by_staff'),
            amountCents: cents(row.amount),
            dueDate: row.due_date,
          })
    const audit = await query<{ id: string }>(
      `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
       VALUES ($1::uuid, $2, 'payment', $3::uuid, $4::uuid, $5::jsonb, NOW()) RETURNING id::text AS id`,
      [row.client_id, action === 'reverse' ? 'payment_reversed_by_admin' : 'payment_reopened', uuid, ra.realUserUuid, JSON.stringify(payload)],
    )

    // 10A: email for an earlier received month, or always for break-glass. Reopen has no received date.
    if (earlierMonth || ra.breakGlass) {
      queueAdminEmails(uuid, targets, adminText.body, earlierMonth ? row.paid_at : null, adminLink)
    }
    return { ok: true as const, payment: await paymentView(feId, saved), auditEventId: audit[0]!.id }
  })
}

/* -------------------------------- history -------------------------------- */

export type HistoryEntry = {
  id: string
  type: string
  createdAt: string
  actorName: string | null
  reasonKind: string | null
  reason: string | null
  referenceLast4: string | null
}

export async function paymentHistory(ra: ReversalActor, feId: string): Promise<{ ok: true; history: HistoryEntry[] }> {
  const historyDenied = () =>
    reversalError(403, 'PAYMENT_PERMISSION_REQUIRED', 'You do not have permission to see this payment history.')
  if (!ra.breakGlass && !historyRoleAllowed(ra.actor.role)) throw historyDenied()
  const uuid = await resolveUuid('payment', feId)
  if (!uuid) throw notFound()
  const rows = await query<PaymentRow>(`SELECT ${ROW_COLUMNS} FROM payments WHERE id = $1::uuid`, [uuid])
  const row = rows[0]
  if (!row) throw notFound()
  await assertSameAgency(ra, row)
  if (!ra.breakGlass && !(await actorCanManagePayments(ra.actor))) throw historyDenied()
  const events = await query<{ id: string; event_type: string; created_at: Date; payload: Record<string, unknown> | null; actor_name: string | null }>(
    `SELECT e.id::text AS id, e.event_type, e.created_at, e.payload,
            NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS actor_name
       FROM event_log e LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.subject_type = 'payment' AND e.subject_id = $1::uuid AND e.event_type = ANY($2::text[])
      ORDER BY e.created_at DESC, e.id DESC`,
    [uuid, [...HISTORY_EVENT_TYPES]],
  )
  return {
    ok: true,
    history: events.map((e) => {
      const p = e.payload ?? {}
      const str = (v: unknown) => (typeof v === 'string' ? v : null)
      return {
        id: e.id,
        type: e.event_type,
        createdAt: e.created_at.toISOString(),
        actorName: e.actor_name,
        reasonKind: str(p.reasonKind),
        reason: str(p.reason),
        referenceLast4: str(p.originalReferenceLast4) ?? referenceLast4(str(p.reference)),
      }
    }),
  }
}

/* -------------------------------- routes --------------------------------- */

function respondError(c: Context, err: unknown) {
  const e = err as Partial<ReversalError>
  const status = typeof e?.status === 'number' && e.status >= 400 && e.status < 600 ? e.status : 500
  if (status >= 500) {
    console.error('payment reversal: request failed')
    return c.json({ error: 'payment_reversal_failed', code: 'PAYMENT_REVERSAL_FAILED', message: 'Something went wrong. Try again.' }, 500)
  }
  return c.json(
    { error: 'payment_reversal_failed', code: e.code ?? null, message: e.message ?? 'Request refused', ...(e.extra ?? {}) },
    status as 400,
  )
}

export function registerPaymentReversalRoutes(app: Hono): void {
  const unconfigured = (c: Context) =>
    c.json({ error: 'database_unconfigured', message: databaseConfigError || 'DATABASE_URL is not set' }, 503)

  for (const action of ['reverse', 'reopen'] as const) {
    app.post(`/api/payments/:id/${action}`, async (c) => {
      if (!databaseConfigured) return unconfigured(c)
      try {
        const ra = await reversalActor(c)
        const raw = await c.req.json().catch(() => null)
        const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
        return c.json(await runReversal(ra, action, c.req.param('id'), body))
      } catch (err) {
        return respondError(c, err)
      }
    })
  }

  app.get('/api/payments/:id/history', async (c) => {
    if (!databaseConfigured) return unconfigured(c)
    try {
      return c.json(await paymentHistory(await reversalActor(c), c.req.param('id')))
    } catch (err) {
      return respondError(c, err)
    }
  })
}
