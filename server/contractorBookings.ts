/**
 * Contractor bookings (migration 034, also created on first use).
 *
 * Lifecycle: an agency admin or full agent books a contractor for a date →
 * the contractor accepts or declines → the booking is linked to a fault /
 * maintenance ticket (which assigns the contractor to it) → completed.
 * Agency staff see their agency's bookings; a contractor sees their own.
 */
import { query } from './db.js'
import { resolveFrontendId, resolveUuid } from './entityMap.js'
import { notifyUsers } from './supportDesk.js'
import type { DemoActor } from './actor.js'

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS contractor_bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contractor_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booked_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  unit_id             UUID REFERENCES units(id) ON DELETE SET NULL,
  ticket_id           UUID REFERENCES maintenance_tickets(id) ON DELETE SET NULL,
  trade               VARCHAR(40),
  scheduled_date      DATE NOT NULL,
  time_window         VARCHAR(20) NOT NULL DEFAULT 'morning'
                        CHECK (time_window IN ('morning', 'afternoon', 'full_day', 'evening')),
  description         TEXT NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'requested'
                        CHECK (status IN ('requested', 'accepted', 'declined', 'completed', 'cancelled')),
  contractor_note     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookings_contractor ON contractor_bookings (contractor_user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_bookings_client ON contractor_bookings (client_id, scheduled_date);
`
let ready: Promise<void> | null = null
export function ensureBookingTable(): Promise<void> {
  ready ??= query(SCHEMA_SQL).then(() => undefined).catch((e) => {
    ready = null
    throw e
  })
  return ready
}

const BOOKERS = new Set(['super_admin', 'client_admin', 'agent_admin', 'ground_agent'])
const WINDOWS = ['morning', 'afternoon', 'full_day', 'evening'] as const

function err(status: number, message: string): Error {
  return Object.assign(new Error(message), { status })
}

async function uuidOf(type: 'user' | 'ticket', ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null
  if (/^[0-9a-f-]{36}$/i.test(ref)) return ref
  return (await resolveUuid(type as never, ref).catch(() => null)) ?? null
}

async function actorInfo(actor: DemoActor): Promise<{ id: string; client_id: string | null }> {
  const id = await uuidOf('user', actor.userId)
  if (!id) throw err(401, 'Sign in first')
  const rows = await query<{ client_id: string | null }>(`SELECT client_id::text AS client_id FROM users WHERE id = $1::uuid`, [id])
  return { id, client_id: rows[0]?.client_id ?? null }
}

export type Booking = {
  id: string
  contractorUserId: string
  contractorName: string
  bookedByName: string | null
  listingId: string | null
  listingTitle: string | null
  ticketId: string | null
  ticketTitle: string | null
  trade: string | null
  scheduledDate: string
  timeWindow: (typeof WINDOWS)[number]
  description: string
  status: 'requested' | 'accepted' | 'declined' | 'completed' | 'cancelled'
  contractorNote: string | null
  createdAt: string
}

type Row = {
  id: string
  contractor_user_id: string
  contractor_name: string
  booked_by_name: string | null
  unit_id: string | null
  listing_title: string | null
  ticket_id: string | null
  ticket_title: string | null
  trade: string | null
  scheduled_date: Date | string
  time_window: Booking['timeWindow']
  description: string
  status: Booking['status']
  contractor_note: string | null
  created_at: Date
}

const SELECT = `SELECT b.id::text AS id, b.contractor_user_id::text AS contractor_user_id,
        TRIM(CONCAT_WS(' ', c.first_name, c.last_name)) AS contractor_name,
        TRIM(CONCAT_WS(' ', bb.first_name, bb.last_name)) AS booked_by_name,
        b.unit_id::text AS unit_id, COALESCE(u.title, u.unit_number) AS listing_title,
        b.ticket_id::text AS ticket_id, t.title AS ticket_title, b.trade, b.scheduled_date, b.time_window,
        b.description, b.status, b.contractor_note, b.created_at
   FROM contractor_bookings b
   JOIN users c ON c.id = b.contractor_user_id
   LEFT JOIN users bb ON bb.id = b.booked_by
   LEFT JOIN units u ON u.id = b.unit_id
   LEFT JOIN maintenance_tickets t ON t.id = b.ticket_id`

async function toBooking(r: Row): Promise<Booking> {
  const fe = (type: string, id: string | null) => (id ? resolveFrontendId(type as never, id).catch(() => null) : Promise.resolve(null))
  return {
    id: r.id,
    contractorUserId: (await fe('user', r.contractor_user_id)) ?? r.contractor_user_id,
    contractorName: r.contractor_name,
    bookedByName: r.booked_by_name,
    listingId: r.unit_id ? ((await fe('property', r.unit_id)) ?? r.unit_id) : null,
    listingTitle: r.listing_title,
    ticketId: r.ticket_id ? ((await fe('ticket', r.ticket_id)) ?? r.ticket_id) : null,
    ticketTitle: r.ticket_title,
    trade: r.trade,
    scheduledDate: typeof r.scheduled_date === 'string' ? r.scheduled_date.slice(0, 10) : new Date(r.scheduled_date).toISOString().slice(0, 10),
    timeWindow: r.time_window,
    description: r.description,
    status: r.status,
    contractorNote: r.contractor_note,
    createdAt: new Date(r.created_at).toISOString(),
  }
}

export async function listBookings(actor: DemoActor): Promise<Booking[]> {
  await ensureBookingTable()
  const me = await actorInfo(actor)
  let rows: Row[]
  if (actor.role === 'contractor') {
    rows = await query<Row>(`${SELECT} WHERE b.contractor_user_id = $1::uuid ORDER BY b.scheduled_date DESC LIMIT 300`, [me.id])
  } else if (actor.role === 'super_admin') {
    rows = await query<Row>(`${SELECT} ORDER BY b.scheduled_date DESC LIMIT 300`)
  } else if (BOOKERS.has(actor.role) || actor.role === 'agent') {
    if (!me.client_id) return []
    rows = await query<Row>(`${SELECT} WHERE b.client_id = $1::uuid ORDER BY b.scheduled_date DESC LIMIT 300`, [me.client_id])
  } else {
    throw err(403, 'Not allowed')
  }
  return Promise.all(rows.map(toBooking))
}

export async function createBooking(actor: DemoActor, body: Record<string, unknown>): Promise<Booking> {
  await ensureBookingTable()
  if (!BOOKERS.has(actor.role)) throw err(403, 'Only agency admins and full agents can book contractors')
  const me = await actorInfo(actor)
  const contractor = await uuidOf('user', String(body.contractorUserId ?? ''))
  if (!contractor) throw err(400, 'Choose a contractor')
  const crow = await query<{ role: string; name: string }>(
    `SELECT role, TRIM(CONCAT_WS(' ', first_name, last_name)) AS name FROM users WHERE id = $1::uuid`,
    [contractor],
  )
  if (crow[0]?.role !== 'CONTRACTOR') throw err(400, 'That person is not a contractor')
  const date = String(body.scheduledDate ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw err(400, 'Choose a date')
  if (date < new Date().toISOString().slice(0, 10)) throw err(400, 'The date has passed')
  const window = (WINDOWS as readonly string[]).includes(String(body.timeWindow)) ? String(body.timeWindow) : 'morning'
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (description.length < 10) throw err(400, 'Describe the job in at least 10 characters')
  let unitId: string | null = null
  if (typeof body.listingId === 'string' && body.listingId) {
    const { resolveListingUnitUuid } = await import('./listingUuid.js')
    unitId = await resolveListingUnitUuid(body.listingId).catch(() => null)
  }
  const ticket = await uuidOf('ticket', typeof body.ticketId === 'string' ? body.ticketId : null)
  let clientId = me.client_id
  if (!clientId && unitId) {
    clientId = (await query<{ c: string }>(`SELECT client_id::text AS c FROM units WHERE id = $1::uuid`, [unitId]))[0]?.c ?? null
  }
  if (!clientId) throw err(400, 'Choose the property this booking is for')
  const rows = await query<{ id: string }>(
    `INSERT INTO contractor_bookings (client_id, contractor_user_id, booked_by, unit_id, ticket_id, trade, scheduled_date, time_window, description)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7::date, $8, $9) RETURNING id::text AS id`,
    [clientId, contractor, me.id, unitId, ticket, typeof body.trade === 'string' ? body.trade.slice(0, 40) : null, date, window, description.slice(0, 2000)],
  )
  await notifyUsers([contractor], {
    clientId,
    title: `New booking request for ${date}`,
    body: description.slice(0, 200),
    link: '/workspace/portals/contractor?tab=bookings',
    resource: 'contractor_booking',
    action: 'created',
  })
  const out = await query<Row>(`${SELECT} WHERE b.id = $1::uuid`, [rows[0].id])
  return toBooking(out[0])
}

/** accept · decline (contractor) · cancel · complete · link_ticket (agency) */
export async function actOnBooking(actor: DemoActor, id: string, body: Record<string, unknown>): Promise<Booking> {
  await ensureBookingTable()
  const me = await actorInfo(actor)
  const rows = await query<{ client_id: string; contractor_user_id: string; booked_by: string | null; status: string; description: string; scheduled_date: Date | string }>(
    `SELECT client_id::text AS client_id, contractor_user_id::text AS contractor_user_id, booked_by::text AS booked_by, status,
            description, scheduled_date FROM contractor_bookings WHERE id = $1::uuid`,
    [id],
  )
  const b = rows[0]
  if (!b) throw err(404, 'Booking not found')
  const action = String(body.action ?? '')
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : null
  const isContractor = b.contractor_user_id === me.id
  const isAgency = actor.role === 'super_admin' || (BOOKERS.has(actor.role) && me.client_id === b.client_id)
  const set = async (status: string, notifyIds: Array<string | null>, title: string) => {
    await query(
      `UPDATE contractor_bookings SET status = $2, contractor_note = COALESCE($3, contractor_note), updated_at = NOW() WHERE id = $1::uuid`,
      [id, status, note],
    )
    await notifyUsers(notifyIds, {
      clientId: b.client_id,
      title,
      body: note ?? b.description.slice(0, 160),
      link: '/workspace/operations/contractors?tab=bookings',
      resource: 'contractor_booking',
      action: status,
    }, me.id)
  }
  if (action === 'accept' || action === 'decline') {
    if (!isContractor) throw err(403, 'Only the booked contractor can answer this booking')
    if (b.status !== 'requested') throw err(400, 'This booking was already answered')
    await set(action === 'accept' ? 'accepted' : 'declined', [b.booked_by], `Booking ${action === 'accept' ? 'accepted' : 'declined'}`)
  } else if (action === 'complete') {
    if (!isContractor && !isAgency) throw err(403, 'Not allowed')
    if (b.status !== 'accepted') throw err(400, 'Only accepted bookings can be completed')
    await set('completed', isContractor ? [b.booked_by] : [b.contractor_user_id], 'Booking completed')
  } else if (action === 'cancel') {
    if (!isAgency) throw err(403, 'Only the agency can cancel a booking')
    if (b.status === 'completed') throw err(400, 'This booking is already completed')
    await set('cancelled', [b.contractor_user_id], 'Booking cancelled')
  } else if (action === 'link_ticket') {
    if (!isAgency) throw err(403, 'Only the agency can link a booking to a fault')
    const ticket = await uuidOf('ticket', typeof body.ticketId === 'string' ? body.ticketId : null)
    if (!ticket) throw err(400, 'Choose a fault or maintenance job')
    await query(`UPDATE contractor_bookings SET ticket_id = $2::uuid, updated_at = NOW() WHERE id = $1::uuid`, [id, ticket])
  } else {
    throw err(400, 'Unknown action')
  }
  const out = await query<Row>(`${SELECT} WHERE b.id = $1::uuid`, [id])
  return toBooking(out[0])
}
