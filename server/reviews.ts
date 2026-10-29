/**
 * Reviews (property, agent and application experience).
 *
 * Modelled on how review sites work: an overall star rating plus category
 * ratings, a "verified tenant / applicant" badge from real records, a rating
 * breakdown, sort orders, "helpful" votes, reports (3 reports hide a review
 * for moderation), one reply from the agency, and moderation by agency or
 * platform admins. Reviews containing phone numbers or e-mail addresses wait
 * for moderation. Tables: migration 032 (also created on first use).
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { resolveListingUnitUuid } from './listingUuid.js'
import { notifyUsers, superAdminUuids } from './supportDesk.js'
import type { DemoActor } from './actor.js'

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS reviews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id) ON DELETE CASCADE,
  unit_id          UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  target_type      VARCHAR(20) NOT NULL DEFAULT 'property'
                     CHECK (target_type IN ('property', 'agent', 'application')),
  target_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  author_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name      VARCHAR(120) NOT NULL,
  rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  sub_ratings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  title            VARCHAR(120),
  body             TEXT NOT NULL,
  verified         VARCHAR(20) CHECK (verified IS NULL OR verified IN ('tenant', 'applicant', 'viewer')),
  status           VARCHAR(20) NOT NULL DEFAULT 'published'
                     CHECK (status IN ('published', 'pending', 'hidden')),
  moderation_note  TEXT,
  helpful_count    INT NOT NULL DEFAULT 0,
  report_count     INT NOT NULL DEFAULT 0,
  response_body    TEXT,
  response_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  response_name    VARCHAR(120),
  response_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unit_id, target_type, author_user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_unit ON reviews (unit_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_target_user ON reviews (target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_client_status ON reviews (client_id, status);

CREATE TABLE IF NOT EXISTS review_votes (
  review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS review_reports (
  review_id  UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     VARCHAR(40) NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, user_id)
);
`

let schemaReady: Promise<void> | null = null
export function ensureReviewTables(): Promise<void> {
  schemaReady ??= query(SCHEMA_SQL)
    .then(() => undefined)
    .catch((err) => {
      schemaReady = null
      throw err
    })
  return schemaReady
}

export const SUB_RATING_KEYS = {
  property: ['accuracy', 'condition', 'location', 'value'],
  agent: ['communication', 'responsiveness', 'professionalism'],
  application: ['ease', 'communication', 'speed'],
} as const

export type ReviewTarget = keyof typeof SUB_RATING_KEYS
export type ReviewSort = 'recent' | 'highest' | 'lowest' | 'helpful'

export type PublicReview = {
  id: string
  targetType: ReviewTarget
  authorName: string
  rating: number
  subRatings: Record<string, number>
  title: string | null
  body: string
  verified: 'tenant' | 'applicant' | 'viewer' | null
  status: 'published' | 'pending' | 'hidden'
  helpfulCount: number
  votedHelpful: boolean
  mine: boolean
  response: { body: string; name: string; at: string } | null
  createdAt: string
  updatedAt: string
}

export type ReviewSummary = {
  count: number
  average: number | null
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
  subAverages: Record<string, number>
  byTarget: Record<ReviewTarget, { count: number; average: number | null }>
}

function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

const CONTACT_RE = /(\+?27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}|[\w.+-]+@[\w-]+\.[\w.]+/i

/** "Thandi M." — first name and surname initial only. */
export function publicAuthorName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'Lekaya user'
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
}

export function cleanSubRatings(target: ReviewTarget, raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const key of SUB_RATING_KEYS[target]) {
    const v = Number((raw as Record<string, unknown>)[key])
    if (Number.isInteger(v) && v >= 1 && v <= 5) out[key] = v
  }
  return out
}

async function actorUuid(actor: DemoActor | null): Promise<string | null> {
  if (!actor) return null
  return (await resolveUuid('user', actor.userId).catch(() => null)) ?? null
}

