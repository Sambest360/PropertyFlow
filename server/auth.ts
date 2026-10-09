/**
 * Email/password auth for the Hono API.
 * Uses bcryptjs hashes in users.password_hash and HMAC-signed JWT cookies/Bearer tokens.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { query } from './db.js'
import { ensureUuid } from './entityMap.js'
import { isReservedSuperAdminEmail, resolveFrontendRole } from '../src/lib/supabase/idMap.js'
import { applyVerificationDecision } from '../src/lib/verification.js'
import { ACTOR_AGENCY_HEADER, ACTOR_ROLE_HEADER, ACTOR_USER_HEADER } from './actor.js'

const AUTH_COOKIE = 'pf_session'
const TOKEN_TTL_SEC = 60 * 60 * 24 * 14 // 14 days

export type SessionUser = {
  id: string
  frontendId: string
  email: string
  name: string
  role: string
  agencyId: string | null
  phone?: string
  active: boolean
  enabledPermissions?: string[]
  licenseStatus?: string | null
  mentorId?: string | null
  commissionSharePct?: number | null
  company?: string
  idNumberOrPassport?: string
  verification?: VerificationMeta | null
}

export type VerificationDocMeta = {
  key: string
  label: string
  name: string
  mimeType: string
  dataUrl: string
  uploadedAt: string
  /** Kept when a reviewer has opened this document. updateUserVerification does not clear it. */
  lookedAt?: string
}

export type VerificationMeta = {
  status: 'pending' | 'approved' | 'rejected' | 'not_required'
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string | null
  rejectNote?: string
  profile?: Record<string, unknown>
  documents?: VerificationDocMeta[]
}

type JwtPayload = {
  sub: string
  fe: string
  role: string
  agency: string | null
  exp: number
}

const ROLE_TO_DB: Record<string, string> = {
  super_admin: 'SUPER_ADMIN',
  client_admin: 'AGENCY_ADMIN',
  agency_admin: 'AGENCY_ADMIN',
  agent_admin: 'AGENT_ADMIN',
  agent: 'GROUND_AGENT',
  ground_agent: 'GROUND_AGENT',
  landlord: 'LANDLORD',
  tenant: 'END_USER',
  applicant: 'END_USER',
  contractor: 'CONTRACTOR',
}


function authSecret(): string {
  const s = process.env.AUTH_SECRET?.trim()
  if (!s || s === '') {
    const env = process.env.NODE_ENV || 'development'
    throw new Error(`AUTH_SECRET is required in all environments (NODE_ENV=${env}). Set AUTH_SECRET environment variable.`)
  }
  return s
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf) : buf
  return b.toString('base64url')
}

function signToken(payload: JwtPayload): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = createHmac('sha256', authSecret()).update(data).digest('base64url')
  return `${data}.${sig}`
}

function verifyToken(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, sig] = parts
  const data = `${header}.${body}`
  const expected = createHmac('sha256', authSecret()).update(data).digest('base64url')
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtPayload
    if (!payload.sub || !payload.exp || payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false
  // Support pgcrypto crypt() hashes from older demo seed ($2a$…)
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: 'User', last: 'User' }
  if (parts.length === 1) return { first: parts[0], last: parts[0] }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

type UserRow = {
  id: string
  email: string
  password_hash: string
  first_name: string
  last_name: string
  phone: string | null
  role: string
  active: boolean
  client_id: string | null
  metadata: Record<string, unknown> | null
  agency_fe: string | null
}

