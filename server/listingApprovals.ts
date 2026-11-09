/**
 * Only a super admin can make a listing live. When an agency or landlord saves
 * a listing as Published (or Featured / Under Offer) it is stored as a draft
 * with a pending approval; a super admin approves (it goes live) or declines
 * (with a reason) from Admin → Listing approvals.
 *
 * Listings that were already live before this rule keep their status.
 */
import type { Hono } from 'hono'
import { query, withTransaction } from './db.js'
import { resolveUuid } from './entityMap.js'
import { resolveRequestActor } from './requestActor.js'
import { assertUnitTitleTypeConfirmed } from './listingTitleTypeConfirm.js'
import { actorIsOwner, listingLiveClass } from './listingLiveStatus.js'
import { isOccupiedAdvert } from '../src/lib/occupiedAdvert.js'
import { PUBLIC_UNIT_STATUS_KEYS } from './publicUnitStatus.js'
import { assertListingReadyToPublish } from './listingReadiness.js'

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

type Source = 'single' | 'bulk'
type Snapshot = { approval: string | null; unitStatus: string | null }

/** The owner (full super admin, server/listingLiveStatus.ts actorIsOwner) or a 401/403. */
async function requireOwner(c: Parameters<typeof resolveRequestActor>[0], message = 'Only the owner can do this') {
  const actor = await resolveRequestActor(c, null)
  if (!actor) throw Object.assign(new Error('Sign-in required'), { status: 401 })
  if (!(await actorIsOwner(actor.role, actor.userId))) throw Object.assign(new Error(message), { status: 403 })
  return actor
}

async function snapshot(unitId: string): Promise<Snapshot & { clientId: string | null; title: string | null; requestedBy: string | null; note: string | null }> {
  const r = (
    await query<{ approval: string | null; unit_status: string | null; client_id: string | null; title: string | null; requested_by: string | null; note: string | null }>(
      `SELECT a.status AS approval, u.status_config_key AS unit_status, u.client_id::text AS client_id, u.title,
              a.requested_by::text AS requested_by, a.note
         FROM units u LEFT JOIN listing_approvals a ON a.unit_id = u.id WHERE u.id = $1::uuid`,
      [unitId],
    )
  )[0]
  return {
    approval: r?.approval ?? null,
    unitStatus: r?.unit_status ?? null,
    clientId: r?.client_id ?? null,
    title: r?.title ?? null,
    requestedBy: r?.requested_by ?? null,
    note: r?.note ?? null,
  }
}

