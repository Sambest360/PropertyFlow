/**
 * Mailtrap transactional email (official `mailtrap` SDK).
 *
 * Config pattern mirrors server/payfast.ts: env-driven config that resolves to
 * null when unset, so every send site degrades to a no-op in environments
 * without credentials instead of throwing at import time.
 *
 * Secrets come from env only (never hardcode): MAILTRAP_API_KEY.
 * Setup values: MAILTRAP_USE_SANDBOX, MAILTRAP_INBOX_ID, MAILTRAP_FROM_*.
 *
 * Check delivery at https://mailtrap.io/sending/email_logs
 * Docs: https://docs.mailtrap.io/
 */
import { MailtrapClient, type MailtrapClientConfig } from 'mailtrap'
import nodemailer from 'nodemailer'

/**
 * Two transports, selected by MAILTRAP_TRANSPORT:
 *  - 'smtp'  — classic SMTP credentials (host sandbox.smtp.mailtrap.io + user/pass)
 *  - 'api'   — Mailtrap Email API via the official SDK (MAILTRAP_API_KEY)
 * Defaults to whichever is configured; explicit MAILTRAP_TRANSPORT wins.
 */
export type MailtrapTransport = 'smtp' | 'api'

type SmtpCreds = { host: string; port: number; user: string; pass: string }
type ApiCreds = { token: string; sandbox: boolean; testInboxId: number | null }

export type MailtrapConfig = {
  transport: MailtrapTransport
  smtp: SmtpCreds | null
  api: ApiCreds | null
  fromEmail: string
  fromName: string
}

function smtpCredsFromEnv(): SmtpCreds | null {
  const user = process.env.MAILTRAP_SMTP_USER?.trim()
  const pass = process.env.MAILTRAP_SMTP_PASS?.trim()
  if (!user || !pass) return null
  const port = Number(process.env.MAILTRAP_SMTP_PORT?.trim() || 587)
  return {
    host: process.env.MAILTRAP_SMTP_HOST?.trim() || 'sandbox.smtp.mailtrap.io',
    port: Number.isFinite(port) ? port : 587,
    user,
    pass,
  }
}

function apiCredsFromEnv(): ApiCreds | null {
  const token = process.env.MAILTRAP_API_KEY?.trim()
  if (!token) return null
  const sandbox = (process.env.MAILTRAP_USE_SANDBOX ?? 'true').trim().toLowerCase() === 'true'
  const rawInbox = process.env.MAILTRAP_INBOX_ID?.trim()
  const testInboxId = sandbox && rawInbox ? Number(rawInbox) : null
  return {
    token,
    sandbox,
    testInboxId: testInboxId != null && Number.isFinite(testInboxId) ? testInboxId : null,
  }
}

/** Resolves null when neither transport is configured — callers must no-op then. */
export function mailtrapConfigFromEnv(): MailtrapConfig | null {
  const smtp = smtpCredsFromEnv()
  const api = apiCredsFromEnv()
  if (!smtp && !api) return null
  const requested = process.env.MAILTRAP_TRANSPORT?.trim().toLowerCase()
  const transport: MailtrapTransport =
    requested === 'smtp' || requested === 'api'
      ? requested
      : smtp
        ? 'smtp'
        : 'api'
  return {
    transport,
    smtp,
    api,
    fromEmail: process.env.MAILTRAP_FROM_EMAIL?.trim() || 'hello@demomailtrap.co',
    fromName: process.env.MAILTRAP_FROM_NAME?.trim() || 'Letkaya',
  }
}

export function isMailtrapConfigured(): boolean {
  return mailtrapConfigFromEnv() != null
}

let cachedApi: { client: MailtrapClient; key: string } | null = null
let cachedSmtp: { transporter: ReturnType<typeof nodemailer.createTransport>; key: string } | null = null

function getApiClient(config: MailtrapConfig): MailtrapClient {
  const api = config.api
  if (!api) throw new Error('API transport not configured')
  const key = `${api.token}:${api.sandbox}:${api.testInboxId ?? ''}`
  if (!cachedApi || cachedApi.key !== key) {
    const opts: MailtrapClientConfig = { token: api.token, sandbox: api.sandbox }
    if (api.testInboxId != null) opts.testInboxId = api.testInboxId
    cachedApi = { client: new MailtrapClient(opts), key }
  }
  return cachedApi.client
}

