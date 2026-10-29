/**
 * One way out for every email. Picks the provider from the environment:
 *
 *   EMAIL_PROVIDER=brevo    Brevo transactional API   (BREVO_API_KEY, "xkeysib-…")
 *   EMAIL_PROVIDER=smtp     any SMTP relay, e.g. Brevo smtp-relay.brevo.com:587
 *                           (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS — the "xsmtpsib-…" key)
 *   EMAIL_PROVIDER=mailtrap the older Mailtrap settings (MAILTRAP_*)
 *   EMAIL_PROVIDER=log      nothing is sent; the email is only recorded
 *
 * Without EMAIL_PROVIDER the first configured one wins (brevo, smtp, mailtrap),
 * else log. Sender: EMAIL_FROM (default info@lekayarentals.site) and
 * EMAIL_FROM_NAME. Keys live in the server .env only — never in code.
 *
 * Every attempt is written to email_log (no bodies, no secrets) so the
 * platform team can see what went out. Sending never throws.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import nodemailer from 'nodemailer'
import { query } from '../db.js'

export type EmailProvider = 'brevo' | 'smtp' | 'mailtrap' | 'log'

export type OutgoingEmail = {
  to: string
  toName?: string
  subject: string
  text: string
  html?: string
  /** Template id / category, e.g. "password_reset". */
  category?: string
  /** users.id (uuid) of the recipient, when known. */
  userId?: string | null
}

export type SendResult = { sent: true; messageId?: string } | { sent: false; reason: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

export function emailSender(): { email: string; name: string } {
  // The old MAILTRAP_FROM_* names only count when Mailtrap itself is in use.
  const mailtrap = emailProvider() === 'mailtrap'
  return {
    email: env('EMAIL_FROM') || (mailtrap ? env('MAILTRAP_FROM_EMAIL') : '') || 'info@lekayarentals.site',
    name: env('EMAIL_FROM_NAME') || (mailtrap ? env('MAILTRAP_FROM_NAME') : '') || 'Lekaya Rentals',
  }
}

export function emailProvider(): EmailProvider {
  const chosen = env('EMAIL_PROVIDER').toLowerCase()
  if (chosen === 'brevo' || chosen === 'smtp' || chosen === 'mailtrap' || chosen === 'log') return chosen
  if (env('BREVO_API_KEY')) return 'brevo'
  if (env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS')) return 'smtp'
  if (env('MAILTRAP_API_KEY') || (env('MAILTRAP_SMTP_USER') && env('MAILTRAP_SMTP_PASS'))) return 'mailtrap'
  return 'log'
}

/** Previews render templates without sending: run the send inside captureEmails(). */
const capture = new AsyncLocalStorage<OutgoingEmail[]>()
export async function captureEmails(fn: () => Promise<unknown>): Promise<OutgoingEmail[]> {
  const out: OutgoingEmail[] = []
  await capture.run(out, fn)
  return out
}

let logTableReady: Promise<void> | null = null
export function ensureEmailLogTable(): Promise<void> {
  logTableReady ??= query(`
CREATE TABLE IF NOT EXISTS email_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  to_email    VARCHAR(190) NOT NULL,
  category    VARCHAR(60),
  subject     VARCHAR(300) NOT NULL,
  provider    VARCHAR(20) NOT NULL,
  status      VARCHAR(20) NOT NULL,
  error       TEXT,
  message_id  VARCHAR(200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log (created_at DESC);
`)
    .then(() => undefined)
    .catch((e) => {
      logTableReady = null
      throw e
    })
  return logTableReady
}

async function record(mail: OutgoingEmail, provider: EmailProvider, status: string, error?: string, messageId?: string) {
  try {
    await ensureEmailLogTable()
    await query(
      `INSERT INTO email_log (user_id, to_email, category, subject, provider, status, error, message_id)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)`,
      [
        mail.userId && /^[0-9a-f-]{36}$/i.test(mail.userId) ? mail.userId : null,
        mail.to.slice(0, 190),
        mail.category?.slice(0, 60) ?? null,
        mail.subject.slice(0, 300),
        provider,
        status,
        error ? error.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '***@redacted').slice(0, 500) : null,
        messageId?.slice(0, 200) ?? null,
      ],
    )
  } catch {
    /* logging must never break a send */
  }
}

export function redactEmailForLog(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  return `${email[0]}***@${email.slice(at + 1)}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let smtpCache: { key: string; t: any } | null = null
function smtpTransport(host: string, port: number, user: string, pass: string) {
  const key = `${host}:${port}:${user}`
  if (!smtpCache || smtpCache.key !== key) {
    smtpCache = { key, t: nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } }) }
  }
  return smtpCache.t
}

async function viaBrevo(mail: OutgoingEmail): Promise<string | undefined> {
  const from = emailSender()
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env('BREVO_API_KEY'), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: from,
      to: [{ email: mail.to, ...(mail.toName ? { name: mail.toName } : {}) }],
      subject: mail.subject,
      textContent: mail.text,
      ...(mail.html ? { htmlContent: mail.html } : {}),
      ...(mail.category ? { tags: [mail.category] } : {}),
    }),
  })
  const body = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string }
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.message || body.code || 'send failed'}`)
  return body.messageId
}

