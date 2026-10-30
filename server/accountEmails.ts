/**
 * Account emails and one-time links: welcome, email confirmation, account
 * set-up (staff-created users), forgot / reset password, and the security
 * notice after a password change. Also each person's notification settings.
 *
 * Links carry a random token; only its SHA-256 is stored (auth_tokens), it
 * works once and expires. The only passwords emailed are temporary ones set
 * by staff (new account, staff reset); those must be changed at the next
 * sign-in (metadata.mustChangePassword).
 */
import { createHash, randomBytes } from 'node:crypto'
import { query } from './db.js'
import { hashPassword, MIN_PASSWORD_LENGTH } from './auth.js'
import { sendTemplateEmail } from './email/templates.js'

export type TokenPurpose = 'verify_email' | 'reset_password' | 'setup_account' | 'change_email'

const TTL_MS: Record<TokenPurpose, number> = {
  verify_email: 48 * 3600_000,
  reset_password: 3600_000,
  setup_account: 72 * 3600_000,
  change_email: 72 * 3600_000,
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     VARCHAR(30) NOT NULL,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens (user_id, purpose);
`
let ready: Promise<void> | null = null
export function ensureAuthTokenTable(): Promise<void> {
  ready ??= query(SCHEMA_SQL).then(() => undefined).catch((e) => {
    ready = null
    throw e
  })
  return ready
}

function fail(status: number, message: string, code?: string): Error {
  return Object.assign(new Error(message), { status, ...(code ? { code } : {}) })
}

const sha = (raw: string) => createHash('sha256').update(raw).digest('hex')

type UserLite = {
  id: string
  email: string
  first_name: string
  last_name: string
  active: boolean
  role: string
  metadata: Record<string, unknown> | null
  agency_name: string | null
}

async function userById(uuid: string): Promise<UserLite | null> {
  const rows = await query<UserLite>(
    `SELECT u.id::text AS id, u.email, u.first_name, u.last_name, u.active, u.role, u.metadata,
            c.company_name AS agency_name
       FROM users u LEFT JOIN clients c ON c.id = u.client_id
      WHERE u.id = $1::uuid LIMIT 1`,
    [uuid],
  )
  return rows[0] ?? null
}

async function userByEmail(email: string): Promise<UserLite | null> {
  const rows = await query<UserLite>(
    `SELECT u.id::text AS id, u.email, u.first_name, u.last_name, u.active, u.role, u.metadata,
            c.company_name AS agency_name
       FROM users u LEFT JOIN clients c ON c.id = u.client_id
      WHERE lower(u.email) = lower($1) LIMIT 1`,
    [email.trim()],
  )
  return rows[0] ?? null
}

/** New one-time token for a user; older unused tokens for the same purpose stop working. */
export async function issueToken(userUuid: string, purpose: TokenPurpose): Promise<string> {
  await ensureAuthTokenTable()
  const raw = randomBytes(32).toString('base64url')
  await query(`UPDATE auth_tokens SET used_at = NOW() WHERE user_id = $1::uuid AND purpose = $2 AND used_at IS NULL`, [userUuid, purpose])
  await query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1::uuid, $2, $3, $4)`,
    [userUuid, purpose, sha(raw), new Date(Date.now() + TTL_MS[purpose]).toISOString()],
  )
  return raw
}

/** Marks the token used and returns its user; throws 400 when unknown, used or expired. */
export async function consumeToken(raw: string, purposes: TokenPurpose[]): Promise<{ userId: string; purpose: TokenPurpose }> {
  await ensureAuthTokenTable()
  const token = String(raw ?? '').trim()
  if (!token) throw fail(400, 'This link is not valid.', 'TOKEN_INVALID')
  const rows = await query<{ user_id: string; purpose: TokenPurpose }>(
    `UPDATE auth_tokens SET used_at = NOW()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() AND purpose = ANY($2::text[])
      RETURNING user_id::text AS user_id, purpose`,
    [sha(token), purposes],
  )
  if (!rows[0]) throw fail(400, 'This link has expired or was already used. Ask for a new one.', 'TOKEN_EXPIRED')
  return { userId: rows[0].user_id, purpose: rows[0].purpose }
}

const firstName = (u: UserLite) => u.first_name || u.email.split('@')[0]
const feRole = (u: UserLite) => String((u.metadata ?? {}).frontend_role ?? '').trim() || undefined

export function isEmailVerified(metadata: Record<string, unknown> | null | undefined): boolean {
  return (metadata ?? {}).emailVerification !== 'pending'
}

/** After self sign-up: welcome email, then the confirm-your-email link. */
export async function sendSignupEmails(userUuid: string): Promise<void> {
  const u = await userById(userUuid)
  if (!u) return
  await sendTemplateEmail('welcome', { to: u.email, name: firstName(u), role: feRole(u), userId: u.id })
  await sendVerificationEmail(userUuid)
}

export async function sendVerificationEmail(userUuid: string): Promise<{ alreadyVerified: boolean }> {
  const u = await userById(userUuid)
  if (!u) throw fail(404, 'User not found')
  if (isEmailVerified(u.metadata)) return { alreadyVerified: true }
  const token = await issueToken(u.id, 'verify_email')
  await sendTemplateEmail('verify_email', { to: u.email, name: firstName(u), link: `/verify-email?token=${token}`, userId: u.id })
  return { alreadyVerified: false }
}

