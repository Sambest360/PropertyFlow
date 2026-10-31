/**
 * Public agency + contact-person details for listing pages, and the
 * self-service edits behind them.
 *
 *   Agency profile  clients.settings.publicProfile: phone, email, website,
 *                   office address, short description, logo. Only what the
 *                   agency typed here is public (clients.email / phone stay
 *                   internal). Agency admins (client_admin, agent_admin) edit
 *                   their own agency; super admins any. The agency name,
 *                   legal, billing and plan fields are not editable here.
 *   Profile photos  users.avatar_url, a /api/files link. Staff set their own;
 *                   agency admins with users.manage set their agency's staff;
 *                   super admins anyone's.
 *   Listing contact the unit's assigned agent (active staff of the same
 *                   agency), else the building's landlord. Name, role, photo
 *                   and phone only: never email, ID numbers or addresses.
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import type { DemoActor } from './actor.js'
import { isSafePhotoUrl } from '../src/lib/photoLimits.js'
import { websiteHref } from '../src/lib/contactLinks.js'

export type AgencyPublicProfile = {
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  description: string | null
  logoUrl: string | null
}

export type PublicListingContact = {
  agency: (AgencyPublicProfile & { name: string; area: string | null }) | null
  person: { name: string; role: string; photoUrl: string | null; phone: string | null } | null
}

const EMPTY_PROFILE: AgencyPublicProfile = {
  phone: null,
  email: null,
  website: null,
  address: null,
  description: null,
  logoUrl: null,
}

/** Agency roles that manage their own agency. */
export const AGENCY_ADMIN_ROLES: ReadonlySet<string> = new Set(['client_admin', 'agent_admin'])
/** Roles that may upload their own profile photo. */
export const PHOTO_SELF_ROLES: ReadonlySet<string> = new Set(['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'])
/** DB roles shown as a listing contact when assigned as the agent. */
const DB_STAFF_ROLES = ['AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT']
const DB_ROLE_LABEL: Record<string, string> = {
  AGENCY_ADMIN: 'Principal',
  AGENT_ADMIN: 'Agency administrator',
  GROUND_AGENT: 'Agent',
  LANDLORD: 'Owner',
}

const PHONE_RE = /^\+?[\d\s()-]{7,20}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function coded(status: number, code: string, message: string): Error {
  return Object.assign(new Error(message), { status, code })
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}

/** Stored settings.publicProfile → the public shape (junk dropped). */
export function readPublicProfile(raw: unknown): AgencyPublicProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_PROFILE }
  const r = raw as Record<string, unknown>
  const logo = typeof r.logoUrl === 'string' && isSafePhotoUrl(r.logoUrl) && !r.logoUrl.startsWith('data:') ? r.logoUrl : null
  return {
    phone: text(r.phone, 40),
    email: text(r.email, 190),
    website: text(r.website, 200),
    address: text(r.address, 300),
    description: text(r.description, 600),
    logoUrl: logo,
  }
}

/**
 * Validate an edit. Only contact fields are read: name, legal, billing and
 * plan keys in the body are ignored. Returns the fields to store (logo is
 * handled separately).
 */
export function cleanProfileEdit(body: Record<string, unknown>): Omit<AgencyPublicProfile, 'logoUrl'> {
  const phone = text(body.phone, 40)
  if (phone && !PHONE_RE.test(phone)) throw coded(400, 'BAD_PHONE', 'Use digits, spaces and an optional + for the phone number.')
  const email = text(body.email, 190)
  if (email && !EMAIL_RE.test(email)) throw coded(400, 'BAD_EMAIL', 'Enter a valid email address.')
  const websiteRaw = text(body.website, 200)
  const website = websiteRaw ? websiteHref(websiteRaw) : null
  if (websiteRaw && !website) throw coded(400, 'BAD_WEBSITE', 'Enter a valid website address.')
  return {
    phone,
    email,
    website: website ? website.replace(/\/$/, '') : null,
    address: text(body.address, 300),
    description: text(body.description, 600),
  }
}

async function actorUuid(actor: DemoActor): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/i.test(actor.userId)) return actor.userId
  return (await resolveUuid('user', actor.userId).catch(() => null)) ?? null
}

/** The actor's agency (client uuid) from their own user row, never from the request. */
async function actorClientUuid(actor: DemoActor): Promise<string | null> {
  const id = await actorUuid(actor)
  if (!id) return null
  const rows = await query<{ client_id: string | null }>(`SELECT client_id::text AS client_id FROM users WHERE id = $1::uuid`, [id])
  return rows[0]?.client_id ?? null
}