async function viaSmtp(mail: OutgoingEmail, host: string, port: number, user: string, pass: string, extra?: Record<string, string>) {
  const from = emailSender()
  const info = await smtpTransport(host, port, user, pass).sendMail({
    from: `"${from.name}" <${from.email}>`,
    to: mail.toName ? `"${mail.toName.replace(/"/g, '')}" <${mail.to}>` : mail.to,
    subject: mail.subject,
    text: mail.text,
    ...(mail.html ? { html: mail.html } : {}),
    headers: { 'Auto-Submitted': 'auto-generated', ...(extra ?? {}) },
  })
  return info.messageId as string | undefined
}

async function viaMailtrap(mail: OutgoingEmail): Promise<string | undefined> {
  const user = env('MAILTRAP_SMTP_USER')
  const pass = env('MAILTRAP_SMTP_PASS')
  const transport = env('MAILTRAP_TRANSPORT').toLowerCase()
  if (user && pass && transport !== 'api') {
    const port = Number(env('MAILTRAP_SMTP_PORT') || 587)
    return viaSmtp(mail, env('MAILTRAP_SMTP_HOST') || 'sandbox.smtp.mailtrap.io', Number.isFinite(port) ? port : 587, user, pass,
      mail.category ? { 'X-Mailtrap-Category': mail.category } : undefined)
  }
  const { MailtrapClient } = await import('mailtrap')
  const sandbox = (process.env.MAILTRAP_USE_SANDBOX ?? 'true').trim().toLowerCase() === 'true'
  const inbox = Number(env('MAILTRAP_INBOX_ID'))
  if (sandbox && !Number.isFinite(inbox)) throw new Error('API sandbox mode requires MAILTRAP_INBOX_ID')
  const client = new MailtrapClient({ token: env('MAILTRAP_API_KEY'), sandbox, ...(sandbox ? { testInboxId: inbox } : {}) })
  const from = emailSender()
  const response = await client.send({
    from: { email: from.email, name: from.name },
    to: [{ email: mail.to, ...(mail.toName ? { name: mail.toName } : {}) }],
    subject: mail.subject,
    text: mail.text,
    ...(mail.html ? { html: mail.html } : {}),
    ...(mail.category ? { category: mail.category } : {}),
  })
  return (response as unknown as { message_ids?: string[] }).message_ids?.[0]
}

/** Send one email. Resolves { sent: false } instead of throwing. */
export async function deliverEmail(mail: OutgoingEmail): Promise<SendResult> {
  const captured = capture.getStore()
  if (captured) {
    captured.push(mail)
    return { sent: false, reason: 'preview' }
  }
  const to = mail.to.trim()
  if (!EMAIL_RE.test(to)) return { sent: false, reason: 'invalid recipient' }
  const clean = { ...mail, to }
  const provider = emailProvider()
  if (provider === 'log') {
    console.info(`[email] not sent (no email provider set): ${clean.category ?? 'email'} to ${redactEmailForLog(to)}`)
    await record(clean, provider, 'logged', 'No email provider configured (set BREVO_API_KEY or SMTP_* in the server .env)')
    return { sent: false, reason: 'No email provider configured (MAILTRAP / BREVO / SMTP not set)' }
  }
  try {
    let messageId: string | undefined
    if (provider === 'brevo') messageId = await viaBrevo(clean)
    else if (provider === 'smtp') {
      const port = Number(env('SMTP_PORT') || 587)
      messageId = await viaSmtp(clean, env('SMTP_HOST'), Number.isFinite(port) ? port : 587, env('SMTP_USER'), env('SMTP_PASS'))
    } else messageId = await viaMailtrap(clean)
    console.info(`[email] sent via ${provider}: ${clean.category ?? 'email'} to ${redactEmailForLog(to)}`)
    await record(clean, provider, 'sent', undefined, messageId)
    return { sent: true, messageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[email] ${provider} send failed:`, message.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '***@redacted'))
    await record(clean, provider, 'failed', message)
    return { sent: false, reason: message }
  }
}