async function rowToSession(row: UserRow): Promise<SessionUser> {
  const meta = row.metadata ?? {}
  const frontendId =
    typeof meta.frontend_id === 'string' && meta.frontend_id
      ? meta.frontend_id
      : row.id
  // DB staff roles override stale metadata (e.g. frontend_role: tenant on GROUND_AGENT)
  const feRole = resolveFrontendRole(row.role, meta, row.email)
  const verification =
    meta.verification && typeof meta.verification === 'object'
      ? (meta.verification as VerificationMeta)
      : null
  const profile =
    verification?.profile && typeof verification.profile === 'object'
      ? verification.profile
      : null
  return {
    id: row.id,
    frontendId,
    email: row.email,
    name: `${row.first_name} ${row.last_name}`.trim(),
    role: feRole,
    agencyId: row.agency_fe,
    phone: row.phone ?? undefined,
    active: row.active,
    enabledPermissions: Array.isArray(meta.enabledPermissions)
      ? (meta.enabledPermissions as string[])
      : undefined,
    licenseStatus: (meta.licenseStatus as string | null | undefined) ?? null,
    mentorId: (meta.mentorId as string | null | undefined) ?? null,
    commissionSharePct:
      typeof meta.commissionSharePct === 'number' ? meta.commissionSharePct : null,
    company:
      typeof profile?.company === 'string'
        ? profile.company
        : typeof meta.company === 'string'
          ? meta.company
          : undefined,
    idNumberOrPassport:
      typeof profile?.idNumberOrPassport === 'string'
        ? profile.idNumberOrPassport
        : typeof meta.idNumberOrPassport === 'string'
          ? meta.idNumberOrPassport
          : undefined,
    verification,
  }
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone, u.role,
            u.active, u.client_id, u.metadata,
            COALESCE(c.settings->>'frontend_id', c.id::text) AS agency_fe
     FROM users u
     LEFT JOIN clients c ON c.id = u.client_id
     WHERE lower(u.email) = lower($1)
     LIMIT 1`,
    [email.trim()],
  )
  return rows[0] ?? null
}

async function findUserById(id: string): Promise<UserRow | null> {
  const rows = await query<UserRow>(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone, u.role,
            u.active, u.client_id, u.metadata,
            COALESCE(c.settings->>'frontend_id', c.id::text) AS agency_fe
     FROM users u
     LEFT JOIN clients c ON c.id = u.client_id
     WHERE u.id = $1::uuid
     LIMIT 1`,
    [id],
  )
  return rows[0] ?? null
}

async function countUsers(): Promise<number> {
  const rows = await query<{ n: string }>('SELECT COUNT(*)::text AS n FROM users')
  return Number(rows[0]?.n ?? 0)
}

export function issueSession(c: Context, user: SessionUser): string {
  const token = signToken({
    sub: user.id,
    fe: user.frontendId,
    role: user.role,
    agency: user.agencyId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
  })
  setCookie(c, AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: TOKEN_TTL_SEC,
  })
  return token
}

export function clearSession(c: Context): void {
  deleteCookie(c, AUTH_COOKIE, { path: '/' })
}

export function readBearerOrCookie(c: Context): string | null {
  const auth = c.req.header('Authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim()
  return getCookie(c, AUTH_COOKIE) ?? null
}

export async function resolveSessionUser(c: Context): Promise<SessionUser | null> {
  const token = readBearerOrCookie(c)
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload) return null
  const row = await findUserById(payload.sub)
  if (!row || !row.active) return null
  return rowToSession(row)
}

/** Attach session actor headers for downstream persist gates when Authorization cookie present. */
export async function applySessionActorHeaders(c: Context): Promise<SessionUser | null> {
  const user = await resolveSessionUser(c)
  if (!user) return null
  // Mutate request headers via clone is hard in Hono; callers use session alongside parseDemoActor.
  return user
}

export type RegisterInput = {
  email: string
  password: string
  firstName?: string
  lastName?: string
  /** Fallback when first/last omitted */
  name?: string
  phone?: string
  role?: string
  profile?: Record<string, unknown>
  documents?: VerificationDocMeta[]
}

const LANDLORD_PORTFOLIO_PERMISSIONS = [
  'assets.view',
  'assets.manage',
  'listings.publish',
  'leads.view',
  'applications.view',
  'viewings.manage',
  'maintenance.view',
  'documents.view',
  'payments.view',
  'reports.view',
  'messages.manage',
  'portal.owner',
  'portal.tenant',
  'portal.contractor',
]

async function createLandlordPortfolio(opts: {
  first: string
  last: string
  shortId: string
}): Promise<{ clientUuid: string; agencyFeId: string }> {
  const agencyFeId = `ag-ll-${opts.shortId}`
  const clientUuid = await ensureUuid('agency', agencyFeId)
  const company = `${opts.first} ${opts.last} Portfolio`.trim()
  const slug = `ll-${opts.shortId}`
  await query(
    `INSERT INTO clients (id, company_name, subdomain, status, city, settings, updated_at)
     VALUES ($1::uuid, $2, $3, 'active', $4, $5::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       settings = clients.settings || EXCLUDED.settings,
       updated_at = NOW()`,
    [
      clientUuid,
      company || 'Landlord Portfolio',
      slug,
      '',
      JSON.stringify({
        frontend_id: agencyFeId,
        enabledPermissions: LANDLORD_PORTFOLIO_PERMISSIONS,
        portfolio: true,
      }),
    ],
  )
  return { clientUuid, agencyFeId }
}

