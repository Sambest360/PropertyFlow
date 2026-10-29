/**
 * Complaints and warnings (migration 033, also created on first use).
 *
 *   Complaint  any signed-in user about another user (agent, landlord, tenant,
 *              contractor). Goes to the subject's agency admins and the super
 *              admins; they investigate and uphold or dismiss it.
 *   Warning    issued by an agency admin (own agency) or super admin:
 *              notice · warning (private to the user) · final · severe (also
 *              shown on the user's public profile). The user is notified and
 *              acknowledges it.
 *   Profile    public page per user: rating from reviews, recent reviews,
 *              public warnings and the number of upheld complaints.
 */
import { query } from './db.js'
import { resolveFrontendId, resolveUuid } from './entityMap.js'
import { notifyUsers, superAdminUuids } from './supportDesk.js'
import type { DemoActor } from './actor.js'

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS user_complaints (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  subject_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id          UUID REFERENCES units(id) ON DELETE SET NULL,
  category         VARCHAR(40) NOT NULL,
  description      TEXT NOT NULL,
  evidence         JSONB NOT NULL DEFAULT '[]'::jsonb,
  status           VARCHAR(20) NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'investigating', 'upheld', 'dismissed')),
  resolution_note  TEXT,
  handled_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_complaints_subject ON user_complaints (subject_user_id, status);
CREATE INDEX IF NOT EXISTS idx_complaints_client ON user_complaints (client_id, status);

CREATE TABLE IF NOT EXISTS user_warnings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  complaint_id     UUID REFERENCES user_complaints(id) ON DELETE SET NULL,
  level            VARCHAR(20) NOT NULL CHECK (level IN ('notice', 'warning', 'final', 'severe')),
  reason           TEXT NOT NULL,
  public           BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at  TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_warnings_user ON user_warnings (user_id, created_at DESC);
`
let ready: Promise<void> | null = null
export function ensureConductTables(): Promise<void> {
  ready ??= query(SCHEMA_SQL).then(() => undefined).catch((e) => {
    ready = null
    throw e
  })
  return ready
}

export const COMPLAINT_CATEGORIES = [
  'unprofessional',
  'no_response',
  'misleading_listing',
  'harassment',
  'discrimination',
  'payment_dispute',
  'poor_workmanship',
  'property_damage',
  'safety',
  'other',
] as const
export const WARNING_LEVELS = ['notice', 'warning', 'final', 'severe'] as const
export type WarningLevel = (typeof WARNING_LEVELS)[number]
/** Levels shown on the public profile. */
export const PUBLIC_LEVELS: WarningLevel[] = ['final', 'severe']

const ADMIN_ROLES = new Set(['super_admin', 'client_admin', 'agent_admin'])
const DB_ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Platform team',
  AGENCY_ADMIN: 'Principal',
  AGENT_ADMIN: 'Agency administrator',
  GROUND_AGENT: 'Agent',
  LANDLORD: 'Landlord',
  END_USER: 'Tenant',
  CONTRACTOR: 'Contractor',
}

function err(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

async function uuidOf(feOrUuid: string | null | undefined): Promise<string | null> {
  if (!feOrUuid) return null
  if (/^[0-9a-f-]{36}$/i.test(feOrUuid)) return feOrUuid
  return (await resolveUuid('user', feOrUuid).catch(() => null)) ?? null
}

async function me(actor: DemoActor): Promise<string> {
  const id = await uuidOf(actor.userId)
  if (!id) throw err(401, 'Sign in first')
  return id
}

async function userRow(uuid: string) {
  const rows = await query<{ id: string; client_id: string | null; name: string; role: string; created_at: Date; avatar_url: string | null }>(
    `SELECT id::text AS id, client_id::text AS client_id, TRIM(CONCAT_WS(' ', first_name, last_name)) AS name, role, created_at, avatar_url
       FROM users WHERE id = $1::uuid`,
    [uuid],
  )
  return rows[0] ?? null
}

/** Super admin: anyone. Agency admin: users of their own agency. */
async function canAdminister(actor: DemoActor, actorUuid: string, subjectClientId: string | null): Promise<boolean> {
  if (actor.role === 'super_admin') return true
  if (!ADMIN_ROLES.has(actor.role) || !subjectClientId) return false
  const mine = await userRow(actorUuid)
  return mine?.client_id === subjectClientId
}

async function agencyAdmins(clientId: string | null): Promise<string[]> {
  if (!clientId) return []
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE client_id = $1::uuid AND COALESCE(active, true)
       AND (role IN ('AGENCY_ADMIN', 'AGENT_ADMIN') OR metadata->>'frontend_role' IN ('client_admin', 'agent_admin'))`,
    [clientId],
  )
  return rows.map((r) => r.id)
}

/* ------------------------------- complaints ------------------------------ */

