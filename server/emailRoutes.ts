/**
 * Routes for account emails, notification settings and the admin email page.
 * Registered from server/index.ts.
 */
import type { Context, Hono } from 'hono'
import { resolveSessionUser } from './auth.js'
import {
  clearAuthFailuresForEmail,
  notifyEmailRateLimit,
  passwordFlowIpRateLimit,
  tooManyRequests,
  verifyEmailIpRateLimit,
} from './rateLimit.js'
import { clientIp } from './clientIp.js'
import { query } from './db.js'

type Status = 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503

function statusOf(err: unknown): Status {
  const s = (err as { status?: number })?.status
  return (s && [400, 401, 403, 404, 409, 429, 503].includes(s) ? s : 500) as Status
}
function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function registerEmailRoutes(app: Hono): void {
  /** "Forgot password": always 200 so the answer never reveals which emails have accounts. */
  app.post('/api/auth/forgot-password', async (c) => {
    // H1 (spec r5 :63): its own per-IP bucket, so a login cap or lockout never blocks a reset.
    const ipGate = passwordFlowIpRateLimit(clientIp(c))
    if (!ipGate.ok) {
      const rl = tooManyRequests(ipGate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    const body = (await c.req.json().catch(() => ({}))) as { email?: unknown }
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    if (email && notifyEmailRateLimit(`reset:${email}`).ok) {
      const { requestPasswordReset } = await import('./accountEmails.js')
      await requestPasswordReset(email).catch((err) => console.warn('[forgot-password] failed:', message(err)))
    }
    return c.json({ ok: true })
  })

  /** Choose a password from a reset or account set-up link. */
  app.post('/api/auth/set-password', async (c) => {
    c.header('Cache-Control', 'no-store')
    const ipGate = passwordFlowIpRateLimit(clientIp(c))
    if (!ipGate.ok) {
      const rl = tooManyRequests(ipGate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    try {
      const body = (await c.req.json().catch(() => ({}))) as { token?: unknown; password?: unknown }
      const { setPasswordWithToken } = await import('./accountEmails.js')
      const r = await setPasswordWithToken(String(body.token ?? ''), String(body.password ?? ''))
      // H1: the new password unlocks the account from every IP at once.
      clearAuthFailuresForEmail(r.email)
      return c.json({ ok: true, email: r.email })
    } catch (err) {
      return c.json({ error: (err as { code?: string }).code ?? 'set_password_failed', message: message(err) }, statusOf(err))
    }
  })

  app.post('/api/auth/verify-email', async (c) => {
    // H1 (spec r5 :66): 10 per IP per 15 min (defence in depth; tokens are long).
    const ipGate = verifyEmailIpRateLimit(clientIp(c))
    if (!ipGate.ok) {
      const rl = tooManyRequests(ipGate.retryAfterSec)
      return c.json(rl.body, rl.status, rl.headers)
    }
    try {
      const body = (await c.req.json().catch(() => ({}))) as { token?: unknown }
      const { verifyEmailToken } = await import('./accountEmails.js')
      const r = await verifyEmailToken(String(body.token ?? ''))
      return c.json({ ok: true, email: r.email })
    } catch (err) {
      return c.json({ error: (err as { code?: string }).code ?? 'verify_failed', message: message(err) }, statusOf(err))
    }
  })

  app.post('/api/auth/resend-verification', async (c) => {
    const user = await resolveSessionUser(c).catch(() => null)
    if (!user) return c.json({ error: 'unauthorized', message: 'Sign in first' }, 401)
    if (!notifyEmailRateLimit(`verify:${user.email}`).ok) {
      const rl = tooManyRequests(600)
      return c.json(rl.body, rl.status, rl.headers)
    }
    try {
      const { sendVerificationEmail } = await import('./accountEmails.js')
      const r = await sendVerificationEmail(user.id)
      return c.json({ ok: true, alreadyVerified: r.alreadyVerified })
    } catch (err) {
      return c.json({ error: 'resend_failed', message: message(err) }, statusOf(err))
    }
  })

  /** The signed-in person's notification settings. */
  app.get('/api/account/notification-prefs', async (c) => {
    const user = await resolveSessionUser(c).catch(() => null)
    if (!user) return c.json({ error: 'unauthorized', message: 'Sign in first' }, 401)
    const { getNotificationPrefs, NOTIFICATION_CATEGORIES } = await import('./accountEmails.js')
    return c.json({
      prefs: await getNotificationPrefs(user.id),
      categories: NOTIFICATION_CATEGORIES.map((x) => ({ id: x.id, label: x.label, resources: x.resources })),
    })
  })

  app.put('/api/account/notification-prefs', async (c) => {
    const user = await resolveSessionUser(c).catch(() => null)
    if (!user) return c.json({ error: 'unauthorized', message: 'Sign in first' }, 401)
    try {
      const body = (await c.req.json().catch(() => ({}))) as { prefs?: unknown }
      const { saveNotificationPrefs } = await import('./accountEmails.js')
      return c.json({ prefs: await saveNotificationPrefs(user.id, body.prefs ?? body) })
    } catch (err) {
      return c.json({ error: 'save_failed', message: message(err) }, statusOf(err))
    }
  })

  // ---- Platform team: templates, test send, recent emails ----

  async function requireSuperAdmin(c: Context) {
    const user = await resolveSessionUser(c).catch(() => null)
    if (!user) return { error: c.json({ error: 'unauthorized', message: 'Sign in first' }, 401) }
    if (user.role !== 'super_admin') return { error: c.json({ error: 'forbidden', message: 'Platform team only' }, 403) }
    return { user }
  }

  app.get('/api/admin/email/templates', async (c) => {
    const gate = await requireSuperAdmin(c)
    if (gate.error) return gate.error
    const { listEmailPreviews } = await import('./email/previews.js')
    const { emailProvider, emailSender } = await import('./email/send.js')
    return c.json({ provider: emailProvider(), sender: emailSender(), templates: await listEmailPreviews() })
  })

  app.post('/api/admin/email/test', async (c) => {
    const gate = await requireSuperAdmin(c)
    if (gate.error) return gate.error
    const body = (await c.req.json().catch(() => ({}))) as { templateId?: unknown }
    const { sendPreviewTo } = await import('./email/previews.js')
    const result = await sendPreviewTo(String(body.templateId ?? 'test'), gate.user.email, gate.user.id)
    return c.json(result, result.sent ? 200 : 502)
  })

  app.get('/api/admin/email/log', async (c) => {
    const gate = await requireSuperAdmin(c)
    if (gate.error) return gate.error
    const { ensureEmailLogTable } = await import('./email/send.js')
    await ensureEmailLogTable()
    const rows = await query(
      `SELECT id::text AS id, to_email, category, subject, provider, status, error, created_at
         FROM email_log ORDER BY created_at DESC LIMIT 100`,
    )
    return c.json({ emails: rows })
  })

  /** Cron fallback for the in-process notification mailer. */
  app.get('/api/cron/notification-emails', async (c) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return c.json({ error: 'cron_disabled' }, 503)
    if (c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'unauthorized' }, 401)
    const { emailPendingNotifications } = await import('./notificationMailer.js')
    return c.json(await emailPendingNotifications())
  })
}
