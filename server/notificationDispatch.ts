/**
 * Notifications raised in the app (application submitted, viewing booked, job
 * updated…) for OTHER people. The browser cannot write another person's
 * notification through /api/persist, so it sends them here. The server only
 * delivers to people connected to the sender through an agency — same
 * agency, or an application, lease, property, job or booking there — or to
 * the platform team. Delivered notifications are emailed by the mailer too.
 */
import { query } from './db.js'
import { ensureUuid, resolveUuid } from './entityMap.js'
import type { DemoActor } from './actor.js'

export type DispatchItem = {
  id?: unknown
  userId?: unknown
  agencyId?: unknown
  title?: unknown
  body?: unknown
  link?: unknown
  resource?: unknown
  action?: unknown
}

const LINK_SQL = [
  `SELECT client_id FROM users WHERE id = $1::uuid AND client_id IS NOT NULL`,
  `SELECT client_id FROM applications WHERE applicant_id = $1::uuid OR agent_id = $1::uuid`,
  `SELECT client_id FROM leases WHERE tenant_id = $1::uuid OR landlord_id = $1::uuid OR agent_id = $1::uuid`,
  `SELECT client_id FROM buildings WHERE landlord_id = $1::uuid`,
  `SELECT client_id FROM units WHERE agent_id = $1::uuid`,
  `SELECT client_id FROM maintenance_tickets WHERE reported_by = $1::uuid OR contractor_id = $1::uuid`,
  `SELECT client_id FROM bookings WHERE applicant_id = $1::uuid OR agent_id = $1::uuid`,
  `SELECT client_id FROM contractor_bookings WHERE contractor_user_id = $1::uuid`,
]

/** Agencies (client ids) a user is connected to. */
export async function linkedAgencies(userUuid: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (const sql of LINK_SQL) {
    try {
      const rows = await query<{ client_id: string | null }>(sql, [userUuid])
      for (const r of rows) if (r.client_id) out.add(String(r.client_id))
    } catch {
      /* table not on this database */
    }
  }
  return out
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

async function uuidOfUser(ref: string): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ref
  return (await resolveUuid('user', ref).catch(() => null)) ?? null
}

export async function dispatchNotifications(
  actor: DemoActor,
  items: DispatchItem[],
): Promise<{ delivered: number; refused: number }> {
  const actorUuid = await uuidOfUser(actor.userId)
  if (!actorUuid) throw Object.assign(new Error('Sign in first'), { status: 401 })
  const actorLinks = actor.role === 'super_admin' ? null : await linkedAgencies(actorUuid)
  const recipientCache = new Map<string, { uuid: string; role: string; links: Set<string> } | null>()

  let delivered = 0
  let refused = 0
  for (const item of items.slice(0, 100)) {
    const ref = text(item.userId, 80)
    const title = text(item.title, 200)
    if (!ref || !title) {
      refused++
      continue
    }
    if (!recipientCache.has(ref)) {
      const uuid = await uuidOfUser(ref)
      const row = uuid
        ? (await query<{ role: string }>(`SELECT role FROM users WHERE id = $1::uuid AND active`, [uuid]))[0]
        : undefined
      recipientCache.set(ref, uuid && row ? { uuid, role: row.role, links: await linkedAgencies(uuid) } : null)
    }
    const r = recipientCache.get(ref)
    if (!r) {
      refused++
      continue
    }
    const allowed =
      actorLinks === null ||
      r.uuid === actorUuid ||
      r.role === 'SUPER_ADMIN' ||
      [...r.links].some((c) => actorLinks.has(c))
    if (!allowed) {
      refused++
      continue
    }
    const feId = text(item.id, 64)
    const id = feId && /^[A-Za-z0-9_-]+$/.test(feId) ? await ensureUuid('notification', feId) : null
    const agencyRef = text(item.agencyId, 80)
    const client = agencyRef ? await resolveUuid('agency', agencyRef).catch(() => null) : null
    await query(
      `INSERT INTO notifications (id, client_id, user_id, title, body, link_path, resource_type, action_type)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2::uuid, $3::uuid, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        client,
        r.uuid,
        title,
        text(item.body, 1000),
        text(item.link, 500) || null,
        text(item.resource, 40) || null,
        text(item.action, 20) || null,
      ],
    )
    delivered++
  }
  return { delivered, refused }
}