function getSmtpTransporter(config: MailtrapConfig): ReturnType<typeof nodemailer.createTransport> {
  const smtp = config.smtp
  if (!smtp) throw new Error('SMTP transport not configured')
  const key = `${smtp.host}:${smtp.port}:${smtp.user}`
  if (!cachedSmtp || cachedSmtp.key !== key) {
    cachedSmtp = {
      key,
      transporter: nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
      }),
    }
  }
  return cachedSmtp.transporter
}

export type MailtrapSendInput = {
  to: string
  toName?: string
  subject: string
  text: string
  html?: string
  category?: string
}

export type MailtrapSendResult =
  | { sent: true; messageId?: string }
  | { sent: false; reason: string }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Quiet send — resolves { sent: false } instead of throwing so email problems
 * never break the API route that triggered it. Await it when you need the
 * outcome, or `void sendMailtrapEmail(...)` for fire-and-forget.
 */
export async function sendMailtrapEmail(input: MailtrapSendInput): Promise<MailtrapSendResult> {
  const config = mailtrapConfigFromEnv()
  if (!config) return { sent: false, reason: 'MAILTRAP_SMTP_USER/PASS or MAILTRAP_API_KEY not set' }
  const to = input.to.trim()
  if (!EMAIL_RE.test(to)) return { sent: false, reason: 'invalid recipient' }
  if (config.transport === 'api' && config.api?.sandbox && config.api.testInboxId == null) {
    return { sent: false, reason: 'API sandbox mode requires MAILTRAP_INBOX_ID' }
  }

  try {
    let messageId: string | undefined
    if (config.transport === 'smtp') {
      const info = await getSmtpTransporter(config).sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: input.toName ? `${input.toName} <${to}>` : to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        headers: input.category ? { 'X-Mailtrap-Category': input.category } : undefined,
      })
      messageId = info.messageId
    } else {
      const client = getApiClient(config)
      const response = await client.send({
        from: { email: config.fromEmail, name: config.fromName },
        to: [{ email: to, ...(input.toName ? { name: input.toName } : {}) }],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        ...(input.category ? { category: input.category } : {}),
      })
      messageId = (response as { message_ids?: string[] }).message_ids?.[0]
    }
    console.log(
      `[mailtrap] sent (${config.transport}${config.transport === 'api' && config.api?.sandbox ? '/sandbox' : ''}) to ${redactEmailForLog(to)}${messageId ? ` msg=${messageId}` : ''}`,
    )
    return { sent: true, messageId }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[mailtrap] send failed:', message.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '***@redacted'))
    return { sent: false, reason: message }
  }
}

// ---------------------------------------------------------------------------
// Branded HTML shell + business emails
// ---------------------------------------------------------------------------

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1d4ed8;padding:18px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:bold;">Let<span style="color:#f8b500">kaya</span></span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 14px;font-size:20px;color:#0f172a;">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;">
          Sent by Letkaya · This is an automated message.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.6;">${text}</p>`
}

/** CR10 N8: HTML-escape user-supplied text for email bodies. */
export function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function redactEmailForLog(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const head = local.length ? `${local[0]}***` : '***'
  return `${head}@${domain}`
}

export async function sendListingEnquiryConfirmation(input: {
  email: string
  firstName: string
  propertyTitle?: string
  action: 'lead' | 'viewing'
}): Promise<MailtrapSendResult> {
  const subject =
    input.action === 'viewing'
      ? 'Your viewing request has been received'
      : 'Your property enquiry has been received'
  const propertyLine = input.propertyTitle
    ? ` for <strong>${escapeHtml(input.propertyTitle)}</strong>`
    : ''
  return sendMailtrapEmail({
    to: input.email,
    toName: input.firstName,
    subject,
    category: 'listing-enquiry',
    text: `Hi ${input.firstName}, we received your ${input.action === 'viewing' ? 'viewing request' : 'enquiry'}${input.propertyTitle ? ` for ${input.propertyTitle}` : ''}. The listing agent will contact you shortly.`,
    html: shell(
      subject,
      p(`Hi <strong>${escapeHtml(input.firstName)}</strong>,`) +
        p(
          `Thanks for your ${input.action === 'viewing' ? 'viewing request' : 'enquiry'}${propertyLine}. The listing agent will be in touch shortly.`,
        ) +
        p('Keep this email for your records — no reply is needed.'),
    ),
  })
}

/**
 * Notify the listing agent (and landlord, when resolvable) that a guest lead or
 * viewing request came in. Fire-and-forget from the route — never blocks it.
 */