/** Client uuid for an agency frontend id or uuid (entity map, seed map, then settings.frontend_id). */
async function clientUuidFor(agencyId: string): Promise<string | null> {
  const mapped = await resolveUuid('agency', agencyId).catch(() => null)
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM clients WHERE id::text = $1 OR settings->>'frontend_id' = $2 LIMIT 1`,
    [mapped ?? agencyId, agencyId],
  )
  return rows[0]?.id ?? null
}

/** Who may edit this agency's public profile. */
export function canEditAgencyProfile(role: string, actorClient: string | null, targetClient: string): boolean {
  if (role === 'super_admin') return true
  return AGENCY_ADMIN_ROLES.has(role) && actorClient != null && actorClient === targetClient
}

/** Who may set this user's photo. */
export function canSetUserPhoto(
  actor: { role: string; uuid: string | null; clientId: string | null; usersManage: boolean },
  target: { id: string; clientId: string | null; dbRole: string },
): boolean {
  if (actor.role === 'super_admin') return true
  if (actor.uuid && actor.uuid === target.id) return PHOTO_SELF_ROLES.has(actor.role)
  return (
    AGENCY_ADMIN_ROLES.has(actor.role) &&
    actor.usersManage &&
    actor.clientId != null &&
    actor.clientId === target.clientId &&
    DB_STAFF_ROLES.includes(target.dbRole)
  )
}

/** Agency profile for the settings editor (staff of that agency, or super admin). */
export async function getAgencyProfile(actor: DemoActor, agencyId: string): Promise<AgencyPublicProfile & { name: string; canEdit: boolean }> {
  const clientId = await clientUuidFor(agencyId)
  if (!clientId) throw coded(404, 'AGENCY_NOT_FOUND', 'Agency not found')
  const mine = await actorClientUuid(actor)
  if (actor.role !== 'super_admin' && mine !== clientId) throw coded(403, 'FORBIDDEN', 'Not your agency')
  const rows = await query<{ company_name: string; trading_as: string | null; profile: unknown }>(
    `SELECT company_name, trading_as, settings->'publicProfile' AS profile FROM clients WHERE id = $1::uuid`,
    [clientId],
  )
  // Same name the listing cards show.
  const name = rows[0]?.trading_as?.trim() || rows[0]?.company_name || ''
  return { name, ...readPublicProfile(rows[0]?.profile), canEdit: canEditAgencyProfile(actor.role, mine, clientId) }
}

/**
 * Save contact details (and optionally the logo). `logo`: a data URL to
 * upload, null to remove, undefined to keep.
 */
export async function saveAgencyProfile(
  actor: DemoActor,
  agencyId: string,
  body: Record<string, unknown>,
  uploadPhoto: (dataUrl: string, folder: string) => Promise<string>,
): Promise<AgencyPublicProfile> {
  const clientId = await clientUuidFor(agencyId)
  if (!clientId) throw coded(404, 'AGENCY_NOT_FOUND', 'Agency not found')
  if (!canEditAgencyProfile(actor.role, await actorClientUuid(actor), clientId)) {
    throw coded(403, 'FORBIDDEN', 'Only an administrator of this agency can edit its details.')
  }
  const fields = cleanProfileEdit(body)
  const current = await query<{ profile: unknown }>(`SELECT settings->'publicProfile' AS profile FROM clients WHERE id = $1::uuid`, [clientId])
  let logoUrl = readPublicProfile(current[0]?.profile).logoUrl
  if (body.logo === null) logoUrl = null
  else if (typeof body.logo === 'string' && body.logo) {
    if (!body.logo.startsWith('data:image/')) throw coded(400, 'BAD_PHOTO', 'Upload the logo as an image file.')
    logoUrl = await uploadPhoto(body.logo, `agency/${clientId}/branding`)
  }
  const next: AgencyPublicProfile = { ...fields, logoUrl }
  await query(
    `UPDATE clients
        SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('publicProfile', $2::jsonb),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [clientId, JSON.stringify(next)],
  )
  return next
}

async function loadTarget(userId: string): Promise<{ id: string; clientId: string | null; dbRole: string; avatarUrl: string | null } | null> {
  const id = /^[0-9a-f-]{36}$/i.test(userId) ? userId : await resolveUuid('user', userId).catch(() => null)
  if (!id) return null
  const rows = await query<{ id: string; client_id: string | null; role: string; avatar_url: string | null }>(
    `SELECT id::text AS id, client_id::text AS client_id, role, avatar_url FROM users WHERE id = $1::uuid`,
    [id],
  )
  const r = rows[0]
  return r ? { id: r.id, clientId: r.client_id, dbRole: r.role, avatarUrl: r.avatar_url } : null
}