async function unitFor(listingId: string): Promise<{ id: string; client_id: string; agent_id: string | null; landlord_id: string | null; title: string } | null> {
  const uuid = await resolveListingUnitUuid(listingId)
  if (!uuid) return null
  const rows = await query<{ id: string; client_id: string; agent_id: string | null; landlord_id: string | null; title: string }>(
    `SELECT u.id::text AS id, u.client_id::text AS client_id, u.agent_id::text AS agent_id,
            b.landlord_id::text AS landlord_id, COALESCE(u.title, u.unit_number, 'Listing') AS title
       FROM units u LEFT JOIN buildings b ON b.id = u.building_id WHERE u.id = $1::uuid`,
    [uuid],
  )
  return rows[0] ?? null
}

/** Staff of the listing's agency (or a super admin) may reply and moderate. */
async function canManage(actor: DemoActor | null, clientId: string, uuid: string | null): Promise<boolean> {
  if (!actor || !uuid) return false
  if (actor.role === 'super_admin') return true
  if (!['client_admin', 'agent_admin', 'ground_agent', 'agent'].includes(actor.role)) return false
  const rows = await query<{ ok: boolean }>(`SELECT client_id = $2::uuid AS ok FROM users WHERE id = $1::uuid`, [uuid, clientId])
  return rows[0]?.ok === true
}

async function verifiedAs(unitId: string, authorUuid: string): Promise<PublicReview['verified']> {
  const lease = await query(`SELECT 1 FROM leases WHERE unit_id = $1::uuid AND tenant_id = $2::uuid LIMIT 1`, [unitId, authorUuid]).catch(() => [])
  if (lease.length) return 'tenant'
  const app = await query(`SELECT 1 FROM applications WHERE unit_id = $1::uuid AND applicant_id = $2::uuid LIMIT 1`, [unitId, authorUuid]).catch(() => [])
  if (app.length) return 'applicant'
  const viewing = await query(
    `SELECT 1 FROM bookings bk JOIN users us ON us.id = $2::uuid
      WHERE bk.unit_id = $1::uuid AND lower(bk.visitor_email) = lower(us.email) LIMIT 1`,
    [unitId, authorUuid],
  ).catch(() => [])
  return viewing.length ? 'viewer' : null
}

type Row = {
  id: string
  target_type: ReviewTarget
  author_user_id: string
  author_name: string
  rating: number
  sub_ratings: Record<string, number> | null
  title: string | null
  body: string
  verified: PublicReview['verified']
  status: PublicReview['status']
  helpful_count: number
  response_body: string | null
  response_name: string | null
  response_at: Date | null
  created_at: Date
  updated_at: Date
  voted: boolean
}

function toPublic(r: Row, me: string | null): PublicReview {
  return {
    id: r.id,
    targetType: r.target_type,
    authorName: publicAuthorName(r.author_name),
    rating: r.rating,
    subRatings: r.sub_ratings ?? {},
    title: r.title,
    body: r.body,
    verified: r.verified,
    status: r.status,
    helpfulCount: r.helpful_count,
    votedHelpful: r.voted === true,
    mine: me != null && r.author_user_id === me,
    response: r.response_body ? { body: r.response_body, name: r.response_name ?? 'The agency', at: new Date(r.response_at ?? r.updated_at).toISOString() } : null,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }
}

export function summarize(rows: Array<Pick<Row, 'rating' | 'sub_ratings' | 'target_type'>>): ReviewSummary {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewSummary['distribution']
  const subTotals: Record<string, { n: number; sum: number }> = {}
  const byTarget = {
    property: { count: 0, sum: 0 },
    agent: { count: 0, sum: 0 },
    application: { count: 0, sum: 0 },
  }
  let sum = 0
  for (const r of rows) {
    distribution[r.rating as 1 | 2 | 3 | 4 | 5]++
    sum += r.rating
    byTarget[r.target_type].count++
    byTarget[r.target_type].sum += r.rating
    for (const [k, v] of Object.entries(r.sub_ratings ?? {})) {
      subTotals[k] ??= { n: 0, sum: 0 }
      subTotals[k].n++
      subTotals[k].sum += v
    }
  }
  const avg = (s: number, n: number) => (n ? Math.round((s / n) * 10) / 10 : null)
  return {
    count: rows.length,
    average: avg(sum, rows.length),
    distribution,
    subAverages: Object.fromEntries(Object.entries(subTotals).map(([k, v]) => [k, avg(v.sum, v.n) ?? 0])),
    byTarget: Object.fromEntries(
      Object.entries(byTarget).map(([k, v]) => [k, { count: v.count, average: avg(v.sum, v.count) }]),
    ) as ReviewSummary['byTarget'],
  }
}