export async function sendListingLeadAlert(input: {
  agentEmail: string
  agentName?: string
  landlordEmail?: string
  propertyTitle?: string
  leadName: string
  leadEmail: string
  leadPhone?: string
  action: 'lead' | 'viewing'
}): Promise<MailtrapSendResult> {
  const kind = input.action === 'viewing' ? 'viewing request' : 'new enquiry'
  const subject = `${input.action === 'viewing' ? 'Viewing request' : 'New enquiry'}: ${input.leadName}`
  const propertyLine = input.propertyTitle
    ? ` for <strong>${escapeHtml(input.propertyTitle)}</strong>`
    : ''
  const contactRows =
    (input.leadEmail ? p(`Email: <strong>${escapeHtml(input.leadEmail)}</strong>`) : '') +
    (input.leadPhone ? p(`Phone: <strong>${escapeHtml(input.leadPhone)}</strong>`) : '')
  const bodyHtml =
    p(`Hi${input.agentName ? ` <strong>${escapeHtml(input.agentName)}</strong>` : ''},`) +
    p(`<strong>${escapeHtml(input.leadName)}</strong> sent a ${kind}${propertyLine} from the marketplace.`) +
    contactRows +
    p('Open your Letkaya workspace leads board to follow up.')
  const text =
    `${input.leadName} sent a ${kind}${input.propertyTitle ? ` for ${input.propertyTitle}` : ''}.` +
    (input.leadEmail ? ` Email: ${input.leadEmail}.` : '') +
    (input.leadPhone ? ` Phone: ${input.leadPhone}.` : '')
  const result = await sendMailtrapEmail({
    to: input.agentEmail,
    toName: input.agentName,
    subject,
    category: 'listing-lead-alert',
    text,
    html: shell(subject, bodyHtml),
  })
  // Landlord gets the same alert when we can resolve one — quiet-fail on each.
  if (input.landlordEmail && input.landlordEmail !== input.agentEmail) {
    void sendMailtrapEmail({
      to: input.landlordEmail,
      subject,
      category: 'listing-lead-alert',
      text,
      html: shell(subject, bodyHtml),
    })
  }
  return result
}

export async function sendPaymentReceipt(input: {
  email: string
  payerName?: string
  paymentId: string
  amountDisplay: string
  status: string
}): Promise<MailtrapSendResult> {
  const subject = `Payment ${input.status.toLowerCase() === 'complete' ? 'received' : 'update'} — ${input.amountDisplay}`
  return sendMailtrapEmail({
    to: input.email,
    toName: input.payerName,
    subject,
    category: 'payment-receipt',
    text: `We received your payment of ${input.amountDisplay} (ref ${input.paymentId}). Status: ${input.status}.`,
    html: shell(
      subject,
      (input.payerName ? p(`Hi <strong>${escapeHtml(input.payerName)}</strong>,`) : '') +
        p(
          `Your payment of <strong>${escapeHtml(input.amountDisplay)}</strong> was marked <strong>${escapeHtml(input.status)}</strong> by the payment provider.`,
        ) +
        p(`Reference: ${escapeHtml(input.paymentId)}`),
    ),
  })
}

export async function sendWelcomeEmail(input: {
  email: string
  firstName: string
  role?: string
}): Promise<MailtrapSendResult> {
  const subject = 'Welcome to Letkaya 🏡'
  const roleLine =
    input.role === 'landlord'
      ? 'Your documents are with our verification team — you will be notified once your account is approved and you can publish listings.'
      : input.role === 'contractor'
        ? 'Your documents are with our verification team — you will be notified once your account is approved and jobs can be assigned to you.'
        : 'You can now browse listings, book viewings, and track applications from your dashboard.'
  return sendMailtrapEmail({
    to: input.email,
    toName: input.firstName,
    subject,
    category: 'welcome',
    text: `Hi ${input.firstName}, welcome to Letkaya! ${roleLine}`,
    html: shell(
      subject,
      p(`Hi <strong>${escapeHtml(input.firstName)}</strong>,`) +
        p('Welcome to <strong>Letkaya</strong> — your account has been created.') +
        p(escapeHtml(roleLine)) +
        p('Keep this email for your records — no reply is needed.'),
    ),
  })
}

/**
 * Confirmation to the applicant right after their application is submitted
 * (stage machine decides the rest — this email makes no promises beyond "we
 * have it"). Fire-and-forget from the persist path.
 */
