/**
 * The property an email is about, for the property card (server/email/layout.ts).
 *
 * Emails name a property by whatever they have to hand — a unit, a listing
 * id, an application, a lease, a job, a payment, a viewing, or just the
 * notification's link — and this file finds the unit behind it, then loads
 * the card: title, "Suburb, City" (never the street), price, photo and where
 * "View property" goes.
 *
 * Photos: listing photos may still be data: URLs in the database, which mail
 * apps block, so emails never embed them. The card points at
 * /api/email/photo/<unit>, which serves a resized cover photo
 * (server/email/photoRoute.ts). A public listing's photo is served to anyone;
 * any other listing's photo only with the signature this file adds when it
 * builds the email for someone who is party to that property.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { query } from '../db.js'
import { isUuid, resolveFrontendId, resolveUuid } from '../entityMap.js'
import { isOccupiedAdvert } from '../../src/lib/occupiedAdvert.js'
import { appUrl, type PropertyCard } from './layout.js'

/** Unit status keys the marketplace shows (same list as the guest marketplace). */
const PUBLIC_UNIT_STATUS_KEYS = new Set(['PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE'])

/** Who is reading: decides where "View property" can go. */
export type CardAudience = 'staff' | 'landlord' | 'tenant' | 'public'

export type UnitRow = {
  id: string
  title: string | null
  unit_number: string | null
  building_name: string | null
  suburb: string | null
  city: string | null
  rent: string | null
  price: string | null
  listing_type: string | null
  status_config_key: string | null
  advertise_while_occupied: boolean | null
  available_from: string | null
  bedrooms: number | null
  bathrooms: string | null
  unit_images: unknown
  building_images: unknown
  agent_id: string | null
  landlord_id: string | null
  landlord_verification: string | null
}

const UNIT_SQL = `
SELECT u.id::text AS id, u.title, u.unit_number::text AS unit_number, b.name AS building_name,
       b.suburb, b.city, u.rent::text AS rent, u.price::text AS price, u.listing_type,
       u.status_config_key, u.advertise_while_occupied, u.available_from::text AS available_from,
       u.bedrooms, u.bathrooms::text AS bathrooms,
       u.images AS unit_images, b.images AS building_images,
       u.agent_id::text AS agent_id, b.landlord_id::text AS landlord_id,
       l.metadata->'verification'->>'status' AS landlord_verification
  FROM units u
  LEFT JOIN buildings b ON b.id = u.building_id
  LEFT JOIN users l ON l.id = b.landlord_id
 WHERE u.id = $1::uuid`