const ORDER: Record<ReviewSort, string> = {
  recent: 'r.created_at DESC',
  highest: 'r.rating DESC, r.created_at DESC',
  lowest: 'r.rating ASC, r.created_at DESC',
  helpful: 'r.helpful_count DESC, r.created_at DESC',
}

/** Published reviews for a listing (plus your own and, for its staff, everything). */
export async function listReviews(
  actor: DemoActor | null,
  listingId: string,
  opts: { sort?: string; target?: string } = {},
): Promise<{ reviews: PublicReview[]; summary: ReviewSummary; canManage: boolean; myReviewTargets: ReviewTarget[]; verified: PublicReview['verified'] }> {
  await ensureReviewTables()
  const unit = await unitFor(listingId)
  if (!unit) throw httpError(404, 'Listing not found')
  const me = await actorUuid(actor)
  const manage = await canManage(actor, unit.client_id, me)
  const sort = (Object.keys(ORDER) as ReviewSort[]).includes(opts.sort as ReviewSort) ? (opts.sort as ReviewSort) : 'recent'
  const target = ['property', 'agent', 'application'].includes(opts.target ?? '') ? opts.target : null
  const rows = await query<Row>(
    `SELECT r.id::text AS id, r.target_type, r.author_user_id::text AS author_user_id, r.author_name, r.rating,
            r.sub_ratings, r.title, r.body, r.verified, r.status, r.helpful_count, r.response_body, r.response_name,
            r.response_at, r.created_at, r.updated_at,
            EXISTS (SELECT 1 FROM review_votes v WHERE v.review_id = r.id AND v.user_id = $2::uuid) AS voted
       FROM reviews r
      WHERE r.unit_id = $1::uuid
        AND ($4::text IS NULL OR r.target_type = $4)
        AND (r.status = 'published' OR r.author_user_id = $2::uuid OR $3::boolean)
      ORDER BY ${ORDER[sort]} LIMIT 200`,
    [unit.id, me, manage, target],
  )
  const published = rows.filter((r) => r.status === 'published')
  const mine = me ? rows.filter((r) => r.author_user_id === me).map((r) => r.target_type) : []
  return {
    reviews: rows.map((r) => toPublic(r, me)),
    summary: summarize(published),
    canManage: manage,
    myReviewTargets: mine,
    verified: me ? await verifiedAs(unit.id, me) : null,
  }
}

