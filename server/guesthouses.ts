/**
 * Guest houses: short-stay, per-night bookings (Airbnb-style), migration 044.
 *
 * Unlike long-term rentals (application → lease), a guest picks dates and a
 * room, sees the full price up front, and books. Model, following how
 * short-stay systems (Airbnb, Booking.com, NightsBridge) work:
 *   - A guest house has rooms. Each room has a nightly rate (optional weekend
 *     rate for Fri/Sat nights), a cleaning fee, a guest cap and min/max nights.
 *   - A stay is [check_in, check_out): the check-out day is free for the next
 *     guest, so back-to-back bookings are allowed.
 *   - Instant book confirms at once. Otherwise the booking is a request that
 *     holds the dates for 24 h until the host accepts or declines; unanswered
 *     requests expire and release the dates.
 *   - Hosts block dates (maintenance, own use). Blocks and live bookings make
 *     a room unavailable; the overlap check runs under a row lock on the room
 *     so two guests cannot book the same night.
 *   - Price = nights x rate + cleaning fee + tourism levy (default 1%, the
 *     TOMSA levy many SA establishments add; hosts can set 0).
 *
 * Managers: super_admin (all), agency staff (their agency), landlords (their
 * own guest houses). Guests can book signed in or as a guest (name + email),
 * and look up / cancel a booking by reference + email.
 */
import { clientQuery, query, withTransaction } from './db.js'
import { resolveUuid } from './entityMap.js'
import { notifyUsers } from './supportDesk.js'
import type { DemoActor } from './actor.js'

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS guesthouses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID REFERENCES clients(id) ON DELETE CASCADE,
  owner_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  name                VARCHAR(160) NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  address             VARCHAR(300) NOT NULL DEFAULT '',
  suburb              VARCHAR(120),
  city                VARCHAR(120) NOT NULL DEFAULT '',
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  photos              JSONB NOT NULL DEFAULT '[]'::jsonb,
  amenities           TEXT[] NOT NULL DEFAULT '{}',
  house_rules         TEXT NOT NULL DEFAULT '',
  check_in_time       VARCHAR(5) NOT NULL DEFAULT '14:00',
  check_out_time      VARCHAR(5) NOT NULL DEFAULT '10:00',
  cancellation_policy VARCHAR(12) NOT NULL DEFAULT 'moderate'
                        CHECK (cancellation_policy IN ('flexible', 'moderate', 'strict')),
  instant_book        BOOLEAN NOT NULL DEFAULT FALSE,
  tourism_levy_pct    NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  contact_phone       VARCHAR(40),
  contact_email       VARCHAR(200),
  status              VARCHAR(12) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'published', 'paused')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guesthouses_status_city ON guesthouses (status, city);
CREATE INDEX IF NOT EXISTS idx_guesthouses_client ON guesthouses (client_id);
CREATE INDEX IF NOT EXISTS idx_guesthouses_owner ON guesthouses (owner_user_id);

CREATE TABLE IF NOT EXISTS guesthouse_rooms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guesthouse_id   UUID NOT NULL REFERENCES guesthouses(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  bed_setup       VARCHAR(120) NOT NULL DEFAULT '1 double bed',
  max_guests      INTEGER NOT NULL DEFAULT 2 CHECK (max_guests BETWEEN 1 AND 30),
  nightly_rate    NUMERIC(12,2) NOT NULL CHECK (nightly_rate >= 0),
  weekend_rate    NUMERIC(12,2) CHECK (weekend_rate >= 0),
  cleaning_fee    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cleaning_fee >= 0),
  min_nights      INTEGER NOT NULL DEFAULT 1 CHECK (min_nights >= 1),
  max_nights      INTEGER NOT NULL DEFAULT 30 CHECK (max_nights >= 1),
  photos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gh_rooms_house ON guesthouse_rooms (guesthouse_id);

