import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * T-V29 (plan delta D4 row 25): the reversal's notices must not be picked up
 * by the notification mailer (server/notificationMailer.ts) on a database
 * built from schema.sql ONLY, where notifications has no emailed_at /
 * email_status (migration 035 and ensureNotificationEmailColumns add them).
 * The reversal calls the memoised ensureNotificationEmailColumns() outside
 * its transaction, inserts its notices with emailed_at = NOW() and
 * email_status = 'off', and sends the one admin email itself.
 *
 * Run against a THROWAWAY scratch database loaded from schema.sql only
 * (PF_TEST_PG_URL). beforeAll drops the two columns IF EXISTS so the file
 * can be re-run on the same scratch database. Never live.
 * One pg file at a time: `vitest run --no-file-parallelism`.
 */
const url = process.env.PF_TEST_PG_URL

const sentEmails = vi.hoisted(() => [] as Array<{ id: string; data: Record<string, unknown> }>)
vi.hoisted(() => {
  process.env.PF_SKIP_SERVE = '1'
  if (process.env.PF_TEST_PG_URL) process.env.DATABASE_URL = process.env.PF_TEST_PG_URL
  // Dummy signing secret for this test process only (not a credential).
  process.env.AUTH_SECRET = ['par', 'mailer', 'test', 'only'].join('-')
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

import { USERS, audits, cleanup, makeClient, notices, seedBase, seedPayment, type App, type UserKey } from './paymentReversal.pgFixtures.js'

const monthsAgo = (n: number) => {
  const d = new Date()
  d.setUTCDate(10)
  d.setUTCMonth(d.getUTCMonth() - n)
  return d.toISOString()
}

describe.skipIf(!url)('T-V29: reversal notices on a schema.sql-only database are never emailed by the mailer', () => {
  let db: typeof import('./db.js')
  let app: App
  const tokens: Partial<Record<UserKey, string>> = {}
  const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params as never)
  const { login, call } = makeClient(() => app, tokens, '10.88.2')

  beforeAll(async () => {
    db = await import('./db.js')
    // schema.sql-only shape: no email columns (re-runnable on the scratch DB).
    await q(`DROP INDEX IF EXISTS idx_notifications_email_pending`)
    await q(`ALTER TABLE notifications DROP COLUMN IF EXISTS emailed_at, DROP COLUMN IF EXISTS email_status`)
    await cleanup(q)
    await seedBase(q)
    app = (await import('./index.js')).default as unknown as App
    tokens.caA1 = await login('caA1', 1)
  })
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_DEMO_ACTOR', '')
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    if (db) await cleanup(q)
  })

  it('T-V29: reverse (earlier month) + reopen create the notices; the mailer then sends none of them; each other client_admin gets exactly one explicit payment_record_changed email', async () => {
    const cols0 = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.columns WHERE table_name = 'notifications' AND column_name IN ('emailed_at', 'email_status')`,
    )
    expect(cols0[0]?.n).toBe('0')

    const p = await seedPayment(q, { paidAt: monthsAgo(1) })
    const rev = await call('POST', `/api/payments/${p.fe}/reverse`, 'caA1', {
      reasonKind: 'WRONG_ROW', reason: 'Recorded on the wrong tenant row', expectedUpdatedAt: p.updatedAt,
      requestId: crypto.randomUUID(), acknowledgeEarlierMonth: true,
    })
    expect([rev.status, rev.code]).toEqual([200, null])
    await q(`UPDATE payments SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1::uuid`, [p.uuid])
    const ua = (await q<{ updated_at: Date }>(`SELECT updated_at FROM payments WHERE id = $1::uuid`, [p.uuid]))[0]!.updated_at.toISOString()
    const reo = await call('POST', `/api/payments/${p.fe}/reopen`, 'caA1', {
      reasonKind: 'STILL_OWED', reason: 'The tenant still owes this amount', expectedUpdatedAt: ua, requestId: crypto.randomUUID(),
    })
    expect([reo.status, reo.code]).toEqual([200, null])

    await vi.waitFor(() => expect(sentEmails.filter((e) => e.id === 'payment_record_changed')).toHaveLength(1))
    const a = await audits(q, p.uuid)
    const before = sentEmails.length

    const { emailPendingNotifications } = await import('./notificationMailer.js')
    await emailPendingNotifications()
    const fromMailer = sentEmails.slice(before).filter((e) => e.id === 'notification' || e.id === 'notification_digest')

    expect({
      notified: a.map((r) => [r.event_type, r.payload.tenantNotified, r.payload.adminsNotified]),
      notices: (await notices(q)).map((n) => [n.user_id, n.email_status, n.emailed]),
      mailerSent: fromMailer.length,
      explicit: sentEmails.filter((e) => e.id === 'payment_record_changed').map((e) => e.data.userId),
    }).toEqual({
      notified: [
        ['payment_reversed_by_admin', true, 1],
        ['payment_reopened', true, 1],
      ],
      notices: [
        [USERS.caA2.id, 'off', true],
        [USERS.caA2.id, 'off', true],
        [USERS.tenA.id, 'off', true],
        [USERS.tenA.id, 'off', true],
      ].sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
      mailerSent: 0,
      explicit: [USERS.caA2.id],
    })
  })
})
