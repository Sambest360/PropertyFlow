import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Admin reversal Step 1 through the REAL app (server/index.ts, PF_SKIP_SERVE=1):
 * real POST /api/auth/login, real resolveRequestActor (NODE_ENV production,
 * demo actor headers off), real routes, on a real THROWAWAY Postgres
 * (PF_TEST_PG_URL, built from schema.sql + migrations). Never live.
 *
 * Spec: spec-admin-reversal.md v1.3 (f882af95); plan v2 + delta D4 rows
 * 1-29; Jim's delta sign-off (39e371f2). Harness shape copied from
 * server/auditRowIntegrity.http.pg.test.ts (setup only). Run with
 * `vitest run --no-file-parallelism`, one pg file at a time.
 *
 * Emails: sendTemplateEmail is replaced by a recorder for the whole module
 * graph (vi.mock), so nothing is ever sent.
 */
const url = process.env.PF_TEST_PG_URL

const sentEmails = vi.hoisted(() => [] as Array<{ id: string; data: Record<string, unknown> }>)
vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  // Dummy signing secret for this test process only (not a credential).
  process.env.AUTH_SECRET = ['par', 'reversal', 'test', 'only'].join('-')
  delete process.env.ALLOW_DEMO_ACTOR
})
vi.mock('./email/templates.js', async (importOriginal) => {
  const m = await importOriginal<typeof import('./email/templates.js')>()
  return {
    ...m,
    sendTemplateEmail: async (id: string, data: Record<string, unknown>) => {
      sentEmails.push({ id, data })
      return { sent: false, reason: 'preview' }
    },
  }
})

import {
  A, AG, APP_A, APP_A_FE, B, LEASE_A, USERS, audits, cleanup, makeClient, notices, paymentRow, resetRows, seedBase, seedPayment,
  updatedAt, type App, type UserKey,
} from './paymentReversal.pgFixtures.js'