/** Create or update your review of a listing (one per listing and kind). */
export async function upsertReview(actor: DemoActor, input: Record<string, unknown>): Promise<PublicReview> {
  await ensureReviewTables()
  const me = await actorUuid(actor)
  if (!me) throw httpError(401, 'Sign in to leave a review')
  const unit = await unitFor(String(input.listingId ?? ''))
  if (!unit) throw httpError(404, 'Listing not found')
  const target = (['property', 'agent', 'application'] as const).find((t) => t === input.targetType) ?? 'property'
  const rating = Number(input.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, 'Choose a rating from 1 to 5 stars')
  const body = typeof input.body === 'string' ? input.body.trim() : ''
  if (body.length < 20) throw httpError(400, 'Write at least 20 characters so others can learn from your review')
  if (body.length > 3000) throw httpError(400, 'Keep the review under 3000 characters')
  const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 120) : null
  if (await canManage(actor, unit.client_id, me)) throw httpError(403, 'Agency staff cannot review their own listings')
  if (target === 'agent' && !unit.agent_id) throw httpError(400, 'This listing has no agent to review yet')
  const verified = await verifiedAs(unit.id, me)
  if (target === 'application' && verified !== 'tenant' && verified !== 'applicant') {
    throw httpError(400, 'Apply for this property first, then review how the application went')
  }
  const nameRows = await query<{ name: string }>(
    `SELECT TRIM(CONCAT_WS(' ', first_name, last_name)) AS name FROM users WHERE id = $1::uuid`,
    [me],
  )
  const status = CONTACT_RE.test(`${title ?? ''} ${body}`) ? 'pending' : 'published'
  const rows = await query<Row>(
    `INSERT INTO reviews (client_id, unit_id, target_type, target_user_id, author_user_id, author_name, rating, sub_ratings, title, body, verified, status)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8::jsonb, $9, $10, $11, $12)
     ON CONFLICT (unit_id, target_type, author_user_id) DO UPDATE SET
       rating = EXCLUDED.rating, sub_ratings = EXCLUDED.sub_ratings, title = EXCLUDED.title, body = EXCLUDED.body,
       verified = EXCLUDED.verified, status = CASE WHEN reviews.status = 'hidden' THEN 'hidden' ELSE EXCLUDED.status END,
       updated_at = NOW()
     RETURNING id::text AS id, target_type, author_user_id::text AS author_user_id, author_name, rating, sub_ratings, title, body,
               verified, status, helpful_count, response_body, response_name, response_at, created_at, updated_at, FALSE AS voted`,
    [
      unit.client_id,
      unit.id,
      target,
      target === 'agent' ? unit.agent_id : null,
      me,
      nameRows[0]?.name || 'Lekaya user',
      rating,
      JSON.stringify(cleanSubRatings(target, input.subRatings)),
      title,
      body,
      verified,
      status,
    ],
  )
  const saved = rows[0]
  // Tell the agent / landlord about a new review.
  await notifyUsers(
    [unit.agent_id, unit.landlord_id],
    {
      clientId: unit.client_id,
      title: `New ${rating}★ review on ${unit.title}`.slice(0, 200),
      body: body.slice(0, 200),
      link: `/listing/${encodeURIComponent(String(input.listingId))}#reviews`,
      resource: 'review',
      action: 'created',
    },
    me,
  ).catch(() => 0)
  return toPublic(saved, me)
}

async function loadReview(id: string): Promise<{ id: string; unit_id: string; client_id: string; author_user_id: string; author_name: string } | null> {
  await ensureReviewTables()
  const rows = await query<{ id: string; unit_id: string; client_id: string; author_user_id: string; author_name: string }>(
    `SELECT id::text AS id, unit_id::text AS unit_id, client_id::text AS client_id, author_user_id::text AS author_user_id, author_name
       FROM reviews WHERE id = $1::uuid`,
    [id],
  )
  return rows[0] ?? null
}

