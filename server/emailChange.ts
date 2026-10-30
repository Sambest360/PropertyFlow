/**
 * Admin changes a user's sign-in email:
 *   POST /api/admin/users/email   { userId, email }   (staff, rules below)
 *   POST /api/auth/confirm-email-change { token }    (the person, from the link)
 *
 * Who may change whose email: the same rules as a staff password reset
 * (assertCanManageUserCredentials in passwordReset.ts).
 *
 * The change does not apply when requested. It is stored as
 * metadata.pendingEmail and a one-time link goes to the NEW address (with a
 * notice to the old one); the account switches only when that link is used,
 * so a typo can never lock someone out and nobody can redirect an account to
 * an inbox they do not control.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import type { SessionUser } from './auth.js'
import { assertCanManageUserCredentials } from './passwordReset.js'
import { consumeToken, issueToken } from './accountEmails.js'
import { sendTemplateEmail } from './email/templates.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const fail = (status: number, message: string, code?: string) =>
  Object.assign(new Error(message), { status, ...(code ? { code } : {}) }) as Error & { status: number; code?: string }

async function emailTakenByOther(email: string, userUuid: string): Promise<boolean> {
  const rows = await query<{ ok: number }>(
    `SELECT 1 AS ok FROM users WHERE lower(email) = lower($1) AND id <> $2::uuid LIMIT 1`,
    [email, userUuid],
  )
  return rows.length > 0
}

async function logEvent(clientId: string | null, userUuid: string, actorUuid: string | null, type: string, payload: object) {
  await query(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, $2::uuid, $3, 'user', $4::uuid, $5::uuid, $6::jsonb, NOW())`,
    [randomUUID(), clientId, type, userUuid, actorUuid, JSON.stringify(payload)],
  )
}

export type EmailChangeRequest = { userId: string; pendingEmail: string; emailSent: boolean }

export async function requestEmailChange(actor: SessionUser, userId: string, newEmailRaw: unknown): Promise<EmailChangeRequest> {
  const newEmail = String(newEmailRaw ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(newEmail) || newEmail.length > 190) throw fail(400, 'Enter a valid email address', 'EMAIL_INVALID')
  const { row, target } = await assertCanManageUserCredentials(actor, userId, 'email address')
  if (newEmail === String(row.email ?? '').toLowerCase()) {
    throw fail(400, 'That is already this account’s email address', 'EMAIL_UNCHANGED')
  }
  if (await emailTakenByOther(newEmail, row.id)) {
    throw fail(409, 'Another account already uses that email address', 'EMAIL_TAKEN')
  }
  await query(
    `UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object('pendingEmail', $2::text, 'pendingEmailRequestedAt', $3::text), updated_at = NOW()
      WHERE id = $1::uuid`,
    [row.id, newEmail, new Date().toISOString()],
  )
  const token = await issueToken(row.id, 'change_email')
  const name = target.name?.split(' ')[0] || undefined
  const sent = await sendTemplateEmail('email_change_confirm', {
    to: newEmail,
    name,
    link: `/confirm-email-change?token=${token}`,
    changedBy: actor.name,
    oldEmail: row.email,
    userId: row.id,
  })
  await sendTemplateEmail('email_change_notice', { to: row.email, name, newEmail, changedBy: actor.name, userId: row.id })
  // Who asked for whom; never the addresses.
  await logEvent(row.client_id, row.id, actor.id, 'email_change_requested', {
    actorUserId: actor.frontendId,
    targetUserId: target.frontendId,
  })
  return { userId: target.frontendId, pendingEmail: newEmail, emailSent: sent.sent }
}

/** The person used the link sent to the new address: switch the account to it. */
export async function confirmEmailChange(raw: unknown): Promise<{ email: string }> {
  const { userId } = await consumeToken(String(raw ?? ''), ['change_email'])
  const rows = await query<{ email: string; client_id: string | null; metadata: Record<string, unknown> | null }>(
    `SELECT email, client_id::text AS client_id, metadata FROM users WHERE id = $1::uuid LIMIT 1`,
    [userId],
  )
  const row = rows[0]
  const pending = typeof row?.metadata?.pendingEmail === 'string' ? row.metadata.pendingEmail : ''
  if (!row || !pending) throw fail(400, 'There is no email change waiting for this account.', 'EMAIL_CHANGE_NONE')
  if (await emailTakenByOther(pending, userId)) {
    throw fail(409, 'Another account now uses that email address. Ask your administrator to try again.', 'EMAIL_TAKEN')
  }
  await query(
    `UPDATE users SET email = $2,
            metadata = (COALESCE(metadata, '{}'::jsonb) - 'pendingEmail' - 'pendingEmailRequestedAt')
              || jsonb_build_object('emailVerification', 'verified', 'emailVerifiedAt', $3::text),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [userId, pending, new Date().toISOString()],
  )
  await logEvent(row.client_id, userId, userId, 'email_changed', {})
  return { email: pending }
}
