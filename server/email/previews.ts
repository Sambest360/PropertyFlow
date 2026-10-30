/**
 * Every email the system sends, rendered with sample data for the admin
 * "Emails" page. Business emails are rendered by calling their real send
 * function inside captureEmails(), so the preview is exactly what goes out.
 */
import { captureEmails, type OutgoingEmail, type SendResult, deliverEmail } from './send.js'
import { renderTemplate, TEMPLATE_CATALOG, type TemplateId } from './templates.js'

export type EmailPreview = {
  id: string
  name: string
  group: string
  description: string
  subject: string
  html: string
  text: string
}

type BusinessPreview = { id: string; name: string; group: string; description: string; run: () => Promise<unknown> }

async function business(): Promise<BusinessPreview[]> {
  const m = await import('../mailtrap.js')
  return [
    { id: 'enquiry_confirmation', name: 'Enquiry received', group: 'Enquiries & viewings', description: 'To a visitor after they enquire or book a viewing on a listing.', run: () => m.sendListingEnquiryConfirmation({ email: 'thandi@example.com', firstName: 'Thandi', propertyTitle: 'Humewood Beach Apartment B14', action: 'viewing' }) },
    { id: 'lead_alert', name: 'New lead for the agent', group: 'Enquiries & viewings', description: 'To the listing agent when a new enquiry comes in (landlord copy only with ALERT_LANDLORDS=1).', run: () => m.sendListingLeadAlert({ agentEmail: 'agent@example.com', agentName: 'James', propertyTitle: 'Humewood Beach Apartment B14', leadName: 'Thandi Mokoena', leadEmail: 'thandi@example.com', leadPhone: '082 555 0101', action: 'lead' }) },
    { id: 'application_received', name: 'Application received', group: 'Applications', description: 'To the applicant right after they apply.', run: () => m.sendApplicationReceived({ email: 'thandi@example.com', applicantName: 'Thandi', propertyTitle: 'Humewood Beach Apartment B14', referenceCode: 'APP-1042' }) },
    { id: 'application_approved', name: 'Application approved', group: 'Applications', description: 'To the applicant when the agency approves.', run: () => m.sendApplicationApproved({ email: 'thandi@example.com', applicantName: 'Thandi', propertyTitle: 'Humewood Beach Apartment B14' }) },
    { id: 'application_declined', name: 'Application declined', group: 'Applications', description: 'To the applicant when the agency declines.', run: () => m.sendApplicationDeclined({ email: 'thandi@example.com', applicantName: 'Thandi', propertyTitle: 'Humewood Beach Apartment B14', reason: 'The property was let to another applicant.' }) },
    { id: 'verification_decision', name: 'Documents checked', group: 'Account', description: 'To a landlord or contractor when the platform team approves or rejects their documents.', run: () => m.sendVerificationDecision({ email: 'sipho@example.com', firstName: 'Sipho', role: 'landlord', approved: true }) },
    { id: 'payment_receipt', name: 'Payment receipt', group: 'Payments', description: 'After an online payment.', run: () => m.sendPaymentReceipt({ email: 'thandi@example.com', payerName: 'Thandi', paymentId: 'PAY-2291', amountDisplay: 'R 8 500.00', status: 'Paid' }) },
    { id: 'dunning_notice', name: 'Rent reminder', group: 'Payments', description: 'Rent arrears reminder (when ENABLE_EMAIL_DUNNING is on).', run: () => m.sendDunningNoticeEmail({ email: 'thandi@example.com', tenantName: 'Thandi', title: 'Rent is overdue', body: 'Your rent for October is 5 days late.', stage: 'reminder', propertyTitle: 'Humewood Beach Apartment B14', amountDisplay: 'R 8 500.00', dueDate: '2026-10-01' }) },
    { id: 'lease_signed', name: 'Lease signed', group: 'Leases', description: 'When every party has signed (when ENABLE_EMAIL_LEASE_SIGNED is on).', run: () => m.sendLeaseSignedEmail({ to: 'thandi@example.com', name: 'Thandi', propertyTitle: 'Humewood Beach Apartment B14', leaseLink: 'https://lekayarentals.site/workspace/portals/tenant/leases' }) },
    { id: 'lease_end_reminder', name: 'Lease ending', group: 'Leases', description: 'Before a lease ends (when ENABLE_EMAIL_LEASE_REMINDER is on).', run: () => m.sendLeaseEndReminder({ email: 'thandi@example.com', name: 'Thandi', title: 'Your lease ends in 60 days', body: 'Your lease at Humewood Beach Apartment B14 ends on 31 December. Let your agent know if you want to renew.' }) },
  ]
}

async function captureOne(run: () => Promise<unknown>): Promise<OutgoingEmail | null> {
  const [mail] = await captureEmails(async () => {
    // Business send functions bail out early when a flag is off; force them on for the preview.
    const keys = ['ENABLE_EMAIL_DUNNING', 'ENABLE_EMAIL_LEASE_SIGNED', 'ENABLE_EMAIL_LEASE_REMINDER'] as const
    const saved = keys.map((k) => process.env[k])
    keys.forEach((k) => (process.env[k] = '1'))
    try {
      await run()
    } finally {
      keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])))
    }
  })
  return mail ?? null
}

export async function listEmailPreviews(): Promise<EmailPreview[]> {
  const out: EmailPreview[] = TEMPLATE_CATALOG.map((t) => {
    const r = renderTemplate(t.id as TemplateId, t.sample as never)
    return { id: t.id, name: t.name, group: t.group, description: t.description, subject: r.subject, html: r.html, text: r.text }
  })
  for (const b of await business()) {
    const mail = await captureOne(b.run)
    if (mail) out.push({ id: b.id, name: b.name, group: b.group, description: b.description, subject: mail.subject, html: mail.html ?? '', text: mail.text })
  }
  return out
}

/** Send one template's sample to the signed-in admin so they can see it in their inbox. */
export async function sendPreviewTo(id: string, to: string, userId: string): Promise<SendResult> {
  const preview = (await listEmailPreviews()).find((p) => p.id === id)
  if (!preview) return { sent: false, reason: 'Unknown template' }
  return deliverEmail({ to, subject: `[Preview] ${preview.subject}`, text: preview.text, html: preview.html, category: `preview_${id}`, userId })
}
