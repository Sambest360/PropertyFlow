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

  // ---- Platform team: write an email to chosen people (sent from info@lekayarentals.site) ----

  app.get('/api/admin/email/recipients', async (c) => {
    const gate = await requireSuperAdmin(c)
    if (gate.error) return gate.error
    const q = String(c.req.query('q') ?? '').trim()
    const rows = await query(
      `SELECT u.id::text AS id, trim(u.first_name || ' ' || u.last_name) AS name, u.email, u.role, c.company_name AS agency
         FROM users u LEFT JOIN clients c ON c.id = u.client_id
        WHERE u.active = TRUE AND u.email NOT LIKE '%@propertyflow.local'
          AND ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR (u.first_name || ' ' || u.last_name) ILIKE '%' || $1 || '%' OR c.company_name ILIKE '%' || $1 || '%')
        ORDER BY u.first_name LIMIT 25`,
      [q],
    )
    return c.json({ recipients: rows })
  })

  app.post('/api/admin/email/compose', async (c) => {
    const gate = await requireSuperAdmin(c)
    if (gate.error) return gate.error
    const body = (await c.req.json().catch(() => ({}))) as { userIds?: unknown; group?: unknown; subject?: unknown; message?: unknown }
    const subject = String(body.subject ?? '').trim().slice(0, 200)
    const text = String(body.message ?? '').trim().slice(0, 20000)
    if (!subject || !text) return c.json({ error: 'invalid', message: 'Add a subject and a message.' }, 400)
    const ids = Array.isArray(body.userIds) ? body.userIds.map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500) : []
    const group = String(body.group ?? '')
    const groupRole: Record<string, string[]> = {
      agency_admins: ['AGENCY_ADMIN', 'AGENT_ADMIN'],
      landlords: ['LANDLORD'],
      agents: ['GROUND_AGENT'],
      contractors: ['CONTRACTOR'],
      tenants: ['END_USER'],
    }
    const roles = groupRole[group] ?? []
    if (!ids.length && !roles.length) return c.json({ error: 'invalid', message: 'Choose who to send it to.' }, 400)
    const people = await query<{ id: string; email: string; first_name: string }>(
      `SELECT id::text AS id, email, first_name FROM users
        WHERE active = TRUE AND email NOT LIKE '%@propertyflow.local'
          AND (id = ANY($1::uuid[]) OR role = ANY($2::text[]))
        LIMIT 2000`,
      [ids, roles],
    )
    const { layout, para, escapeHtml } = await import('./email/layout.js')
    const { deliverEmail } = await import('./email/send.js')
    let sent = 0
    let failed = 0
    for (const p of people) {
      const greeting = `Hi ${p.first_name || 'there'},`
      const htmlBody = [greeting, ...text.split(/\n{2,}/)].map((chunk) => para(escapeHtml(chunk).replace(/\n/g, '<br>'))).join('')
      const r = await deliverEmail({
        to: p.email,
        subject,
        text: `${greeting}\n\n${text}\n\n— Lekaya Rentals`,
        html: layout(subject, htmlBody, { preheader: text.slice(0, 120) }),
        category: 'admin_message',
        userId: p.id,
      })
      if (r.sent) sent++
      else failed++
    }
    return c.json({ ok: true, recipients: people.length, sent, failed, sentBy: gate.user.email })
  })

  /** Cron fallback for the in-process notification mailer. */
  app.get('/api/cron/notification-emails', async (c) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return c.json({ error: 'cron_disabled' }, 503)
    if (c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'unauthorized' }, 401)
    const { emailPendingNotifications } = await import('./notificationMailer.js')
    return c.json(await emailPendingNotifications())
  })

  /** Daily summary email for agency admins (see server/email/routing.ts). */
  app.get('/api/cron/admin-digest', async (c) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return c.json({ error: 'cron_disabled' }, 503)
    if (c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'unauthorized' }, 401)
    const { sendAdminDailyDigests } = await import('./notificationMailer.js')
    return c.json(await sendAdminDailyDigests())
  })

  /** A listing's cover photo, resized, for the property card in emails (read-only). */
  app.get('/api/email/photo/:file', async (c) => {
    const { emailPhoto } = await import('./email/photoRoute.js')
    const r = await emailPhoto(c.req.param('file'), c.req.query('s')).catch(() => ({ status: 404 as const }))
    if (r.status !== 200) return c.body(null, 404, { 'Cache-Control': 'public, max-age=300' })
    return new Response(new Uint8Array(r.body), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=604800',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
}