/** "R 8 500" — whole rands, space as the thousands separator. */
export function formatRand(amount: number): string {
  return `R ${Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
}

/** Rent per month for rentals, the asking price for sales. */
export function priceLabel(r: Pick<UnitRow, 'rent' | 'price' | 'listing_type'>): string | null {
  const rent = r.rent != null ? Number(r.rent) : NaN
  const price = r.price != null ? Number(r.price) : NaN
  const type = String(r.listing_type ?? '').toUpperCase()
  if (type === 'SALE' && price > 0) return formatRand(price)
  if (rent > 0) return `${formatRand(rent)} / month`
  if (price > 0) return formatRand(price)
  return null
}

/** Same rule as the public marketplace (isPubliclyListedForApplication). */
export function isPublicListing(r: UnitRow): boolean {
  const statusKey = String(r.status_config_key ?? '').toUpperCase()
  const occupied = isOccupiedAdvert({
    statusKey,
    listingType: r.listing_type,
    advertiseWhileOccupied: r.advertise_while_occupied,
    availableFrom: r.available_from,
  })
  if (!occupied && !PUBLIC_UNIT_STATUS_KEYS.has(statusKey)) return false
  if (String(r.listing_type ?? '').toUpperCase() === 'NOT_LISTED') return false
  if (r.landlord_verification === 'pending' || r.landlord_verification === 'rejected') return false
  return true
}

/** First photo of the unit, else of its building (any stored form: file link, https, data: URL). */
export function coverImageRef(r: Pick<UnitRow, 'unit_images' | 'building_images'>): string | null {
  for (const list of [r.unit_images, r.building_images]) {
    if (!Array.isArray(list)) continue
    for (const img of list) {
      const ref = typeof img === 'string' ? img : img && typeof img === 'object' ? String((img as { url?: unknown }).url ?? '') : ''
      if (ref.trim()) return ref.trim()
    }
  }
  return null
}

function photoKey(): string | null {
  const s = process.env.AUTH_SECRET?.trim()
  return s ? s : null
}

/** Signature that lets one email's recipient load one non-public listing's cover photo. */
export function photoSignature(unitUuid: string): string | null {
  const key = photoKey()
  if (!key) return null
  return createHmac('sha256', key).update(`email-photo:${unitUuid.toLowerCase()}`).digest('base64url').slice(0, 22)
}

export function photoSignatureValid(unitUuid: string, sig: string | null | undefined): boolean {
  const want = photoSignature(unitUuid)
  if (!want || !sig || sig.length !== want.length) return false
  return timingSafeEqual(Buffer.from(want), Buffer.from(sig))
}

/**
 * Absolute https link to the resized cover photo. `v` changes when the photo
 * does, so mail apps' image caches never show an old one. Null when the site
 * address is not https (a mail app would not load it anyway).
 */
export function coverPhotoUrl(unitUuid: string, imageRef: string, signed: boolean): string | null {
  const base = appUrl()
  if (!/^https:\/\//i.test(base)) return null
  const v = createHmac('sha256', 'v').update(imageRef).digest('hex').slice(0, 10)
  const sig = signed ? photoSignature(unitUuid) : null
  return `${base}/api/email/photo/${unitUuid}.jpg?v=${v}${sig ? `&s=${sig}` : ''}`
}

export async function loadUnit(unitUuid: string): Promise<UnitRow | null> {
  if (!isUuid(unitUuid)) return null
  const rows = await query<UnitRow>(UNIT_SQL, [unitUuid]).catch(() => [] as UnitRow[])
  return rows[0] ?? null
}

/** Front-end id used in /listing/:id and /workspace/properties/:id (the unit uuid also works there). */
async function listingId(unitUuid: string): Promise<string> {
  return (
    (await resolveFrontendId('property', unitUuid).catch(() => null)) ??
    (await resolveFrontendId('unit', unitUuid).catch(() => null)) ??
    unitUuid
  )
}

/** Card data for one unit, or null when it is unknown. */
export async function propertyCardForUnit(unitUuid: string, audience: CardAudience): Promise<PropertyCard | null> {
  const r = await loadUnit(unitUuid)
  if (!r) return null
  const isPublic = isPublicListing(r)
  const fe = await listingId(r.id)
  const title = r.title?.trim() || [r.building_name, r.unit_number].filter(Boolean).join(' ').trim() || 'Your property'
  const area = [r.suburb, r.city].map((x) => x?.trim()).filter(Boolean).join(', ')
  const facts = [
    r.bedrooms ? `${r.bedrooms} bed` : '',
    r.bathrooms && Number(r.bathrooms) > 0 ? `${Number(r.bathrooms)} bath` : '',
  ].filter(Boolean)
  const viewUrl = isPublic
    ? `/listing/${encodeURIComponent(fe)}`
    : audience === 'staff' || audience === 'landlord'
      ? `/workspace/properties/${encodeURIComponent(fe)}`
      : null
  return {
    title,
    area: [area, facts.join(' · ')].filter(Boolean).join(' · ') || null,
    price: priceLabel(r),
    imageUrl: cardImageUrl(r.id, coverImageRef(r), !isPublic),
    viewUrl,
  }
}

/**
 * Photos kept on this server (data: URLs, /api/files/…, the old bucket) go
 * through the resizing endpoint; a photo already hosted elsewhere on https is
 * linked as it is; anything else gets the no-photo panel.
 */
export function cardImageUrl(unitUuid: string, ref: string | null, signed: boolean): string | null {
  if (!ref) return null
  const ours =
    ref.startsWith('data:image') ||
    ref.startsWith('/api/files/') ||
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(ref) ||
    (ref.startsWith(appUrl()) && ref.includes('/api/files/'))
  if (ours) return coverPhotoUrl(unitUuid, ref, signed)
  return /^https:\/\//i.test(ref) ? ref : null
}

// ---------------------------------------------------------------------------
// Finding the unit behind a reference
// ---------------------------------------------------------------------------

/** Anything an email may know about the property it is about. */
export type PropertyRef = {
  unitUuid?: string | null
  /** Listing / property front-end id (PR-…) or unit id. */
  propertyId?: string | null
  applicationId?: string | null
  /** leases.id uuid, or the tenancy front-end id. */
  leaseId?: string | null
  ticketId?: string | null
  paymentId?: string | null
  /** A viewing (bookings row). */
  bookingId?: string | null
  /** A notification's link_path; parsed for the ids above. */
  linkPath?: string | null
}

/** The unit, plus the staff assigned to that piece of work (for email routing). */
export type ResolvedProperty = { unitUuid: string; assignedUserIds: string[] }

type Kind = 'property' | 'application' | 'lease' | 'ticket' | 'payment' | 'booking'

/** Ids a link carries, by kind. Exported for tests. */
export function idsFromLink(linkPath: string | null | undefined): Array<{ kind: Kind; id: string }> {
  const raw = String(linkPath ?? '').trim()
  if (!raw) return []
  let url: URL
  try {
    url = new URL(raw, 'https://x.invalid')
  } catch {
    return []
  }
  const out: Array<{ kind: Kind; id: string }> = []
  const seg = url.pathname.split('/').filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  })
  const after = (...path: string[]) => {
    for (let i = 0; i + path.length < seg.length; i++) {
      if (path.every((p, j) => seg[i + j] === p)) return seg[i + path.length]
    }
    return undefined
  }
  const q = (k: string) => url.searchParams.get(k)?.trim() || undefined
  const push = (kind: Kind, id: string | undefined) => {
    if (id && !['new', 'archive', 'edit'].includes(id)) out.push({ kind, id })
  }
  push('booking', q('booking'))
  push('lease', q('lease'))
  push('lease', q('tenancy'))
  push('ticket', q('ticket'))
  push('application', after('applications'))
  push('ticket', after('operations', 'maintenance'))
  push('payment', after('operations', 'payments'))
  push('property', after('viewings', 'property'))
  push('property', after('properties'))
  push('property', after('listing'))
  return out
}

const BY_KIND: Record<Exclude<Kind, 'property'>, { entity: 'application' | 'tenancy' | 'ticket' | 'payment' | 'viewing'; sql: string }> = {
  application: {
    entity: 'application',
    sql: `SELECT unit_id::text AS unit_id, agent_id::text AS agent_id FROM applications
           WHERE id = $1::uuid OR ($2::text IS NOT NULL AND (reference_code = $2 OR metadata->>'frontend_id' = $2)) LIMIT 1`,
  },
  lease: {
    entity: 'tenancy',
    sql: `SELECT unit_id::text AS unit_id, agent_id::text AS agent_id FROM leases WHERE id = $1::uuid LIMIT 1`,
  },
  ticket: {
    entity: 'ticket',
    sql: `SELECT unit_id::text AS unit_id, contractor_id::text AS agent_id FROM maintenance_tickets WHERE id = $1::uuid LIMIT 1`,
  },
  payment: {
    entity: 'payment',
    sql: `SELECT unit_id::text AS unit_id, NULL::text AS agent_id FROM payments WHERE id = $1::uuid LIMIT 1`,
  },
  booking: {
    entity: 'viewing',
    sql: `SELECT unit_id::text AS unit_id, agent_id::text AS agent_id FROM bookings WHERE id = $1::uuid LIMIT 1`,
  },
}

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

async function unitFor(kind: Kind, id: string): Promise<{ unit: string | null; agent: string | null }> {
  if (kind === 'property') {
    const uuid = isUuid(id) ? id : ((await resolveUuid('property', id).catch(() => null)) ?? (await resolveUuid('unit', id).catch(() => null)))
    return { unit: uuid, agent: null }
  }
  const spec = BY_KIND[kind]
  const uuid = isUuid(id) ? id : await resolveUuid(spec.entity, id).catch(() => null)
  const params = kind === 'application' ? [uuid ?? NIL_UUID, isUuid(id) ? null : id] : [uuid]
  if (!params[0]) return { unit: null, agent: null }
  const rows = await query<{ unit_id: string | null; agent_id: string | null }>(spec.sql, params).catch(() => [])
  return { unit: rows[0]?.unit_id ?? null, agent: rows[0]?.agent_id ?? null }
}

/** The unit behind a reference (first one that resolves), or null. */
export async function resolvePropertyRef(ref: PropertyRef): Promise<ResolvedProperty | null> {
  const tries: Array<{ kind: Kind; id: string }> = []
  if (ref.unitUuid) tries.push({ kind: 'property', id: ref.unitUuid })
  if (ref.leaseId) tries.push({ kind: 'lease', id: ref.leaseId })
  if (ref.applicationId) tries.push({ kind: 'application', id: ref.applicationId })
  if (ref.bookingId) tries.push({ kind: 'booking', id: ref.bookingId })
  if (ref.ticketId) tries.push({ kind: 'ticket', id: ref.ticketId })
  if (ref.paymentId) tries.push({ kind: 'payment', id: ref.paymentId })
  if (ref.propertyId) tries.push({ kind: 'property', id: ref.propertyId })
  tries.push(...idsFromLink(ref.linkPath))
  const assigned = new Set<string>()
  for (const t of tries) {
    const hit = await unitFor(t.kind, t.id)
    if (hit.agent) assigned.add(hit.agent)
    if (hit.unit) {
      const unit = await loadUnit(hit.unit)
      if (!unit) continue
      if (unit.agent_id) assigned.add(unit.agent_id)
      return { unitUuid: unit.id, assignedUserIds: [...assigned] }
    }
  }
  return null
}

/** Admin email previews render with a sample property instead of a database lookup. */
const sampleCard = new AsyncLocalStorage<PropertyCard>()
export function withSampleCard<T>(card: PropertyCard, fn: () => Promise<T>): Promise<T> {
  return sampleCard.run(card, fn)
}

/** Card for whatever the email is about; null when no property is involved. Never throws. */
export async function propertyCardFor(ref: PropertyRef, audience: CardAudience): Promise<PropertyCard | null> {
  const sample = sampleCard.getStore()
  if (sample) return sample
  try {
    const hit = await resolvePropertyRef(ref)
    return hit ? await propertyCardForUnit(hit.unitUuid, audience) : null
  } catch {
    return null
  }
}

/** Card audience from a database role (users.role) or front-end role. */
export function audienceForRole(role: string | null | undefined): CardAudience {
  const r = String(role ?? '').toUpperCase()
  if (r === 'LANDLORD') return 'landlord'
  if (['SUPER_ADMIN', 'AGENCY_ADMIN', 'AGENT_ADMIN', 'GROUND_AGENT', 'AGENT', 'CLIENT_ADMIN'].includes(r)) return 'staff'
  if (r === 'END_USER' || r === 'TENANT') return 'tenant'
  return 'public'
}
