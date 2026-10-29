/**
 * Account, security and notification email templates. Each template has a
 * name and sample data so the platform team can preview it (Admin → Emails).
 * Business emails (applications, payments, leases…) live in server/mailtrap.ts
 * and share the same layout; their previews are listed in emailPreviews.ts.
 *
 * No template ever contains a password. New accounts get a one-time link to
 * choose their own password instead.
 */
import { appLink, button, details, escapeHtml, layout, note, para } from './layout.js'
import { deliverEmail, type SendResult } from './send.js'

export type Rendered = { subject: string; text: string; html: string }

type Base = { to: string; name?: string; userId?: string | null }

export type TemplateData = {
  test: Base
  welcome: Base & { role?: string }
  verify_email: Base & { link: string }
  account_setup: Base & { link: string; agencyName?: string; role?: string; invitedBy?: string }
  password_reset: Base & { link: string }
  password_reset_by_staff: Base & { link: string; resetBy?: string }
  password_changed: Base
  notification: Base & { title: string; body: string; link?: string | null }
  notification_digest: Base & { items: Array<{ title: string; body: string; link?: string | null }> }
}

export type TemplateId = keyof TemplateData

function hi(name?: string): string {
  return para(`Hi <strong>${escapeHtml((name || '').trim() || 'there')}</strong>,`)
}

const ROLE_LINES: Record<string, string> = {
  landlord: 'Our team is checking your documents. We will email you as soon as your account is approved, and then you can list properties.',
  contractor: 'Our team is checking your documents. We will email you as soon as you are approved, and then agencies can book you for jobs.',
  tenant: 'You can now browse homes, book viewings and apply — all from your dashboard.',
}

const ROLE_NAMES: Record<string, string> = {
  super_admin: 'Platform admin',
  client_admin: 'Principal',
  agent_admin: 'Agency administrator',
  ground_agent: 'Full agent',
  agent: 'Agent',
  landlord: 'Landlord',
  tenant: 'Tenant',
  contractor: 'Contractor',
}

