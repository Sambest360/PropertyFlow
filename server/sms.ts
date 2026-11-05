/**
 * SMS for Lekaya Rentals. Only the time-sensitive notifications listed in
 * src/lib/smsRules.ts are texted, to the phone on the account, when the person
 * has "By SMS" switched on (Settings → Notifications) and has not muted that topic.
 *
 *   SMS_PROVIDER=brevo  Brevo transactional SMS (uses BREVO_API_KEY, the "xkeysib-…" API key)
 *   SMS_PROVIDER=log    nothing is sent; the attempt is only recorded (default)
 *   SMS_SENDER          sender name shown on the phone (max 11 letters), default "Lekaya"
 *   NOTIFICATION_SMS=off  stops the worker
 *
 * Every attempt goes to sms_log (number masked, no body). Sending never throws.
 */
import { query } from './db.js'
import { appLink } from './email/layout.js'
import { categoryForResource, normalizeNotificationPrefs } from '../src/lib/notificationCategories.js'
import { normalizeSmsNumber, smsRuleFor, smsText } from '../src/lib/smsRules.js'

const env = (k: string) => process.env[k]?.trim() ?? ''

export type SmsProvider = 'brevo' | 'log'
export function smsProvider(): SmsProvider {
  const chosen = env('SMS_PROVIDER').toLowerCase()
  if (chosen === 'brevo' && env('BREVO_API_KEY')) return 'brevo'
  return 'log'
}

let ready: Promise<void> | null = null
export function ensureSmsTables(): Promise<void> {
  ready ??= (async () => {
    await query(`
CREATE TABLE IF NOT EXISTS sms_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  to_masked   VARCHAR(30) NOT NULL,
  category    VARCHAR(60),
  provider    VARCHAR(20) NOT NULL,
  status      VARCHAR(20) NOT NULL,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`)
    const existing = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'sms_at'`,
    )
    await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sms_at TIMESTAMPTZ`)
    await query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sms_status VARCHAR(20)`)
    if (Number(existing[0]?.n ?? 0) === 0) {
      // First run: older notifications are history, never text them.
      await query(`UPDATE notifications SET sms_at = NOW(), sms_status = 'history' WHERE sms_at IS NULL`)
    }
  })().catch((e) => {
    ready = null
    throw e
  })
  return ready
}

const mask = (n: string) => (n.length > 5 ? `${n.slice(0, 4)}***${n.slice(-2)}` : '***')

export async function deliverSms(to: string, text: string, opts: { userId?: string | null; category?: string } = {}): Promise<{ sent: boolean; reason?: string }> {
  const num = normalizeSmsNumber(to)
  if (!num) return { sent: false, reason: 'invalid number' }
  const provider = smsProvider()
  let status = 'logged'
  let error: string | undefined
  if (provider === 'brevo') {
    try {
      const res = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
        method: 'POST',
        headers: { 'api-key': env('BREVO_API_KEY'), 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: (env('SMS_SENDER') || 'Lekaya').slice(0, 11),
          recipient: num,
          content: text,
          type: 'transactional',
          ...(opts.category ? { tag: opts.category } : {}),
        }),
      })
      status = res.ok ? 'sent' : 'failed'
      if (!res.ok) error = `Brevo ${res.status}`
    } catch (e) {
      status = 'failed'
      error = e instanceof Error ? e.message : String(e)
    }
  }
  try {
    await ensureSmsTables()
    await query(
      `INSERT INTO sms_log (user_id, to_masked, category, provider, status, error) VALUES ($1::uuid, $2, $3, $4, $5, $6)`,
      [opts.userId && /^[0-9a-f-]{36}$/i.test(opts.userId) ? opts.userId : null, mask(num), opts.category ?? null, provider, status, error?.slice(0, 500) ?? null],
    )
  } catch {
    /* logging never breaks a send */
  }
  return status === 'failed' ? { sent: false, reason: error } : { sent: status === 'sent', reason: status === 'logged' ? 'log provider' : undefined }
}

type Row = {
  id: string
  user_id: string
  title: string
  body: string
  link_path: string | null
  resource_type: string | null
  action_type: string | null
  phone: string | null
  active: boolean
  metadata: Record<string, unknown> | null
}

/** Text new SMS-worthy notifications. Each row is marked so it is never texted twice. */
export async function smsPendingNotifications(limit = 200): Promise<{ sent: number; skipped: number; failed: number }> {
  await ensureSmsTables()
  await query(`UPDATE notifications SET sms_at = NOW(), sms_status = 'stale' WHERE sms_at IS NULL AND created_at < NOW() - interval '60 minutes'`)
  const rows = await query<Row>(
    `SELECT n.id::text AS id, n.user_id::text AS user_id, n.title, n.body, n.link_path, n.resource_type, n.action_type,
            u.phone, u.active, u.metadata
       FROM notifications n JOIN users u ON u.id = n.user_id
      WHERE n.sms_at IS NULL ORDER BY n.created_at LIMIT $1`,
    [limit],
  )
  let sent = 0
  let skipped = 0
  let failed = 0
  for (const r of rows) {
    const rule = smsRuleFor(r)
    const prefs = normalizeNotificationPrefs((r.metadata ?? {}).notificationPrefs)
    let status: string
    if (!rule) status = 'not_sms'
    else if (!r.active || !prefs.sms || prefs.muted.includes(categoryForResource(r.resource_type))) status = 'off'
    else if (!normalizeSmsNumber(r.phone)) status = 'no_phone'
    else {
      const out = await deliverSms(r.phone!, smsText(r.title, r.body ?? '', r.link_path ? appLink(r.link_path) : null), { userId: r.user_id, category: rule.id })
      status = out.sent ? 'sent' : out.reason === 'log provider' ? 'logged' : 'failed'
    }
    if (status === 'sent' || status === 'logged') sent++
    else if (status === 'failed') failed++
    else skipped++
    await query(`UPDATE notifications SET sms_at = NOW(), sms_status = $2 WHERE id = $1::uuid`, [r.id, status])
  }
  return { sent, skipped, failed }
}

let timer: ReturnType<typeof setInterval> | null = null
let running = false
export function startSmsWorker(intervalMs = 60_000): void {
  if (timer || process.env.NOTIFICATION_SMS === 'off') return
  const tick = async () => {
    if (running) return
    running = true
    try {
      const r = await smsPendingNotifications()
      if (r.sent || r.failed) console.info(`[notification-sms] sent ${r.sent}, failed ${r.failed}`)
    } catch (err) {
      console.warn('[notification-sms] run failed:', err instanceof Error ? err.message : err)
    } finally {
      running = false
    }
  }
  timer = setInterval(() => void tick(), intervalMs)
  timer.unref?.()
  setTimeout(() => void tick(), 20_000).unref?.()
}
