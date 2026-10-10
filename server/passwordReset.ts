/**
 * D3 staff password reset: POST /api/auth/reset-password { userId }.
 *
 * Who can reset whom (the server is the gate; the UI only hides the button):
 * - Nobody resets themselves (use change-password).
 * - Nobody resets a super admin, not even another super admin (403).
 * - A super admin can reset anyone else.
 * - An agency admin (client_admin / agent_admin) with users.manage can reset:
 *   - non-admin staff (GROUND_AGENT) whose users.client_id is their agency;
 *   - their own tenants: the tenant_id on an ACTIVE, PENDING or NOTICE lease whose
 *     unit is in their agency;
 *   - their own landlords: the landlord_id on a building in their agency, or
 *     on the building of a unit in their agency.
 * - Anyone else, or a target with no such link: 403 (super admin only).
 *
 * The requested id must round-trip: resolveUuid('user', id) has to load a row
 * whose own session front-end id (or uuid) is the id that was sent.
 *
 * Effect: a random 12-character temp password is hashed and stored,
 * metadata.mustChangePassword = true and metadata.passwordChangedAt = now
 * (which revokes every existing session of the target). The temp password is
 * returned once and never logged. event_log gets a password_reset row with the
 * actor and target only.
 */
import { randomUUID } from 'node:crypto'
import { generateTempPassword } from './tempPassword.js'
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import {
  actorFromSession,
  findUserById,
  hashPassword,
  rowToSession,
  type SessionUser,
} from './auth.js'
import { actorHasUsersManage } from './scopeGate.js'

const fail = (status: number, message: string, code?: string) =>
  Object.assign(new Error(message), { status, ...(code ? { code } : {}) }) as Error & {
    status: number
    code?: string
  }

export { generateTempPassword } from './tempPassword.js'

/**
 * Jim B1: any link to another agency makes the target super-admin-only for an
 * agency admin: another users.client_id, a building / unit (or a unit of their
 * building) with another client_id, or a lease (any status, as tenant or
 * landlord) on another agency's unit.
 */
async function hasForeignAgencyLink(targetUuid: string, clientUuid: string): Promise<boolean> {
  const rows = await query<{ ok: number }>(
    `SELECT 1 AS ok WHERE
       EXISTS (SELECT 1 FROM users x
                WHERE x.id = $1::uuid AND x.client_id IS NOT NULL AND x.client_id <> $2::uuid)
    OR EXISTS (SELECT 1 FROM buildings b LEFT JOIN units u ON u.building_id = b.id
                WHERE b.landlord_id = $1::uuid
                  AND (b.client_id <> $2::uuid OR (u.id IS NOT NULL AND u.client_id <> $2::uuid)))
    OR EXISTS (SELECT 1 FROM leases l JOIN units u ON u.id = l.unit_id
                WHERE (l.tenant_id = $1::uuid OR l.landlord_id = $1::uuid)
                  AND (u.client_id <> $2::uuid OR l.client_id <> $2::uuid))`,
    [targetUuid, clientUuid],
  )
  return rows.length > 0
}

/** Jim nit 1: only a plain front-end id is stored for impersonation. */
const IMPERSONATED_ID_RE = /^[\w-]{1,64}$/

const ADMIN_DB_ROLES = new Set(['SUPER_ADMIN', 'AGENCY_ADMIN', 'AGENT_ADMIN'])
const NON_ADMIN_STAFF_DB_ROLES = new Set(['GROUND_AGENT'])

async function isOwnTenant(targetUuid: string, clientUuid: string): Promise<boolean> {
  const rows = await query<{ ok: number }>(
    `SELECT 1 AS ok FROM leases l
       JOIN units u ON u.id = l.unit_id
      WHERE l.tenant_id = $1::uuid
        AND l.status IN ('ACTIVE', 'PENDING', 'NOTICE')
        AND u.client_id = $2::uuid
      LIMIT 1`,
    [targetUuid, clientUuid],
  )
  return rows.length > 0
}

async function isOwnLandlord(targetUuid: string, clientUuid: string): Promise<boolean> {
  const rows = await query<{ ok: number }>(
    `SELECT 1 AS ok FROM buildings b
       LEFT JOIN units u ON u.building_id = b.id
      WHERE b.landlord_id = $1::uuid
        AND (b.client_id = $2::uuid OR u.client_id = $2::uuid)
      LIMIT 1`,
    [targetUuid, clientUuid],
  )
  return rows.length > 0
}

export type ResetResult = {
  tempPassword: string
  target: { id: string; uuid: string; clientId: string | null }
}

export async function resetUserPassword(
  actor: SessionUser,
  requestedId: string,
  opts: { impersonatedUserId?: string | null } = {},
): Promise<ResetResult> {
  const wanted = String(requestedId ?? '').trim()
  if (!wanted) throw fail(400, 'userId is required')
  let targetUuid: string | null = null
  try {
    targetUuid = await resolveUuid('user', wanted)
  } catch {
    targetUuid = null
  }
  const row = targetUuid ? await findUserById(targetUuid) : null
  if (!row) throw fail(404, 'User not found')
  const target = await rowToSession(row)
  // Round trip: the id sent must be this row's own id (front-end or uuid).
  if (wanted !== target.frontendId && wanted !== row.id) throw fail(404, 'User not found')

  if (row.id === actor.id) throw fail(403, 'Use change password for your own account')
  if (row.role === 'SUPER_ADMIN' || target.role === 'super_admin') {
    throw fail(403, 'A super admin password cannot be reset here')
  }

  let allowed = false
  if (actor.role === 'super_admin') {
    allowed = true
  } else if (await actorHasUsersManage(actorFromSession(actor))) {
    const actorRow = await findUserById(actor.id)
    const clientUuid = actorRow?.client_id ?? null
    if (clientUuid) {
      if (NON_ADMIN_STAFF_DB_ROLES.has(row.role)) {
        allowed = row.client_id === clientUuid
      } else if (!ADMIN_DB_ROLES.has(row.role)) {
        allowed =
          (await isOwnTenant(row.id, clientUuid)) || (await isOwnLandlord(row.id, clientUuid))
      }
      if (allowed && (await hasForeignAgencyLink(row.id, clientUuid))) allowed = false
    }
  }
  if (!allowed) throw fail(403, 'You cannot reset this user\u2019s password')

  const tempPassword = generateTempPassword()
  const hash = await hashPassword(tempPassword)
  await query(
    `UPDATE users
        SET password_hash = $2,
            metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object('mustChangePassword', true, 'passwordChangedAt', $3::text),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [row.id, hash, new Date().toISOString()],
  )
  // Actor and target only; never the password or its hash.
  await query(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, $2::uuid, 'password_reset', 'user', $3::uuid, $4::uuid, $5::jsonb, NOW())`,
    [
      randomUUID(),
      row.client_id,
      row.id,
      actor.id,
      JSON.stringify({
        actorUserId: actor.frontendId,
        targetUserId: target.frontendId,
        // The session user always acts; impersonation is recorded, never the actor.
        ...(opts.impersonatedUserId && IMPERSONATED_ID_RE.test(opts.impersonatedUserId)
          ? { impersonating: true, impersonatedUserId: opts.impersonatedUserId }
          : {}),
      }),
    ],
  )
  return { tempPassword, target: { id: target.frontendId, uuid: row.id, clientId: row.client_id } }
}
