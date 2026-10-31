/**
 * Account, security and notification email templates. Each template has a
 * name and sample data so the platform team can preview it (Admin → Emails).
 * Business emails (applications, payments, leases…) live in server/mailtrap.ts
 * and share the same layout; their previews are listed in emailPreviews.ts.
 *
 * No template ever contains a password. New accounts get a one-time link to
 * choose their own password instead.
 */
import {
  appLink,
  button,
  buttonText,
  details,
  escapeHtml,
  layout,
  note,
  para,
  propertyCard,
  propertyCardCompact,
  propertyCardText,
  type PropertyCard,
} from './layout.js'
import { deliverEmail, type SendResult } from './send.js'

export type Rendered = { subject: string; text: string; html: string }

type Base = { to: string; name?: string; userId?: string | null }

export type TemplateData = {
  test: Base
  welcome: Base & { role?: string }
  verify_email: Base & { link: string }
  /** With tempPassword: sign in with it (a change is forced on first sign-in); else: choose-password link. */
  account_setup: Base & { link: string; agencyName?: string; role?: string; invitedBy?: string; tempPassword?: string }
  password_reset: Base & { link: string }
  /** With tempPassword: sign in with it, then choose a new one (forced). */
  /** To the NEW address: confirm it before the account switches to it. */
  email_change_confirm: Base & { link: string; changedBy?: string; oldEmail?: string }
  /** To the OLD address: a change to newEmail is waiting for confirmation. */
  email_change_notice: Base & { newEmail: string; changedBy?: string }
  password_reset_by_staff: Base & { link: string; resetBy?: string; tempPassword?: string }
  password_changed: Base
  /** card: the property it is about; action: the button (deep link), else link / the dashboard. */
  notification: Base & { title: string; body: string; link?: string | null; card?: PropertyCard | null; action?: { label: string; href: string } | null }
  notification_digest: Base & { items: DigestItem[] }
  /** Agency admins: once a day, the routine updates that were not emailed one by one. */
  admin_daily_digest: Base & { items: DigestItem[]; agencyName?: string | null }
}

export type DigestItem = { title: string; body: string; link?: string | null; card?: PropertyCard | null; action?: { label: string; href: string } | null }

const LIST_FONT = `'Outfit', 'Segoe UI', Arial, Helvetica, sans-serif`