export async function registerUser(input: RegisterInput): Promise<{ user: SessionUser; bootstrap: boolean }> {
  const email = input.email.trim().toLowerCase()
  if (!email || !email.includes('@')) {
    const err = new Error('Valid email is required') as Error & { status: number }
    err.status = 400
    throw err
  }
  if (!input.password || input.password.length < 8) {
    const err = new Error('Password must be at least 8 characters') as Error & { status: number }
    err.status = 400
    throw err
  }
  const existing = await findUserByEmail(email)
  if (existing) {
    const err = new Error('Email already registered') as Error & { status: number }
    err.status = 409
    throw err
  }

  const total = await countUsers()
  const bootstrap = total === 0
  if (!bootstrap && isReservedSuperAdminEmail(email)) {
    const err = new Error('This email address is reserved') as Error & { status: number }
    err.status = 403
    throw err
  }
  let roleFe = (input.role || 'tenant').trim()
  if (bootstrap) {
    roleFe = 'super_admin'
  } else {
    const allowedPublic = new Set(['tenant', 'landlord', 'contractor', 'applicant'])
    if (!allowedPublic.has(roleFe)) roleFe = 'tenant'
    if (roleFe === 'applicant') roleFe = 'tenant'
  }

  const firstFromInput = input.firstName?.trim()
  const lastFromInput = input.lastName?.trim()
  const split = splitName(input.name || email.split('@')[0] || 'User')
  const first = firstFromInput || split.first
  const last = lastFromInput || split.last || first
  if (!first || !last) {
    const err = new Error('First name and surname are required') as Error & { status: number }
    err.status = 400
    throw err
  }

  const phone = input.phone?.trim() || ''
  if (!bootstrap && !phone) {
    const err = new Error('Phone number is required') as Error & { status: number }
    err.status = 400
    throw err
  }

  const shortId = crypto.randomUUID().slice(0, 8)
  const feId = `u-${shortId}`
  const uuid = await ensureUuid('user', feId)
  const hash = await hashPassword(input.password)
  const dbRole = ROLE_TO_DB[roleFe] ?? 'END_USER'

  let clientId: string | null = null
  if (roleFe === 'landlord' && !bootstrap) {
    const portfolio = await createLandlordPortfolio({ first, last, shortId })
    clientId = portfolio.clientUuid
  }

  await query(
    `INSERT INTO users (
       id, client_id, email, password_hash, first_name, last_name, phone, role, active, metadata, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, TRUE, $9::jsonb, NOW()
     )`,
    [
      uuid,
      clientId,
      email,
      hash,
      first,
      last,
      phone || null,
      dbRole,
      JSON.stringify(buildRegisterMetadata(roleFe, feId, input)),
    ],
  )

  const row = await findUserById(uuid)
  if (!row) {
    const err = new Error('Registration failed') as Error & { status: number }
    err.status = 500
    throw err
  }
  return { user: await rowToSession(row), bootstrap }
}

function buildRegisterMetadata(
  roleFe: string,
  feId: string,
  input: RegisterInput,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    frontend_id: feId,
    frontend_role: roleFe,
    mustChangePassword: false,
  }
  if (roleFe === 'landlord' || roleFe === 'contractor') {
    const docs = Array.isArray(input.documents) ? input.documents : []
    base.verification = {
      status: 'pending',
      submittedAt: new Date().toISOString(),
      profile: input.profile ?? {},
      documents: docs,
    } satisfies VerificationMeta
    if (typeof input.profile?.company === 'string') base.company = input.profile.company
    if (typeof input.profile?.idNumberOrPassport === 'string') {
      base.idNumberOrPassport = input.profile.idNumberOrPassport
    }
  } else if (roleFe === 'tenant' || roleFe === 'applicant') {
    base.verification = { status: 'not_required' } satisfies VerificationMeta
  }
  return base
}

