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
import { assertUnitTitleTypeConfirmed } from './listingTitleTypeConfirm.js'
import { actorIsOwner, listingLiveClass } from './listingLiveStatus.js'
import { isOccupiedAdvert } from '../src/lib/occupiedAdvert.js'
import { PUBLIC_UNIT_STATUS_KEYS } from './publicUnitStatus.js'

const PUBLIC_KEYS = PUBLIC_UNIT_STATUS_KEYS

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

export type LiveApproval = { status: 'pending' | 'approved' | 'declined' | 'withdrawn'; requestedAt: string; reviewedAt?: string; note?: string }

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
 * The status a listing write may store. Only the owner (full super admin)
 * makes a listing live. Anyone else asking for a public status on a listing
 * that is not live now gets DRAFT plus a pending approval, even when it was
 * approved before. A save of an already-live listing keeps its key (the
 * owner-only live check in upsertProperty has already refused class changes).
 */
export async function gateListingLive(opts: {
  unitUuid: string
  statusKey: string
  storedStatus: string
  actorRole: string | null
  actorUserId: string | null
  actorIsOwner: boolean
}): Promise<string> {
  const wantsPublic = PUBLIC_KEYS.has(opts.statusKey.toUpperCase())
  if (!wantsPublic) return opts.statusKey
  await ensureListingApprovalsTable()
  if (opts.actorIsOwner) {
    await query(
      `INSERT INTO listing_approvals (unit_id, status, reviewed_at, note) VALUES ($1::uuid, 'approved', NOW(), 'Published by a super admin')
       ON CONFLICT (unit_id) DO UPDATE SET status = 'approved', reviewed_at = COALESCE(listing_approvals.reviewed_at, NOW())`,
      [opts.unitUuid],
    )
    return opts.statusKey
  }
  // Already live: a details save keeps it live (no approval query, no write).
  if (PUBLIC_KEYS.has(opts.storedStatus.toUpperCase())) return opts.statusKey
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

export async function applyListingApproval(opts: {
  unitId: string
  decision: 'approved' | 'declined'
  note: string
  reviewerUserId: string | null
}): Promise<{ ok: true; status: string }> {
  const decision = opts.decision
  const note = String(opts.note ?? '').trim().slice(0, 1000)
  await ensureListingApprovalsTable()
  // A15: check before the approval status write so a 409 leaves the request pending.
  if (decision === 'approved') {
    await assertUnitTitleTypeConfirmed(opts.unitId)
  }
  const rows = await query<{ requested_by: string | null; client_id: string | null; title: string | null }>(
    `UPDATE listing_approvals a SET status = $2, reviewed_at = NOW(), reviewed_by = $3::uuid, note = NULLIF($4, '')
       FROM units u WHERE a.unit_id = $1::uuid AND u.id = a.unit_id
     RETURNING a.requested_by::text AS requested_by, u.client_id::text AS client_id, u.title`,
    [opts.unitId, decision, opts.reviewerUserId, note],
  )
  if (!rows[0]) throw Object.assign(new Error('Not found'), { status: 404 })
  if (decision === 'approved') {
    await query(
      `UPDATE units SET status_config_key = 'PUBLISHED', updated_at = NOW() WHERE id = $1::uuid AND status_config_key IN ('DRAFT', 'OFF_MARKET', 'NOT_LISTED')`,
      [opts.unitId],
    )
  }
  const title = decision === 'approved' ? 'Listing approved — it is live' : 'Listing not approved'
  const text =
    decision === 'approved'
      ? `"${rows[0].title ?? 'Your listing'}" was approved and is now live.${note ? ` Note: ${note}` : ''}`
      : `"${rows[0].title ?? 'Your listing'}" was not approved. Reason: ${note}`
  await query(
    `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
     SELECT $1::uuid, id, $2, $3, '/workspace/properties', 'property', 'updated' FROM users
      WHERE active = TRUE AND (id = $4::uuid OR (client_id = $1::uuid AND role IN ('AGENCY_ADMIN', 'AGENT_ADMIN')))`,
    [rows[0].client_id, title, text, rows[0].requested_by],
  )
  return { ok: true, status: decision }
}

/**
 * The owner takes a live listing down. An occupied advert is switched off
 * (the unit stays OCCUPIED); anything else goes OFF_MARKET (shown as Draft)
 * and loses Featured. The approval row becomes 'withdrawn', so a later
 * publish by anyone else goes back to review.
 */
export async function withdrawListing(opts: { unitId: string; note: string; reviewerUserId: string | null }): Promise<{ ok: true; status: 'withdrawn' }> {
  await ensureListingApprovalsTable()
  const note = String(opts.note ?? '').trim().slice(0, 1000)
  const unit = (
    await query<{ status_config_key: string; listing_type: string | null; featured: boolean | null; advertise_while_occupied: boolean | null; available_from: string | null; client_id: string | null; title: string | null }>(
      `SELECT status_config_key, listing_type, featured, advertise_while_occupied, available_from::text AS available_from, client_id::text AS client_id, title
         FROM units WHERE id = $1::uuid`,
      [opts.unitId],
    )
  )[0]
  if (!unit) throw Object.assign(new Error('Not found'), { status: 404 })
  const row = {
    statusKey: unit.status_config_key,
    listingType: unit.listing_type,
    featured: Boolean(unit.featured),
    advertiseWhileOccupied: Boolean(unit.advertise_while_occupied),
    availableFrom: unit.available_from,
  }
  if (listingLiveClass(row) === 'hidden') {
    throw Object.assign(new Error('This listing is not live.'), { status: 409, code: 'LISTING_NOT_LIVE' })
  }
  if (isOccupiedAdvert(row)) {
    // Same UPDATE clearOccupiedAdvert (occupiedListing.ts) runs; the unit stays OCCUPIED.
    await query(
      `UPDATE units SET advertise_while_occupied = false, available_from = NULL, updated_at = NOW()
        WHERE id = $1::uuid AND advertise_while_occupied = true`,
      [opts.unitId],
    )
  } else {
    await query(`UPDATE units SET status_config_key = 'OFF_MARKET', featured = false, updated_at = NOW() WHERE id = $1::uuid`, [opts.unitId])
  }
  const approval = await query<{ requested_by: string | null }>(
    `INSERT INTO listing_approvals (unit_id, status, reviewed_at, reviewed_by, note) VALUES ($1::uuid, 'withdrawn', NOW(), $2::uuid, NULLIF($3, ''))
     ON CONFLICT (unit_id) DO UPDATE SET status = 'withdrawn', reviewed_at = NOW(), reviewed_by = EXCLUDED.reviewed_by, note = EXCLUDED.note
     RETURNING requested_by::text AS requested_by`,
    [opts.unitId, opts.reviewerUserId, note],
  )
  await query(
    `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
     SELECT $1::uuid, id, $2, $3, '/workspace/properties', 'property', 'updated' FROM users
      WHERE active = TRUE AND (id = $4::uuid OR (client_id = $1::uuid AND role IN ('AGENCY_ADMIN', 'AGENT_ADMIN')))`,
    [
      unit.client_id,
      'Listing taken down',
      `"${unit.title ?? 'Your listing'}" was taken down by a Lekaya Rentals admin.${note ? ` Reason: ${note}` : ''}`,
      approval[0]?.requested_by ?? null,
    ],
  )
  return { ok: true, status: 'withdrawn' }
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
      const ref = c.req.param('unitId')
      // A unit uuid, or a listing id (the property page sends its own id for a take-down).
      const unitId = /^[0-9a-f-]{36}$/i.test(ref)
        ? ref
        : await (await import('./listingUuid.js')).resolveListingUnitUuid(ref).catch(() => null)
      if (!unitId) return c.json({ ok: false, message: 'Bad listing id' }, 400)
      const body = (await c.req.json().catch(() => ({}))) as { decision?: string; note?: string }
      // P4: approve, decline and take-down are the owner's alone (checked before any write).
      if (!(await actorIsOwner(actor.role, actor.userId))) {
        return c.json({ ok: false, message: 'Only the owner can approve, decline or take down a listing' }, 403)
      }
      const decision =
        body.decision === 'approve' ? 'approved' : body.decision === 'decline' ? 'declined' : body.decision === 'withdraw' ? 'withdrawn' : null
      const note = String(body.note ?? '').trim().slice(0, 1000)
      if (!decision) return c.json({ ok: false, message: 'decision must be approve, decline or withdraw' }, 400)
      if (decision === 'declined' && !note) return c.json({ ok: false, message: 'Give a reason for declining.' }, 400)
      const reviewer = await resolveUuid('user', actor.userId).catch(() => null)
      if (decision === 'withdrawn') {
        const out = await withdrawListing({ unitId, note, reviewerUserId: reviewer })
        return c.json({ ok: true, status: out.status })
      }
      const result = await applyListingApproval({
        unitId,
        decision,
        note,
        reviewerUserId: reviewer,
      })
      return c.json({ ok: true, status: result.status })
    } catch (err) {
      const s = (err as { status?: number }).status ?? 500
      const code = (err as { code?: unknown }).code
      return c.json(
        { ok: false, message: err instanceof Error ? err.message : String(err), ...(typeof code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(code) ? { code } : {}) },
        s as 401,
      )
    }
  })
}