async function audit(opts: {
  eventType: 'listing_approval_decision' | 'listing_withdrawn'
  unitId: string
  clientId: string | null
  reviewerUserId: string | null
  payload: Record<string, unknown>
}) {
  await query(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES (gen_random_uuid(), $1::uuid, $2, 'unit', $3::uuid, $4::uuid, $5::jsonb, NOW())`,
    [opts.clientId, opts.eventType, opts.unitId, opts.reviewerUserId, JSON.stringify(opts.payload)],
  )
}

/** One notification to the requester and the agency's admins. */
async function notifyAgency(clientId: string | null, requestedBy: string | null | string[], title: string, body: string) {
  const requesters = (Array.isArray(requestedBy) ? requestedBy : [requestedBy]).filter((x): x is string => Boolean(x))
  await query(
    `INSERT INTO notifications (client_id, user_id, title, body, link_path, resource_type, action_type)
     SELECT $1::uuid, id, $2, $3, '/workspace/properties', 'property', 'updated' FROM users
      WHERE active = TRUE AND (id = ANY($4::uuid[]) OR (client_id = $1::uuid AND role IN ('AGENCY_ADMIN', 'AGENT_ADMIN')))`,
    [clientId, title, body, requesters],
  )
}

export type ApprovalResult = {
  ok: true
  status: string
  skipped?: 'already_live' | 'already_declined' | 'already_withdrawn'
  clientId: string | null
  title: string | null
  requestedBy: string | null
  note: string
}

export async function applyListingApproval(opts: {
  unitId: string
  decision: 'approved' | 'declined'
  note: string
  reviewerUserId: string | null
  notify?: boolean
  source?: Source
  batchId?: string
}): Promise<ApprovalResult> {
  const decision = opts.decision
  const note = String(opts.note ?? '').trim().slice(0, 1000)
  await ensureListingApprovalsTable()
  const before = await snapshot(opts.unitId)
  // Idempotent: a re-approve of a live listing, or the same decline again, writes nothing.
  if (decision === 'approved' && before.approval === 'approved' && PUBLIC_KEYS.has(String(before.unitStatus ?? '').toUpperCase())) {
    return { ok: true, status: 'approved', skipped: 'already_live', clientId: before.clientId, title: before.title, requestedBy: before.requestedBy, note }
  }
  if (decision === 'declined' && before.approval === 'declined' && (before.note ?? '') === note) {
    return { ok: true, status: 'declined', skipped: 'already_declined', clientId: before.clientId, title: before.title, requestedBy: before.requestedBy, note }
  }
  // A15 + B1: checked before the approval write, so a 409 / 422 leaves the request pending.
  if (decision === 'approved') {
    await assertUnitTitleTypeConfirmed(opts.unitId)
    await assertListingReadyToPublish(opts.unitId)
  }
  const rows = await withTransaction(async () => {
    const updated = await query<{ requested_by: string | null; client_id: string | null; title: string | null }>(
      `UPDATE listing_approvals a SET status = $2, reviewed_at = NOW(), reviewed_by = $3::uuid, note = NULLIF($4, '')
         FROM units u WHERE a.unit_id = $1::uuid AND u.id = a.unit_id
       RETURNING a.requested_by::text AS requested_by, u.client_id::text AS client_id, u.title`,
      [opts.unitId, decision, opts.reviewerUserId, note],
    )
    if (!updated[0]) throw Object.assign(new Error('Not found'), { status: 404 })
    if (decision === 'approved') {
      await query(
        `UPDATE units SET status_config_key = 'PUBLISHED', updated_at = NOW() WHERE id = $1::uuid AND status_config_key IN ('DRAFT', 'OFF_MARKET', 'NOT_LISTED')`,
        [opts.unitId],
      )
    }
    return updated
  })
  const after = await snapshot(opts.unitId)
  await audit({
    eventType: 'listing_approval_decision',
    unitId: opts.unitId,
    clientId: rows[0].client_id,
    reviewerUserId: opts.reviewerUserId,
    payload: {
      decision, note, source: opts.source ?? 'single', ...(opts.batchId ? { batchId: opts.batchId } : {}),
      before: { approval: before.approval, unitStatus: before.unitStatus }, after: { approval: after.approval, unitStatus: after.unitStatus },
    },
  })
  if (opts.notify !== false) {
    const title = decision === 'approved' ? 'Listing approved — it is live' : 'Listing not approved'
    const text =
      decision === 'approved'
        ? `"${rows[0].title ?? 'Your listing'}" was approved and is now live.${note ? ` Note: ${note}` : ''}`
        : `"${rows[0].title ?? 'Your listing'}" was not approved. Reason: ${note}`
    await notifyAgency(rows[0].client_id, rows[0].requested_by, title, text)
  }
  return { ok: true, status: decision, clientId: rows[0].client_id, title: rows[0].title, requestedBy: rows[0].requested_by, note }
}

/**
 * The owner takes a live listing down. An occupied advert is switched off
 * (the unit stays OCCUPIED); anything else goes OFF_MARKET (shown as Draft)
 * and loses Featured. The approval row becomes 'withdrawn' (created when
 * none existed), so a later publish by anyone else goes back to review.
 * A listing that is not live: 'already_withdrawn' when its row already
 * says so, otherwise 409 LISTING_NOT_LIVE.
 */
export async function withdrawListing(opts: {
  unitId: string
  note: string
  reviewerUserId: string | null
  notify?: boolean
  source?: Source
  batchId?: string
}): Promise<ApprovalResult> {
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
  const before = await snapshot(opts.unitId)
  const row = {
    statusKey: unit.status_config_key,
    listingType: unit.listing_type,
    featured: Boolean(unit.featured),
    advertiseWhileOccupied: Boolean(unit.advertise_while_occupied),
    availableFrom: unit.available_from,
  }
  if (listingLiveClass(row) === 'hidden') {
    if (before.approval === 'withdrawn') {
      return { ok: true, status: 'withdrawn', skipped: 'already_withdrawn', clientId: unit.client_id, title: unit.title, requestedBy: before.requestedBy, note }
    }
    throw Object.assign(new Error('This listing is not live.'), { status: 409, code: 'LISTING_NOT_LIVE' })
  }
  const approval = await withTransaction(async () => {
    if (isOccupiedAdvert(row)) {
      // Same UPDATE clearOccupiedAdvert (occupiedListing.ts) runs; the unit stays OCCUPIED.
      await query(
        `UPDATE units SET advertise_while_occupied = false, available_from = NULL, updated_at = NOW()
          WHERE id = $1::uuid AND advertise_while_occupied = true`,
        [opts.unitId],
      )
    } else {
      await query(
        `UPDATE units SET status_config_key = 'OFF_MARKET', featured = FALSE, updated_at = NOW()
          WHERE id = $1::uuid AND upper(status_config_key) = ANY($2::text[])`,
        [opts.unitId, [...PUBLIC_KEYS]],
      )
    }
    return query<{ requested_by: string | null }>(
      `INSERT INTO listing_approvals (unit_id, status, reviewed_at, reviewed_by, note) VALUES ($1::uuid, 'withdrawn', NOW(), $2::uuid, NULLIF($3, ''))
       ON CONFLICT (unit_id) DO UPDATE SET status = 'withdrawn', reviewed_at = NOW(), reviewed_by = EXCLUDED.reviewed_by, note = EXCLUDED.note
       RETURNING requested_by::text AS requested_by`,
      [opts.unitId, opts.reviewerUserId, note],
    )
  })
  const after = await snapshot(opts.unitId)
  await audit({
    eventType: 'listing_withdrawn',
    unitId: opts.unitId,
    clientId: unit.client_id,
    reviewerUserId: opts.reviewerUserId,
    payload: {
      decision: 'withdraw', note, source: opts.source ?? 'single', ...(opts.batchId ? { batchId: opts.batchId } : {}),
      before: { approval: before.approval, unitStatus: before.unitStatus }, after: { approval: after.approval, unitStatus: after.unitStatus },
    },
  })
  if (opts.notify !== false) {
    await notifyAgency(
      unit.client_id,
      approval[0]?.requested_by ?? null,
      'Listing taken down',
      `"${unit.title ?? 'Your listing'}" was taken down by a Lekaya Rentals admin.${note ? ` Reason: ${note}` : ''}`,
    )
  }
  return { ok: true, status: 'withdrawn', clientId: unit.client_id, title: unit.title, requestedBy: approval[0]?.requested_by ?? null, note }
}

const UUID_RE = /^[0-9a-f-]{36}$/i
const BULK_MAX = 100

type BulkAction = 'approve' | 'decline' | 'withdraw'
export type BulkRow = { id: string; ok: boolean; status?: string; skipped?: string; error?: string; code?: string; httpStatus?: number }

/** Validates a bulk body; throws a 400 before anything is written. */
export async function parseBulkBody(body: Record<string, unknown>): Promise<{ action: BulkAction; unitIds: string[] | null; agencyId: string | null; note: string }> {
  const bad = (m: string) => Object.assign(new Error(m), { status: 400 })
  const action = body.action
  if (action !== 'approve' && action !== 'decline' && action !== 'withdraw') throw bad('action must be approve, decline or withdraw')
  const hasIds = body.unitIds !== undefined && body.unitIds !== null
  const hasAgency = typeof body.agencyId === 'string' && body.agencyId.trim() !== ''
  if (hasIds === hasAgency) throw bad('Send exactly one of unitIds or agencyId')
  if (hasAgency && action !== 'approve') throw bad('agencyId is only for approve')
  const note = String(body.note ?? '').trim().slice(0, 1000)
  if (action === 'decline' && !note) throw bad('Give a reason for declining.')
  if (hasIds) {
    if (!Array.isArray(body.unitIds)) throw bad('unitIds must be a list')
    for (const id of body.unitIds) if (typeof id !== 'string' || !UUID_RE.test(id)) throw bad(`Bad listing id: ${String(id)}`)
    const unitIds = [...new Set(body.unitIds as string[])]
    if (unitIds.length > BULK_MAX) throw bad('At most 100 listings per request')
    return { action, unitIds, agencyId: null, note }
  }
  const raw = String(body.agencyId).trim()
  const agencyId = UUID_RE.test(raw) ? raw : await resolveUuid('agency', raw).catch(() => null)
  if (!agencyId) throw bad(`Unknown agency: ${raw}`)
  return { action, unitIds: null, agencyId, note }
}

const pendingForAgency = async (agencyId: string) =>
  (
    await query<{ unit_id: string }>(
      `SELECT a.unit_id::text AS unit_id FROM listing_approvals a JOIN units u ON u.id = a.unit_id
        WHERE a.status = 'pending' AND u.client_id = $1::uuid ORDER BY a.requested_at LIMIT ${BULK_MAX}`,
      [agencyId],
    )
  ).map((r) => r.unit_id)

export async function runBulk(
  parsed: Awaited<ReturnType<typeof parseBulkBody>>,
  reviewerUserId: string | null,
): Promise<{ ok: true; batchId: string; results: BulkRow[]; summary: { requested: number; ok: number; skipped: number; failed: number }; remainingPending?: number }> {
  await ensureListingApprovalsTable()
  const batchId = (await query<{ id: string }>(`SELECT gen_random_uuid()::text AS id`))[0].id
  const ids = parsed.unitIds ?? (await pendingForAgency(parsed.agencyId!))
  const results: BulkRow[] = []
  const changed: Array<ApprovalResult & { id: string }> = []
  for (const id of ids) {
    try {
      const r =
        parsed.action === 'withdraw'
          ? await withdrawListing({ unitId: id, note: parsed.note, reviewerUserId, notify: false, source: 'bulk', batchId })
          : await applyListingApproval({
              unitId: id,
              decision: parsed.action === 'approve' ? 'approved' : 'declined',
              note: parsed.note,
              reviewerUserId,
              notify: false,
              source: 'bulk',
              batchId,
            })
      results.push({ id, ok: true, status: r.status, ...(r.skipped ? { skipped: r.skipped } : {}) })
      if (!r.skipped) changed.push({ ...r, id })
    } catch (err) {
      const e = err as { message?: string; code?: unknown; status?: number }
      results.push({
        id,
        ok: false,
        error: e?.message ?? String(err),
        ...(typeof e?.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(e.code) ? { code: e.code } : {}),
        httpStatus: typeof e?.status === 'number' ? e.status : 500,
      })
    }
  }
  // One digest per agency touched (nothing changed -> no digest, so a re-run is silent).
  const byAgency = new Map<string | null, typeof changed>()
  for (const c of changed) byAgency.set(c.clientId, [...(byAgency.get(c.clientId) ?? []), c])
  const verb: Record<string, string> = { approved: 'approved', declined: 'declined', withdrawn: 'taken down' }
  for (const [clientId, rows] of byAgency) {
    if (!clientId) continue
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
    const title = `Listing review: ${[...counts].map(([s, n]) => `${n} ${verb[s] ?? s}`).join(', ')}`
    const lines = rows.slice(0, 10).map((r) => `• "${r.title ?? 'Listing'}" ${verb[r.status] ?? r.status}${r.note && r.status !== 'approved' ? ` — ${r.note}` : ''}`)
    if (rows.length > 10) lines.push(`and ${rows.length - 10} more`)
    await notifyAgency(clientId, [...new Set(rows.map((r) => r.requestedBy).filter((x): x is string => Boolean(x)))], title, lines.join('\n'))
  }
  const summary = {
    requested: ids.length,
    ok: results.filter((r) => r.ok && !r.skipped).length,
    skipped: results.filter((r) => r.ok && r.skipped).length,
    failed: results.filter((r) => !r.ok).length,
  }
  await query(
    `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES (gen_random_uuid(), $1::uuid, 'listing_bulk_batch', 'listing_batch', $2::uuid, $3::uuid, $4::jsonb, NOW())`,
    [
      parsed.agencyId,
      batchId,
      reviewerUserId,
      JSON.stringify({ action: parsed.action, ...summary, ...(parsed.agencyId ? { agencyId: parsed.agencyId } : {}), failedIds: results.filter((r) => !r.ok).map((r) => r.id) }),
    ],
  )
  const remainingPending = parsed.agencyId
    ? (await query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM listing_approvals a JOIN units u ON u.id = a.unit_id WHERE a.status = 'pending' AND u.client_id = $1::uuid`,
        [parsed.agencyId],
      ))[0].n
    : undefined
  return { ok: true, batchId, results, summary, ...(remainingPending !== undefined ? { remainingPending } : {}) }
}