export async function fileComplaint(actor: DemoActor, body: Record<string, unknown>) {
  await ensureConductTables()
  const author = await me(actor)
  const subject = await uuidOf(String(body.subjectUserId ?? ''))
  if (!subject) throw err(400, 'Choose who the complaint is about')
  if (subject === author) throw err(400, 'You cannot complain about yourself')
  const subj = await userRow(subject)
  if (!subj) throw err(404, 'That person was not found')
  const category = (COMPLAINT_CATEGORIES as readonly string[]).includes(String(body.category)) ? String(body.category) : 'other'
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (description.length < 20) throw err(400, 'Describe what happened in at least 20 characters')
  const evidence = Array.isArray(body.evidence) ? body.evidence.filter((x) => typeof x === 'string' && /^https?:/.test(x)).slice(0, 6) : []
  let unitId: string | null = null
  if (typeof body.listingId === 'string' && body.listingId) {
    const { resolveListingUnitUuid } = await import('./listingUuid.js')
    unitId = await resolveListingUnitUuid(body.listingId).catch(() => null)
  }
  const rows = await query<{ id: string }>(
    `INSERT INTO user_complaints (client_id, subject_user_id, author_user_id, unit_id, category, description, evidence)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::jsonb) RETURNING id::text AS id`,
    [subj.client_id, subject, author, unitId, category, description.slice(0, 4000), JSON.stringify(evidence)],
  )
  await notifyUsers(
    [...(await agencyAdmins(subj.client_id)), ...(await superAdminUuids())],
    {
      clientId: subj.client_id,
      title: `New complaint about ${subj.name || 'a user'}`,
      body: description.slice(0, 200),
      link: '/workspace/conduct',
      resource: 'complaint',
      action: 'created',
    },
    author,
  )
  return { id: rows[0].id }
}

type ComplaintRow = {
  id: string
  subject_user_id: string
  subject_name: string
  subject_role: string
  author_user_id: string
  author_name: string
  category: string
  description: string
  evidence: string[]
  status: string
  resolution_note: string | null
  listing_title: string | null
  created_at: Date
  updated_at: Date
}

/** Complaints you filed, plus (admins) the ones about people in your agency. */
export async function listComplaints(actor: DemoActor) {
  await ensureConductTables()
  const uid = await me(actor)
  let clientFilter: string | null = null
  let admin = false
  if (actor.role === 'super_admin') admin = true
  else if (ADMIN_ROLES.has(actor.role)) {
    clientFilter = (await userRow(uid))?.client_id ?? null
    admin = Boolean(clientFilter)
  }
  const rows = await query<ComplaintRow>(
    `SELECT c.id::text AS id, c.subject_user_id::text AS subject_user_id, TRIM(CONCAT_WS(' ', s.first_name, s.last_name)) AS subject_name,
            s.role AS subject_role, c.author_user_id::text AS author_user_id, TRIM(CONCAT_WS(' ', a.first_name, a.last_name)) AS author_name,
            c.category, c.description, c.evidence, c.status, c.resolution_note,
            COALESCE(u.title, u.unit_number) AS listing_title, c.created_at, c.updated_at
       FROM user_complaints c
       JOIN users s ON s.id = c.subject_user_id
       JOIN users a ON a.id = c.author_user_id
       LEFT JOIN units u ON u.id = c.unit_id
      WHERE c.author_user_id = $1::uuid
         OR ($2::boolean AND ($3::uuid IS NULL OR c.client_id = $3::uuid))
      ORDER BY c.created_at DESC LIMIT 300`,
    [uid, admin, clientFilter],
  )
  return {
    canHandle: admin,
    complaints: await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        subjectUserId: (await resolveFrontendId('user', r.subject_user_id).catch(() => null)) ?? r.subject_user_id,
        subjectName: r.subject_name,
        subjectRole: DB_ROLE_LABEL[r.subject_role] ?? r.subject_role,
        mine: r.author_user_id === uid,
        authorName: admin || r.author_user_id === uid ? r.author_name : null,
        category: r.category,
        description: r.description,
        evidence: r.evidence ?? [],
        status: r.status,
        resolutionNote: r.resolution_note,
        listingTitle: r.listing_title,
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      })),
    ),
  }
}