export async function sendApplicationReceived(input: {
  email: string
  applicantName?: string
  propertyTitle?: string
  referenceCode?: string
}): Promise<MailtrapSendResult> {
  const subject = 'Your application has been received'
  const propertyLine = input.propertyTitle
    ? ` for <strong>${escapeHtml(input.propertyTitle)}</strong>`
    : ''
  const refLine = input.referenceCode
    ? p(`Reference: <strong>${escapeHtml(input.referenceCode)}</strong>`)
    : ''
  return sendMailtrapEmail({
    to: input.email,
    toName: input.applicantName,
    subject,
    category: 'application-received',
    text: `Hi${input.applicantName ? ` ${input.applicantName}` : ''}, we received your application${input.propertyTitle ? ` for ${input.propertyTitle}` : ''}. The agency will review it and be in touch.${input.referenceCode ? ` Reference: ${input.referenceCode}.` : ''}`,
    html: shell(
      subject,
      p(`Hi${input.applicantName ? ` <strong>${escapeHtml(input.applicantName)}</strong>` : ''},`) +
        p(`We received your application${propertyLine}. The agency will review it and be in touch.`) +
        refLine +
        p('Track its progress anytime from your dashboard.'),
    ),
  })
}

/**
 * Decision email after a super admin reviews a landlord/contractor onboarding
 * verification. Approved → they can sign in and publish/receive work;
 * rejected → honest note, no false promises.
 */
export async function sendVerificationDecision(input: {
  email: string
  firstName?: string
  role?: string
  approved: boolean
  rejectNote?: string
}): Promise<MailtrapSendResult> {
  const isLandlord = input.role !== 'contractor'
  const subject = input.approved
    ? 'Your Letkaya account has been approved 🎉'
    : 'Update on your Letkaya account'
  const nextStep = input.approved
    ? isLandlord
      ? 'You can sign in now and start publishing your listings — applicants can find and apply to them right away.'
      : 'You can sign in now — maintenance jobs in your service areas will be assigned to you.'
    : `Reviewer note: ${input.rejectNote ?? 'Your documents were not approved'}. You can register again with updated documents, or contact support for help.`
  return sendMailtrapEmail({
    to: input.email,
    toName: input.firstName,
    subject,
    category: input.approved ? 'verification-approved' : 'verification-rejected',
    text: `Hi${input.firstName ? ` ${input.firstName}` : ''}, ${input.approved ? 'your Letkaya account has been approved.' : 'your Letkaya verification was not approved.'} ${nextStep}`,
    html: shell(
      subject,
      p(`Hi${input.firstName ? ` <strong>${escapeHtml(input.firstName)}</strong>` : ' there'},`) +
        (input.approved
          ? p('Good news — your account has been <strong style="color:#16a34a;">approved</strong>.') +
            p(escapeHtml(nextStep)) +
            p('Sign in with the email and password you registered.')
          : p('Unfortunately your verification was <strong>not approved</strong>.') +
            p(escapeHtml(nextStep))),
    ),
  })
}

export async function sendApplicationApproved(input: {
  email: string
  applicantName?: string
  propertyTitle?: string
}): Promise<MailtrapSendResult> {
  const subject = 'Your rental application was approved 🎉'
  const propertyLine = input.propertyTitle
    ? ` for <strong>${escapeHtml(input.propertyTitle)}</strong>`
    : ''
  return sendMailtrapEmail({
    to: input.email,
    toName: input.applicantName,
    subject,
    category: 'application-approved',
    text: `Good news — your application${input.propertyTitle ? ` for ${input.propertyTitle}` : ''} has been approved. Your tenant portal tools are now unlocked.`,
    html: shell(
      subject,
      p(`Good news${input.applicantName ? `, <strong>${escapeHtml(input.applicantName)}</strong>` : ''}!`) +
        p(`Your application${propertyLine} has been <strong style="color:#16a34a;">approved</strong>.`) +
        p('Sign in to your tenant portal to see your lease details, raise maintenance requests, and message the agency.'),
    ),
  })
}

/**
 * DQ-M4 Mode A: optional rent-dunning email behind ENABLE_EMAIL_DUNNING (default OFF).
 * Unset / false / 0 → never send. When ON, still no-ops if Mailtrap is unconfigured.
 * Not WhatsApp/SMS/carrier delivery — sandbox/transactional Mailtrap only.
 */
