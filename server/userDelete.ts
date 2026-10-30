/**
 * Super admin deletes a user: POST /api/admin/users/delete { userId }.
 *
 * Only a super admin, never themselves and never another super admin.
 *
 * Most foreign keys to users are ON DELETE SET NULL, so a plain DELETE would
 * silently leave leases without a tenant, applications without an applicant
 * and so on. So:
 * - No row anywhere references the user (checked against every foreign key
 *   to users in the live schema): the user row is deleted.
 * - Otherwise the account is anonymised instead: name, email, phone, photo and
 *   password are wiped and it is deactivated, while the leases, payments and
 *   history that point at it stay intact (POPIA erasure without breaking the
 *   agency's records).
 * Either way their sessions end and event_log records who did it.
 */
import { randomUUID } from 'node:crypto'
import { clientQuery, withTransaction } from './db.js'
import { findUserById, rowToSession, type SessionUser } from './auth.js'
import { resolveUuid } from './entityMap.js'

/** Rows that belong to the account itself and go with it (FK cascade or per-user only). */
const OWN_TABLES = new Set(['auth_tokens', 'notifications'])

const fail = (status: number, message: string, code?: string) =>
  Object.assign(new Error(message), { status, ...(code ? { code } : {}) }) as Error & { status: number; code?: string }

export type DeleteUserResult = { userId: string; mode: 'deleted' | 'anonymised' }

export async function deleteUser(actor: SessionUser, requestedId: string): Promise<DeleteUserResult> {
  if (actor.role !== 'super_admin') throw fail(403, 'Only a super admin can delete users')
  const wanted = String(requestedId ?? '').trim()
  if (!wanted) throw fail(400, 'userId is required')
  let uuid: string | null = null
  try {
    uuid = await resolveUuid('user', wanted)
  } catch {
    uuid = null
  }
  const row = uuid ? await findUserById(uuid) : null
  if (!row) throw fail(404, 'User not found')
  const target = await rowToSession(row)
  if (wanted !== target.frontendId && wanted !== row.id) throw fail(404, 'User not found')
  if (row.id === actor.id) throw fail(403, 'You cannot delete your own account here')
  if (row.role === 'SUPER_ADMIN' || target.role === 'super_admin') throw fail(403, 'A super admin cannot be deleted')

  return withTransaction(async (client) => {
    const fks = await clientQuery<{ tbl: string; col: string }>(
      client,
      `SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass`,
    )
    let referenced = false
    for (const { tbl, col } of fks) {
      if (OWN_TABLES.has(tbl.replace(/^public\./, ''))) continue
      const hit = await clientQuery(
        client,
        `SELECT 1 FROM ${tbl} WHERE ${JSON.stringify(col)} = $1::uuid LIMIT 1`,
        [row.id],
      )
      if (hit.length) {
        referenced = true
        break
      }
    }

    let mode: DeleteUserResult['mode']
    if (!referenced) {
      await clientQuery(client, `DELETE FROM users WHERE id = $1::uuid`, [row.id])
      await clientQuery(client, `DELETE FROM entity_id_map WHERE entity_type IN ('user', 'user_email') AND backend_id = $1::uuid`, [row.id])
      mode = 'deleted'
    } else {
      const now = new Date().toISOString()
      await clientQuery(
        client,
        `UPDATE users
            SET email = $2, first_name = 'Deleted', last_name = 'user', phone = NULL, avatar_url = NULL,
                password_hash = '!', active = false,
                metadata = jsonb_build_object(
                  'frontend_id', metadata->'frontend_id',
                  'frontend_role', metadata->'frontend_role',
                  'deletedAt', $3::text,
                  'passwordChangedAt', $3::text),
                updated_at = NOW()
          WHERE id = $1::uuid`,
        [row.id, `deleted-${row.id.slice(0, 8)}@deleted.invalid`, now],
      )
      const tokens = await clientQuery<{ t: string | null }>(client, `SELECT to_regclass('auth_tokens')::text AS t`)
      if (tokens[0]?.t) await clientQuery(client, `DELETE FROM auth_tokens WHERE user_id = $1::uuid`, [row.id])
      mode = 'anonymised'
    }
    await clientQuery(
      client,
      `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
       VALUES ($1::uuid, $2::uuid, 'user_deleted', 'user', $3::uuid, $4::uuid, $5::jsonb, NOW())`,
      [randomUUID(), row.client_id, mode === 'deleted' ? null : row.id, actor.id, JSON.stringify({ actorUserId: actor.frontendId, targetUserId: target.frontendId, mode })],
    )
    return { userId: target.frontendId, mode }
  })
}