/** Admin: move a complaint along, optionally issuing a warning when upheld. */
export async function handleComplaint(actor: DemoActor, id: string, body: Record<string, unknown>) {
  await ensureConductTables()
  const uid = await me(actor)
  const rows = await query<{ client_id: string | null; subject_user_id: string; author_user_id: string }>(
    `SELECT client_id::text AS client_id, subject_user_id::text AS subject_user_id, author_user_id::text AS author_user_id
       FROM user_complaints WHERE id = $1::uuid`,
    [id],
  )
  const c = rows[0]
  if (!c) throw err(404, 'Complaint not found')
  if (!(await canAdminister(actor, uid, c.client_id))) throw err(403, 'Only the agency admin or platform team can handle this complaint')
  const status = ['open', 'investigating', 'upheld', 'dismissed'].includes(String(body.status)) ? String(body.status) : null
  if (!status) throw err(400, 'Choose a status')
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : null
  await query(
    `UPDATE user_complaints SET status = $2, resolution_note = COALESCE($3, resolution_note), handled_by = $4::uuid, updated_at = NOW() WHERE id = $1::uuid`,
    [id, status, note, uid],
  )
  if (status === 'upheld' || status === 'dismissed') {
    await notifyUsers([c.author_user_id], {
      clientId: c.client_id,
      title: `Your complaint was ${status === 'upheld' ? 'upheld' : 'closed'}`,
      body: note ?? (status === 'upheld' ? 'Action has been taken.' : 'After review no action was taken.'),
      link: '/workspace/conduct',
      resource: 'complaint',
      action: status,
    })
  }
  const w = body.warning as { level?: unknown; reason?: unknown; public?: unknown } | undefined
  if (status === 'upheld' && w && w.level) {
    await issueWarning(actor, { userId: c.subject_user_id, level: w.level, reason: w.reason ?? note, complaintId: id, public: w.public })
  }
  return { ok: true }
}

/* -------------------------------- warnings ------------------------------- */

export async function issueWarning(actor: DemoActor, body: Record<string, unknown>) {
  await ensureConductTables()
  const uid = await me(actor)
  const target = await uuidOf(String(body.userId ?? ''))
  if (!target) throw err(400, 'Choose who to warn')
  const subj = await userRow(target)
  if (!subj) throw err(404, 'User not found')
  if (!(await canAdminister(actor, uid, subj.client_id))) throw err(403, 'Only the agency admin or platform team can issue warnings')
  const level = (WARNING_LEVELS as readonly string[]).includes(String(body.level)) ? (String(body.level) as WarningLevel) : null
  if (!level) throw err(400, 'Choose a warning level')
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (reason.length < 10) throw err(400, 'Give a reason of at least 10 characters')
  const isPublic = PUBLIC_LEVELS.includes(level) ? body.public !== false : false
  const days = Number(body.expiresInDays)
  const rows = await query<{ id: string }>(
    `INSERT INTO user_warnings (client_id, user_id, issued_by, complaint_id, level, reason, public, expires_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, CASE WHEN $8::int > 0 THEN NOW() + ($8::int || ' days')::interval END)
     RETURNING id::text AS id`,
    [subj.client_id, target, uid, typeof body.complaintId === 'string' ? body.complaintId : null, level, reason.slice(0, 2000), isPublic, Number.isFinite(days) ? days : 0],
  )
  await notifyUsers([target], {
    clientId: subj.client_id,
    title: level === 'notice' ? 'You have a notice from the platform team' : `You received a ${level === 'warning' ? 'warning' : `${level} warning`}`,
    body: `${reason.slice(0, 180)}${isPublic ? ' This warning is shown on your public profile.' : ''}`,
    link: '/workspace/conduct',
    resource: 'warning',
    action: level,
  })
  return { id: rows[0].id, public: isPublic }
}

