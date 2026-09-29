/**
 * POST /api/notify/application-received
 *
 * Temporary route for the client-side application create path. The Hono API
 * end-to-end PR (Mon 5 Oct) deletes it and sends this mail from application
 * create on the server.
 *
 * Auth: session cookie `pf_session` or `Authorization: Bearer`. Anonymous
 * callers get 401 before any database read or email. Body is
 * `{ referenceCode }` only; any other field is 400.
 * The application is loaded by reference code inside the caller's agency.
 * The caller must be the applicant or staff of that agency (403 otherwise).
 * An unknown code, including one that belongs to another agency, is 404.
 * Recipient, name, and property title come from the database. One received
 * email is recorded on `applications.received_email_at`.
 */
import type { Context } from 'hono'
import { query } from './db.js'
import { readBearerOrCookie, resolveSessionUser } from './auth.js'
import { notifyUserRateLimit, tooManyRequests } from './rateLimit.js'
import { sendApplicationReceived } from './mailtrap.js'

const AGENCY_STAFF = new Set(['client_admin', 'agent_admin', 'ground_agent', 'agent'])

type ApplicationMailRow = {
  id: string
  client_id: string
  applicant_id: string | null
  reference_code: string
  received_email_at: string | Date | null
  email: string | null
  first_name: string | null
  last_name: string | null
  unit_title: string | null
}

function unauthorized(c: Context) {
  return c.json({ error: 'unauthorized', message: 'Sign in required' }, 401)
}

function invalidBody(c: Context) {
  return c.json({ error: 'invalid_body', message: 'Only referenceCode is accepted' }, 400)
}

export async function notifyApplicationReceived(c: Context) {
  if (!readBearerOrCookie(c)) return unauthorized(c)
  const session = await resolveSessionUser(c)
  if (!session) return unauthorized(c)

  let parsed: unknown
  try {
    parsed = await c.req.json()
  } catch {
    return invalidBody(c)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalidBody(c)
  const body = parsed as Record<string, unknown>
  if (Object.keys(body).some((key) => key !== 'referenceCode')) return invalidBody(c)
  const referenceCode = typeof body.referenceCode === 'string' ? body.referenceCode.trim() : ''
  if (!referenceCode || referenceCode.length > 40) return invalidBody(c)

  const gate = notifyUserRateLimit(session.id)
  if (!gate.ok) {
    const limited = tooManyRequests(gate.retryAfterSec)
    return c.json(limited.body, limited.status, limited.headers)
  }

  const rows = await query<ApplicationMailRow>(
    `SELECT
       a.id::text AS id,
       a.client_id::text AS client_id,
       a.applicant_id::text AS applicant_id,
       a.reference_code,
       a.received_email_at,
       applicant.email,
       applicant.first_name,
       applicant.last_name,
       un.title AS unit_title
     FROM applications a
     JOIN users caller ON caller.id = $2::uuid
     JOIN users applicant ON applicant.id = a.applicant_id
     LEFT JOIN units un ON un.id = a.unit_id AND un.client_id = a.client_id
     WHERE a.reference_code = $1
       AND a.client_id = caller.client_id
     LIMIT 1`,
    [referenceCode, session.id],
  )
  const row = rows[0]
  if (!row) return c.json({ error: 'not_found' }, 404)
  const isApplicant = row.applicant_id != null && row.applicant_id === session.id
  const isStaff = AGENCY_STAFF.has(session.role)
  if (!isApplicant && !isStaff) return c.json({ error: 'forbidden' }, 403)
  if (!row.email) return c.json({ ok: true }, 202)
  if (row.received_email_at) return c.json({ ok: true }, 202)

  const claimed = await query<{ id: string }>(
    `UPDATE applications
     SET received_email_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid
       AND client_id = $2::uuid
       AND received_email_at IS NULL
     RETURNING id::text AS id`,
    [row.id, row.client_id],
  )
  if (claimed.length === 0) return c.json({ ok: true }, 202)

  const applicantName = [row.first_name, row.last_name]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
  try {
    await sendApplicationReceived({
      email: row.email,
      applicantName: applicantName || undefined,
      propertyTitle: row.unit_title?.trim() || undefined,
      referenceCode: row.reference_code,
    })
  } catch (err) {
    console.error(
      '[notify] application-received email failed:',
      err instanceof Error ? err.message : err,
    )
  }
  return c.json({ ok: true }, 202)
}