CREATE TABLE IF NOT EXISTS guesthouse_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES guesthouse_rooms(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL CHECK (end_date > start_date),
  reason      VARCHAR(200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gh_blocks_room ON guesthouse_blocks (room_id, start_date);

CREATE TABLE IF NOT EXISTS guesthouse_bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       VARCHAR(16) NOT NULL UNIQUE,
  guesthouse_id   UUID NOT NULL REFERENCES guesthouses(id) ON DELETE CASCADE,
  room_id         UUID NOT NULL REFERENCES guesthouse_rooms(id) ON DELETE CASCADE,
  guest_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  guest_name      VARCHAR(160) NOT NULL,
  guest_email     VARCHAR(200) NOT NULL,
  guest_phone     VARCHAR(40),
  guests          INTEGER NOT NULL CHECK (guests >= 1),
  check_in        DATE NOT NULL,
  check_out       DATE NOT NULL CHECK (check_out > check_in),
  nights          INTEGER NOT NULL,
  accommodation   NUMERIC(12,2) NOT NULL,
  cleaning_fee    NUMERIC(12,2) NOT NULL DEFAULT 0,
  tourism_levy    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  status          VARCHAR(12) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'checked_in', 'completed', 'no_show', 'expired')),
  payment_status  VARCHAR(10) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'deposit', 'paid', 'refunded')),
  guest_message   TEXT,
  host_note       TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gh_bookings_room_dates ON guesthouse_bookings (room_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_gh_bookings_house ON guesthouse_bookings (guesthouse_id, check_in);
CREATE INDEX IF NOT EXISTS idx_gh_bookings_email ON guesthouse_bookings (lower(guest_email));`

let ready: Promise<void> | null = null
export function ensureGuesthouseTables(): Promise<void> {
  ready ??= query(SCHEMA_SQL).then(() => undefined).catch((e) => {
    ready = null
    throw e
  })
  return ready
}

function err(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

const STAFF = new Set(['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'])
const MANAGER_ROLES = new Set([...STAFF, 'landlord'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const POLICIES = ['flexible', 'moderate', 'strict'] as const
export const AMENITIES = [
  'wifi', 'parking', 'breakfast', 'pool', 'aircon', 'kitchen', 'braai', 'tv', 'workspace',
  'washing_machine', 'pet_friendly', 'wheelchair_access', 'backup_power', 'security', 'garden', 'sea_view',
] as const

function uuid(v: unknown, what: string): string {
  const s = String(v ?? '')
  if (!UUID_RE.test(s)) throw err(400, `Unknown ${what}`)
  return s
}

const str = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : fallback
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = num(v)
  if (n === null) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}
const money = (n: number) => Math.round(n * 100) / 100
const toDate = (v: Date | string): string =>
  typeof v === 'string' ? v.slice(0, 10) : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const today = () => new Date().toISOString().slice(0, 10)

function photoList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter((x) => /^https?:\/\//i.test(x) || x.startsWith('/'))
    .slice(0, 20)
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000)
}

/** Validated [checkIn, checkOut) or null when either is missing. */
export function parseStay(checkIn: unknown, checkOut: unknown): { checkIn: string; checkOut: string; nights: number } | null {
  const a = String(checkIn ?? '')
  const b = String(checkOut ?? '')
  if (!a && !b) return null
  if (!DATE_RE.test(a) || !DATE_RE.test(b)) throw err(400, 'Choose check-in and check-out dates')
  const nights = nightsBetween(a, b)
  if (!(nights >= 1)) throw err(400, 'Check-out must be after check-in')
  if (nights > 365) throw err(400, 'Stays are limited to 365 nights')
  return { checkIn: a, checkOut: b, nights }
}

export type Quote = {
  nights: number
  nightly: Array<{ date: string; rate: number }>
  accommodation: number
  cleaningFee: number
  tourismLevy: number
  total: number
}

/** Fri and Sat nights use the weekend rate when one is set. */
export function quoteStay(
  room: { nightlyRate: number; weekendRate: number | null; cleaningFee: number },
  levyPct: number,
  checkIn: string,
  nights: number,
): Quote {
  const nightly: Quote['nightly'] = []
  const start = Date.parse(`${checkIn}T00:00:00Z`)
  for (let i = 0; i < nights; i++) {
    const d = new Date(start + i * 86_400_000)
    const dow = d.getUTCDay()
    const weekend = dow === 5 || dow === 6
    nightly.push({ date: d.toISOString().slice(0, 10), rate: weekend && room.weekendRate != null ? room.weekendRate : room.nightlyRate })
  }
  const accommodation = money(nightly.reduce((s, n) => s + n.rate, 0))
  const tourismLevy = money((accommodation * levyPct) / 100)
  const cleaningFee = money(room.cleaningFee)
  return { nights, nightly, accommodation, cleaningFee, tourismLevy, total: money(accommodation + cleaningFee + tourismLevy) }
}

/** What the guest gets back when they cancel, by policy and days before check-in. */
export function refundPercent(policy: (typeof POLICIES)[number], checkIn: string, now = new Date()): number {
  const hours = (Date.parse(`${checkIn}T14:00:00Z`) - now.getTime()) / 3_600_000
  if (policy === 'flexible') return hours >= 24 ? 100 : 0
  if (policy === 'moderate') return hours >= 5 * 24 ? 100 : hours >= 24 ? 50 : 0
  return hours >= 14 * 24 ? 100 : hours >= 7 * 24 ? 50 : 0
}

export const POLICY_TEXT: Record<(typeof POLICIES)[number], string> = {
  flexible: 'Full refund up to 24 hours before check-in.',
  moderate: 'Full refund up to 5 days before check-in, 50% up to 24 hours before.',
  strict: 'Full refund up to 14 days before check-in, 50% up to 7 days before.',
}

// ---------------------------------------------------------------- rows

type HouseRow = {
  id: string
  client_id: string | null
  owner_user_id: string | null
  owner_name: string | null
  name: string
  description: string
  address: string
  suburb: string | null
  city: string
  latitude: number | null
  longitude: number | null
  photos: unknown
  amenities: string[]
  house_rules: string
  check_in_time: string
  check_out_time: string
  cancellation_policy: (typeof POLICIES)[number]
  instant_book: boolean
  tourism_levy_pct: string
  contact_phone: string | null
  contact_email: string | null
  status: 'draft' | 'published' | 'paused'
  created_at: Date
}
type RoomRow = {
  id: string
  guesthouse_id: string
  name: string
  description: string
  bed_setup: string
  max_guests: number
  nightly_rate: string
  weekend_rate: string | null
  cleaning_fee: string
  min_nights: number
  max_nights: number
  photos: unknown
  active: boolean
  sort_order: number
}

export type Room = {
  id: string
  guesthouseId: string
  name: string
  description: string
  bedSetup: string
  maxGuests: number
  nightlyRate: number
  weekendRate: number | null
  cleaningFee: number
  minNights: number
  maxNights: number
  photos: string[]
  active: boolean
}
export type Guesthouse = {
  id: string
  name: string
  description: string
  address: string
  suburb: string | null
  city: string
  latitude: number | null
  longitude: number | null
  photos: string[]
  amenities: string[]
  houseRules: string
  checkInTime: string
  checkOutTime: string
  cancellationPolicy: (typeof POLICIES)[number]
  cancellationText: string
  instantBook: boolean
  tourismLevyPct: number
  contactPhone: string | null
  contactEmail: string | null
  status: 'draft' | 'published' | 'paused'
  hostName: string | null
  fromPrice: number | null
  maxGuests: number
  roomCount: number
  createdAt: string
}

const HOUSE_SELECT = `SELECT g.id::text AS id, g.client_id::text AS client_id, g.owner_user_id::text AS owner_user_id,
    NULLIF(TRIM(CONCAT_WS(' ', o.first_name, o.last_name)), '') AS owner_name,
    g.name, g.description, g.address, g.suburb, g.city, g.latitude, g.longitude, g.photos, g.amenities,
    g.house_rules, g.check_in_time, g.check_out_time, g.cancellation_policy, g.instant_book,
    g.tourism_levy_pct::text AS tourism_levy_pct, g.contact_phone, g.contact_email, g.status, g.created_at
  FROM guesthouses g LEFT JOIN users o ON o.id = g.owner_user_id`
const ROOM_SELECT = `SELECT id::text AS id, guesthouse_id::text AS guesthouse_id, name, description, bed_setup, max_guests,
    nightly_rate::text AS nightly_rate, weekend_rate::text AS weekend_rate, cleaning_fee::text AS cleaning_fee,
    min_nights, max_nights, photos, active, sort_order
  FROM guesthouse_rooms`

function toRoom(r: RoomRow): Room {
  return {
    id: r.id,
    guesthouseId: r.guesthouse_id,
    name: r.name,
    description: r.description,
    bedSetup: r.bed_setup,
    maxGuests: r.max_guests,
    nightlyRate: Number(r.nightly_rate),
    weekendRate: r.weekend_rate == null ? null : Number(r.weekend_rate),
    cleaningFee: Number(r.cleaning_fee),
    minNights: r.min_nights,
    maxNights: r.max_nights,
    photos: photoList(r.photos),
    active: r.active,
  }
}

function toHouse(h: HouseRow, rooms: Room[]): Guesthouse {
  const live = rooms.filter((r) => r.active)
  return {
    id: h.id,
    name: h.name,
    description: h.description,
    address: h.address,
    suburb: h.suburb,
    city: h.city,
    latitude: h.latitude,
    longitude: h.longitude,
    photos: photoList(h.photos),
    amenities: h.amenities ?? [],
    houseRules: h.house_rules,
    checkInTime: h.check_in_time,
    checkOutTime: h.check_out_time,
    cancellationPolicy: h.cancellation_policy,
    cancellationText: POLICY_TEXT[h.cancellation_policy] ?? '',
    instantBook: h.instant_book,
    tourismLevyPct: Number(h.tourism_levy_pct),
    contactPhone: h.contact_phone,
    contactEmail: h.contact_email,
    status: h.status,
    hostName: h.owner_name,
    fromPrice: live.length ? Math.min(...live.map((r) => r.nightlyRate)) : null,
    maxGuests: live.reduce((m, r) => Math.max(m, r.maxGuests), 0),
    roomCount: live.length,
    createdAt: new Date(h.created_at).toISOString(),
  }
}

async function roomsFor(houseIds: string[]): Promise<Map<string, Room[]>> {
  const out = new Map<string, Room[]>()
  if (!houseIds.length) return out
  const rows = await query<RoomRow>(`${ROOM_SELECT} WHERE guesthouse_id = ANY($1::uuid[]) ORDER BY sort_order, created_at`, [houseIds])
  for (const r of rows) {
    const list = out.get(r.guesthouse_id) ?? []
    list.push(toRoom(r))
    out.set(r.guesthouse_id, list)
  }
  return out
}

/** Pending requests past their hold release their dates. */
async function expireStale(): Promise<void> {
  await query(`UPDATE guesthouse_bookings SET status = 'expired', updated_at = NOW()
                WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()`)
}

const LIVE_BOOKING = `(b.status IN ('confirmed', 'checked_in') OR (b.status = 'pending' AND (b.expires_at IS NULL OR b.expires_at > NOW())))`

/** Room ids (of the given) with a booking or block overlapping [checkIn, checkOut). */
async function busyRooms(roomIds: string[], checkIn: string, checkOut: string): Promise<Set<string>> {
  if (!roomIds.length) return new Set()
  const rows = await query<{ room_id: string }>(
    `SELECT b.room_id::text AS room_id FROM guesthouse_bookings b
      WHERE b.room_id = ANY($1::uuid[]) AND ${LIVE_BOOKING} AND b.check_in < $3::date AND b.check_out > $2::date
     UNION
     SELECT k.room_id::text FROM guesthouse_blocks k
      WHERE k.room_id = ANY($1::uuid[]) AND k.start_date < $3::date AND k.end_date > $2::date`,
    [roomIds, checkIn, checkOut],
  )
  return new Set(rows.map((r) => r.room_id))
}

// ---------------------------------------------------------------- public

export async function listPublicGuesthouses(q: Record<string, string | undefined>): Promise<{
  items: Array<Guesthouse & { availableRooms: number | null; stayQuote: Quote | null }>
}> {
  await ensureGuesthouseTables()
  await expireStale()
  const stay = parseStay(q.checkIn, q.checkOut)
  if (stay && stay.checkIn < today()) throw err(400, 'Check-in date has passed')
  const guests = int(q.guests, 1, 30, 1)
  const params: unknown[] = []
  let where = `g.status = 'published'`
  const area = str(q.q ?? q.city, 120)
  if (area) {
    params.push(`%${area.toLowerCase()}%`)
    where += ` AND (lower(g.city) LIKE $${params.length} OR lower(COALESCE(g.suburb, '')) LIKE $${params.length} OR lower(g.name) LIKE $${params.length})`
  }
  const houses = await query<HouseRow>(`${HOUSE_SELECT} WHERE ${where} ORDER BY g.created_at DESC LIMIT 200`, params)
  const rooms = await roomsFor(houses.map((h) => h.id))
  const items: Array<Guesthouse & { availableRooms: number | null; stayQuote: Quote | null }> = []
  for (const h of houses) {
    const live = (rooms.get(h.id) ?? []).filter((r) => r.active)
    if (!live.length) continue
    const fits = live.filter((r) => r.maxGuests >= guests)
    if (!fits.length) continue
    let availableRooms: number | null = null
    let stayQuote: Quote | null = null
    if (stay) {
      const busy = await busyRooms(fits.map((r) => r.id), stay.checkIn, stay.checkOut)
      const open = fits.filter((r) => !busy.has(r.id) && stay.nights >= r.minNights && stay.nights <= r.maxNights)
      if (!open.length) continue
      availableRooms = open.length
      const cheapest = open.map((r) => quoteStay(r, Number(h.tourism_levy_pct), stay.checkIn, stay.nights)).sort((a, b) => a.total - b.total)[0]
      stayQuote = cheapest
    }
    items.push({ ...toHouse(h, live), contactPhone: null, contactEmail: null, availableRooms, stayQuote })
  }
  const sort = q.sort
  if (sort === 'price_asc') items.sort((a, b) => (a.fromPrice ?? 0) - (b.fromPrice ?? 0))
  if (sort === 'price_desc') items.sort((a, b) => (b.fromPrice ?? 0) - (a.fromPrice ?? 0))
  return { items }
}

export type RoomAvailability = Room & {
  available: boolean | null
  reason: string | null
  quote: Quote | null
  /** Taken nights over the next 12 months as [from, to) ranges. */
  unavailable: Array<{ from: string; to: string }>
}

export async function getPublicGuesthouse(id: string, q: Record<string, string | undefined>): Promise<Guesthouse & { rooms: RoomAvailability[] }> {
  await ensureGuesthouseTables()
  await expireStale()
  const hid = uuid(id, 'guest house')
  const rows = await query<HouseRow>(`${HOUSE_SELECT} WHERE g.id = $1::uuid AND g.status = 'published'`, [hid])
  if (!rows[0]) throw err(404, 'Guest house not found')
  const live = ((await roomsFor([hid])).get(hid) ?? []).filter((r) => r.active)
  const stay = parseStay(q.checkIn, q.checkOut)
  const guests = int(q.guests, 1, 30, 1)
  const busy = stay ? await busyRooms(live.map((r) => r.id), stay.checkIn, stay.checkOut) : new Set<string>()
  const ranges = await takenRanges(live.map((r) => r.id))
  const levy = Number(rows[0].tourism_levy_pct)
  const out: RoomAvailability[] = live.map((r) => {
    let available: boolean | null = null
    let reason: string | null = null
    let quote: Quote | null = null
    if (stay) {
      quote = quoteStay(r, levy, stay.checkIn, stay.nights)
      if (stay.checkIn < today()) reason = 'Check-in date has passed'
      else if (busy.has(r.id)) reason = 'Booked for some of these nights'
      else if (stay.nights < r.minNights) reason = `Minimum stay is ${r.minNights} nights`
      else if (stay.nights > r.maxNights) reason = `Maximum stay is ${r.maxNights} nights`
      else if (guests > r.maxGuests) reason = `Sleeps up to ${r.maxGuests}`
      available = reason === null
    }
    return { ...r, available, reason, quote, unavailable: ranges.get(r.id) ?? [] }
  })
  return { ...toHouse(rows[0], live), contactPhone: null, contactEmail: null, rooms: out }
}

async function takenRanges(roomIds: string[]): Promise<Map<string, Array<{ from: string; to: string }>>> {
  const out = new Map<string, Array<{ from: string; to: string }>>()
  if (!roomIds.length) return out
  const rows = await query<{ room_id: string; s: Date | string; e: Date | string }>(
    `SELECT b.room_id::text AS room_id, b.check_in AS s, b.check_out AS e FROM guesthouse_bookings b
      WHERE b.room_id = ANY($1::uuid[]) AND ${LIVE_BOOKING} AND b.check_out > CURRENT_DATE AND b.check_in < CURRENT_DATE + 400
     UNION ALL
     SELECT k.room_id::text, k.start_date, k.end_date FROM guesthouse_blocks k
      WHERE k.room_id = ANY($1::uuid[]) AND k.end_date > CURRENT_DATE AND k.start_date < CURRENT_DATE + 400
     ORDER BY 2`,
    [roomIds],
  )
  for (const r of rows) {
    const list = out.get(r.room_id) ?? []
    list.push({ from: toDate(r.s), to: toDate(r.e) })
    out.set(r.room_id, list)
  }
  return out
}

function newReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = 'GH-'
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

async function actorUuid(actor: DemoActor | null): Promise<string | null> {
  if (!actor?.userId) return null
  if (UUID_RE.test(actor.userId)) return actor.userId
  return (await resolveUuid('user' as never, actor.userId).catch(() => null)) ?? null
}

export type GuestBooking = {
  id: string
  reference: string
  guesthouseId: string
  guesthouseName: string
  city: string
  roomId: string
  roomName: string
  guestName: string
  guestEmail: string
  guestPhone: string | null
  guests: number
  checkIn: string
  checkOut: string
  nights: number
  accommodation: number
  cleaningFee: number
  tourismLevy: number
  total: number
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'checked_in' | 'completed' | 'no_show' | 'expired'
  paymentStatus: 'unpaid' | 'deposit' | 'paid' | 'refunded'
  guestMessage: string | null
  hostNote: string | null
  expiresAt: string | null
  checkInTime: string
  checkOutTime: string
  cancellationPolicy: (typeof POLICIES)[number]
  createdAt: string
}

type BookingRow = {
  id: string
  reference: string
  guesthouse_id: string
  guesthouse_name: string
  city: string
  room_id: string
  room_name: string
  guest_name: string
  guest_email: string
  guest_phone: string | null
  guests: number
  check_in: Date | string
  check_out: Date | string
  nights: number
  accommodation: string
  cleaning_fee: string
  tourism_levy: string
  total: string
  status: GuestBooking['status']
  payment_status: GuestBooking['paymentStatus']
  guest_message: string | null
  host_note: string | null
  expires_at: Date | null
  check_in_time: string
  check_out_time: string
  cancellation_policy: GuestBooking['cancellationPolicy']
  created_at: Date
  client_id: string | null
  owner_user_id: string | null
  guest_user_id: string | null
}

const BOOKING_SELECT = `SELECT b.id::text AS id, b.reference, b.guesthouse_id::text AS guesthouse_id, g.name AS guesthouse_name, g.city,
    b.room_id::text AS room_id, r.name AS room_name, b.guest_name, b.guest_email, b.guest_phone, b.guests,
    b.check_in, b.check_out, b.nights, b.accommodation::text AS accommodation, b.cleaning_fee::text AS cleaning_fee,
    b.tourism_levy::text AS tourism_levy, b.total::text AS total, b.status, b.payment_status, b.guest_message, b.host_note,
    b.expires_at, g.check_in_time, g.check_out_time, g.cancellation_policy, b.created_at,
    g.client_id::text AS client_id, g.owner_user_id::text AS owner_user_id, b.guest_user_id::text AS guest_user_id
  FROM guesthouse_bookings b
  JOIN guesthouses g ON g.id = b.guesthouse_id
  JOIN guesthouse_rooms r ON r.id = b.room_id`

function toBooking(r: BookingRow, forGuest = false): GuestBooking {
  return {
    id: r.id,
    reference: r.reference,
    guesthouseId: r.guesthouse_id,
    guesthouseName: r.guesthouse_name,
    city: r.city,
    roomId: r.room_id,
    roomName: r.room_name,
    guestName: r.guest_name,
    guestEmail: r.guest_email,
    guestPhone: r.guest_phone,
    guests: r.guests,
    checkIn: toDate(r.check_in),
    checkOut: toDate(r.check_out),
    nights: r.nights,
    accommodation: Number(r.accommodation),
    cleaningFee: Number(r.cleaning_fee),
    tourismLevy: Number(r.tourism_levy),
    total: Number(r.total),
    status: r.status,
    paymentStatus: r.payment_status,
    guestMessage: r.guest_message,
    hostNote: forGuest && !['declined', 'cancelled', 'confirmed'].includes(r.status) ? null : r.host_note,
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    checkInTime: r.check_in_time,
    checkOutTime: r.check_out_time,
    cancellationPolicy: r.cancellation_policy,
    createdAt: new Date(r.created_at).toISOString(),
  }
}

async function hostRecipients(clientId: string | null, ownerId: string | null): Promise<string[]> {
  const out: string[] = []
  if (ownerId) out.push(ownerId)
  if (clientId) {
    const rows = await query<{ id: string }>(
      `SELECT id::text AS id FROM users WHERE client_id = $1::uuid AND role IN ('CLIENT_ADMIN', 'AGENT_ADMIN') LIMIT 20`,
      [clientId],
    ).catch(() => [])
    out.push(...rows.map((r) => r.id))
  }
  return out
}

export async function createGuestBooking(actor: DemoActor | null, body: Record<string, unknown>): Promise<GuestBooking> {
  await ensureGuesthouseTables()
  await expireStale()
  const roomId = uuid(body.roomId, 'room')
  const stay = parseStay(body.checkIn, body.checkOut)
  if (!stay) throw err(400, 'Choose check-in and check-out dates')
  if (stay.checkIn < today()) throw err(400, 'Check-in date has passed')
  const guests = int(body.guests, 1, 30, 1)
  const name = str(body.guestName, 160)
  const email = str(body.guestEmail, 200).toLowerCase()
  const phone = str(body.guestPhone, 40) || null
  if (name.length < 2) throw err(400, 'Enter your full name')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err(400, 'Enter a valid email address')
  const message = str(body.message, 2000) || null
  const guestUser = await actorUuid(actor)

  const created = await withTransaction(async (client) => {
    const roomRows = await clientQuery<RoomRow & { status: string; levy: string; instant_book: boolean; client_id: string | null; owner_user_id: string | null; house_name: string }>(
      client,
      `SELECT r.id::text AS id, r.guesthouse_id::text AS guesthouse_id, r.name, r.description, r.bed_setup, r.max_guests,
              r.nightly_rate::text AS nightly_rate, r.weekend_rate::text AS weekend_rate, r.cleaning_fee::text AS cleaning_fee,
              r.min_nights, r.max_nights, r.photos, r.active, r.sort_order,
              g.status, g.tourism_levy_pct::text AS levy, g.instant_book, g.client_id::text AS client_id,
              g.owner_user_id::text AS owner_user_id, g.name AS house_name
         FROM guesthouse_rooms r JOIN guesthouses g ON g.id = r.guesthouse_id
        WHERE r.id = $1::uuid
          FOR UPDATE OF r`,
      [roomId],
    )
    const row = roomRows[0]
    if (!row || row.status !== 'published' || !row.active) throw err(404, 'This room is not taking bookings')
    const room = toRoom(row)
    if (guests > room.maxGuests) throw err(400, `This room sleeps up to ${room.maxGuests}`)
    if (stay.nights < room.minNights) throw err(400, `Minimum stay is ${room.minNights} nights`)
    if (stay.nights > room.maxNights) throw err(400, `Maximum stay is ${room.maxNights} nights`)
    const clash = await clientQuery<{ n: number }>(
      client,
      `SELECT COUNT(*)::int AS n FROM (
         SELECT 1 FROM guesthouse_bookings b WHERE b.room_id = $1::uuid AND ${LIVE_BOOKING} AND b.check_in < $3::date AND b.check_out > $2::date
         UNION ALL
         SELECT 1 FROM guesthouse_blocks k WHERE k.room_id = $1::uuid AND k.start_date < $3::date AND k.end_date > $2::date) x`,
      [roomId, stay.checkIn, stay.checkOut],
    )
    if ((clash[0]?.n ?? 0) > 0) throw err(409, 'Those dates were just booked. Choose other dates.')
    const quote = quoteStay(room, Number(row.levy), stay.checkIn, stay.nights)
    const status = row.instant_book ? 'confirmed' : 'pending'
    let id = ''
    for (let attempt = 0; attempt < 5 && !id; attempt++) {
      const ins = await clientQuery<{ id: string }>(
        client,
        `INSERT INTO guesthouse_bookings (reference, guesthouse_id, room_id, guest_user_id, guest_name, guest_email, guest_phone, guests,
            check_in, check_out, nights, accommodation, cleaning_fee, tourism_levy, total, status, guest_message, expires_at)
         VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9::date, $10::date, $11, $12, $13, $14, $15, $16::text, $17,
                 CASE WHEN $16::text = 'pending' THEN NOW() + INTERVAL '24 hours' ELSE NULL END)
         ON CONFLICT (reference) DO NOTHING RETURNING id::text AS id`,
        [newReference(), row.guesthouse_id, roomId, guestUser, name, email, phone, guests, stay.checkIn, stay.checkOut, stay.nights,
          quote.accommodation, quote.cleaningFee, quote.tourismLevy, quote.total, status, message],
      )
      id = ins[0]?.id ?? ''
    }
    if (!id) throw err(500, 'Could not create the booking. Try again.')
    return { id, status, clientId: row.client_id, ownerId: row.owner_user_id, houseName: row.house_name }
  })

  const recipients = await hostRecipients(created.clientId, created.ownerId)
  await notifyUsers(recipients, {
    clientId: created.clientId,
    title: created.status === 'pending' ? `Booking request: ${created.houseName}` : `New booking: ${created.houseName}`,
    body: `${name} · ${stay.checkIn} to ${stay.checkOut} · ${guests} guest${guests === 1 ? '' : 's'}`,
    link: '/workspace/guesthouses?tab=bookings',
    resource: 'guesthouse_booking',
    action: 'created',
  }).catch(() => 0)
  const out = await query<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1::uuid`, [created.id])
  return toBooking(out[0], true)
}