export async function updateUserVerification(opts: {
  frontendUserId: string
  status: 'approved' | 'rejected'
  rejectNote?: string
  reviewerFrontendId?: string | null
}): Promise<SessionUser> {
  const rows = await query<UserRow>(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.phone, u.role,
            u.active, u.client_id, u.metadata,
            COALESCE(c.settings->>'frontend_id', c.id::text) AS agency_fe
     FROM users u
     LEFT JOIN clients c ON c.id = u.client_id
     WHERE u.metadata->>'frontend_id' = $1
        OR u.id::text = $1
     LIMIT 1`,
    [opts.frontendUserId],
  )
  const row = rows[0]
  if (!row) {
    const err = new Error('User not found') as Error & { status: number }
    err.status = 404
    throw err
  }
  const meta = { ...(row.metadata ?? {}) } as Record<string, unknown>
  const prev =
    meta.verification && typeof meta.verification === 'object'
      ? (meta.verification as VerificationMeta)
      : ({ status: 'pending' } as VerificationMeta)
  meta.verification = applyVerificationDecision(prev, {
    status: opts.status,
    reviewedAt: new Date().toISOString(),
    reviewedBy: opts.reviewerFrontendId ?? null,
    rejectNote: opts.rejectNote,
  })
  await query(`UPDATE users SET metadata = $2::jsonb, updated_at = NOW() WHERE id = $1::uuid`, [
    row.id,
    JSON.stringify(meta),
  ])
  const refreshed = await findUserById(row.id)
  if (!refreshed) {
    const err = new Error('User not found after update') as Error & { status: number }
    err.status = 500
    throw err
  }
  return rowToSession(refreshed)
}

/**
 * Self-service password change (API mode). Checks the current password against
 * users.password_hash, stores the new hash and clears mustChangePassword. The
 * generic persist route never accepts passwordHash / password from non-super
 * actors, so this is the only non-admin way to change a password.
 */
export async function changeUserPassword(opts: {
  userUuid: string
  currentPassword: string
  newPassword: string
}): Promise<SessionUser> {
  const fail = (status: number, message: string) =>
    Object.assign(new Error(message), { status }) as Error & { status: number }
  if (!opts.newPassword || opts.newPassword.length < 8) {
    throw fail(400, 'New password must be at least 8 characters')
  }
  if (opts.newPassword === opts.currentPassword) {
    throw fail(400, 'New password must differ from the current one')
  }
  const row = await findUserById(opts.userUuid)
  if (!row || !row.active) throw fail(401, 'Not signed in')
  const ok = row.password_hash
    ? await verifyPassword(opts.currentPassword ?? '', row.password_hash)
    : false
  if (!ok) throw fail(401, 'Current password is incorrect')
  const hash = await hashPassword(opts.newPassword)
  await query(
    `UPDATE users
        SET password_hash = $2,
            metadata = COALESCE(metadata, '{}'::jsonb) || '{"mustChangePassword": false}'::jsonb,
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [row.id, hash],
  )
  const refreshed = await findUserById(row.id)
  if (!refreshed) throw fail(500, 'User not found after update')
  return rowToSession(refreshed)
}

export async function loginUser(email: string, password: string): Promise<SessionUser> {
  const row = await findUserByEmail(email)
  if (!row || !row.active) {
    const err = new Error('Invalid email or password') as Error & { status: number }
    err.status = 401
    throw err
  }
  const ok = await verifyPassword(password, row.password_hash)
  if (!ok) {
    const err = new Error('Invalid email or password') as Error & { status: number }
    err.status = 401
    throw err
  }
  return rowToSession(row)
}

export function sessionToPublic(user: SessionUser) {
  return {
    id: user.frontendId,
    email: user.email,
    name: user.name,
    role: user.role,
    agencyId: user.agencyId,
    phone: user.phone,
    active: user.active,
    enabledPermissions: user.enabledPermissions,
    licenseStatus: user.licenseStatus,
    mentorId: user.mentorId,
    commissionSharePct: user.commissionSharePct,
    company: user.company,
    idNumberOrPassport: user.idNumberOrPassport,
    verification: user.verification ?? undefined,
  }
}

export function actorFromSession(user: SessionUser): {
  userId: string
  role: import('../src/types/domain.js').Role
  agencyId: string | null
} {
  return {
    userId: user.frontendId,
    role: user.role as import('../src/types/domain.js').Role,
    agencyId: user.agencyId,
  }
}

export { AUTH_COOKIE, ACTOR_USER_HEADER, ACTOR_ROLE_HEADER, ACTOR_AGENCY_HEADER }