const RID = () => crypto.randomUUID()
const REASON = 'Recorded on the wrong tenant row by mistake'
const monthsAgo = (n: number) => {
  const d = new Date()
  d.setUTCDate(10)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString()
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const recordEmails = () => sentEmails.filter((e) => e.id === 'payment_record_changed')
const settle = () => new Promise((r) => setTimeout(r, 200))

const REVERSE_KEYS = [
  'previousStatus', 'newStatus', 'mode', 'reasonKind', 'reason', 'acknowledgedEarlierMonth', 'tenantNotified', 'adminsNotified',
  'markedPaidEventId', 'originalAmountCents', 'restoredAmountCents', 'originalPaidAmountCents', 'originalPaidAt', 'originalMethod',
  'originalReferenceLast4', 'referenceCleared', 'originalRecordedBy', 'balancePaymentId', 'balanceAction', 'requestId', 'actorRole',
].sort()

describe.skipIf(!url)('admin reversal Step 1: real app, session and Postgres', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)
  const { login, call } = makeClient(() => app, tokens, '10.88.1')

  const reverse = (who: UserKey, fe: string, body: Record<string, unknown>, headers?: Record<string, string>) =>
    call('POST', `/api/payments/${fe}/reverse`, who, body, headers)
  const reopen = (who: UserKey, fe: string, body: Record<string, unknown>, headers?: Record<string, string>) =>
    call('POST', `/api/payments/${fe}/reopen`, who, body, headers)
  const revBody = (p: { updatedAt: string }, over: Record<string, unknown> = {}) => ({
    reasonKind: 'WRONG_ROW', reason: REASON, expectedUpdatedAt: p.updatedAt, requestId: RID(), ...over,
  })
  const reoBody = (p: { updatedAt: string }, over: Record<string, unknown> = {}) => ({
    reasonKind: 'STILL_OWED', reason: 'The tenant still owes this amount', expectedUpdatedAt: p.updatedAt, requestId: RID(), ...over,
  })
  /** Status + code + the stored row, so one diff shows all three. */
  const refusedUnchanged = async (res: { status: number; code: string | null }, uuid: string, before: unknown) => ({
    status: res.status, code: res.code, row: await paymentRow(q, uuid), audits: (await audits(q, uuid)).length, unchanged: before,
  })

  beforeAll(async () => {
    db = await import('./db.js')
    await cleanup(q)
    await seedBase(q)
    app = (await import('./index.js')).default as unknown as App
    let n = 1
    for (const key of Object.keys(USERS) as UserKey[]) tokens[key] = await login(key, n++)
  })
  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
    await resetRows(q)
    sentEmails.length = 0
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
  afterAll(async () => {
    if (db) await cleanup(q)
  })

  it('SESSION CONTROL: AGENCY_ADMIN logs in as client_admin, AGENT_ADMIN as agent_admin, SUPER_ADMIN as super_admin', async () => {
    const me = async (k: UserKey) => {
      const r = await app.request('/api/auth/me', { headers: { Authorization: `Bearer ${tokens[k]}` } })
      const b = (await r.json()) as { user?: { role: string } }
      return b.user?.role
    }
    expect({ caA1: await me('caA1'), aaA: await me('aaA'), superAdmin: await me('superAdmin'), tenA: await me('tenA') }).toEqual({
      caA1: 'client_admin', aaA: 'agent_admin', superAdmin: 'super_admin', tenA: 'tenant',
    })
  })

  // ---- row 1 T-V4 (pg part) ------------------------------------------------
  it('T-V4: reason missing / 9 characters / bad kind give the exact 400 codes and write nothing', async () => {
    const p = await seedPayment(q)
    const before = await paymentRow(q, p.uuid)
    const codes = [
      (await reverse('caA1', p.fe, revBody(p, { reason: undefined }))).code,
      (await reverse('caA1', p.fe, revBody(p, { reason: '123456789' }))).code,
      (await reverse('caA1', p.fe, revBody(p, { reasonKind: 'TYPO' }))).code,
    ]
    expect({ codes, row: await paymentRow(q, p.uuid), audits: (await audits(q, p.uuid)).length }).toEqual({
      codes: ['PAYMENT_REVERSAL_REASON_REQUIRED', 'PAYMENT_REVERSAL_REASON_REQUIRED', 'PAYMENT_REVERSAL_REASON_KIND_INVALID'],
      row: before,
      audits: 0,
    })
  })

  // ---- row 3 T-V26 (pg part) -------------------------------------------------
  it('T-V26: an earlier-month (SAST) reverse needs the acknowledgement; same month does not; reopen never asks', async () => {
    const old = await seedPayment(q, { paidAt: monthsAgo(2) })
    const refused = await reverse('caA1', old.fe, revBody(old))
    expect({ status: refused.status, code: refused.code, row: (await paymentRow(q, old.uuid))?.status }).toEqual({
      status: 400, code: 'PAYMENT_REVERSAL_ACK_REQUIRED', row: 'PAID',
    })
    const acked = await reverse('caA1', old.fe, revBody(old, { acknowledgeEarlierMonth: true }))
    expect(acked.status).toBe(200)
    expect((await audits(q, old.uuid))[0]?.payload.acknowledgedEarlierMonth).toBe(true)

    const same = await seedPayment(q)
    expect((await reverse('caA1', same.fe, revBody(same))).status).toBe(200)

    // A cancelled row that still carries an old received date: reopen never asks.
    const cancelled = await seedPayment(q, { status: 'CANCELLED', paidAt: monthsAgo(2) })
    expect((await reopen('caA1', cancelled.fe, reoBody(cancelled))).status).toBe(200)
  })

  // ---- row 6 T-V11 STORED (pg part) ----------------------------------------
  it('T-V11: the reference stays unless clearReference; the audit holds its last 4 characters only', async () => {
    const keep = await seedPayment(q)
    expect((await reverse('caA1', keep.fe, revBody(keep))).status).toBe(200)
    const keepAudit = (await audits(q, keep.uuid))[0]!.payload
    const clear = await seedPayment(q)
    expect((await reverse('caA1', clear.fe, revBody(clear, { clearReference: true }))).status).toBe(200)
    const clearAudit = (await audits(q, clear.uuid))[0]!.payload
    expect({
      kept: (await paymentRow(q, keep.uuid))?.reference,
      keepAudit: [keepAudit.originalReferenceLast4, keepAudit.referenceCleared],
      cleared: (await paymentRow(q, clear.uuid))?.reference,
      clearAudit: [clearAudit.originalReferenceLast4, clearAudit.referenceCleared],
      fullReferenceInAudit: JSON.stringify([keepAudit, clearAudit]).includes('FNB-REF-0042'),
    }).toEqual({ kept: 'FNB-REF-0042-7781', keepAudit: ['7781', false], cleared: null, clearAudit: ['7781', true], fullReferenceInAudit: false })
  })

  // ---- row 7 T-V1 -----------------------------------------------------------
  it('T-V1: client_admin reverse: DUE, paid fields NULL, amount unchanged, one audit row with the exact keys', async () => {
    const p = await seedPayment(q, { paidAmount: 8000 })
    const res = await reverse('caA1', p.fe, revBody(p))
    const row = await paymentRow(q, p.uuid)
    const rows = await audits(q, p.uuid)
    expect({
      status: res.status,
      paymentStatus: (res.json?.payment as { status?: string })?.status,
      auditEventId: res.json?.auditEventId === rows[0]?.id,
      row: { ...row, paid_at: row?.paid_at ?? null },
      auditCount: rows.length,
      type: rows[0]?.event_type,
      actor: rows[0]?.actor_user_id,
      client: rows[0]?.client_id,
      keys: Object.keys(rows[0]?.payload ?? {}).sort(),
    }).toEqual({
      status: 200,
      paymentStatus: 'Due',
      auditEventId: true,
      row: { status: 'DUE', paid_at: null, paid_amount: null, method: null, reference: 'FNB-REF-0042-7781', recorded_by: null, amount: '8500.00' },
      auditCount: 1,
      type: 'payment_reversed_by_admin',
      actor: USERS.caA1.id,
      client: A,
      keys: REVERSE_KEYS,
    })
    expect(rows[0]!.payload).toMatchObject({
      previousStatus: 'PAID', newStatus: 'DUE', mode: 'REVERSE', reasonKind: 'WRONG_ROW', reason: REASON,
      originalAmountCents: 850000, restoredAmountCents: null, originalPaidAmountCents: 800000, originalMethod: 'EFT',
      originalRecordedBy: USERS.caA1.id, balancePaymentId: null, balanceAction: 'NONE', actorRole: 'client_admin',
    })
  })

  // ---- row 8 T-V5 -----------------------------------------------------------
  it('T-V5: reverse on a DUE row gives 409 PAYMENT_NOT_PAID; reopen on a PAID row gives 409 PAYMENT_NOT_CANCELLED; nothing written', async () => {
    const due = await seedPayment(q, { status: 'DUE' })
    const paid = await seedPayment(q)
    const beforeDue = await paymentRow(q, due.uuid)
    const beforePaid = await paymentRow(q, paid.uuid)
    expect(await refusedUnchanged(await reverse('caA1', due.fe, revBody(due)), due.uuid, beforeDue)).toEqual({
      status: 409, code: 'PAYMENT_NOT_PAID', row: beforeDue, audits: 0, unchanged: beforeDue,
    })
    expect(await refusedUnchanged(await reopen('caA1', paid.fe, reoBody(paid)), paid.uuid, beforePaid)).toEqual({
      status: 409, code: 'PAYMENT_NOT_CANCELLED', row: beforePaid, audits: 0, unchanged: beforePaid,
    })
  })

  // ---- row 9 T-V6 -----------------------------------------------------------
  it('T-V6: an expectedUpdatedAt one millisecond off gives 409 PAYMENT_STALE; nothing written', async () => {
    const p = await seedPayment(q)
    const before = await paymentRow(q, p.uuid)
    const off = new Date(new Date(p.updatedAt).getTime() - 1).toISOString()
    expect(await refusedUnchanged(await reverse('caA1', p.fe, revBody(p, { expectedUpdatedAt: off })), p.uuid, before)).toEqual({
      status: 409, code: 'PAYMENT_STALE', row: before, audits: 0, unchanged: before,
    })
    expect((await reverse('caA1', p.fe, revBody(p, { expectedUpdatedAt: undefined }))).code).toBe('PAYMENT_STALE')
  })

  // ---- row 10 T-V8 ----------------------------------------------------------
  it('T-V8: the row survives with the same id and no DELETE ever reaches payments', async () => {
    const p = await seedPayment(q)
    const pg = (await import('pg')).default
    const sqls: string[] = []
    const orig = pg.Client.prototype.query
    vi.spyOn(pg.Client.prototype, 'query').mockImplementation(function (this: unknown, ...args: unknown[]) {
      const first = args[0]
      sqls.push(typeof first === 'string' ? first : String((first as { text?: string })?.text ?? ''))
      return (orig as (...a: unknown[]) => unknown).apply(this, args)
    } as never)
    const res = await reverse('caA1', p.fe, revBody(p))
    vi.restoreAllMocks()
    const ids = await q<{ id: string }>(`SELECT id::text AS id FROM payments WHERE id = $1::uuid`, [p.uuid])
    expect({
      status: res.status,
      survives: ids.length,
      deletes: sqls.filter((s) => /delete\s+from\s+payments/i.test(s)).length,
      inserts: sqls.filter((s) => /insert\s+into\s+payments/i.test(s)).length,
      sawUpdate: sqls.some((s) => /update\s+payments/i.test(s)),
    }).toEqual({ status: 200, survives: 1, deletes: 0, inserts: 0, sawUpdate: true })
  })

  // ---- row 11 T-V10 ---------------------------------------------------------
  it('T-V10: when the audit insert fails, the row is not changed (one transaction)', async () => {
    await q(`ALTER TABLE event_log DROP CONSTRAINT IF EXISTS par_tv10_fail_audit`)
    await q(
      `ALTER TABLE event_log ADD CONSTRAINT par_tv10_fail_audit
         CHECK (event_type <> 'payment_reversed_by_admin' OR COALESCE(payload->>'reason', '') NOT LIKE '%PAR-FAIL-AUDIT%') NOT VALID`,
    )
    try {
      const p = await seedPayment(q)
      const before = await paymentRow(q, p.uuid)
      const res = await reverse('caA1', p.fe, revBody(p, { reason: 'Force the audit to fail PAR-FAIL-AUDIT' }))
      expect({ status: res.status, row: await paymentRow(q, p.uuid), audits: (await audits(q, p.uuid)).length, notices: (await notices(q)).length }).toEqual({
        status: 500, row: before, audits: 0, notices: 0,
      })
    } finally {
      await q(`ALTER TABLE event_log DROP CONSTRAINT IF EXISTS par_tv10_fail_audit`)
    }
  })

  // ---- rows 12-17 T-V2, T-V2a-d, T-V30 --------------------------------------
  it('T-V2: client_admin and agent_admin on role defaults reverse and reopen; an agent_admin without trust.approve_payout too', async () => {
    const out: Record<string, number[]> = {}
    for (const who of ['caA1', 'aaA', 'aaNoPayout'] as const) {
      const paid = await seedPayment(q)
      const cancelled = await seedPayment(q, { status: 'CANCELLED' })
      out[who] = [(await reverse(who, paid.fe, revBody(paid))).status, (await reopen(who, cancelled.fe, reoBody(cancelled))).status]
    }
    expect(out).toEqual({ caA1: [200, 200], aaA: [200, 200], aaNoPayout: [200, 200] })
  })

  const refused403 = async (who: UserKey) => {
    const paid = await seedPayment(q)
    const cancelled = await seedPayment(q, { status: 'CANCELLED' })
    const before = [await paymentRow(q, paid.uuid), await paymentRow(q, cancelled.uuid)]
    const r1 = await reverse(who, paid.fe, revBody(paid))
    const r2 = await reopen(who, cancelled.fe, reoBody(cancelled))
    return {
      results: [[r1.status, r1.code], [r2.status, r2.code]],
      rows: [await paymentRow(q, paid.uuid), await paymentRow(q, cancelled.uuid)],
      audits: (await audits(q, paid.uuid)).length + (await audits(q, cancelled.uuid)).length,
      before,
    }
  }
  const expect403 = (r: Awaited<ReturnType<typeof refused403>>) =>
    expect(r).toEqual({
      results: [[403, 'PAYMENT_REVERSAL_PERMISSION_REQUIRED'], [403, 'PAYMENT_REVERSAL_PERMISSION_REQUIRED']],
      rows: r.before,
      audits: 0,
      before: r.before,
    })

  it('T-V2a: a tenant (role default includes payments.manage) gets 403 and nothing is written', async () => {
    expect403(await refused403('tenA'))
  })
  it('T-V2b: a landlord (payments.view) gets 403 and nothing is written', async () => {
    expect403(await refused403('llA'))
  })
  it('T-V2c: a ground agent with a stored payments.manage gets 403 and nothing is written', async () => {
    expect403(await refused403('gaA'))
  })
  it('T-V2d: an agent_admin whose stored list has no payments.manage gets 403 and nothing is written', async () => {
    expect403(await refused403('aaNoPm'))
  })
  it('T-V30: client_admin and agent_admin whose agency pack lacks payments.manage (stored lists have it) get 403, nothing written', async () => {
    for (const who of ['caC', 'aaC'] as const) {
      const paid = await seedPayment(q, { client: (await import('./paymentReversal.pgFixtures.js')).C, party: null, recordedBy: null })
      const before = await paymentRow(q, paid.uuid)
      const r = await reverse(who, paid.fe, revBody(paid))
      expect({ who, status: r.status, code: r.code, row: await paymentRow(q, paid.uuid), audits: (await audits(q, paid.uuid)).length }).toEqual({
        who, status: 403, code: 'PAYMENT_REVERSAL_PERMISSION_REQUIRED', row: before, audits: 0,
      })
    }
  })

  // ---- row 18 T-V3 ----------------------------------------------------------
  it('T-V3: an admin of agency A gets 404 PAYMENT_NOT_FOUND on B\'s row (whatever the body says); nothing written', async () => {
    const pB = await seedPayment(q, { client: B, party: null, recordedBy: null })
    const before = await paymentRow(q, pB.uuid)
    const r = await reverse('caA1', pB.fe, revBody(pB, { agencyId: AG.B, actorAgencyId: AG.B }))
    expect({ status: r.status, code: r.code, row: await paymentRow(q, pB.uuid), audits: (await audits(q, pB.uuid)).length }).toEqual({
      status: 404, code: 'PAYMENT_NOT_FOUND', row: before, audits: 0,
    })
    expect((await reverse('caA1', 'par-pay-does-not-exist', revBody(pB))).code).toBe('PAYMENT_NOT_FOUND')
  })

  it('T-V3: super_admin needs a ticket; with one the reason is stored as [Support <ref>], every client_admin gets the notice AND the email in the same month', async () => {
    const p = await seedPayment(q)
    const noTicket = await reverse('superAdmin', p.fe, revBody(p))
    expect([noTicket.status, noTicket.code, (await paymentRow(q, p.uuid))?.status]).toEqual([400, 'PAYMENT_REVERSAL_TICKET_REQUIRED', 'PAID'])
    const ok = await reverse('superAdmin', p.fe, revBody(p, { supportTicketRef: 'T-123' }))
    expect(ok.status).toBe(200)
    const a = (await audits(q, p.uuid))[0]!
    await vi.waitFor(() => expect(recordEmails()).toHaveLength(2))
    expect({
      actor: a.actor_user_id,
      role: a.payload.actorRole,
      ticket: a.payload.supportTicketRef,
      reason: a.payload.reason,
      adminNotices: (await notices(q)).filter((n) => n.title === 'Payment record changed').map((n) => n.user_id),
      emailedTo: recordEmails().map((e) => e.data.userId).sort(),
      statementLine: recordEmails()[0]?.data.statementMonth ?? null,
    }).toEqual({
      actor: USERS.superAdmin.id,
      role: 'super_admin',
      ticket: 'T-123',
      reason: `[Support T-123] ${REASON}`,
      adminNotices: [USERS.caA1.id, USERS.caA2.id].sort(),
      emailedTo: [USERS.caA1.id, USERS.caA2.id].sort(),
      statementLine: null,
    })
  })

  it('T-V3: a super_admin session impersonating a client_admin is break-glass: ticket required, audit actor = the super_admin, impersonatedUserId set, all client_admins notified and emailed', async () => {
    const imp = { 'X-User-Id': USERS.caA1.fe, 'X-Role': 'client_admin', 'X-Agency-Id': AG.A }
    const p = await seedPayment(q)
    const noTicket = await reverse('superAdmin', p.fe, revBody(p), imp)
    expect([noTicket.status, noTicket.code]).toEqual([400, 'PAYMENT_REVERSAL_TICKET_REQUIRED'])
    const ok = await reverse('superAdmin', p.fe, revBody(p, { supportTicketRef: 'ticket from Sipho re Unit 4' }), imp)
    expect(ok.status).toBe(200)
    const a = (await audits(q, p.uuid))[0]!
    await vi.waitFor(() => expect(recordEmails()).toHaveLength(2))
    expect({
      actor: a.actor_user_id,
      role: a.payload.actorRole,
      impersonatedUserId: a.payload.impersonatedUserId,
      impersonatorUserId: a.payload.impersonatorUserId ?? null,
      // break-glass: the impersonated client_admin is NOT excluded.
      adminNotices: (await notices(q)).filter((n) => n.title === 'Payment record changed').map((n) => n.user_id).sort(),
      emailedTo: recordEmails().map((e) => e.data.userId).sort(),
    }).toEqual({
      actor: USERS.superAdmin.id,
      role: 'super_admin',
      impersonatedUserId: USERS.caA1.fe,
      impersonatorUserId: null,
      adminNotices: [USERS.caA1.id, USERS.caA2.id].sort(),
      emailedTo: [USERS.caA1.id, USERS.caA2.id].sort(),
    })
  })

  // ---- row 19 T-V18 ---------------------------------------------------------
  it('T-V18: history refuses a tenant (403 PAYMENT_PERMISSION_REQUIRED) and another agency (404); staff see the rows newest first with names, never the full reference', async () => {
    const p = await seedPayment(q, { party: 'tenA' })
    expect((await reverse('caA1', p.fe, revBody(p))).status).toBe(200)
    const after = { updatedAt: await updatedAt(q, p.uuid) }
    await q(`UPDATE payments SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1::uuid`, [p.uuid])
    expect((await reopen('aaA', p.fe, reoBody({ updatedAt: await updatedAt(q, p.uuid) }))).status).toBe(200)
    void after
    const tenant = await call('GET', `/api/payments/${p.fe}/history`, 'tenA')
    const other = await call('GET', `/api/payments/${p.fe}/history`, 'caB')
    const staff = await call('GET', `/api/payments/${p.fe}/history`, 'caA2')
    const history = (staff.json?.history ?? []) as Array<{ type: string; actorName: string; referenceLast4: string | null }>
    expect({
      tenant: [tenant.status, tenant.code],
      other: [other.status, other.code],
      staff: staff.status,
      types: history.map((h) => h.type),
      names: history.map((h) => h.actorName),
      last4: history[1]?.referenceLast4,
      fullRef: JSON.stringify(staff.json).includes('FNB-REF-0042'),
    }).toEqual({
      tenant: [403, 'PAYMENT_PERMISSION_REQUIRED'],
      other: [404, 'PAYMENT_NOT_FOUND'],
      staff: 200,
      types: ['payment_reopened', 'payment_reversed_by_admin'],
      names: ['Sipho Office', 'Lerato Principal'],
      last4: '7781',
      fullRef: false,
    })
  })

  // ---- row 20 T-V7 ----------------------------------------------------------
  it('T-V7: the same requestId twice gives one audit row and the same auditEventId', async () => {
    const p = await seedPayment(q)
    const body = revBody(p)
    const first = await reverse('caA1', p.fe, body)
    const second = await reverse('caA1', p.fe, body)
    expect({
      statuses: [first.status, second.status],
      same: first.json?.auditEventId === second.json?.auditEventId,
      audits: (await audits(q, p.uuid)).length,
      tenantNotices: (await notices(q)).filter((n) => n.user_id === USERS.tenA.id).length,
    }).toEqual({ statuses: [200, 200], same: true, audits: 1, tenantNotices: 1 })
  })

  it('T-V7: two admins at once are serialised by the row lock: one 200, the other 409 PAYMENT_NOT_PAID', async () => {
    const p = await seedPayment(q)
    const holder = await db.pool!.connect()
    let results: Array<{ status: number; code: string | null }> = []
    try {
      await holder.query('BEGIN')
      await holder.query('SELECT id FROM payments WHERE id = $1::uuid FOR UPDATE', [p.uuid])
      const both = Promise.all([reverse('caA1', p.fe, revBody(p)), reverse('aaA', p.fe, revBody(p))])
      await new Promise((r) => setTimeout(r, 400))
      await holder.query('COMMIT')
      results = (await both).map((r) => ({ status: r.status, code: r.code }))
    } finally {
      holder.release()
    }
    expect({
      results: results.sort((x, y) => x.status - y.status),
      audits: (await audits(q, p.uuid)).length,
    }).toEqual({ results: [{ status: 200, code: null }, { status: 409, code: 'PAYMENT_NOT_PAID' }], audits: 1 })
  })

  // ---- row 21 T-V12 ---------------------------------------------------------
  it('T-V12: reopen with a live sibling (same lease, type, due date; or same application and type) gives 409 PAYMENT_REOPEN_DUPLICATE_ROW', async () => {
    const due = daysAgo(3)
    const live = await seedPayment(q, { status: 'DUE', leaseId: LEASE_A, dueDate: due })
    const c1 = await seedPayment(q, { status: 'CANCELLED', leaseId: LEASE_A, dueDate: due })
    const r1 = await reopen('caA1', c1.fe, reoBody(c1))
    const appLive = await seedPayment(q, { status: 'PAID', applicationId: APP_A, type: 'DEPOSIT' })
    const c2 = await seedPayment(q, { status: 'CANCELLED', applicationId: APP_A, type: 'DEPOSIT' })
    const r2 = await reopen('caA1', c2.fe, reoBody(c2))
    // A cancelled sibling does not block.
    const c3 = await seedPayment(q, { status: 'CANCELLED', leaseId: LEASE_A, dueDate: daysAgo(40) })
    await seedPayment(q, { status: 'CANCELLED', leaseId: LEASE_A, dueDate: daysAgo(40) })
    const r3 = await reopen('caA1', c3.fe, reoBody(c3))
    expect({
      r1: [r1.status, r1.code, r1.json?.otherPayments],
      r2: [r2.status, r2.code, r2.json?.otherPayments],
      rows: [(await paymentRow(q, c1.uuid))?.status, (await paymentRow(q, c2.uuid))?.status],
      r3: r3.status,
    }).toEqual({
      r1: [409, 'PAYMENT_REOPEN_DUPLICATE_ROW', [live.fe]],
      r2: [409, 'PAYMENT_REOPEN_DUPLICATE_ROW', [appLive.fe]],
      rows: ['CANCELLED', 'CANCELLED'],
      r3: 200,
    })
  })

  // ---- row 22 T-V24 ---------------------------------------------------------
  it('T-V24: a failing tenant notice rolls back to its savepoint: the reversal commits, tenantNotified false, one uuid-only log line', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await q(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS par_tv24_fail_tenant`)
    await q(`ALTER TABLE notifications ADD CONSTRAINT par_tv24_fail_tenant CHECK (user_id <> '${USERS.tenA.id}'::uuid OR resource_type IS DISTINCT FROM 'payment') NOT VALID`)
    try {
      const p = await seedPayment(q)
      const res = await reverse('caA1', p.fe, revBody(p))
      const a = (await audits(q, p.uuid))[0]
      const lines = warn.mock.calls.filter((c) => String(c[0]).startsWith('payment reversal: tenant notice'))
      expect({
        status: res.status,
        row: (await paymentRow(q, p.uuid))?.status,
        tenantNotified: a?.payload.tenantNotified,
        adminsNotified: a?.payload.adminsNotified,
        lines,
      }).toEqual({
        status: 200, row: 'DUE', tenantNotified: false, adminsNotified: 1,
        lines: [[`payment reversal: tenant notice failed payment=${p.uuid}`]],
      })
    } finally {
      await q(`ALTER TABLE notifications DROP CONSTRAINT IF EXISTS par_tv24_fail_tenant`)
    }
  })

  it('T-V24: party_user_id NULL: no tenant insert, tenantNotified false, the reversal commits', async () => {
    const p = await seedPayment(q, { party: null })
    const res = await reverse('caA1', p.fe, revBody(p))
    expect({ status: res.status, tenantNotified: (await audits(q, p.uuid))[0]?.payload.tenantNotified, tenantNotices: (await notices(q)).filter((n) => n.title !== 'Payment record changed').length }).toEqual({
      status: 200, tenantNotified: false, tenantNotices: 0,
    })
  })

  // ---- row 23 T-V25 ---------------------------------------------------------
  it('T-V25: an AGENT_ADMIN actor: every client_admin gets the notice, no agent_admin does; same month: no email', async () => {
    const p = await seedPayment(q)
    expect((await reverse('aaA', p.fe, revBody(p))).status).toBe(200)
    await settle()
    const admin = (await notices(q)).filter((n) => n.title === 'Payment record changed')
    expect({ to: admin.map((n) => n.user_id).sort(), adminsNotified: (await audits(q, p.uuid))[0]?.payload.adminsNotified, emails: recordEmails().length }).toEqual({
      to: [USERS.caA1.id, USERS.caA2.id].sort(), adminsNotified: 2, emails: 0,
    })
  })

  it('T-V25: a client_admin actor is excluded; an earlier-month reverse emails the other client_admin once with the statement line; reopen sends no email', async () => {
    const p = await seedPayment(q, { paidAt: monthsAgo(1) })
    expect((await reverse('caA1', p.fe, revBody(p, { acknowledgeEarlierMonth: true }))).status).toBe(200)
    await vi.waitFor(() => expect(recordEmails()).toHaveLength(1))
    await settle()
    const admin = (await notices(q)).filter((n) => n.title === 'Payment record changed')
    const email = recordEmails()[0]!
    expect({
      to: admin.map((n) => n.user_id),
      emails: recordEmails().map((e) => e.data.userId),
      statement: typeof email.data.statementMonth === 'string' && /^[A-Z][a-z]+ \d{4}$/.test(email.data.statementMonth),
      bodyHasReason: String(email.data.body).includes(REASON),
    }).toEqual({ to: [USERS.caA2.id], emails: [USERS.caA2.id], statement: true, bodyHasReason: false })

    sentEmails.length = 0
    const c = await seedPayment(q, { status: 'CANCELLED', paidAt: monthsAgo(3) })
    expect((await reopen('caA1', c.fe, reoBody(c))).status).toBe(200)
    await settle()
    expect(recordEmails()).toHaveLength(0)
  })

  // ---- row 24 T-V15 ---------------------------------------------------------
  it('T-V15: the tenant notification never carries the reason; the tenant bootstrap shows the row as Due again (Upload proof shows for any status but Paid)', async () => {
    const p = await seedPayment(q, { party: 'tenA' })
    expect((await reverse('caA1', p.fe, revBody(p, { reasonKind: 'PAYMENT_BOUNCED', reason: 'Bank returned it: R/D unpaid ref 991' }))).status).toBe(200)
    const tenant = (await notices(q)).filter((n) => n.user_id === USERS.tenA.id)
    const boot = await call('GET', '/api/bootstrap', 'tenA')
    const mine = ((boot.json?.payments ?? []) as Array<{ id: string; status: string }>).find((x) => x.id === p.fe)
    expect({
      notices: tenant.map((n) => ({ title: n.title, body: n.body, email_status: n.email_status, emailed: n.emailed })),
      bootStatus: mine?.status,
    }).toEqual({
      notices: [{ title: 'Payment returned', body: 'The payment of R 8500.00 was returned by the bank. Please pay again and upload your proof.', email_status: 'off', emailed: true }],
      bootStatus: 'Due',
    })
  })

  // ---- row 26 T-V31 ---------------------------------------------------------
  it('T-V31: the tenant bootstrap carries only the tenant\'s own payments; every payment carries updatedAt and the mapped applicationId (tenant and staff)', async () => {
    const own = await seedPayment(q, { party: 'tenA', applicationId: APP_A, type: 'DEPOSIT' })
    const other = await seedPayment(q, { party: 'tenA2' })
    const tenantBoot = await call('GET', '/api/bootstrap', 'tenA')
    const staffBoot = await call('GET', '/api/bootstrap', 'caA1')
    type P = { id: string; partyUserId: string | null; updatedAt?: string; applicationId?: string | null }
    const tp = ((tenantBoot.json?.payments ?? []) as P[]).filter((x) => x.id.startsWith('par-pay-'))
    const sp = ((staffBoot.json?.payments ?? []) as P[]).filter((x) => x.id.startsWith('par-pay-'))
    expect({
      tenantIds: tp.map((x) => x.id).sort(),
      tenantOwn: tp.every((x) => x.partyUserId === USERS.tenA.fe),
      tenantUpdatedAt: tp.map((x) => x.updatedAt),
      tenantApp: tp.find((x) => x.id === own.fe)?.applicationId,
      staffIds: sp.map((x) => x.id).sort(),
      staffUpdatedAt: sp.every((x) => typeof x.updatedAt === 'string' && !Number.isNaN(Date.parse(x.updatedAt!))),
      staffApp: sp.find((x) => x.id === own.fe)?.applicationId,
      staffOtherApp: sp.find((x) => x.id === other.fe)?.applicationId,
    }).toEqual({
      tenantIds: [own.fe],
      tenantOwn: true,
      tenantUpdatedAt: [own.updatedAt],
      tenantApp: APP_A_FE,
      staffIds: [own.fe, other.fe].sort(),
      staffUpdatedAt: true,
      staffApp: APP_A_FE,
      staffOtherApp: null,
    })
  })

  // ---- row 27 T-V13 (pin) ---------------------------------------------------
  it('T-V13 (pin): after a reverse, the arrears sweep (escalations.ts:579-588) selects the row and marks it OVERDUE at 7+ days; status reads Due/Overdue for the rent roll filter', async () => {
    const p = await seedPayment(q, { dueDate: daysAgo(10) })
    expect((await reverse('caA1', p.fe, revBody(p))).status).toBe(200)
    expect((await paymentRow(q, p.uuid))?.status).toBe('DUE')
    const { runEscalations } = await import('./escalations.js')
    await runEscalations(new Date())
    expect((await paymentRow(q, p.uuid))?.status).toBe('OVERDUE')
  })

  // ---- row 28 T-V14 (pin) ---------------------------------------------------
  it('T-V14 (pin): /api/persist on the new audit rows\' ids gives 403 EVENT_LOG_TYPE_MISMATCH; the bootstrap carries no row of the new types', async () => {
    const actsBefore = new Set(
      ((((await call('GET', '/api/bootstrap', 'caA1')).json as { activities?: Array<{ id: string }> } | null)?.activities) ?? []).map((a) => a.id),
    )
    const p = await seedPayment(q)
    expect((await reverse('caA1', p.fe, revBody(p))).status).toBe(200)
    await q(`UPDATE payments SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1::uuid`, [p.uuid])
    expect((await reopen('caA1', p.fe, reoBody({ updatedAt: await updatedAt(q, p.uuid) }))).status).toBe(200)
    const [rev, reo] = await audits(q, p.uuid)
    const before = JSON.stringify(await audits(q, p.uuid))
    const results = [
      await call('POST', '/api/persist', 'aaA', { resource: 'activity', action: 'delete', id: rev!.id }),
      await call('POST', '/api/persist', 'aaA', { resource: 'activity', action: 'upsert', id: reo!.id, data: { id: reo!.id, agencyId: AG.A, text: 'x', user: 'x' } }),
      await call('POST', '/api/persist', 'aaA', { resource: 'property_event', action: 'delete', id: reo!.id }),
    ].map((r) => [r.status, r.code])
    const bootJson = (await call('GET', '/api/bootstrap', 'caA1')).json as { activities?: Array<{ id: string }> } | null
    const boot = JSON.stringify(bootJson)
    const extraActivities = (bootJson?.activities ?? []).filter((a) => !actsBefore.has(a.id)).length
    expect({
      results,
      unchanged: JSON.stringify(await audits(q, p.uuid)) === before,
      bootHasIds: boot.includes(rev!.id) || boot.includes(reo!.id),
      bootHasTypes: /payment_reversed_by_admin|payment_reopened/.test(boot),
      extraActivities,
    }).toEqual({
      results: [[403, 'EVENT_LOG_TYPE_MISMATCH'], [403, 'EVENT_LOG_TYPE_MISMATCH'], [403, 'EVENT_LOG_TYPE_MISMATCH']],
      unchanged: true,
      bootHasIds: false,
      bootHasTypes: false,
      extraActivities: 0,
    })
  })

  // ---- T-V32 (Oscar / Jim R4) ----------------------------------------------
  it('T-V32: when the actor is the agency\'s only client_admin, the audit row and history show adminsNotified 0', async () => {
    const p = await seedPayment(q, { client: B, party: null, recordedBy: null })
    expect((await reverse('caB', p.fe, revBody(p))).status).toBe(200)
    const a = (await audits(q, p.uuid))[0]
    const hist = await call('GET', `/api/payments/${p.fe}/history`, 'caB')
    const row = ((hist.json?.history ?? []) as Array<{ type: string; adminsNotified?: number | null }>).find((h) => h.type === 'payment_reversed_by_admin')
    expect({
      audit: a?.payload.adminsNotified,
      history: row?.adminsNotified ?? null,
      notices: (await notices(q)).filter((n) => n.title === 'Payment record changed').length,
    }).toEqual({ audit: 0, history: 0, notices: 0 })
  })

  // ---- R2 impersonation (Jim delta2; mirrors passwordReset.test.ts:446-477) -
  it('R2: a super_admin reverse without impersonation has no impersonatedUserId', async () => {
    const p = await seedPayment(q)
    expect((await reverse('superAdmin', p.fe, revBody(p, { supportTicketRef: 'T-123' }))).status).toBe(200)
    const a = (await audits(q, p.uuid))[0]!
    expect({ actor: a.actor_user_id, impersonatedUserId: a.payload.impersonatedUserId ?? null, impersonatorUserId: a.payload.impersonatorUserId ?? null }).toEqual({
      actor: USERS.superAdmin.id,
      impersonatedUserId: null,
      impersonatorUserId: null,
    })
  })

  it('R2: impersonating gives the real actor plus impersonatedUserId and requires a ticket; a non-plain id is not stored', async () => {
    const imp = { 'X-User-Id': USERS.caA1.fe, 'X-Role': 'client_admin', 'X-Agency-Id': AG.A }
    const p = await seedPayment(q)
    expect([ (await reverse('superAdmin', p.fe, revBody(p), imp)).status, (await reverse('superAdmin', p.fe, revBody(p), imp)).code ]).toEqual([400, 'PAYMENT_REVERSAL_TICKET_REQUIRED'])
    const ok = await reverse('superAdmin', p.fe, revBody(p, { supportTicketRef: 'ticket from Sipho re Unit 4' }), imp)
    expect(ok.status).toBe(200)
    const a = (await audits(q, p.uuid))[0]!
    expect({ actor: a.actor_user_id, role: a.payload.actorRole, impersonatedUserId: a.payload.impersonatedUserId ?? null }).toEqual({
      actor: USERS.superAdmin.id,
      role: 'super_admin',
      impersonatedUserId: USERS.caA1.fe,
    })

    const q2 = await seedPayment(q)
    const bad = await reverse(
      'superAdmin',
      q2.fe,
      revBody(q2, { supportTicketRef: 'T-999' }),
      { 'X-User-Id': 'x'.repeat(65), 'X-Role': 'client_admin', 'X-Agency-Id': AG.A },
    )
    expect(bad.status).toBe(200)
    const b = (await audits(q, q2.uuid))[0]!
    expect({ actor: b.actor_user_id, impersonatedUserId: b.payload.impersonatedUserId ?? null }).toEqual({
      actor: USERS.superAdmin.id,
      impersonatedUserId: null,
    })
  })

  // ---- row 29 T-V17 (pin) ---------------------------------------------------
  it('T-V17 (pin): persist on a PAID row is 409 PAYMENT_TERMINAL and persist on a CANCELLED row is 409 PAYMENT_CANCELLED; reverse and reopen still work', async () => {
    const paid = await seedPayment(q)
    const persistPaid = await call('POST', '/api/persist', 'caA1', { resource: 'payment', action: 'delete', id: paid.fe })
    expect([persistPaid.status, persistPaid.code, (await paymentRow(q, paid.uuid))?.status]).toEqual([409, 'PAYMENT_TERMINAL', 'PAID'])
    expect((await reverse('caA1', paid.fe, revBody(paid))).status).toBe(200)
    expect((await paymentRow(q, paid.uuid))?.status).toBe('DUE')

    const cancelled = await seedPayment(q, { status: 'CANCELLED' })
    const persistCan = await call('POST', '/api/persist', 'caA1', { resource: 'payment', action: 'delete', id: cancelled.fe })
    expect([persistCan.status, persistCan.code, (await paymentRow(q, cancelled.uuid))?.status]).toEqual([409, 'PAYMENT_CANCELLED', 'CANCELLED'])
    expect((await reopen('caA1', cancelled.fe, reoBody(cancelled))).status).toBe(200)
    expect((await paymentRow(q, cancelled.uuid))?.status).toBe('DUE')
  })
})