export async function lookupGuestBooking(reference: string, email: string): Promise<GuestBooking> {
  await ensureGuesthouseTables()
  await expireStale()
  const rows = await query<BookingRow>(
    `${BOOKING_SELECT} WHERE upper(b.reference) = upper($1) AND lower(b.guest_email) = lower($2)`,
    [str(reference, 16), str(email, 200)],
  )
  if (!rows[0]) throw err(404, 'No booking matches that reference and email')
  return toBooking(rows[0], true)
}

export async function myGuestBookings(actor: DemoActor): Promise<GuestBooking[]> {
  await ensureGuesthouseTables()
  await expireStale()
  const me = await actorUuid(actor)
  if (!me) throw err(401, 'Sign in first')
  const rows = await query<BookingRow>(
    `${BOOKING_SELECT} WHERE b.guest_user_id = $1::uuid
      ORDER BY b.check_in DESC LIMIT 200`,
    [me],
  )
  return rows.map((r) => toBooking(r, true))
}

export async function cancelGuestBooking(reference: string, email: string): Promise<GuestBooking & { refundPercent: number }> {
  const b = await lookupGuestBooking(reference, email)
  if (!['pending', 'confirmed'].includes(b.status)) throw err(400, 'This booking can no longer be cancelled')
  const pct = b.status === 'pending' ? 100 : refundPercent(b.cancellationPolicy, b.checkIn)
  await query(
    `UPDATE guesthouse_bookings SET status = 'cancelled', updated_at = NOW(),
       host_note = CONCAT_WS(E'\\n', host_note, $2::text) WHERE id = $1::uuid`,
    [b.id, `Cancelled by guest (${pct}% refund under policy)`],
  )
  const meta = await query<{ client_id: string | null; owner_user_id: string | null }>(
    `SELECT client_id::text AS client_id, owner_user_id::text AS owner_user_id FROM guesthouses WHERE id = $1::uuid`,
    [b.guesthouseId],
  )
  await notifyUsers(await hostRecipients(meta[0]?.client_id ?? null, meta[0]?.owner_user_id ?? null), {
    clientId: meta[0]?.client_id ?? null,
    title: `Booking cancelled: ${b.reference}`,
    body: `${b.guestName} cancelled ${b.checkIn} to ${b.checkOut}`,
    link: '/workspace/guesthouses?tab=bookings',
    resource: 'guesthouse_booking',
    action: 'cancelled',
  }).catch(() => 0)
  return { ...(await lookupGuestBooking(reference, email)), refundPercent: pct }
}