async function markVerified(userUuid: string): Promise<void> {
  await query(
    `UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object('emailVerification', 'verified', 'emailVerifiedAt', $2::text), updated_at = NOW()
      WHERE id = $1::uuid`,
    [userUuid, new Date().toISOString()],
  )
}

export async function verifyEmailToken(raw: string): Promise<{ email: string }> {
  const { userId } = await consumeToken(raw, ['verify_email'])
  await markVerified(userId)
  const u = await userById(userId)
  return { email: u?.email ?? '' }
}

/**
 * Staff created this account. With the account's temporary password: email it
 * (the account must change it at first sign-in, see writes.ts upsertUser).
 * Without one: email a one-time link to choose a password.
 */
export async function sendAccountSetupEmail(
  userUuid: string,
  opts: { invitedBy?: string; tempPassword?: string } = {},
): Promise<void> {
  const u = await userById(userUuid)
  if (!u || !u.active) return
  const base = {
    to: u.email,
    name: firstName(u),
    agencyName: u.agency_name ?? undefined,
    role: feRole(u),
    invitedBy: opts.invitedBy,
    userId: u.id,
  }
  if (opts.tempPassword) {
    await sendTemplateEmail('account_setup', { ...base, link: '/login', tempPassword: opts.tempPassword })
    return
  }
  const token = await issueToken(u.id, 'setup_account')
  await sendTemplateEmail('account_setup', { ...base, link: `/set-password?token=${token}` })
}

/**
 * A staff member reset this person's password. With the temporary password:
 * email it (they must choose their own at the next sign-in). Without: a
 * one-time link to choose a new one.
 */
export async function sendStaffResetEmail(userUuid: string, resetBy?: string, tempPassword?: string): Promise<void> {
  const u = await userById(userUuid)
  if (!u || !u.active) return
  if (tempPassword) {
    await sendTemplateEmail('password_reset_by_staff', { to: u.email, name: firstName(u), link: '/login', tempPassword, resetBy, userId: u.id })
    return
  }
  const token = await issueToken(u.id, 'setup_account')
  await sendTemplateEmail('password_reset_by_staff', { to: u.email, name: firstName(u), link: `/set-password?token=${token}`, resetBy, userId: u.id })
}

/** "Forgot password": always succeeds outwardly so it never reveals which emails exist. */
export async function requestPasswordReset(email: string): Promise<void> {
  const clean = String(email ?? '').trim()
  if (!clean.includes('@')) return
  const u = await userByEmail(clean)
  if (!u || !u.active) return
  const token = await issueToken(u.id, 'reset_password')
  await sendTemplateEmail('password_reset', { to: u.email, name: firstName(u), link: `/reset-password?token=${token}`, userId: u.id })
}

/** Set a new password from a reset or set-up link. Signs out other sessions. */
export async function setPasswordWithToken(raw: string, newPassword: string): Promise<{ email: string }> {
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw fail(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'PASSWORD_TOO_SHORT')
  }
  const { userId, purpose } = await consumeToken(raw, ['reset_password', 'setup_account'])
  const u = await userById(userId)
  if (!u || !u.active) throw fail(400, 'This account is not active.', 'ACCOUNT_INACTIVE')
  const hash = await hashPassword(newPassword)
  await query(
    `UPDATE users
        SET password_hash = $2,
            metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object('mustChangePassword', false, 'passwordChangedAt', $3::text,
                                    'emailVerification', 'verified', 'emailVerifiedAt', COALESCE(metadata->>'emailVerifiedAt', $3::text)),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [u.id, hash, new Date().toISOString()],
  )
  if (purpose === 'reset_password') {
    void sendTemplateEmail('password_changed', { to: u.email, name: firstName(u), userId: u.id })
  }
  return { email: u.email }
}

export async function sendPasswordChangedEmail(userUuid: string): Promise<void> {
  const u = await userById(userUuid)
  if (!u) return
  await sendTemplateEmail('password_changed', { to: u.email, name: firstName(u), userId: u.id })
}

// ---------------------------------------------------------------------------
// Notification settings (users.metadata.notificationPrefs)
// ---------------------------------------------------------------------------

export {
  NOTIFICATION_CATEGORIES,
  categoryForResource,
  type NotificationCategoryId,
  type NotificationPrefs,
} from '../src/lib/notificationCategories.js'
import { normalizeNotificationPrefs, type NotificationPrefs } from '../src/lib/notificationCategories.js'

export function readPrefs(metadata: Record<string, unknown> | null | undefined): NotificationPrefs {
  return normalizeNotificationPrefs((metadata ?? {}).notificationPrefs)
}

export async function getNotificationPrefs(userUuid: string): Promise<NotificationPrefs> {
  const rows = await query<{ metadata: Record<string, unknown> | null }>(`SELECT metadata FROM users WHERE id = $1::uuid`, [userUuid])
  return readPrefs(rows[0]?.metadata)
}

export async function saveNotificationPrefs(userUuid: string, input: unknown): Promise<NotificationPrefs> {
  const prefs = readPrefs({ notificationPrefs: input })
  await query(
    `UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('notificationPrefs', $2::jsonb), updated_at = NOW()
      WHERE id = $1::uuid`,
    [userUuid, JSON.stringify(prefs)],
  )
  return prefs
}