const render: { [K in TemplateId]: (d: TemplateData[K]) => Rendered } = {
  test: (d) => ({
    subject: 'Lekaya Rentals test email',
    text: `Hi ${d.name ?? 'there'}, this is a test email from Lekaya Rentals. If you can read it, email is working.`,
    html: layout('Email is working', hi(d.name) + para('This is a test email from Lekaya Rentals. If you can read it, email is set up correctly.')),
  }),

  welcome: (d) => {
    const line = ROLE_LINES[d.role ?? ''] ?? 'Your account is ready. Sign in any time to pick up where you left off.'
    return {
      subject: 'Welcome to Lekaya Rentals',
      text: `Hi ${d.name ?? 'there'}, welcome to Lekaya Rentals! ${line} Sign in: ${appLink('/login')}`,
      html: layout(
        'Welcome to Lekaya Rentals',
        hi(d.name) +
          para('Thanks for joining <strong>Lekaya Rentals</strong>. Your account has been created.') +
          para(escapeHtml(line)) +
          button('Go to my dashboard', '/workspace'),
        { preheader: 'Your Lekaya Rentals account is ready.' },
      ),
    }
  },

  verify_email: (d) => ({
    subject: 'Confirm your email address',
    text: `Hi ${d.name ?? 'there'}, please confirm your email address for Lekaya Rentals: ${appLink(d.link)} (the link expires in 48 hours).`,
    html: layout(
      'Confirm your email address',
      hi(d.name) +
        para('Please confirm that this is your email address. It keeps your account safe and makes sure you get our updates.') +
        button('Confirm my email', d.link) +
        note('This link expires in 48 hours. If you did not create a Lekaya Rentals account, you can ignore this email.'),
      { preheader: 'One click to confirm your email.' },
    ),
  }),

  account_setup: (d) => {
    const who = d.agencyName ? ` at ${d.agencyName}` : ''
    return {
      subject: 'Your Lekaya Rentals account is ready',
      text: `Hi ${d.name ?? 'there'}, an account was created for you${who}. Choose your password here: ${appLink(d.link)} (the link expires in 72 hours). Sign-in email: ${d.to}`,
      html: layout(
        'Your account is ready',
        hi(d.name) +
          para(`An account has been created for you on <strong>Lekaya Rentals</strong>${escapeHtml(who)}.`) +
          details([
            ['Sign-in email', d.to],
            ['Role', d.role ? (ROLE_NAMES[d.role] ?? d.role) : null],
            ['Set up by', d.invitedBy],
          ]) +
          para('Choose your own password to finish setting up. We never send passwords by email.') +
          button('Choose my password', d.link) +
          note('This link works once and expires in 72 hours. If it has expired, use "Forgot password" on the sign-in page.'),
        { preheader: 'Choose your password to start using Lekaya Rentals.' },
      ),
    }
  },

  password_reset: (d) => ({
    subject: 'Reset your Lekaya Rentals password',
    text: `Hi ${d.name ?? 'there'}, we got a request to reset your password. Choose a new one here: ${appLink(d.link)} (the link expires in 1 hour). If you did not ask for this, ignore this email.`,
    html: layout(
      'Reset your password',
      hi(d.name) +
        para('We got a request to reset the password for your Lekaya Rentals account.') +
        button('Choose a new password', d.link) +
        note('This link works once and expires in 1 hour. If you did not ask for a reset, ignore this email — your password stays the same.'),
      { preheader: 'Use this link to choose a new password.' },
    ),
  }),

  password_reset_by_staff: (d) => ({
    subject: 'Your password was reset',
    text: `Hi ${d.name ?? 'there'}, ${d.resetBy ?? 'your agency'} reset your Lekaya Rentals password. Choose a new password here: ${appLink(d.link)} (the link expires in 72 hours).`,
    html: layout(
      'Your password was reset',
      hi(d.name) +
        para(`${escapeHtml(d.resetBy ?? 'Your agency')} reset the password for your Lekaya Rentals account.`) +
        para('Choose your own new password with the button below.') +
        button('Choose a new password', d.link) +
        note('This link works once and expires in 72 hours. If you did not expect this, contact your agency.'),
    ),
  }),

  password_changed: (d) => ({
    subject: 'Your password was changed',
    text: `Hi ${d.name ?? 'there'}, the password for your Lekaya Rentals account was just changed. If this was not you, reset your password now and contact support.`,
    html: layout(
      'Your password was changed',
      hi(d.name) +
        para('The password for your Lekaya Rentals account was just changed. Other devices have been signed out.') +
        para('If this was you, there is nothing else to do.') +
        para('<strong>Not you?</strong> Reset your password straight away and let us know.') +
        button('Reset my password', '/forgot-password'),
    ),
  }),

  notification: (d) => ({
    subject: d.title,
    text: `Hi ${d.name ?? 'there'}, ${d.title}: ${d.body}${d.link ? ` Open: ${appLink(d.link)}` : ''}`,
    html: layout(
      d.title,
      hi(d.name) + para(escapeHtml(d.body).replace(/\n/g, '<br />')) + (d.link ? button('Open in Lekaya', d.link) : button('Open my dashboard', '/workspace')),
      { preheader: d.body.slice(0, 120), manageNotifications: true },
    ),
  }),

  notification_digest: (d) => {
    const items = d.items.slice(0, 10)
    const more = d.items.length - items.length
    const list = items
      .map(
        (i) =>
          `<tr><td style="padding:10px 0;border-bottom:1px solid #dceaf8;"><div style="font-family:Arial,sans-serif;font-size:14px;font-weight:700;color:#0f2744;">${escapeHtml(i.title)}</div><div style="font-family:Arial,sans-serif;font-size:13px;color:#2f4a6a;line-height:1.5;margin-top:2px;">${escapeHtml(i.body)}</div></td></tr>`,
      )
      .join('')
    return {
      subject: `You have ${d.items.length} new updates on Lekaya Rentals`,
      text: `Hi ${d.name ?? 'there'}, you have ${d.items.length} new updates:\n` + items.map((i) => `- ${i.title}: ${i.body}`).join('\n'),
      html: layout(
        `${d.items.length} new updates`,
        hi(d.name) +
          para('Here is what happened since we last wrote:') +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">${list}</table>` +
          (more > 0 ? note(`And ${more} more in your notifications.`) : '') +
          button('See all notifications', '/workspace'),
        { manageNotifications: true },
      ),
    }
  },
}

