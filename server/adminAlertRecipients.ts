/**
 * Who receives the platform's admin emails: new sign-ups, listings waiting
 * for approval, escalations, compliance and conduct, storage and billing
 * alerts, and every other notice the system sends to super admins.
 *
 * Every super admin still sees those notices in the app. The email goes once
 * to each address on this list (platform_settings 'admin_alert_emails'),
 * instead of once per super admin. An empty list falls back to emailing every
 * super admin, so admin emails can never silently stop.
 */
import { query } from './db.js'

export const ADMIN_ALERT_EMAILS_KEY = 'admin_alert_emails'
export const MAX_ADMIN_ALERT_EMAILS = 10

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trimmed, lower-cased, valid, unique addresses (at most 10). */
export function sanitizeAdminAlertEmails(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\s,;]+/) : []
  const out: string[] = []
  for (const v of raw) {
    const e = typeof v === 'string' ? v.trim().toLowerCase() : ''
    if (e && e.length <= 254 && EMAIL_RE.test(e) && !out.includes(e)) out.push(e)
    if (out.length >= MAX_ADMIN_ALERT_EMAILS) break
  }
  return out
}

let ready: Promise<void> | null = null
function ensureTable(): Promise<void> {
  ready ??= query(`
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(80) PRIMARY KEY, value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by UUID REFERENCES users(id) ON DELETE SET NULL
)`)
    .then(() => undefined)
    .catch((e) => {
      ready = null
      throw e
    })
  return ready
}

/** The addresses admin emails go to; [] means "every super admin". */
export async function adminAlertEmails(): Promise<string[]> {
  await ensureTable()
  const row = (await query<{ value: unknown }>(`SELECT value FROM platform_settings WHERE key = $1`, [ADMIN_ALERT_EMAILS_KEY]))[0]
  const v = row?.value as { emails?: unknown } | null | undefined
  return sanitizeAdminAlertEmails(v?.emails)
}

export async function saveAdminAlertEmails(emails: string[], byUserUuid: string | null): Promise<string[]> {
  await ensureTable()
  const clean = sanitizeAdminAlertEmails(emails)
  await query(
    `INSERT INTO platform_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3::uuid)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [ADMIN_ALERT_EMAILS_KEY, JSON.stringify({ emails: clean }), byUserUuid],
  )
  return clean
}

/** Is this users row a super admin (DB role or the platform front-end role)? */
export function isSuperAdminRow(role: string | null | undefined, metadata: Record<string, unknown> | null | undefined): boolean {
  return String(role ?? '').toUpperCase() === 'SUPER_ADMIN' || String(metadata?.frontend_role ?? '') === 'super_admin'
}

const ROLE_WORDS: Record<string, string> = {
  END_USER: 'a tenant / applicant',
  LANDLORD: 'a landlord',
  CONTRACTOR: 'a contractor',
  GROUND_AGENT: 'an agent',
  AGENT: 'an agent',
  AGENT_ADMIN: 'an agency admin',
  AGENCY_ADMIN: 'an agency admin',
  SUPER_ADMIN: 'a platform admin',
}

/**
 * Tell the super admins (and so the admin alert addresses) that someone new
 * joined: a self sign-up, or an account staff created. Best effort.
 */
export async function notifyNewAccount(userUuid: string, how: 'signed_up' | 'added_by_staff'): Promise<void> {
  try {
    const u = (
      await query<{ name: string | null; email: string; role: string; fe: string | null; agency: string | null }>(
        `SELECT NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') AS name, u.email, u.role,
                u.metadata->>'frontend_id' AS fe, c.company_name AS agency
           FROM users u LEFT JOIN clients c ON c.id = u.client_id WHERE u.id = $1::uuid`,
        [userUuid],
      )
    )[0]
    if (!u || u.email.endsWith('@propertyflow.local')) return
    const name = u.name || u.email
    const role = ROLE_WORDS[String(u.role).toUpperCase()] ?? 'a user'
    const where = u.agency && how === 'added_by_staff' ? ` at ${u.agency}` : ''
    const { notifyUsers, superAdminUuids } = await import('./supportDesk.js')
    await notifyUsers(
      await superAdminUuids(),
      {
        clientId: null,
        title: how === 'signed_up' ? `New sign-up: ${name}` : `New account: ${name}`,
        body:
          how === 'signed_up'
            ? `${name} (${u.email}) signed up as ${role}.`
            : `${name} (${u.email}) was added as ${role}${where}.`,
        link: `/workspace/admin/users/${encodeURIComponent(u.fe || userUuid)}`,
        resource: 'user',
        action: 'created',
      },
      userUuid,
    )
  } catch (err) {
    console.warn('[new-account notice] failed:', err instanceof Error ? err.message : err)
  }
}
