/**
 * Business emails (enquiries, applications, payments, leases, dunning).
 *
 * Every email goes out through server/email/send.ts (Brevo API, SMTP relay,
 * Mailtrap or log-only, chosen from the server .env) in the shared branded
 * layout from server/email/layout.ts. The file keeps its old name so existing
 * imports keep working.
 */
import { deliverEmail, emailProvider, redactEmailForLog as redact, type SendResult } from './email/send.js'
import { layout, para, escapeHtml as esc } from './email/layout.js'

export type MailtrapSendInput = {
  to: string
  toName?: string
  subject: string
  text: string
  html?: string
  category?: string
  userId?: string | null
}

export type MailtrapSendResult = SendResult

/** True when a real email provider is configured (not log-only). */
export function isMailtrapConfigured(): boolean {
  return emailProvider() !== 'log'
}

/** Kept for scripts/sendTestEmail.ts: the provider in use, or null when log-only. */
export function mailtrapConfigFromEnv(): { transport: string } | null {
  const provider = emailProvider()
  return provider === 'log' ? null : { transport: provider }
}

/** Quiet send — never throws; see server/email/send.ts. */
export async function sendMailtrapEmail(input: MailtrapSendInput): Promise<MailtrapSendResult> {
  return deliverEmail(input)
}

function shell(title: string, bodyHtml: string): string {
  return layout(title, bodyHtml)
}

function p(text: string): string {
  return para(text)
}

/** CR10 N8: HTML-escape user-supplied text for email bodies. */
export function escapeHtml(v: string): string {
  return esc(v)
}

export function redactEmailForLog(email: string): string {
  return redact(email)
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
    p('Open your Lekaya workspace leads board to follow up.')
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
  const { sendTemplateEmail } = await import('./email/templates.js')
  return sendTemplateEmail('welcome', { to: input.email, name: input.firstName, role: input.role })
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
    ? 'Your Lekaya Rentals account has been approved 🎉'
    : 'Update on your Lekaya Rentals account'
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
    text: `Hi${input.firstName ? ` ${input.firstName}` : ''}, ${input.approved ? 'your Lekaya Rentals account has been approved.' : 'your Lekaya verification was not approved.'} ${nextStep}`,
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

export async function sendApplicationDeclined(input: {
  email: string
  applicantName?: string
  propertyTitle?: string
  reason?: string
}): Promise<MailtrapSendResult> {
  const subject = 'Update on your rental application'
  const propertyLine = input.propertyTitle
    ? ` for <strong>${escapeHtml(input.propertyTitle)}</strong>`
    : ''
  const reasonLine = input.reason?.trim()
    ? p(`Reason: ${escapeHtml(input.reason.trim())}`)
    : p('The agency will contact you if further information is required.')
  return sendMailtrapEmail({
    to: input.email,
    toName: input.applicantName,
    subject,
    category: 'application-declined',
    text: `Your application${input.propertyTitle ? ` for ${input.propertyTitle}` : ''} was not approved.${input.reason ? ` Reason: ${input.reason}` : ''}`,
    html: shell(
      subject,
      p(`Hi${input.applicantName ? ` <strong>${escapeHtml(input.applicantName)}</strong>` : ''},`) +
        p(`Thank you for applying${propertyLine}. After review, this application was <strong>not approved</strong>.`) +
        reasonLine +
        p('You may still browse other listings on Lekaya Rentals.'),
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
  const body = `Your lease for ${input.propertyTitle} has been signed by all parties. You can view it in Lekaya: ${input.leaseLink}.`
  // CR10 N8: name, property title and link are escaped in the HTML.
  const htmlBody = `Your lease for ${escapeHtml(input.propertyTitle)} has been signed by all parties. You can view it in Lekaya: ${escapeHtml(input.leaseLink)}.`
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