export function renderTemplate<K extends TemplateId>(id: K, data: TemplateData[K]): Rendered {
  return render[id](data)
}

export async function sendTemplateEmail<K extends TemplateId>(id: K, data: TemplateData[K]): Promise<SendResult> {
  const r = renderTemplate(id, data)
  return deliverEmail({ to: data.to, toName: data.name, subject: r.subject, text: r.text, html: r.html, category: id, userId: data.userId ?? null })
}

/** Names, descriptions and sample data for the admin preview page. */
export const TEMPLATE_CATALOG: Array<{ [K in TemplateId]: { id: K; name: string; group: string; description: string; sample: TemplateData[K] } }[TemplateId]> = [
  { id: 'welcome', name: 'Welcome', group: 'Account', description: 'Sent when someone creates an account.', sample: { to: 'thandi@example.com', name: 'Thandi', role: 'tenant' } },
  { id: 'verify_email', name: 'Confirm email', group: 'Account', description: 'Sent after sign-up, and when someone asks for a new link.', sample: { to: 'thandi@example.com', name: 'Thandi', link: '/verify-email?token=sample' } },
  { id: 'account_setup', name: 'Account created for you', group: 'Account', description: 'Sent when staff create an account. Has a link to choose a password — never the password itself.', sample: { to: 'sipho@example.com', name: 'Sipho', link: '/set-password?token=sample', agencyName: 'Horizon Realty', role: 'ground_agent', invitedBy: 'Lerato Nkosi' } },
  { id: 'password_reset', name: 'Reset password', group: 'Security', description: 'Sent from "Forgot password" on the sign-in page.', sample: { to: 'thandi@example.com', name: 'Thandi', link: '/reset-password?token=sample' } },
  { id: 'password_reset_by_staff', name: 'Password reset by staff', group: 'Security', description: 'Sent when an admin resets someone’s password.', sample: { to: 'sipho@example.com', name: 'Sipho', link: '/set-password?token=sample', resetBy: 'Horizon Realty' } },
  { id: 'password_changed', name: 'Password changed', group: 'Security', description: 'Security notice after any password change.', sample: { to: 'thandi@example.com', name: 'Thandi' } },
  { id: 'notification', name: 'Notification', group: 'Notifications', description: 'Every in-app notification is also emailed with this template (people can turn this off).', sample: { to: 'thandi@example.com', name: 'Thandi', title: 'Your viewing is confirmed', body: 'Your viewing at Humewood Beach Apartment B14 is booked for Saturday at 10:00.', link: '/workspace/portals/tenant/viewings' } },
  { id: 'notification_digest', name: 'Notification summary', group: 'Notifications', description: 'When several notifications arrive together, one summary email is sent instead.', sample: { to: 'thandi@example.com', name: 'Thandi', items: [ { title: 'Application received', body: 'Your application for Humewood B14 was received.' }, { title: 'Document needed', body: 'Please upload your latest payslip.' }, { title: 'Viewing confirmed', body: 'Saturday at 10:00.' } ] } },
  { id: 'test', name: 'Test email', group: 'System', description: 'Used to check that email is set up.', sample: { to: 'you@example.com', name: 'there' } },
]