// ---------------------------------------------------------------- management

type Me = { id: string; role: string; clientId: string | null }

async function manager(actor: DemoActor): Promise<Me> {
  if (!MANAGER_ROLES.has(actor.role)) throw err(403, 'Only agencies and landlords manage guest houses')
  const id = await actorUuid(actor)
  if (!id) throw err(401, 'Sign in first')
  const rows = await query<{ client_id: string | null; focus: string | null }>(
    `SELECT client_id::text AS client_id, metadata->>'landlordFocus' AS focus FROM users WHERE id = $1::uuid`,
    [id],
  )
  if (actor.role === 'landlord' && rows[0]?.focus === 'rentals') {
    throw err(403, 'Your account is set up for rentals and sales only. Ask support to add guest houses.')
  }
  return { id, role: actor.role, clientId: rows[0]?.client_id ?? null }
}

/** SQL predicate on alias g limiting rows to what this manager may see. */
function scope(me: Me, params: unknown[]): string {
  if (me.role === 'super_admin') return 'TRUE'
  if (me.role === 'landlord') {
    params.push(me.id)
    return `g.owner_user_id = $${params.length}::uuid`
  }
  if (!me.clientId) {
    params.push(me.id)
    return `g.owner_user_id = $${params.length}::uuid`
  }
  params.push(me.clientId)
  return `g.client_id = $${params.length}::uuid`
}