/** helpful · report · respond · moderate · delete */
export async function actOnReview(actor: DemoActor, id: string, body: Record<string, unknown>): Promise<{ ok: true; helpfulCount?: number; status?: string }> {
  const me = await actorUuid(actor)
  if (!me) throw httpError(401, 'Sign in first')
  const review = await loadReview(id)
  if (!review) throw httpError(404, 'Review not found')
  const action = String(body.action ?? '')
  if (action === 'helpful') {
    if (review.author_user_id === me) throw httpError(400, 'You cannot vote on your own review')
    const removed = await query(`DELETE FROM review_votes WHERE review_id = $1::uuid AND user_id = $2::uuid RETURNING 1`, [id, me])
    if (!removed.length) await query(`INSERT INTO review_votes (review_id, user_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`, [id, me])
    const rows = await query<{ n: number }>(
      `UPDATE reviews SET helpful_count = (SELECT count(*) FROM review_votes WHERE review_id = $1::uuid) WHERE id = $1::uuid RETURNING helpful_count AS n`,
      [id],
    )
    return { ok: true, helpfulCount: rows[0]?.n ?? 0 }
  }
  if (action === 'report') {
    const reason = ['spam', 'offensive', 'fake', 'personal_info', 'other'].includes(String(body.reason)) ? String(body.reason) : 'other'
    await query(
      `INSERT INTO review_reports (review_id, user_id, reason, note) VALUES ($1::uuid, $2::uuid, $3, $4) ON CONFLICT DO NOTHING`,
      [id, me, reason, typeof body.note === 'string' ? body.note.slice(0, 500) : null],
    )
    const rows = await query<{ status: string; n: number }>(
      `UPDATE reviews SET report_count = (SELECT count(*) FROM review_reports WHERE review_id = $1::uuid),
              status = CASE WHEN (SELECT count(*) FROM review_reports WHERE review_id = $1::uuid) >= 3 AND status = 'published' THEN 'pending' ELSE status END
        WHERE id = $1::uuid RETURNING status, report_count AS n`,
      [id],
    )
    if (rows[0]?.status === 'pending') {
      await notifyUsers(await superAdminUuids(), {
        clientId: review.client_id,
        title: 'A review was reported and is waiting for moderation',
        body: `${rows[0].n} people reported a review by ${review.author_name}.`,
        link: '/workspace/admin/reviews',
        resource: 'review',
        action: 'reported',
      }).catch(() => 0)
    }
    return { ok: true, status: rows[0]?.status }
  }
  if (action === 'delete') {
    if (review.author_user_id !== me && actor.role !== 'super_admin') throw httpError(403, 'Only the author can delete this review')
    await query(`DELETE FROM reviews WHERE id = $1::uuid`, [id])
    return { ok: true }
  }
  const manage = await canManage(actor, review.client_id, me)
  if (!manage) throw httpError(403, 'Only the agency for this listing can do that')
  if (action === 'respond') {
    const text = typeof body.body === 'string' ? body.body.trim().slice(0, 2000) : ''
    const nameRows = await query<{ name: string }>(`SELECT TRIM(CONCAT_WS(' ', first_name, last_name)) AS name FROM users WHERE id = $1::uuid`, [me])
    const agency = await query<{ name: string }>(`SELECT company_name AS name FROM clients WHERE id = $1::uuid`, [review.client_id])
    await query(
      `UPDATE reviews SET response_body = NULLIF($2, ''), response_by = $3::uuid, response_name = $4, response_at = NOW(), updated_at = NOW() WHERE id = $1::uuid`,
      [id, text, me, `${nameRows[0]?.name || 'Agent'}${agency[0]?.name ? `, ${agency[0].name}` : ''}`],
    )
    if (text) {
      await notifyUsers([review.author_user_id], {
        clientId: review.client_id,
        title: 'The agency replied to your review',
        body: text.slice(0, 200),
        link: '/workspace',
        resource: 'review',
        action: 'reply',
      }).catch(() => 0)
    }
    return { ok: true }
  }
  if (action === 'moderate') {
    const status = ['published', 'pending', 'hidden'].includes(String(body.status)) ? String(body.status) : null
    if (!status) throw httpError(400, 'Choose published, pending or hidden')
    await query(`UPDATE reviews SET status = $2, moderation_note = $3, updated_at = NOW() WHERE id = $1::uuid`, [
      id,
      status,
      typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    ])
    return { ok: true, status }
  }
  throw httpError(400, 'Unknown action')
}

/** Reviews waiting for moderation (agency staff see their agency, super admins everything). */
export async function moderationQueue(actor: DemoActor): Promise<Array<PublicReview & { listingTitle: string; reportCount: number }>> {
  await ensureReviewTables()
  const me = await actorUuid(actor)
  if (!me) throw httpError(401, 'Sign in first')
  let clientId: string | null = null
  if (actor.role !== 'super_admin') {
    if (!['client_admin', 'agent_admin'].includes(actor.role)) throw httpError(403, 'Not allowed')
    const rows = await query<{ client_id: string | null }>(`SELECT client_id::text AS client_id FROM users WHERE id = $1::uuid`, [me])
    clientId = rows[0]?.client_id ?? null
    if (!clientId) return []
  }
  const rows = await query<Row & { listing_title: string; report_count: number }>(
    `SELECT r.id::text AS id, r.target_type, r.author_user_id::text AS author_user_id, r.author_name, r.rating, r.sub_ratings,
            r.title, r.body, r.verified, r.status, r.helpful_count, r.response_body, r.response_name, r.response_at,
            r.created_at, r.updated_at, FALSE AS voted, r.report_count,
            COALESCE(u.title, u.unit_number, 'Listing') AS listing_title
       FROM reviews r JOIN units u ON u.id = r.unit_id
      WHERE (r.status <> 'published' OR r.report_count > 0) AND ($1::uuid IS NULL OR r.client_id = $1::uuid)
      ORDER BY r.updated_at DESC LIMIT 200`,
    [clientId],
  )
  return rows.map((r) => ({ ...toPublic(r, me), listingTitle: r.listing_title, reportCount: r.report_count }))
}