/** One row per item: title, text, its property (small) and a link straight to it. */
function digestRows(items: DigestItem[]): string {
  return items
    .map((i) => {
      const href = i.action?.href ?? i.link ?? null
      const label = i.action?.label ?? 'Open'
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #dceaf8;">
<div style="font-family:${LIST_FONT};font-size:14px;font-weight:700;color:#0f2744;">${escapeHtml(i.title)}</div>
<div style="font-family:${LIST_FONT};font-size:13px;color:#2f4a6a;line-height:1.5;margin-top:2px;">${escapeHtml(i.body)}</div>${
        i.card ? propertyCardCompact(i.card) : ''
      }${
        href
          ? `<div style="margin-top:6px;font-family:${LIST_FONT};font-size:13px;"><a href="${escapeHtml(appLink(href))}" target="_blank" style="color:#0B63C8;font-weight:600;text-decoration:underline;">${escapeHtml(label)} &rarr;</a></div>`
          : ''
      }</td></tr>`
    })
    .join('')
}

function digestText(items: DigestItem[]): string {
  return items
    .map((i) => {
      const href = i.action?.href ?? i.link ?? null
      return [`- ${i.title}: ${i.body}`, i.card ? `  ${i.card.title}${i.card.area ? ` (${i.card.area})` : ''}` : '', href ? `  ${i.action?.label ?? 'Open'}: ${appLink(href)}` : '']
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
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
    text: `Hi ${d.name ?? 'there'}, this is a test email from Lekaya Rentals. If you can read it, email is working.\n\n${buttonText('Open Lekaya Rentals', '/workspace')}`,
    html: layout('Email is working', hi(d.name) + para('This is a test email from Lekaya Rentals. If you can read it, email is set up correctly.') + button('Open Lekaya Rentals', '/workspace')),
  }),

  welcome: (d) => {
    const line = ROLE_LINES[d.role ?? ''] ?? 'Your account is ready. Sign in any time to pick up where you left off.'
    return {
      subject: 'Welcome to Lekaya Rentals',
      text: `Hi ${d.name ?? 'there'}, welcome to Lekaya Rentals! ${line}\n\n${buttonText('Go to my dashboard', '/workspace')}`,
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
    if (d.tempPassword) {
      return {
        subject: 'Your Lekaya Rentals account is ready',
        text: `Hi ${d.name ?? 'there'}, an account was created for you${who}. Sign in at ${appLink('/login')} with your email ${d.to} and this temporary password: ${d.tempPassword} — you will be asked to choose your own password when you first sign in.`,
        html: layout(
          'Your account is ready',
          hi(d.name) +
            para(`An account has been created for you on <strong>Lekaya Rentals</strong>${escapeHtml(who)}.`) +
            details([
              ['Sign-in email', d.to],
              ['Temporary password', d.tempPassword],
              ['Role', d.role ? (ROLE_NAMES[d.role] ?? d.role) : null],
              ['Set up by', d.invitedBy],
            ]) +
            para('Sign in with the temporary password above. You will be asked to choose your own password straight away; the temporary one stops working once you do.') +
            button('Sign in', '/login') +
            note('Keep this email private, and delete it once you have changed your password.'),
          { preheader: 'Your sign-in details for Lekaya Rentals.' },
        ),
      }
    }
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
          para('Choose your own password to finish setting up.') +
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

  email_change_confirm: (d) => ({
    subject: 'Confirm your new email address',
    text: `Hi ${d.name ?? 'there'}, ${d.changedBy ?? 'An administrator'} asked to change the sign-in email of your Lekaya Rentals account to this address. Confirm it here: ${appLink(d.link)} (the link expires in 72 hours). Until you confirm, the account keeps its current email.`,
    html: layout(
      'Confirm your new email address',
      hi(d.name) +
        para(`${escapeHtml(d.changedBy ?? 'An administrator')} asked to change the sign-in email of your Lekaya Rentals account to this address.`) +
        details([
          ['New sign-in email', d.to],
          ['Current sign-in email', d.oldEmail],
        ]) +
        para('Confirm it with the button below. Until you do, the account keeps its current email.') +
        button('Confirm this email', d.link) +
        note('This link works once and expires in 72 hours. If you did not expect this, ignore this email and contact your agency.'),
      { preheader: 'Confirm this address to use it to sign in to Lekaya Rentals.' },
    ),
  }),

  email_change_notice: (d) => ({
    subject: 'A change to your sign-in email was requested',
    text: `Hi ${d.name ?? 'there'}, ${d.changedBy ?? 'An administrator'} asked to change the sign-in email of your Lekaya Rentals account to ${d.newEmail}. It only changes once that address is confirmed. If you did not expect this, contact your agency.`,
    html: layout(
      'Sign-in email change requested',
      hi(d.name) +
        para(`${escapeHtml(d.changedBy ?? 'An administrator')} asked to change the sign-in email of your Lekaya Rentals account.`) +
        details([['New sign-in email', d.newEmail]]) +
        para('Nothing changes until the new address is confirmed from that inbox. Until then, keep signing in with this email.') +
        note('If you did not expect this, contact your agency.'),
    ),
  }),

  password_reset_by_staff: (d) => {
    if (d.tempPassword) {
      return {
        subject: 'Your password was reset',
        text: `Hi ${d.name ?? 'there'}, ${d.resetBy ?? 'your agency'} reset your Lekaya Rentals password. Sign in at ${appLink('/login')} with your email ${d.to} and this temporary password: ${d.tempPassword} — you will be asked to choose a new password straight away.`,
        html: layout(
          'Your password was reset',
          hi(d.name) +
            para(`${escapeHtml(d.resetBy ?? 'Your agency')} reset the password for your Lekaya Rentals account.`) +
            details([
              ['Sign-in email', d.to],
              ['Temporary password', d.tempPassword],
            ]) +
            para('Sign in with the temporary password above. You will be asked to choose your own password straight away; the temporary one stops working once you do.') +
            button('Sign in', '/login') +
            note('Keep this email private, and delete it once you have changed your password. If you did not expect this, contact your agency.'),
        ),
      }
    }
    return {
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
    }
  },

  password_changed: (d) => ({
    subject: 'Your password was changed',
    text: `Hi ${d.name ?? 'there'}, the password for your Lekaya Rentals account was just changed. If this was not you, reset your password now and contact support.\n\n${buttonText('Reset my password', '/forgot-password')}`,
    html: layout(
      'Your password was changed',
      hi(d.name) +
        para('The password for your Lekaya Rentals account was just changed. Other devices have been signed out.') +
        para('If this was you, there is nothing else to do.') +
        para('<strong>Not you?</strong> Reset your password straight away and let us know.') +
        button('Reset my password', '/forgot-password'),
    ),
  }),

  notification: (d) => {
    const action = d.action ?? (d.link ? { label: 'Open in Lekaya', href: d.link } : { label: 'Open my dashboard', href: '/workspace' })
    return {
      subject: d.title,
      text: [
        `Hi ${d.name ?? 'there'},`,
        '',
        `${d.title}: ${d.body}`,
        d.card ? `\n${propertyCardText(d.card)}` : '',
        '',
        buttonText(action.label, action.href),
      ]
        .filter((l, i, all) => l !== '' || all[i - 1] !== '')
        .join('\n'),
      html: layout(
        d.title,
        hi(d.name) + para(escapeHtml(d.body).replace(/\n/g, '<br />')) + (d.card ? propertyCard(d.card) : '') + button(action.label, action.href),
        { preheader: d.body.slice(0, 120), manageNotifications: true },
      ),
    }
  },

  notification_digest: (d) => {
    const items = d.items.slice(0, 10)
    const more = d.items.length - items.length
    return {
      subject: `You have ${d.items.length} new updates on Lekaya Rentals`,
      text:
        `Hi ${d.name ?? 'there'}, you have ${d.items.length} new updates:\n` +
        digestText(items) +
        (more > 0 ? `\nAnd ${more} more in your notifications.` : '') +
        `\n\n${buttonText('See all notifications', '/workspace')}`,
      html: layout(
        `${d.items.length} new updates`,
        hi(d.name) +
          para('Here is what happened since we last wrote:') +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">${digestRows(items)}</table>` +
          (more > 0 ? note(`And ${more} more in your notifications.`) : '') +
          button('See all notifications', '/workspace'),
        { manageNotifications: true },
      ),
    }
  },

  admin_daily_digest: (d) => {
    const items = d.items.slice(0, 25)
    const more = d.items.length - items.length
    const n = d.items.length
    const where = d.agencyName ? ` at ${d.agencyName}` : ''
    return {
      subject: `Your daily summary: ${n} update${n === 1 ? '' : 's'} on Lekaya Rentals`,
      text:
        `Hi ${d.name ?? 'there'}, here ${n === 1 ? 'is the routine update' : `are the ${n} routine updates`}${where} from the last day that did not need you straight away. Anything urgent was emailed to you when it happened.\n` +
        digestText(items) +
        (more > 0 ? `\nAnd ${more} more in your notifications.` : '') +
        `\n\n${buttonText('Open my dashboard', '/workspace')}`,
      html: layout(
        'Your daily summary',
        hi(d.name) +
          para(`Here ${n === 1 ? 'is the routine update' : `are the ${n} routine updates`}${escapeHtml(where)} from the last day. Your agents handled these; anything that needs your decision was emailed to you when it happened.`) +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">${digestRows(items)}</table>` +
          (more > 0 ? note(`And ${more} more in your notifications.`) : '') +
          button('Open my dashboard', '/workspace'),
        { preheader: `${n} update${n === 1 ? '' : 's'} from your agency on Lekaya Rentals.`, manageNotifications: true },
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

/** Sample property for previews (the public demo listing). */
export const SAMPLE_CARD: PropertyCard = {
  title: 'Humewood Beach Apartment B14',
  area: 'Humewood, Gqeberha · 2 bed · 1 bath',
  price: 'R 8 500 / month',
  imageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1072&h=600&fit=crop&q=78',
  viewUrl: '/listing/PR-1011',
}

/** Names, descriptions and sample data for the admin preview page. */
export const TEMPLATE_CATALOG: Array<{ [K in TemplateId]: { id: K; name: string; group: string; description: string; sample: TemplateData[K] } }[TemplateId]> = [
  { id: 'welcome', name: 'Welcome', group: 'Account', description: 'Sent when someone creates an account.', sample: { to: 'thandi@example.com', name: 'Thandi', role: 'tenant' } },
  { id: 'verify_email', name: 'Confirm email', group: 'Account', description: 'Sent after sign-up, and when someone asks for a new link.', sample: { to: 'thandi@example.com', name: 'Thandi', link: '/verify-email?token=sample' } },
  { id: 'account_setup', name: 'Account created for you', group: 'Account', description: 'Sent when staff create an account: the sign-in email and a temporary password, which must be changed at first sign-in.', sample: { to: 'sipho@example.com', name: 'Sipho', link: '/login', tempPassword: 'Sample-Temp-9241', agencyName: 'Horizon Realty', role: 'ground_agent', invitedBy: 'Lerato Nkosi' } },
  { id: 'password_reset', name: 'Reset password', group: 'Security', description: 'Sent from "Forgot password" on the sign-in page.', sample: { to: 'thandi@example.com', name: 'Thandi', link: '/reset-password?token=sample' } },
  { id: 'email_change_confirm', name: 'Confirm new email', group: 'Security', description: 'Sent to the new address when an admin changes someone’s sign-in email. The change only applies once this link is used.', sample: { to: 'sipho.new@example.com', name: 'Sipho', link: '/confirm-email-change?token=sample', changedBy: 'Lerato Nkosi', oldEmail: 'sipho@example.com' } },
  { id: 'email_change_notice', name: 'Email change requested', group: 'Security', description: 'Sent to the current address when an admin asks to change it.', sample: { to: 'sipho@example.com', name: 'Sipho', newEmail: 'sipho.new@example.com', changedBy: 'Lerato Nkosi' } },
  { id: 'password_reset_by_staff', name: 'Password reset by staff', group: 'Security', description: 'Sent when an admin resets someone’s password: a temporary password that must be changed at the next sign-in.', sample: { to: 'sipho@example.com', name: 'Sipho', link: '/login', tempPassword: 'Sample-Temp-9241', resetBy: 'Horizon Realty' } },
  { id: 'password_changed', name: 'Password changed', group: 'Security', description: 'Security notice after any password change.', sample: { to: 'thandi@example.com', name: 'Thandi' } },
  { id: 'notification', name: 'Notification', group: 'Notifications', description: 'Every in-app notification is also emailed with this template (people can turn this off): the property it is about and a button straight to the item. Agency admins only get the important ones; the rest go into their daily summary.', sample: { to: 'thandi@example.com', name: 'Thandi', title: 'Your viewing is confirmed', body: 'Your viewing at Humewood Beach Apartment B14 is booked for Saturday at 10:00.', link: '/workspace/portals/tenant/viewings', card: SAMPLE_CARD, action: { label: 'See my viewing', href: '/workspace/portals/tenant/viewings' } } },
  { id: 'notification_digest', name: 'Notification summary', group: 'Notifications', description: 'When several notifications arrive together, one summary email is sent instead.', sample: { to: 'thandi@example.com', name: 'Thandi', items: [ { title: 'Application received', body: 'Your application for Humewood B14 was received.', card: SAMPLE_CARD, action: { label: 'Open my application', href: '/workspace/portals/tenant/applications/APP-1042' } }, { title: 'Document needed', body: 'Please upload your latest payslip.', card: SAMPLE_CARD, action: { label: 'Upload documents', href: '/workspace/portals/tenant/applications/APP-1042?tab=documents' } }, { title: 'Viewing confirmed', body: 'Saturday at 10:00.', action: { label: 'See my viewing', href: '/workspace/portals/tenant/viewings' } } ] } },
  { id: 'admin_daily_digest', name: 'Daily summary (agency admins)', group: 'Notifications', description: 'Once a day (07:30 SAST cron) to agency admins: the routine updates that were not emailed one by one. Important items are still emailed straight away.', sample: { to: 'lerato@example.com', name: 'Lerato', agencyName: 'Horizon Realty', items: [ { title: 'New application', body: 'Thandi Mokoena applied for Humewood Beach Apartment B14 (Rent).', card: SAMPLE_CARD, action: { label: 'Review the application', href: '/workspace/sales/applications/APP-1042' } }, { title: 'Viewing booked', body: 'Saturday 10:00 with Sipho Dlamini.', card: SAMPLE_CARD, action: { label: 'Open the viewing', href: '/workspace/sales/viewings/property/PR-1011' } }, { title: 'Maintenance job updated', body: 'Leaking geyser: contractor on site.', action: { label: 'Open the job', href: '/workspace/operations/maintenance/TCK-88' } } ] } },
  { id: 'test', name: 'Test email', group: 'System', description: 'Used to check that email is set up.', sample: { to: 'you@example.com', name: 'there' } },
]