async function ownedHouse(me: Me, id: string): Promise<HouseRow> {
  const params: unknown[] = [uuid(id, 'guest house')]
  const rows = await query<HouseRow>(`${HOUSE_SELECT} WHERE g.id = $1::uuid AND ${scope(me, params)}`, params)
  if (!rows[0]) throw err(404, 'Guest house not found')
  return rows[0]
}

export type ManagedSummary = Guesthouse & {
  upcoming: number
  pendingRequests: number
  occupancy30: number
  revenue30: number
}

export async function listManagedGuesthouses(actor: DemoActor): Promise<ManagedSummary[]> {
  await ensureGuesthouseTables()
  await expireStale()
  const me = await manager(actor)
  const params: unknown[] = []
  const houses = await query<HouseRow>(`${HOUSE_SELECT} WHERE ${scope(me, params)} ORDER BY g.created_at DESC`, params)
  const rooms = await roomsFor(houses.map((h) => h.id))
  const ids = houses.map((h) => h.id)
  const stats = ids.length
    ? await query<{ id: string; upcoming: number; pending: number; nights30: number; revenue30: string }>(
        `SELECT g.id::text AS id,
           COUNT(*) FILTER (WHERE b.status IN ('confirmed', 'checked_in') AND b.check_out >= CURRENT_DATE)::int AS upcoming,
           COUNT(*) FILTER (WHERE b.status = 'pending')::int AS pending,
           COALESCE(SUM(GREATEST(0, LEAST(b.check_out, CURRENT_DATE + 30) - GREATEST(b.check_in, CURRENT_DATE)))
             FILTER (WHERE b.status IN ('confirmed', 'checked_in', 'completed')), 0)::int AS nights30,
           COALESCE(SUM(b.total) FILTER (WHERE b.status IN ('confirmed', 'checked_in', 'completed') AND b.created_at > NOW() - INTERVAL '30 days'), 0)::text AS revenue30
         FROM guesthouses g LEFT JOIN guesthouse_bookings b ON b.guesthouse_id = g.id
         WHERE g.id = ANY($1::uuid[]) GROUP BY g.id`,
        [ids],
      )
    : []
  const byId = new Map(stats.map((s) => [s.id, s]))
  return houses.map((h) => {
    const rs = rooms.get(h.id) ?? []
    const s = byId.get(h.id)
    const roomNights = Math.max(1, rs.filter((r) => r.active).length * 30)
    return {
      ...toHouse(h, rs),
      upcoming: s?.upcoming ?? 0,
      pendingRequests: s?.pending ?? 0,
      occupancy30: Math.round(((s?.nights30 ?? 0) / roomNights) * 100),
      revenue30: Number(s?.revenue30 ?? 0),
    }
  })
}

