/**
 * Emails in-app notifications. Notifications are created in many places
 * (server routes, the client store via /api/persist, crons), so instead of
 * touching each one this worker picks up new rows from the notifications
 * table, checks the person's settings, and sends one email — or one summary
 * when several arrived together. Each row is marked so it is never emailed twice.
 *
 * Each email shows the property the notification is about (photo card) and a
 * button straight to the item. Who is emailed at once and who gets the
 * routine ones in a daily summary is decided by server/email/routing.ts;
 * the summary itself is sendAdminDailyDigests() below.
 */
import { query } from './db.js'
import { categoryForResource, readPrefs } from './accountEmails.js'
import { sendTemplateEmail, type DigestItem } from './email/templates.js'
import { emailActionFor } from './email/actions.js'
import { audienceForRole, propertyCardForUnit, resolvePropertyRef } from './email/propertyContext.js'
import { routeNotificationEmail } from './email/routing.js'

let columnsReady: Promise<void> | null = null
export function ensureNotificationEmailColumns(): Promise<void> {
  columnsReady ??= (async () => {
    const existing = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'emailed_at'`,
    )
    await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ`)
    await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_status VARCHAR(20)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_notifications_email_pending ON notifications (created_at) WHERE emailed_at IS NULL`)
    if (Number(existing[0]?.n ?? 0) === 0) {
      // First run: older notifications are history, not news — never email them.
      await query(`UPDATE notifications SET emailed_at = NOW(), email_status = 'history' WHERE emailed_at IS NULL`)
    }
  })().catch((e) => {
    columnsReady = null
    throw e
  })
  return columnsReady
}

type Pending = {
  id: string
  user_id: string
  title: string
  body: string
  link_path: string | null
  resource_type: string | null
  action_type: string | null
  role: string
  email: string
  first_name: string
  active: boolean
  metadata: Record<string, unknown> | null
}

/** Only rows this fresh are emailed; anything older is marked stale (e.g. after downtime). */
const MAX_AGE_MIN = 120

export async function emailPendingNotifications(limit = 200): Promise<{ sent: number; skipped: number; failed: number; held: number }> {
  await ensureNotificationEmailColumns()
  await query(
    `UPDATE notifications SET emailed_at = NOW(), email_status = 'stale'
      WHERE emailed_at IS NULL AND created_at < NOW() - ($1 || ' minutes')::interval`,
    [String(MAX_AGE_MIN)],
  )
  const rows = await query<Pending>(
    `SELECT n.id::text AS id, n.user_id::text AS user_id, n.title, n.body, n.link_path, n.resource_type,
            n.action_type, u.role, u.email, u.first_name, u.active, u.metadata
       FROM notifications n JOIN users u ON u.id = n.user_id
      WHERE n.emailed_at IS NULL
      ORDER BY n.created_at
      LIMIT $1`,
    [limit],
  )
  const byUser = new Map<string, Pending[]>()
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r])

  let sent = 0
  let skipped = 0
  let failed = 0
  let held = 0
  const mark = (ids: string[], status: string) =>
    ids.length
      ? query(`UPDATE notifications SET emailed_at = NOW(), email_status = $2 WHERE id = ANY($1::uuid[])`, [ids, status])
      : Promise.resolve([])

  for (const [, list] of byUser) {
    const u = list[0]!
    const prefs = readPrefs(u.metadata)
    const wanted = u.active && prefs.email ? list.filter((n) => !prefs.muted.includes(categoryForResource(n.resource_type))) : []
    const unwanted = list.filter((n) => !wanted.includes(n))
    await mark(unwanted.map((n) => n.id), 'off')
    skipped += unwanted.length
    if (!wanted.length) continue
    const audience = audienceForRole(u.role)
    const frontendRole = String((u.metadata ?? {}).frontend_role ?? '')
    const now: DigestItem[] = []
    const nowIds: string[] = []
    const later: string[] = []
    for (const n of wanted) {
      const ctx = await resolvePropertyRef({ linkPath: n.link_path }).catch(() => null)
      const decision = routeNotificationEmail({
        role: u.role,
        frontendRole,
        resource: n.resource_type,
        action: n.action_type,
        title: n.title,
        assignedToRecipient: Boolean(ctx?.assignedUserIds.includes(n.user_id)),
      })
      if (decision.route === 'digest') {
        later.push(n.id)
        continue
      }
      now.push(await digestItem(n, audience, ctx?.unitUuid ?? null))
      nowIds.push(n.id)
    }
    // Held for the agency admin's daily summary; still in the app meanwhile.
    await mark(later, 'digest')
    held += later.length
    if (!now.length) continue
    const name = u.first_name || u.email.split('@')[0]
    const result =
      now.length === 1
        ? await sendTemplateEmail('notification', { to: u.email, name, ...now[0]!, userId: u.user_id })
        : await sendTemplateEmail('notification_digest', { to: u.email, name, items: now, userId: u.user_id })
    const reason = result.sent ? '' : (result as { reason: string }).reason
    const status = result.sent ? 'sent' : reason.startsWith('No email provider') ? 'logged' : 'failed'
    await mark(nowIds, status)
    if (result.sent) sent += nowIds.length
    else failed += nowIds.length
  }
  return { sent, skipped, failed, held }
}

/** Title, text, property card and deep-link button for one notification. */
async function digestItem(
  n: { title: string; body: string; link_path: string | null; resource_type: string | null },
  audience: ReturnType<typeof audienceForRole>,
  unitUuid: string | null,
): Promise<DigestItem> {
  const card = unitUuid ? await propertyCardForUnit(unitUuid, audience).catch(() => null) : null
  const action = emailActionFor({ link: n.link_path, resource: n.resource_type, title: n.title, audience })
  return { title: n.title, body: n.body, link: action.href, card, action }
}

/** Unread routine updates are summed up for this long; older ones are left in the app. */
const DIGEST_WINDOW_H = 36

/**
 * Daily summary for agency admins (cron /api/cron/admin-digest): the
 * notifications routing.ts held back, still unread, in one email each.
 * Read ones are skipped (they were seen in the app). Every held row is marked
 * so it is never summed up twice.
 */
export async function sendAdminDailyDigests(): Promise<{ emails: number; items: number; skipped: number }> {
  await ensureNotificationEmailColumns()
  const rows = await query<Pending & { read_at: string | null; created_at: string; agency_name: string | null }>(
    `SELECT n.id::text AS id, n.user_id::text AS user_id, n.title, n.body, n.link_path, n.resource_type,
            n.action_type, n.read_at::text AS read_at, n.created_at::text AS created_at, u.role, u.email, u.first_name, u.active, u.metadata,
            c.company_name AS agency_name
       FROM notifications n
       JOIN users u ON u.id = n.user_id
       LEFT JOIN clients c ON c.id = u.client_id
      WHERE n.email_status = 'digest'
      ORDER BY n.created_at
      LIMIT 2000`,
  )
  const byUser = new Map<string, typeof rows>()
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r])
  const cutoff = Date.now() - DIGEST_WINDOW_H * 3600_000
  let emails = 0
  let items = 0
  let skipped = 0
  for (const [, list] of byUser) {
    const u = list[0]!
    const fresh = list.filter((n) => !n.read_at && u.active)
    const ids = list.map((n) => n.id)
    const audience = audienceForRole(u.role)
    const out: DigestItem[] = []
    for (const n of fresh) {
      if (Date.parse(n.created_at) < cutoff) continue
      const ctx = await resolvePropertyRef({ linkPath: n.link_path }).catch(() => null)
      out.push(await digestItem(n, audience, ctx?.unitUuid ?? null))
    }
    if (!out.length) {
      await query(`UPDATE notifications SET email_status = 'digest_skip' WHERE id = ANY($1::uuid[])`, [ids])
      skipped += ids.length
      continue
    }
    const r = await sendTemplateEmail('admin_daily_digest', {
      to: u.email,
      name: u.first_name || u.email.split('@')[0],
      agencyName: u.agency_name,
      items: out,
      userId: u.user_id,
    })
    const status = r.sent ? 'digest_sent' : (r as { reason: string }).reason.startsWith('No email provider') ? 'digest_logged' : 'digest_failed'
    await query(`UPDATE notifications SET email_status = $2 WHERE id = ANY($1::uuid[])`, [ids, status])
    if (r.sent) {
      emails++
      items += out.length
    }
  }
  return { emails, items, skipped }
}

let timer: ReturnType<typeof setInterval> | null = null
let running = false

/** Runs every minute inside the API process (started from server/index.ts). */
export function startNotificationMailer(intervalMs = 60_000): void {
  if (timer || process.env.NOTIFICATION_EMAILS === 'off') return
  const tick = async () => {
    if (running) return
    running = true
    try {
      const r = await emailPendingNotifications()
      if (r.sent || r.failed) console.info(`[notification-email] sent ${r.sent}, failed ${r.failed}, off ${r.skipped}, held for summary ${r.held}`)
    } catch (err) {
      console.warn('[notification-email] run failed:', err instanceof Error ? err.message : err)
    } finally {
      running = false
    }
  }
  timer = setInterval(() => void tick(), intervalMs)
  timer.unref?.()
  setTimeout(() => void tick(), 15_000).unref?.()
}
