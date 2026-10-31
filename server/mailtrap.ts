/**
 * Business emails (enquiries, applications, payments, leases, dunning).
 *
 * Every email goes out through server/email/send.ts (Brevo API, SMTP relay,
 * Mailtrap or log-only, chosen from the server .env) in the shared branded
 * layout from server/email/layout.ts. The file keeps its old name so existing
 * imports keep working.
 */
import { deliverEmail, emailProvider, redactEmailForLog as redact, type SendResult } from './email/send.js'
import {
  button,
  buttonText,
  layout,
  para,
  escapeHtml as esc,
  propertyCard,
  propertyCardText,
  textLink,
  type PropertyCard,
} from './email/layout.js'
import { audienceForRole, propertyCardFor, type CardAudience, type PropertyRef } from './email/propertyContext.js'
import { emailActionFor } from './email/actions.js'
import { routeNotificationEmail } from './email/routing.js'

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

/**
 * The property card for an email: resolved from what the caller knows, or a
 * title-only card (no photo panel) when the property cannot be looked up.
 */
async function cardFor(
  ref: PropertyRef | undefined,
  audience: CardAudience,
  fallbackTitle?: string,
): Promise<PropertyCard | null> {
  const card = ref ? await propertyCardFor(ref, audience) : null
  if (card) return card
  return fallbackTitle?.trim() ? { title: fallbackTitle.trim() } : null
}

/** Card + button HTML and their plain-text twin. */
function blocks(card: PropertyCard | null, action: { label: string; href: string } | null): { html: string; text: string } {
  return {
    html: (card ? propertyCard(card) : '') + (action ? button(action.label, action.href) : ''),
    text: [card ? propertyCardText(card) : '', action ? buttonText(action.label, action.href) : ''].filter(Boolean).join('\n\n'),
  }
}

export async function sendListingEnquiryConfirmation(input: {
  email: string
  firstName: string
  propertyTitle?: string
  action: 'lead' | 'viewing'
  property?: PropertyRef
}): Promise<MailtrapSendResult> {
  const subject =
    input.action === 'viewing'
      ? 'Your viewing request has been received'
      : 'Your property enquiry has been received'
  const card = await cardFor(input.property, 'public', input.propertyTitle)
  const title = card?.title ?? input.propertyTitle
  const propertyLine = title ? ` for <strong>${escapeHtml(title)}</strong>` : ''
  const b = blocks(card, card?.viewUrl ? { label: 'View the property', href: card.viewUrl } : { label: 'Browse more homes', href: '/browse' })
  return sendMailtrapEmail({
    to: input.email,
    toName: input.firstName,
    subject,
    category: 'listing-enquiry',
    text: `Hi ${input.firstName}, we received your ${input.action === 'viewing' ? 'viewing request' : 'enquiry'}${title ? ` for ${title}` : ''}. The listing agent will contact you shortly.\n\n${b.text}`,
    html: shell(
      subject,
      p(`Hi <strong>${escapeHtml(input.firstName)}</strong>,`) +
        p(
          `Thanks for your ${input.action === 'viewing' ? 'viewing request' : 'enquiry'}${propertyLine}. The listing agent will be in touch shortly.`,
        ) +
        b.html +
        p('Keep this email for your records — no reply is needed.'),
    ),
  })
}

/**
 * Landlord copies of enquiry alerts are OFF unless ALERT_LANDLORDS=1 (exactly).
 * Until a data processing agreement and sender verification are in place, only
 * the agent receives the enquirer's name, email, phone and note. Read at call
 * time so the setting follows the server's env (and tests can toggle it).
 */
export function landlordAlertsEnabled(): boolean {
  return process.env.ALERT_LANDLORDS === '1'
}