export type Block = { id: string; roomId: string; startDate: string; endDate: string; reason: string | null }

export async function getManagedGuesthouse(actor: DemoActor, id: string): Promise<Guesthouse & { rooms: Room[]; blocks: Block[]; bookings: GuestBooking[] }> {
  await ensureGuesthouseTables()
  await expireStale()
  const me = await manager(actor)
  const h = await ownedHouse(me, id)
  const rooms = (await roomsFor([h.id])).get(h.id) ?? []
  const blocks = await query<{ id: string; room_id: string; start_date: Date | string; end_date: Date | string; reason: string | null }>(
    `SELECT k.id::text AS id, k.room_id::text AS room_id, k.start_date, k.end_date, k.reason
       FROM guesthouse_blocks k JOIN guesthouse_rooms r ON r.id = k.room_id
      WHERE r.guesthouse_id = $1::uuid AND k.end_date >= CURRENT_DATE - 30 ORDER BY k.start_date`,
    [h.id],
  )
  const bookings = await query<BookingRow>(`${BOOKING_SELECT} WHERE b.guesthouse_id = $1::uuid ORDER BY b.check_in DESC LIMIT 500`, [h.id])
  return {
    ...toHouse(h, rooms),
    rooms,
    blocks: blocks.map((k) => ({ id: k.id, roomId: k.room_id, startDate: toDate(k.start_date), endDate: toDate(k.end_date), reason: k.reason })),
    bookings: bookings.map((b) => toBooking(b)),
  }
}