/** Your own warnings (and, for admins, every warning in scope). */
export async function listWarnings(actor: DemoActor) {
  await ensureConductTables()
  const uid = await me(actor)
  let admin = actor.role === 'super_admin'
  let clientFilter: string | null = null
  if (!admin && ADMIN_ROLES.has(actor.role)) {
    clientFilter = (await userRow(uid))?.client_id ?? null
    admin = Boolean(clientFilter)
  }
  const rows = await query<{
    id: string
    user_id: string
    user_name: string
    level: WarningLevel
    reason: string
    public: boolean
    acknowledged_at: Date | null
    expires_at: Date | null
    revoked_at: Date | null
    created_at: Date
    issuer: string | null
  }>(
    `SELECT w.id::text AS id, w.user_id::text AS user_id, TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS user_name,
            w.level, w.reason, w.public, w.acknowledged_at, w.expires_at, w.revoked_at, w.created_at,
            TRIM(CONCAT_WS(' ', i.first_name, i.last_name)) AS issuer
       FROM user_warnings w JOIN users u ON u.id = w.user_id LEFT JOIN users i ON i.id = w.issued_by
      WHERE w.user_id = $1::uuid OR ($2::boolean AND ($3::uuid IS NULL OR w.client_id = $3::uuid))
      ORDER BY w.created_at DESC LIMIT 300`,
    [uid, admin, clientFilter],
  )
  return {
    canIssue: admin,
    warnings: rows.map((r) => ({
      id: r.id,
      mine: r.user_id === uid,
      userName: r.user_name,
      level: r.level,
      reason: r.reason,
      public: r.public,
      issuedBy: r.issuer,
      acknowledgedAt: r.acknowledged_at ? new Date(r.acknowledged_at).toISOString() : null,
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
      revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  }
}

export async function actOnWarning(actor: DemoActor, id: string, action: string) {
  await ensureConductTables()
  const uid = await me(actor)
  const rows = await query<{ user_id: string; client_id: string | null }>(
    `SELECT user_id::text AS user_id, client_id::text AS client_id FROM user_warnings WHERE id = $1::uuid`,
    [id],
  )
  const w = rows[0]
  if (!w) throw err(404, 'Warning not found')
  if (action === 'acknowledge') {
    if (w.user_id !== uid) throw err(403, 'Only the person warned can acknowledge it')
    await query(`UPDATE user_warnings SET acknowledged_at = COALESCE(acknowledged_at, NOW()) WHERE id = $1::uuid`, [id])
    return { ok: true }
  }
  if (action === 'revoke') {
    if (!(await canAdminister(actor, uid, w.client_id))) throw err(403, 'Not allowed')
    await query(`UPDATE user_warnings SET revoked_at = NOW() WHERE id = $1::uuid`, [id])
    return { ok: true }
  }
  throw err(400, 'Unknown action')
}

/* ----------------------------- public profile ---------------------------- */

export async function publicProfile(actor: DemoActor | null, userRef: string) {
  await ensureConductTables()
  const uuid = await uuidOf(userRef)
  if (!uuid) throw err(404, 'Profile not found')
  const u = await userRow(uuid)
  if (!u) throw err(404, 'Profile not found')
  // Tenants' profiles are only for signed-in agency staff.
  if (u.role === 'END_USER' && !(actor && ['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'].includes(actor.role))) {
    throw err(404, 'Profile not found')
  }
  const agency = u.client_id
    ? (await query<{ name: string }>(`SELECT company_name AS name FROM clients WHERE id = $1::uuid`, [u.client_id]))[0]?.name ?? null
    : null
  let reviews: Array<{ rating: number; title: string | null; body: string; author: string; at: string; listing: string | null }> = []
  let rating: { average: number | null; count: number } = { average: null, count: 0 }
  try {
    const { ensureReviewTables, publicAuthorName } = await import('./reviews.js')
    await ensureReviewTables()
    const agg = await query<{ avg: string | null; n: string }>(
      `SELECT AVG(rating)::numeric(3,1)::text AS avg, count(*)::text AS n FROM reviews
        WHERE status = 'published' AND (target_user_id = $1::uuid OR (target_type = 'property' AND unit_id IN (
          SELECT u.id FROM units u JOIN buildings b ON b.id = u.building_id WHERE b.landlord_id = $1::uuid)))`,
      [uuid],
    )
    rating = { average: agg[0]?.avg ? Number(agg[0].avg) : null, count: Number(agg[0]?.n ?? 0) }
    const rows = await query<{ rating: number; title: string | null; body: string; author_name: string; created_at: Date; listing: string | null }>(
      `SELECT r.rating, r.title, r.body, r.author_name, r.created_at, COALESCE(un.title, un.unit_number) AS listing
         FROM reviews r LEFT JOIN units un ON un.id = r.unit_id
        WHERE r.status = 'published' AND (r.target_user_id = $1::uuid OR (r.target_type = 'property' AND r.unit_id IN (
          SELECT u.id FROM units u JOIN buildings b ON b.id = u.building_id WHERE b.landlord_id = $1::uuid)))
        ORDER BY r.created_at DESC LIMIT 10`,
      [uuid],
    )
    reviews = rows.map((r) => ({
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: publicAuthorName(r.author_name),
      at: new Date(r.created_at).toISOString(),
      listing: r.listing,
    }))
  } catch {
    /* reviews unavailable */
  }
  const warnings = await query<{ level: WarningLevel; reason: string; created_at: Date }>(
    `SELECT level, reason, created_at FROM user_warnings
      WHERE user_id = $1::uuid AND public AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC LIMIT 20`,
    [uuid],
  )
  const upheld = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM user_complaints WHERE subject_user_id = $1::uuid AND status = 'upheld'`,
    [uuid],
  )
  return {
    id: (await resolveFrontendId('user', uuid).catch(() => null)) ?? uuid,
    name: u.name,
    role: DB_ROLE_LABEL[u.role] ?? u.role,
    agency,
    avatarUrl: u.avatar_url,
    memberSince: new Date(u.created_at).toISOString(),
    rating,
    reviews,
    warnings: warnings.map((w) => ({ level: w.level, reason: w.reason, at: new Date(w.created_at).toISOString() })),
    upheldComplaints: Number(upheld[0]?.n ?? 0),
  }
}