export function isEmailDunningEnabled(): boolean {
  const raw = (
    process.env.ENABLE_EMAIL_DUNNING ??
    process.env.DUNNING_EMAIL_ENABLED ??
    ''
  )
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

/**
 * Optional Mailtrap dunning notice (category `rent-dunning`).
 * Reuses the same title/body staff already saw from buildDunningNotice.
 * Fire-and-forget from the notify route — fail ≠ fail UI.
 */
export async function sendDunningNoticeEmail(input: {
  email: string
  tenantName?: string
  title: string
  body: string
  stage: string
  propertyTitle?: string
  amountDisplay?: string
  dueDate?: string
}): Promise<MailtrapSendResult> {
  if (!isEmailDunningEnabled()) {
    return { sent: false, reason: 'ENABLE_EMAIL_DUNNING off (default)' }
  }
  const subject = input.title.trim() || `Rent notice · ${input.stage}`
  const propertyLine = input.propertyTitle
    ? p(`Property: <strong>${escapeHtml(input.propertyTitle)}</strong>`)
    : ''
  const amountLine = input.amountDisplay
    ? p(`Amount: <strong>${escapeHtml(input.amountDisplay)}</strong>`)
    : ''
  const dueLine = input.dueDate ? p(`Due date: <strong>${escapeHtml(input.dueDate)}</strong>`) : ''
  const stageLine = p(`Stage: <strong>${escapeHtml(input.stage)}</strong>`)
  return sendMailtrapEmail({
    to: input.email,
    toName: input.tenantName,
    subject,
    category: 'rent-dunning',
    text: input.body,
    html: shell(
      subject,
      (input.tenantName ? p(`Hi <strong>${escapeHtml(input.tenantName)}</strong>,`) : '') +
        p(escapeHtml(input.body)) +
        propertyLine +
        amountLine +
        dueLine +
        stageLine +
        p(
          'This is an optional Mode A sandbox email (ENABLE_EMAIL_DUNNING). It is not WhatsApp, SMS, or carrier delivery confirmation.',
        ),
    ),
  })
}

/** CR10 part 8: lease-signed email, off by default (ENABLE_EMAIL_LEASE_SIGNED). */
export function isEmailLeaseSignedEnabled(): boolean {
  const raw = (process.env.ENABLE_EMAIL_LEASE_SIGNED ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

/** Plain copy, no legal claims: "Your lease for <property> has been signed by all parties." */
export async function sendLeaseSignedEmail(input: {
  to: string
  name?: string | null
  propertyTitle: string
  leaseLink: string
}): Promise<MailtrapSendResult> {
  if (!isEmailLeaseSignedEnabled()) {
    return { sent: false, reason: 'ENABLE_EMAIL_LEASE_SIGNED off (default)' }
  }
  const subject = 'Your lease has been signed'
  const body = `Your lease for ${input.propertyTitle} has been signed by all parties. You can view it in Letkaya: ${input.leaseLink}.`
  // CR10 N8: name, property title and link are escaped in the HTML.
  const htmlBody = `Your lease for ${escapeHtml(input.propertyTitle)} has been signed by all parties. You can view it in Letkaya: ${escapeHtml(input.leaseLink)}.`
  return sendMailtrapEmail({
    to: input.to,
    toName: input.name ?? undefined,
    subject,
    category: 'lease-signed',
    text: body,
    html: shell(subject, (input.name ? p(`Hi <strong>${escapeHtml(input.name)}</strong>,`) : '') + p(htmlBody)),
  })
}

/** ENABLE_EMAIL_LEASE_REMINDER (default OFF) gates the optional lease-end reminder email. */
export function isEmailLeaseReminderEnabled(): boolean {
  const raw = (process.env.ENABLE_EMAIL_LEASE_REMINDER ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

/** Optional lease-end reminder email (category `lease-end-reminder`), same copy as in-app. */
export async function sendLeaseEndReminder(input: {
  email: string
  name?: string
  title: string
  body: string
}): Promise<MailtrapSendResult> {
  if (!isEmailLeaseReminderEnabled()) {
    return { sent: false, reason: 'ENABLE_EMAIL_LEASE_REMINDER off (default)' }
  }
  return sendMailtrapEmail({
    to: input.email,
    toName: input.name,
    subject: input.title,
    category: 'lease-end-reminder',
    text: input.body,
    html: shell(
      input.title,
      (input.name ? p(`Hi <strong>${escapeLeaseHtml(input.name)}</strong>,`) : '') +
        input.body
          .split('\n')
          .filter(Boolean)
          .map((line) => p(escapeLeaseHtml(line)))
          .join(''),
    ),
  })
}

function escapeLeaseHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