async function photoActor(actor: DemoActor, usersManage: () => Promise<boolean>) {
  const uuid = await actorUuid(actor)
  const clientId = await actorClientUuid(actor)
  const manage = AGENCY_ADMIN_ROLES.has(actor.role) ? await usersManage() : false
  return { role: actor.role, uuid, clientId, usersManage: manage }
}

/** Current photo of a user the actor may manage (self, own agency staff, super admin). */
export async function getUserPhoto(actor: DemoActor, userId: string, usersManage: () => Promise<boolean>): Promise<{ avatarUrl: string | null; canEdit: boolean }> {
  const target = await loadTarget(userId)
  if (!target) throw coded(404, 'USER_NOT_FOUND', 'User not found')
  const who = await photoActor(actor, usersManage)
  const canEdit = canSetUserPhoto(who, target)
  const sameAgency = who.clientId != null && who.clientId === target.clientId
  if (!canEdit && !sameAgency && actor.role !== 'super_admin') throw coded(403, 'FORBIDDEN', 'Not allowed')
  return { avatarUrl: target.avatarUrl, canEdit }
}

/** Set (data URL) or remove (null) a user's profile photo. */
export async function setUserPhoto(
  actor: DemoActor,
  userId: string,
  photo: unknown,
  usersManage: () => Promise<boolean>,
  uploadPhoto: (dataUrl: string, folder: string) => Promise<string>,
): Promise<{ avatarUrl: string | null }> {
  const target = await loadTarget(userId)
  if (!target) throw coded(404, 'USER_NOT_FOUND', 'User not found')
  if (!canSetUserPhoto(await photoActor(actor, usersManage), target)) {
    throw coded(403, 'FORBIDDEN', 'You can only change your own photo, or your agency staff’s photos as an agency administrator.')
  }
  let url: string | null = null
  if (photo !== null) {
    if (typeof photo !== 'string' || !photo.startsWith('data:image/')) throw coded(400, 'BAD_PHOTO', 'Upload the photo as an image file.')
    url = await uploadPhoto(photo, target.clientId ? `agency/${target.clientId}/avatars` : 'avatars')
  }
  await query(`UPDATE users SET avatar_url = $2, updated_at = NOW() WHERE id = $1::uuid`, [target.id, url])
  return { avatarUrl: url }
}

function storedPhoto(u: string | null): string | null {
  return u && isSafePhotoUrl(u) && !u.startsWith('data:') ? u : null
}

/**
 * Agency and contact person for one unit (the caller has already checked the
 * listing is public). Agent: active staff of the unit's own agency. Without
 * one, the building's landlord is the contact.
 */
export async function listingContactForUnit(unitId: string): Promise<PublicListingContact> {
  const units = await query<{ client_id: string | null; agent_id: string | null; landlord_id: string | null }>(
    `SELECT u.client_id::text AS client_id, u.agent_id::text AS agent_id, b.landlord_id::text AS landlord_id
       FROM units u LEFT JOIN buildings b ON b.id = u.building_id
      WHERE u.id = $1::uuid`,
    [unitId],
  )
  const unit = units[0]
  if (!unit?.client_id) return { agency: null, person: null }

  const clients = await query<{ company_name: string; trading_as: string | null; city: string | null; province: string | null; status: string; profile: unknown }>(
    `SELECT company_name, trading_as, city, province, status, settings->'publicProfile' AS profile FROM clients WHERE id = $1::uuid`,
    [unit.client_id],
  )
  const c = clients[0]
  const agency =
    c && ['active', 'trial'].includes(String(c.status).toLowerCase())
      ? {
          name: c.trading_as?.trim() || c.company_name,
          area: [c.city, c.province].filter((x) => x && x.trim()).join(', ') || null,
          ...readPublicProfile(c.profile),
        }
      : null

  type PersonRow = { first_name: string | null; last_name: string | null; role: string; phone: string | null; avatar_url: string | null }
  const personSql = `SELECT first_name, last_name, role, phone, avatar_url FROM users
                      WHERE id = $1::uuid AND active AND COALESCE(metadata->>'deletedAt', '') = ''`
  let row: PersonRow | undefined
  if (unit.agent_id) {
    row = (await query<PersonRow>(`${personSql} AND client_id = $2::uuid AND role = ANY($3::text[])`, [unit.agent_id, unit.client_id, DB_STAFF_ROLES]))[0]
  }
  if (!row && unit.landlord_id) {
    row = (await query<PersonRow>(`${personSql} AND role = 'LANDLORD'`, [unit.landlord_id]))[0]
  }
  const name = row ? `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() : ''
  const person =
    row && name
      ? {
          name,
          role: DB_ROLE_LABEL[row.role] ?? 'Agent',
          photoUrl: storedPhoto(row.avatar_url),
          phone: row.phone?.trim() || null,
        }
      : null
  return { agency, person }
}