export async function listManagedBookings(actor: DemoActor): Promise<GuestBooking[]> {
  await ensureGuesthouseTables()
  await expireStale()
  const me = await manager(actor)
  const params: unknown[] = []
  const rows = await query<BookingRow>(`${BOOKING_SELECT} WHERE ${scope(me, params)} ORDER BY b.check_in DESC LIMIT 1000`, params)
  return rows.map((b) => toBooking(b))
}

export async function saveGuesthouse(actor: DemoActor, id: string | null, body: Record<string, unknown>): Promise<{ id: string }> {
  await ensureGuesthouseTables()
  const me = await manager(actor)
  const name = str(body.name, 160)
  if (name.length < 3) throw err(400, 'Give the guest house a name')
  const city = str(body.city, 120)
  if (!city) throw err(400, 'Enter the city or town')
  const policy = (POLICIES as readonly string[]).includes(String(body.cancellationPolicy)) ? String(body.cancellationPolicy) : 'moderate'
  const status = ['draft', 'published', 'paused'].includes(String(body.status)) ? String(body.status) : 'draft'
  const amenities = Array.isArray(body.amenities)
    ? body.amenities.filter((a): a is string => typeof a === 'string' && (AMENITIES as readonly string[]).includes(a))
    : []
  const time = (v: unknown, d: string) => (/^\d{2}:\d{2}$/.test(String(v ?? '')) ? String(v) : d)
  const levy = Math.min(15, Math.max(0, num(body.tourismLevyPct) ?? 1))
  const vals = [
    name, str(body.description, 8000), str(body.address, 300), str(body.suburb, 120) || null, city,
    num(body.latitude), num(body.longitude), JSON.stringify(photoList(body.photos)), amenities, str(body.houseRules, 4000),
    time(body.checkInTime, '14:00'), time(body.checkOutTime, '10:00'), policy, body.instantBook === true, levy,
    str(body.contactPhone, 40) || null, str(body.contactEmail, 200) || null, status,
  ]
  if (status === 'published' && id) {
    const rooms = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM guesthouse_rooms WHERE guesthouse_id = $1::uuid AND active`, [uuid(id, 'guest house')])
    if (!rooms[0]?.n) throw err(400, 'Add at least one room before publishing')
  }
  if (status === 'published' && !id) throw err(400, 'Save the guest house and add a room before publishing')
  if (id) {
    const h = await ownedHouse(me, id)
    await query(
      `UPDATE guesthouses SET name=$2, description=$3, address=$4, suburb=$5, city=$6, latitude=$7, longitude=$8, photos=$9::jsonb,
         amenities=$10, house_rules=$11, check_in_time=$12, check_out_time=$13, cancellation_policy=$14, instant_book=$15,
         tourism_levy_pct=$16, contact_phone=$17, contact_email=$18, status=$19, updated_at=NOW() WHERE id=$1::uuid`,
      [h.id, ...vals],
    )
    return { id: h.id }
  }
  const owner = me.role === 'landlord' ? me.id : null
  const rows = await query<{ id: string }>(
    `INSERT INTO guesthouses (name, description, address, suburb, city, latitude, longitude, photos, amenities, house_rules,
        check_in_time, check_out_time, cancellation_policy, instant_book, tourism_levy_pct, contact_phone, contact_email, status,
        client_id, owner_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::uuid,$20::uuid) RETURNING id::text AS id`,
    [...vals, me.clientId, owner ?? (me.clientId ? null : me.id)],
  )
  return { id: rows[0].id }
}

export async function deleteGuesthouse(actor: DemoActor, id: string): Promise<{ ok: true }> {
  await ensureGuesthouseTables()
  const me = await manager(actor)
  if (actor.role === 'ground_agent' || actor.role === 'agent') throw err(403, 'Only an agency admin or the owner can delete a guest house')
  const h = await ownedHouse(me, id)
  const live = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM guesthouse_bookings b WHERE b.guesthouse_id = $1::uuid AND ${LIVE_BOOKING} AND b.check_out >= CURRENT_DATE`,
    [h.id],
  )
  if (live[0]?.n) throw err(409, 'This guest house has upcoming bookings. Pause it instead, or cancel the bookings first.')
  await query(`DELETE FROM guesthouses WHERE id = $1::uuid`, [h.id])
  return { ok: true }
}

export async function saveRoom(actor: DemoActor, houseId: string, roomId: string | null, body: Record<string, unknown>): Promise<Room> {
  await ensureGuesthouseTables()
  const me = await manager(actor)
  const h = await ownedHouse(me, houseId)
  const name = str(body.name, 120)
  if (name.length < 2) throw err(400, 'Name the room')
  const rate = num(body.nightlyRate)
  if (rate === null || rate <= 0) throw err(400, 'Set a nightly rate')
  const weekend = num(body.weekendRate)
  const minN = int(body.minNights, 1, 365, 1)
  const maxN = int(body.maxNights, minN, 365, Math.max(30, minN))
  const vals = [
    name, str(body.description, 4000), str(body.bedSetup, 120, '1 double bed') || '1 double bed', int(body.maxGuests, 1, 30, 2),
    money(rate), weekend && weekend > 0 ? money(weekend) : null, money(Math.max(0, num(body.cleaningFee) ?? 0)), minN, maxN,
    JSON.stringify(photoList(body.photos)), body.active !== false,
  ]
  let id: string
  if (roomId) {
    const rows = await query<{ id: string }>(
      `UPDATE guesthouse_rooms SET name=$3, description=$4, bed_setup=$5, max_guests=$6, nightly_rate=$7, weekend_rate=$8,
         cleaning_fee=$9, min_nights=$10, max_nights=$11, photos=$12::jsonb, active=$13
       WHERE id=$1::uuid AND guesthouse_id=$2::uuid RETURNING id::text AS id`,
      [uuid(roomId, 'room'), h.id, ...vals],
    )
    if (!rows[0]) throw err(404, 'Room not found')
    id = rows[0].id
  } else {
    const rows = await query<{ id: string }>(
      `INSERT INTO guesthouse_rooms (guesthouse_id, name, description, bed_setup, max_guests, nightly_rate, weekend_rate, cleaning_fee,
          min_nights, max_nights, photos, active, sort_order)
       VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,
               (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM guesthouse_rooms WHERE guesthouse_id = $1::uuid))
       RETURNING id::text AS id`,
      [h.id, ...vals],
    )
    id = rows[0].id
  }
  const out = await query<RoomRow>(`${ROOM_SELECT} WHERE id = $1::uuid`, [id])
  return toRoom(out[0])
}

