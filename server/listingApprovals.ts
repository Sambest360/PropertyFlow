/**
 * Only a super admin can make a listing live. When an agency or landlord saves
 * a listing as Published (or Featured / Under Offer) it is stored as a draft
 * with a pending approval; a super admin approves (it goes live) or declines
 * (with a reason) from Admin → Listing approvals.
 *
 * Listings that were already live before this rule keep their status.
 */
import type { Hono } from 'hono'
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { resolveRequestActor } from './requestActor.js'

const PUBLIC_KEYS = new Set(['PUBLISHED', 'FEATURED', 'UNDER_OFFER', 'AVAILABLE'])

let ready: Promise<void> | null = null
export function ensureListingApprovalsTable(): Promise<void> {
  ready ??= query(`
CREATE TABLE IF NOT EXISTS listing_approvals (
  -- No FK: the gate runs before a brand-new unit row is written.
  unit_id        UUID PRIMARY KEY,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  reviewed_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  note           TEXT
)`)
    .then(() => undefined)
    .catch((e) => {
      ready = null
      throw e
    })
  return ready
}

export type LiveApproval = { status: 'pending' | 'approved' | 'declined'; requestedAt: string; reviewedAt?: string; note?: string }

/** Approval rows for bootstrap, keyed by unit uuid. */
export async function loadListingApprovals(): Promise<Map<string, LiveApproval>> {
  const out = new Map<string, LiveApproval>()
  try {
    await ensureListingApprovalsTable()
    const rows = await query<{ unit_id: string; status: string; requested_at: Date; reviewed_at: Date | null; note: string | null }>(
      `SELECT unit_id::text AS unit_id, status, requested_at, reviewed_at, note FROM listing_approvals`,
    )
    for (const r of rows) {
      out.set(r.unit_id, {
        status: (r.status as LiveApproval['status']) ?? 'pending',
        requestedAt: new Date(r.requested_at).toISOString(),
        reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : undefined,
        note: r.note ?? undefined,
      })
    }
  } catch {
    /* table missing on an old DB: no approvals */
  }
  return out
}

/**
 * The status a listing write may store. A non-super-admin asking for a public
 * status on a listing that is not approved (and was not already live) gets
 * DRAFT plus a pending approval.
 */
export async function gateListingLive(opts: {
  unitUuid: string
  statusKey: string
  storedStatus: string
  actorRole: string | null
  actorUserId: string | null
}): Promise<string> {
  const wantsPublic = PUBLIC_KEYS.has(opts.statusKey.toUpperCase())
  if (!wantsPublic) return opts.statusKey
  await ensureListingApprovalsTable()
  if (opts.actorRole === 'super_admin') {
    await query(
      `INSERT INTO listing_approvals (unit_id, status, reviewed_at, note) VALUES ($1::uuid, 'approved', NOW(), 'Published by a super admin')
       ON CONFLICT (unit_id) DO UPDATE SET status = 'approved', reviewed_at = COALESCE(listing_approvals.reviewed_at, NOW())`,
      [opts.unitUuid],
    )
    return opts.statusKey
  }
  const row = (await query<{ status: string }>(`SELECT status FROM listing_approvals WHERE unit_id = $1::uuid`, [opts.unitUuid]))[0]
  if (row?.status === 'approved') return opts.statusKey
  // Already live before this rule (no approval row): keep it live.
  if (!row && PUBLIC_KEYS.has(opts.storedStatus.toUpperCase())) return opts.statusKey
  const requester = opts.actorUserId ? await resolveUuid('user', opts.actorUserId).catch(() => null) : null
  const inserted = await query<{ fresh: boolean }>(
    `INSERT INTO listing_approvals (unit_id, status, requested_at, requested_by) VALUES ($1::uuid, 'pending', NOW(), $2::uuid)
     ON CONFLICT (unit_id) DO UPDATE SET status = 'pending', requested_at = NOW(), requested_by = COALESCE(EXCLUDED.requested_by, listing_approvals.requested_by), note = NULL
       WHERE listing_approvals.status <> 'pending'
     RETURNING (xmax = 0) AS fresh`,
    [opts.unitUuid, requester],
  )
  if (inserted.length) {
    // After the unit row itself is written (a new listing is saved just after this).
    setTimeout(() => void notifySuperAdmins(opts.unitUuid).catch(() => undefined), 1500).unref?.()
  }
  return 'DRAFT'
}