/**
 * Notify the listing agent (and the landlord, only when ALERT_LANDLORDS=1 and
 * one is resolvable) that a guest lead or viewing request came in.
 * Fire-and-forget from the route — never blocks it.
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
  /** H1 item 7: a repeat enquiry's new note (already appended to the existing lead). */
  repeatNote?: string
  property?: PropertyRef
  /** The lead's front-end id (the button opens it). */
  leadId?: string | null
  /** A viewing request's booking id (the button opens the viewing). */
  bookingId?: string | null
  /** The listing's front-end id, for the viewings page. */
  propertyId?: string | null
}): Promise<MailtrapSendResult> {
  const repeat = Boolean(input.repeatNote)
  const kind = repeat ? 'follow-up message' : input.action === 'viewing' ? 'viewing request' : 'new enquiry'
  const subject = repeat
    ? `Follow-up from ${input.leadName}`
    : `${input.action === 'viewing' ? 'Viewing request' : 'New enquiry'}: ${input.leadName}`
  const card = await cardFor(input.property, 'staff', input.propertyTitle)
  const title = card?.title ?? input.propertyTitle
  const propertyLine = title ? ` for <strong>${escapeHtml(title)}</strong>` : ''
  const action =
    input.action === 'viewing' && input.propertyId
      ? {
          label: 'Confirm the viewing',
          href: `/workspace/sales/viewings/property/${encodeURIComponent(input.propertyId)}${input.bookingId ? `?booking=${encodeURIComponent(input.bookingId)}` : ''}`,
        }
      : input.leadId
        ? { label: 'Open the lead', href: `/workspace/sales/crm/${encodeURIComponent(input.leadId)}` }
        : { label: 'Open my leads', href: '/workspace/sales/crm' }
  const b = blocks(card, action)
  const contactRows =
    (input.leadEmail ? p(`Email: <strong>${escapeHtml(input.leadEmail)}</strong>`) : '') +
    (input.leadPhone ? p(`Phone: <strong>${escapeHtml(input.leadPhone)}</strong>`) : '')
  const bodyHtml =
    p(`Hi${input.agentName ? ` <strong>${escapeHtml(input.agentName)}</strong>` : ''},`) +
    p(`<strong>${escapeHtml(input.leadName)}</strong> sent a ${kind}${propertyLine} from the marketplace.`) +
    contactRows +
    (repeat ? p(`Message: <strong>${escapeHtml(input.repeatNote ?? '')}</strong>`) + p('It was added to the notes on their existing lead.') : '') +
    b.html
  const text =
    `${input.leadName} sent a ${kind}${title ? ` for ${title}` : ''}.` +
    (input.leadEmail ? ` Email: ${input.leadEmail}.` : '') +
    (input.leadPhone ? ` Phone: ${input.leadPhone}.` : '') +
    (repeat ? ` Message: ${input.repeatNote}. It was added to the notes on their existing lead.` : '') +
    `\n\n${b.text}`
  const result = await sendMailtrapEmail({
    to: input.agentEmail,
    toName: input.agentName,
    subject,
    category: 'listing-lead-alert',
    text,
    html: shell(subject, bodyHtml),
  })
  // Landlord gets the same alert only when ALERT_LANDLORDS=1 and we can resolve
  // one — quiet-fail on each. Their button opens the property, not the CRM.
  if (landlordAlertsEnabled() && input.landlordEmail && input.landlordEmail !== input.agentEmail) {
    const lCard = await cardFor(input.property, 'landlord', input.propertyTitle)
    const lb = blocks(lCard, lCard?.viewUrl ? { label: 'Open the property', href: lCard.viewUrl } : { label: 'Open my portal', href: '/workspace/portals/owner' })
    void sendMailtrapEmail({
      to: input.landlordEmail,
      subject,
      category: 'listing-lead-alert',
      text: text.replace(b.text, lb.text),
      html: shell(subject, bodyHtml.replace(b.html, lb.html)),
    })
  }
  return result
}

/**
 * After an online payment (PayFast, being retired). The site only records
 * payments: the button opens the payment record, never a checkout.
 */