export async function deleteRoom(actor: DemoActor, houseId: string, roomId: string): Promise<{ ok: true }> {
  await ensureGuesthouseTables()
  const me = await manager(actor)
  const h = await ownedHouse(me, houseId)
  const rid = uuid(roomId, 'room')
  const live = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM guesthouse_bookings b WHERE b.room_id = $1::uuid AND ${LIVE_BOOKING} AND b.check_out >= CURRENT_DATE`,
    [rid],
  )
  if (live[0]?.n) throw err(409, 'This room has upcoming bookings. Switch it off instead.')
  const anyBookings = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM guesthouse_bookings WHERE room_id = $1::uuid`, [rid])
  if (anyBookings[0]?.n) {
    await query(`UPDATE guesthouse_rooms SET active = FALSE WHERE id = $1::uuid AND guesthouse_id = $2::uuid`, [rid, h.id])
  } else {
    await query(`DELETE FROM guesthouse_rooms WHERE id = $1::uuid AND guesthouse_id = $2::uuid`, [rid, h.id])
  }
  return { ok: true }
}

export async function addBlock(actor: DemoActor, houseId: string, body: Record<string, unknown>): Promise<Block> {
  await ensureGuesthouseTables()
  const me = await manager(actor)
  const h = await ownedHouse(me, houseId)
  const rid = uuid(body.roomId, 'room')
  const stay = parseStay(body.startDate, body.endDate)
  if (!stay) throw err(400, 'Choose the dates to block')
  const room = await query<{ id: string }>(`SELECT id::text AS id FROM guesthouse_rooms WHERE id = $1::uuid AND guesthouse_id = $2::uuid`, [rid, h.id])
  if (!room[0]) throw err(404, 'Room not found')
  const clash = await query<{ reference: string }>(
    `SELECT b.reference FROM guesthouse_bookings b WHERE b.room_id = $1::uuid AND ${LIVE_BOOKING} AND b.check_in < $3::date AND b.check_out > $2::date LIMIT 1`,
    [rid, stay.checkIn, stay.checkOut],
  )
  if (clash[0]) throw err(409, `Booking ${clash[0].reference} falls in those dates`)
  const rows = await query<{ id: string }>(
    `INSERT INTO guesthouse_blocks (room_id, start_date, end_date, reason) VALUES ($1::uuid, $2::date, $3::date, $4) RETURNING id::text AS id`,
    [rid, stay.checkIn, stay.checkOut, str(body.reason, 200) || null],
  )
  return { id: rows[0].id, roomId: rid, startDate: stay.checkIn, endDate: stay.checkOut, reason: str(body.reason, 200) || null }
}

export async function removeBlock(actor: DemoActor, houseId: string, blockId: string): Promise<{ ok: true }> {
  await ensureGuesthouseTables()
  const me = await manager(actor)
  const h = await ownedHouse(me, houseId)
  await query(
    `DELETE FROM guesthouse_blocks k USING guesthouse_rooms r WHERE k.id = $1::uuid AND r.id = k.room_id AND r.guesthouse_id = $2::uuid`,
    [uuid(blockId, 'block'), h.id],
  )
  return { ok: true }
}

const TRANSITIONS: Record<string, { from: GuestBooking['status'][]; to: GuestBooking['status'] }> = {
  confirm: { from: ['pending'], to: 'confirmed' },
  decline: { from: ['pending'], to: 'declined' },
  cancel: { from: ['pending', 'confirmed'], to: 'cancelled' },
  check_in: { from: ['confirmed'], to: 'checked_in' },
  check_out: { from: ['checked_in'], to: 'completed' },
  no_show: { from: ['confirmed'], to: 'no_show' },
}

/** confirm · decline · cancel · check_in · check_out · no_show · payment (paymentStatus) · note */
export async function actOnGuestBooking(actor: DemoActor, id: string, body: Record<string, unknown>): Promise<GuestBooking> {
  await ensureGuesthouseTables()
  await expireStale()
  const me = await manager(actor)
  const params: unknown[] = [uuid(id, 'booking')]
  const rows = await query<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1::uuid AND ${scope(me, params)}`, params)
  const b = rows[0]
  if (!b) throw err(404, 'Booking not found')
  const action = String(body.action ?? '')
  const note = str(body.note, 1000) || null
  if (action === 'payment') {
    if (actor.role === 'ground_agent' || actor.role === 'agent') throw err(403, 'Only an agency admin or the owner can change payment status')
    const ps = String(body.paymentStatus ?? '')
    if (!['unpaid', 'deposit', 'paid', 'refunded'].includes(ps)) throw err(400, 'Unknown payment status')
    await query(`UPDATE guesthouse_bookings SET payment_status = $2, updated_at = NOW() WHERE id = $1::uuid`, [b.id, ps])
  } else if (action === 'note') {
    await query(`UPDATE guesthouse_bookings SET host_note = $2, updated_at = NOW() WHERE id = $1::uuid`, [b.id, note])
  } else {
    const t = TRANSITIONS[action]
    if (!t) throw err(400, 'Unknown action')
    if (!t.from.includes(b.status)) throw err(400, `A ${b.status.replace('_', ' ')} booking cannot be changed that way`)
    if (action === 'check_in' && toDate(b.check_in) > today()) throw err(400, 'Check-in is only possible from the arrival date')
    await query(
      `UPDATE guesthouse_bookings SET status = $2, expires_at = NULL, updated_at = NOW(),
         host_note = COALESCE($3, host_note) WHERE id = $1::uuid`,
      [b.id, t.to, note],
    )
    if (b.guest_user_id && ['confirm', 'decline', 'cancel'].includes(action)) {
      await notifyUsers([b.guest_user_id], {
        clientId: b.client_id,
        title: `Your stay at ${b.guesthouse_name} was ${t.to}`,
        body: `${b.reference} · ${toDate(b.check_in)} to ${toDate(b.check_out)}${note ? ` · ${note}` : ''}`,
        link: '/stays/bookings',
        resource: 'guesthouse_booking',
        action: t.to,
      }).catch(() => 0)
    }
  }
  const out = await query<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1::uuid`, [b.id])
  return toBooking(out[0])
}
