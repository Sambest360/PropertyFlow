/**
 * Staff invite. Migration 012 (account takeover) owns the invites table.
 * Until that migration is on this branch, tests create the same shape:
 *   match on auth_user_id or token, status 'pending', consume once.
 * 012 should link a profile only when email_confirmed_at is set AND a pending
 * invite matches that auth user id or the redeemed token, created by staff of
 * that agency. Do not link by email match. super_admin is never inserted.
 */
import { randomBytes } from 'node:crypto'
import { query } from './db.js'
import type { SessionUser } from './auth.js'
import { inviteAuthUserByEmail } from './supabase/inviteAuthUser.js'

const STAFF = new Set(['client_admin', 'agent_admin', 'ground_agent', 'agent'])

/** Higher rank is more privilege. Equal rank may be granted. super_admin is never granted. */
const RANK: Record<string, number> = {
  client_admin: 40,
  agent_admin: 30,
  ground_agent: 20,
  agent: 10,
  landlord: 10,
  tenant: 10,
  contractor: 10,
}

const ROLE_ALIASES: Record<string, string> = {
  client_admin: 'client_admin',
  agency_admin: 'client_admin',
  agent_admin: 'agent_admin',
  ground_agent: 'ground_agent',
  agent: 'agent',
  landlord: 'landlord',
  tenant: 'tenant',
  applicant: 'tenant',
  contractor: 'contractor',
  super_admin: 'super_admin',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

export function canonicalInviteRole(role: unknown): string | null {
  if (typeof role !== 'string') return null
  const key = role.trim().toLowerCase()
  return ROLE_ALIASES[key] ?? null
}

type AgencyRow = { id: string; frontendId: string }

async function findAgency(agencyId: string): Promise<AgencyRow | null> {
  const rows = await query<{ id: string; frontend_id: string }>(
    `SELECT id::text AS id,
            COALESCE(settings->>'frontend_id', id::text) AS frontend_id
     FROM clients
     WHERE id::text = $1 OR settings->>'frontend_id' = $1
     LIMIT 1`,
    [agencyId],
  )
  const row = rows[0]
  return row ? { id: row.id, frontendId: row.frontend_id } : null
}

function sameAgency(session: SessionUser, agency: AgencyRow): boolean {
  const ids = [session.clientId, session.agencyId].filter((value): value is string => Boolean(value))
  return ids.some((id) => id === agency.id || id === agency.frontendId)
}

export async function createAgencyInvite(input: {
  session: SessionUser
  email: unknown
  role: unknown
  agencyId: unknown
}): Promise<{ userId: string; created: boolean }> {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email)) throw httpError(400, 'Valid email is required')
  const agencyId = typeof input.agencyId === 'string' ? input.agencyId.trim() : ''
  if (!agencyId) throw httpError(400, 'agency_id is required')
  const role = canonicalInviteRole(input.role)
  if (!role) throw httpError(400, 'Unknown role')
  if (role === 'super_admin') throw httpError(403, 'super admin cannot be granted')

  const agency = await findAgency(agencyId)
  if (!agency) throw httpError(404, 'Agency not found')

  if (input.session.role !== 'super_admin') {
    if (!STAFF.has(input.session.role) || !sameAgency(input.session, agency)) {
      throw httpError(403, 'Staff of this agency required')
    }
    const callerRank = RANK[input.session.role] ?? 0
    const targetRank = RANK[role] ?? 100
    if (targetRank > callerRank) throw httpError(403, 'Cannot grant a role above your own')
  }

  const existing = await query<{ auth_user_id: string | null }>(
    `SELECT auth_user_id::text AS auth_user_id
     FROM invites
     WHERE lower(email) = $1 AND agency_id = $2::uuid AND status = 'pending'
     LIMIT 1`,
    [email, agency.id],
  )
  const pendingId = existing[0]?.auth_user_id
  if (pendingId) return { userId: pendingId, created: false }

  const invited = await inviteAuthUserByEmail(email)
  const token = randomBytes(32).toString('base64url')
  try {
    await query(
      `INSERT INTO invites (
         email, role, agency_id, auth_user_id, token, invited_by, status
       ) VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6::uuid, 'pending')`,
      [email, role, agency.id, invited.userId, token, input.session.id],
    )
  } catch (err) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
    if (code === '23505') {
      const again = await query<{ auth_user_id: string | null }>(
        `SELECT auth_user_id::text AS auth_user_id
         FROM invites
         WHERE lower(email) = $1 AND agency_id = $2::uuid AND status = 'pending'
         LIMIT 1`,
        [email, agency.id],
      )
      const id = again[0]?.auth_user_id
      if (id) return { userId: id, created: false }
    }
    throw err
  }
  return { userId: invited.userId, created: true }
}