async function notifySuperAdmins(unitUuid: string): Promise<void> {
  const unit = (await query<{ title: string | null; company_name: string | null }>(
    `SELECT u.title, c.company_name FROM units u LEFT JOIN clients c ON c.id = u.client_id WHERE u.id = $1::uuid`,
    [unitUuid],
  ))[0]
  await query(
    `INSERT INTO notifications (user_id, title, body, link_path, resource_type, action_type)
     SELECT id, 'Listing waiting for approval', $1, '/workspace/admin/listing-approvals', 'property', 'created'
       FROM users WHERE role = 'SUPER_ADMIN' AND active = TRUE`,
    [`${unit?.company_name ?? 'An agency'} wants "${unit?.title ?? 'a listing'}" to go live. Review it.`],
  )
}

async function superActor(c: Parameters<typeof resolveRequestActor>[0]) {
  const actor = await resolveRequestActor(c, null)
  if (!actor) throw Object.assign(new Error('Sign-in required'), { status: 401 })
  if (actor.role !== 'super_admin') throw Object.assign(new Error('Only a super admin can approve listings'), { status: 403 })
  return actor
}

export function registerListingApprovalRoutes(app: Hono) {
  app.get('/api/admin/listing-approvals', async (c) => {
    try {
      await superActor(c)
      await ensureListingApprovalsTable()
      const status = c.req.query('status') || 'pending'
      const rows = await query(
        `SELECT a.unit_id::text AS "unitId", a.status, a.requested_at AS "requestedAt", a.reviewed_at AS "reviewedAt", a.note,
                u.title, u.rent, u.price, u.listing_type AS "listingType", u.images, u.formatted_address AS address,
                c.company_name AS agency, trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')) AS "requestedBy"
           FROM listing_approvals a
           JOIN units u ON u.id = a.unit_id
           LEFT JOIN clients c ON c.id = u.client_id
           LEFT JOIN users r ON r.id = a.requested_by
          WHERE ($1 = 'all' OR a.status = $1)
          ORDER BY a.requested_at DESC
          LIMIT 200`,
        [status],
      )
      return c.json({ ok: true, items: rows }, 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      const s = (err as { status?: number }).status ?? 500
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, s as 401)
    }
  })

  app.post('/api/admin/listing-approvals/:unitId', async (c) => {
    try {
      const actor = await superActor(c)
      const unitId = c.req.param('unitId')
      if (!/^[0-9a-f-]{36}$/i.test(unitId)) return c.json({ ok: false, message: 'Bad listing id' }, 400)
      const body = (await c.req.json().catch(() => ({}))) as { decision?: string; note?: string }
      const decision = body.decision === 'approve' ? 'approved' : body.decision === 'decline' ? 'declined' : null
      const note = String(body.note ?? '').trim().slice(0, 1000)
      if (!decision) return c.json({ ok: false, message: 'decision must be approve or decline' }, 400)
      if (decision === 'declined' && !note) return c.json({ ok: false, message: 'Give a reason for declining.' }, 400)
      await ensureListingApprovalsTable()
      const reviewer = await resolveUuid('user', actor.userId).catch(() => null)
      const rows = await query<{ requested_by: string | null; client_id: string | null; title: string | null }>(
        `UPDATE listing_approvals a SET status = $2, reviewed_at = NOW(), reviewed_by = $3::uuid, note = NULLIF($4, '')
           FROM units u WHERE a.unit_id = $1::uuid AND u.id = a.unit_id
         RETURNING a.requested_by::text AS requested_by, u.client_id::text AS client_id, u.title`,
        [unitId, decision, reviewer, note],
      )
      if (!rows[0]) return c.json({ ok: false, message: 'Not found' }, 404)
      if (decision === 'approved') {
        await query(`UPDATE units SET status_config_key = 'PUBLISHED', updated_at = NOW() WHERE id = $1::uuid AND status_config_key IN ('DRAFT', 'OFF_MARKET', 'NOT_LISTED')`, [unitId])
      }
      const title = decision === 'approved' ? 'Listing approved — it is live' : 'Listing not approved'
      const text = decision === 'approved'
        ? `"${rows[0].title ?? 'Your listing'}" was approved and is now live.${note ? ` Note: ${note}` : ''}`
        : `"${rows[0].title ?? 'Your listing'}" was not approved. Reason: ${note}`
      await query(
        `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
         SELECT $1::uuid, id, $2, $3, '/workspace/properties', 'property', 'updated' FROM users
          WHERE active = TRUE AND (id = $4::uuid OR (client_id = $1::uuid AND role IN ('AGENCY_ADMIN', 'AGENT_ADMIN')))`,
        [rows[0].client_id, title, text, rows[0].requested_by],
      )
      return c.json({ ok: true, status: decision })
    } catch (err) {
      const s = (err as { status?: number }).status ?? 500
      return c.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, s as 401)
    }
  })
}
