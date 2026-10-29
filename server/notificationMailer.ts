/**
 * Emails every in-app notification. Notifications are created in many places
 * (server routes, the client store via /api/persist, crons), so instead of
 * touching each one this worker picks up new rows from the notifications
 * table, checks the person's settings, and sends one email — or one summary
 * when several arrived together. Each row is marked so it is never emailed twice.
 */
import { query } from './db.js'
import { categoryForResource, readPrefs } from './accountEmails.js'
import { sendTemplateEmail } from './email/templates.js'

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
  email: string
  first_name: string
  active: boolean
  metadata: Record<string, unknown> | null
}

/** Only rows this fresh are emailed; anything older is marked stale (e.g. after downtime). */
const MAX_AGE_MIN = 120

export async function emailPendingNotifications(limit = 200): Promise<{ sent: number; skipped: number; failed: number }> {
  await ensureNotificationEmailColumns()
  await query(
    `UPDATE notifications SET emailed_at = NOW(), email_status = 'stale'
      WHERE emailed_at IS NULL AND created_at < NOW() - ($1 || ' minutes')::interval`,
    [String(MAX_AGE_MIN)],
  )
  const rows = await query<Pending>(
    `SELECT n.id::text AS id, n.user_id::text AS user_id, n.title, n.body, n.link_path, n.resource_type,
            u.email, u.first_name, u.active, u.metadata
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
    const name = u.first_name || u.email.split('@')[0]
    const result =
      wanted.length === 1
        ? await sendTemplateEmail('notification', {
            to: u.email,
            name,
            title: wanted[0]!.title,
            body: wanted[0]!.body,
            link: wanted[0]!.link_path,
            userId: u.user_id,
          })
        : await sendTemplateEmail('notification_digest', {
            to: u.email,
            name,
            items: wanted.map((n) => ({ title: n.title, body: n.body, link: n.link_path })),
            userId: u.user_id,
          })
    const reason = result.sent ? '' : (result as { reason: string }).reason
    const status = result.sent ? 'sent' : reason.startsWith('No email provider') ? 'logged' : 'failed'
    await mark(wanted.map((n) => n.id), status)
    if (result.sent) sent += wanted.length
    else failed += wanted.length
  }
  return { sent, skipped, failed }
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
      if (r.sent || r.failed) console.info(`[notification-email] sent ${r.sent}, failed ${r.failed}, off ${r.skipped}`)
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