function errorBody(err: unknown) {
  const code = (err as { code?: unknown }).code
  return { ok: false, message: err instanceof Error ? err.message : String(err), ...(typeof code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(code) ? { code } : {}) }
}
const errStatusOf = (err: unknown) => ((err as { status?: number }).status ?? 500) as 401

export function registerListingApprovalRoutes(app: Hono) {
  app.get('/api/admin/listing-approvals', async (c) => {
    try {
      await requireOwner(c)
      await ensureListingApprovalsTable()
      const status = c.req.query('status') || 'pending'
      const rows = await query(
        `SELECT a.unit_id::text AS "unitId", a.status, a.requested_at AS "requestedAt", a.reviewed_at AS "reviewedAt", a.note,
                u.title, u.rent, u.price, u.listing_type AS "listingType", u.images, u.formatted_address AS address,
                c.company_name AS agency, u.client_id::text AS "agencyId",
                trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')) AS "requestedBy"
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
      return c.json(errorBody(err), errStatusOf(err))
    }
  })

  app.get('/api/admin/listing-approvals/count', async (c) => {
    try {
      await requireOwner(c)
      await ensureListingApprovalsTable()
      const status = c.req.query('status') || 'pending'
      const rawAgency = (c.req.query('agencyId') ?? '').trim()
      const agencyId = rawAgency ? (UUID_RE.test(rawAgency) ? rawAgency : await resolveUuid('agency', rawAgency).catch(() => null)) : null
      if (rawAgency && !agencyId) return c.json({ ok: true, count: 0 })
      const rows = await query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM listing_approvals a JOIN units u ON u.id = a.unit_id
          WHERE ($1 = 'all' OR a.status = $1) AND ($2::uuid IS NULL OR u.client_id = $2::uuid)`,
        [status, agencyId],
      )
      return c.json({ ok: true, count: rows[0]?.n ?? 0 }, 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      return c.json(errorBody(err), errStatusOf(err))
    }
  })

  // Registered before '/:unitId' so 'bulk' is never read as an id.
  app.post('/api/admin/listing-approvals/bulk', async (c) => {
    try {
      const actor = await requireOwner(c)
      const parsed = await parseBulkBody((await c.req.json().catch(() => ({}))) as Record<string, unknown>)
      const reviewer = await resolveUuid('user', actor.userId).catch(() => null)
      return c.json(await runBulk(parsed, reviewer))
    } catch (err) {
      return c.json(errorBody(err), errStatusOf(err))
    }
  })

  app.post('/api/admin/listing-approvals/:unitId', async (c) => {
    try {
      // P4/B1: approve, decline and take-down are the owner's alone (checked before any write).
      const actor = await requireOwner(c, 'Only the owner can approve, decline or take down a listing')
      const ref = c.req.param('unitId')
      // A unit uuid, or a listing id (the property page sends its own id for a take-down).
      const unitId = UUID_RE.test(ref) ? ref : await (await import('./listingUuid.js')).resolveListingUnitUuid(ref).catch(() => null)
      if (!unitId) return c.json({ ok: false, message: 'Bad listing id' }, 400)
      const body = (await c.req.json().catch(() => ({}))) as { decision?: string; note?: string }
      const decision =
        body.decision === 'approve' ? 'approved' : body.decision === 'decline' ? 'declined' : body.decision === 'withdraw' ? 'withdrawn' : null
      const note = String(body.note ?? '').trim().slice(0, 1000)
      if (!decision) return c.json({ ok: false, message: 'decision must be approve, decline or withdraw' }, 400)
      if (decision === 'declined' && !note) return c.json({ ok: false, message: 'Give a reason for declining.' }, 400)
      const reviewer = await resolveUuid('user', actor.userId).catch(() => null)
      const result =
        decision === 'withdrawn'
          ? await withdrawListing({ unitId, note, reviewerUserId: reviewer })
          : await applyListingApproval({ unitId, decision, note, reviewerUserId: reviewer })
      return c.json({ ok: true, status: result.status, ...(result.skipped ? { skipped: result.skipped } : {}) })
    } catch (err) {
      return c.json(errorBody(err), errStatusOf(err))
    }
  })
}