export async function sendPaymentReceipt(input: {
  email: string
  payerName?: string
  paymentId: string
  amountDisplay: string
  status: string
  property?: PropertyRef
  /** Where the payer sees the record (tenant portal by default). */
  link?: string
}): Promise<MailtrapSendResult> {
  const subject = `Payment ${input.status.toLowerCase() === 'complete' ? 'received' : 'update'} — ${input.amountDisplay}`
  const card = await cardFor(input.property ?? { paymentId: input.paymentId }, 'tenant')
  const b = blocks(card, { label: 'Open the payment record', href: input.link ?? '/workspace/portals/tenant/payments' })
  return sendMailtrapEmail({
    to: input.email,
    toName: input.payerName,
    subject,
    category: 'payment-receipt',
    text: `We received your payment of ${input.amountDisplay} (ref ${input.paymentId}). Status: ${input.status}.\n\n${b.text}`,
    html: shell(
      subject,
      (input.payerName ? p(`Hi <strong>${escapeHtml(input.payerName)}</strong>,`) : '') +
        p(
          `Your payment of <strong>${escapeHtml(input.amountDisplay)}</strong> was marked <strong>${escapeHtml(input.status)}</strong> by the payment provider.`,
        ) +
        p(`Reference: ${escapeHtml(input.paymentId)}`) +
        b.html,
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

/** Applicant's own page for one application (or their list when the id is unknown). */
export function applicantApplicationLink(applicationId?: string | null): string {
  return applicationId
    ? `/workspace/portals/tenant/applications/${encodeURIComponent(applicationId)}`
    : '/workspace/portals/tenant/applications'
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
  property?: PropertyRef
  /** Front-end application id: the button opens it. */
  applicationId?: string | null
}): Promise<MailtrapSendResult> {
  const subject = 'Your application has been received'
  const card = await cardFor(input.property, 'tenant', input.propertyTitle)
  const title = card?.title ?? input.propertyTitle
  const propertyLine = title ? ` for <strong>${escapeHtml(title)}</strong>` : ''
  const refLine = input.referenceCode
    ? p(`Reference: <strong>${escapeHtml(input.referenceCode)}</strong>`)
    : ''
  const b = blocks(card, { label: 'Track my application', href: applicantApplicationLink(input.applicationId) })
  return sendMailtrapEmail({
    to: input.email,
    toName: input.applicantName,
    subject,
    category: 'application-received',
    text: `Hi${input.applicantName ? ` ${input.applicantName}` : ''}, we received your application${title ? ` for ${title}` : ''}. The agency will review it and be in touch.${input.referenceCode ? ` Reference: ${input.referenceCode}.` : ''}\n\n${b.text}`,
    html: shell(
      subject,
      p(`Hi${input.applicantName ? ` <strong>${escapeHtml(input.applicantName)}</strong>` : ''},`) +
        p(`We received your application${propertyLine}. The agency will review it and be in touch.`) +
        refLine +
        b.html +
        p('If the agency asks for more documents, you can upload them from the same page.'),
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
  const action = input.approved
    ? isLandlord
      ? { label: 'List my first property', href: '/workspace/properties/new' }
      : { label: 'Open my jobs', href: '/workspace/portals/contractor' }
    : { label: 'Contact support', href: '/contact' }
  return sendMailtrapEmail({
    to: input.email,
    toName: input.firstName,
    subject,
    category: input.approved ? 'verification-approved' : 'verification-rejected',
    text: `Hi${input.firstName ? ` ${input.firstName}` : ''}, ${input.approved ? 'your Lekaya Rentals account has been approved.' : 'your Lekaya verification was not approved.'} ${nextStep}\n\n${buttonText(action.label, action.href)}`,
    html: shell(
      subject,
      p(`Hi${input.firstName ? ` <strong>${escapeHtml(input.firstName)}</strong>` : ' there'},`) +
        (input.approved
          ? p('Good news — your account has been <strong style="color:#16a34a;">approved</strong>.') +
            p(escapeHtml(nextStep)) +
            p('Sign in with the email and password you registered.')
          : p('Unfortunately your verification was <strong>not approved</strong>.') +
            p(escapeHtml(nextStep))) +
        button(action.label, action.href),
    ),
  })
}

export async function sendApplicationDeclined(input: {
  email: string
  applicantName?: string
  propertyTitle?: string
  reason?: string
  property?: PropertyRef
  applicationId?: string | null
}): Promise<MailtrapSendResult> {
  const subject = 'Update on your rental application'
  const card = await cardFor(input.property, 'tenant', input.propertyTitle)
  const title = card?.title ?? input.propertyTitle
  const propertyLine = title ? ` for <strong>${escapeHtml(title)}</strong>` : ''
  const reasonLine = input.reason?.trim()
    ? p(`Reason: ${escapeHtml(input.reason.trim())}`)
    : p('The agency will contact you if further information is required.')
  const b = blocks(card, { label: 'Browse other homes', href: '/browse' })
  const appLinkText = buttonText('Your application', applicantApplicationLink(input.applicationId))
  return sendMailtrapEmail({
    to: input.email,
    toName: input.applicantName,
    subject,
    category: 'application-declined',
    text: `Your application${title ? ` for ${title}` : ''} was not approved.${input.reason ? ` Reason: ${input.reason}` : ''}\n\n${b.text}\n${appLinkText}`,
    html: shell(
      subject,
      p(`Hi${input.applicantName ? ` <strong>${escapeHtml(input.applicantName)}</strong>` : ''},`) +
        p(`Thank you for applying${propertyLine}. After review, this application was <strong>not approved</strong>.`) +
        reasonLine +
        (card ? propertyCard(card) : '') +
        p('You may still browse other listings on Lekaya Rentals.') +
        button('Browse other homes', '/browse') +
        textLink('See this application', applicantApplicationLink(input.applicationId)),
    ),
  })
}

export async function sendApplicationApproved(input: {
  email: string
  applicantName?: string
  propertyTitle?: string
  property?: PropertyRef
  applicationId?: string | null
}): Promise<MailtrapSendResult> {
  const subject = 'Your rental application was approved 🎉'
  const card = await cardFor(input.property, 'tenant', input.propertyTitle)
  const title = card?.title ?? input.propertyTitle
  const propertyLine = title ? ` for <strong>${escapeHtml(title)}</strong>` : ''
  const b = blocks(card, { label: 'See my next steps', href: applicantApplicationLink(input.applicationId) })
  return sendMailtrapEmail({
    to: input.email,
    toName: input.applicantName,
    subject,
    category: 'application-approved',
    text: `Good news — your application${title ? ` for ${title}` : ''} has been approved. Your next steps (offer, lease signing) are on your application page.\n\n${b.text}`,
    html: shell(
      subject,
      p(`Good news${input.applicantName ? `, <strong>${escapeHtml(input.applicantName)}</strong>` : ''}!`) +
        p(`Your application${propertyLine} has been <strong style="color:#16a34a;">approved</strong>.`) +
        p('Your next steps, such as accepting the offer and signing the lease, are on your application page.') +
        b.html,
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
 * Optional dunning notice (category `rent-dunning`).
 * Reuses the same title/body staff already saw from buildDunningNotice.
 * Fire-and-forget from the notify route — fail ≠ fail UI. The button opens
 * the tenant's payments page to upload proof; the site takes no payments.
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
  property?: PropertyRef
}): Promise<MailtrapSendResult> {
  if (!isEmailDunningEnabled()) {
    return { sent: false, reason: 'ENABLE_EMAIL_DUNNING off (default)' }
  }
  const subject = input.title.trim() || `Rent notice · ${input.stage}`
  const card = await cardFor(input.property, 'tenant', input.propertyTitle)
  const b = blocks(card, { label: 'Upload proof of payment', href: '/workspace/portals/tenant/payments' })
  const amountLine = input.amountDisplay
    ? p(`Amount: <strong>${escapeHtml(input.amountDisplay)}</strong>`)
    : ''
  const dueLine = input.dueDate ? p(`Due date: <strong>${escapeHtml(input.dueDate)}</strong>`) : ''
  return sendMailtrapEmail({
    to: input.email,
    toName: input.tenantName,
    subject,
    category: 'rent-dunning',
    text: [
      input.body,
      input.amountDisplay ? `Amount: ${input.amountDisplay}` : '',
      input.dueDate ? `Due date: ${input.dueDate}` : '',
      '',
      b.text,
      '',
      'Already paid? Upload your proof of payment so your agent can match it.',
    ]
      .filter((l, i, all) => l !== '' || all[i - 1] !== '')
      .join('\n'),
    html: shell(
      subject,
      (input.tenantName ? p(`Hi <strong>${escapeHtml(input.tenantName)}</strong>,`) : '') +
        p(escapeHtml(input.body)) +
        amountLine +
        dueLine +
        (card ? propertyCard(card) : '') +
        p('Already paid? Upload your proof of payment so your agent can match it.') +
        button('Upload proof of payment', '/workspace/portals/tenant/payments'),
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
  property?: PropertyRef
  audience?: CardAudience
}): Promise<MailtrapSendResult> {
  if (!isEmailLeaseSignedEnabled()) {
    return { sent: false, reason: 'ENABLE_EMAIL_LEASE_SIGNED off (default)' }
  }
  const subject = 'Your lease has been signed'
  const card = await cardFor(input.property, input.audience ?? 'tenant', input.propertyTitle)
  const b = blocks(card, { label: 'View the signed lease', href: input.leaseLink })
  const body = `Your lease for ${input.propertyTitle} has been signed by all parties. You can view it in Lekaya: ${input.leaseLink}.`
  // CR10 N8: name, property title and link are escaped in the HTML.
  const htmlBody = `Your lease for ${escapeHtml(input.propertyTitle)} has been signed by all parties. You can view and download it in Lekaya.`
  return sendMailtrapEmail({
    to: input.to,
    toName: input.name ?? undefined,
    subject,
    category: 'lease-signed',
    text: `${body}\n\n${b.text}`,
    html: shell(subject, (input.name ? p(`Hi <strong>${escapeHtml(input.name)}</strong>,`) : '') + p(htmlBody) + b.html),
  })
}

/** ENABLE_EMAIL_LEASE_REMINDER (default OFF) gates the optional lease-end reminder email. */
export function isEmailLeaseReminderEnabled(): boolean {
  const raw = (process.env.ENABLE_EMAIL_LEASE_REMINDER ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

/**
 * Optional lease-end reminder email (category `lease-end-reminder`), same copy
 * as in-app. Agency admins only get it when routing.ts says it needs them;
 * otherwise the in-app copy goes into their daily summary.
 */
export async function sendLeaseEndReminder(input: {
  email: string
  name?: string
  title: string
  body: string
  leaseId?: string
  link?: string
  role?: string
}): Promise<MailtrapSendResult> {
  if (!isEmailLeaseReminderEnabled()) {
    return { sent: false, reason: 'ENABLE_EMAIL_LEASE_REMINDER off (default)' }
  }
  const route = routeNotificationEmail({ role: input.role, resource: 'lease', action: 'reminder', title: input.title })
  if (route.route === 'digest') return { sent: false, reason: 'agency admin: in the daily summary' }
  const audience = audienceForRole(input.role)
  const card = input.leaseId ? await cardFor({ leaseId: input.leaseId }, audience) : null
  const action = input.link ? emailActionFor({ link: input.link, resource: 'lease', title: input.title, audience }) : null
  const b = blocks(card, action)
  return sendMailtrapEmail({
    to: input.email,
    toName: input.name,
    subject: input.title,
    category: 'lease-end-reminder',
    text: b.text ? `${input.body}\n\n${b.text}` : input.body,
    html: shell(
      input.title,
      (input.name ? p(`Hi <strong>${escapeLeaseHtml(input.name)}</strong>,`) : '') +
        input.body
          .split('\n')
          .filter(Boolean)
          .map((line) => p(escapeLeaseHtml(line)))
          .join('') +
        b.html,
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
