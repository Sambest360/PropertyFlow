import { query, withTransaction } from './db.js'
import { isOccupiedAdvert } from '../src/lib/occupiedAdvert.js'
import { availableFromLabel } from '../src/lib/availableFromLabel.js'
import { slotStartSast, slotStoredStart } from './slotInstant.js'
import { assertOccupiedBookingAllowed, markBookingTenantPending } from './occupiedListing.js'
import { ensureUuid, resolveUuid } from './entityMap.js'
import { resolveLiveListing } from './listingResolve.js'
import {
  capacityDecision,
  findDuplicateLead,
  listingFullError,
  lockAndCount,
} from './listingLimits.js'

export type PublicEnquiryInput = {
  propertyId: string
  action: 'lead' | 'viewing'
  firstName: string
  lastName: string
  email: string
  phone?: string
  notes?: string
  slotId?: string | null
  monthlyIncome?: number | null
  /** T1: ignored. Register interest no longer collects an ID; older clients may still send it. */
  idNumber?: string | null
  interestType?: 'Buy' | 'Rent'
}

export type PublicEnquiryResult = {
  ok: true
  /**
   * The new lead's front-end reference (LD-…). null when the email/phone
   * matched an existing lead on this listing (T3 F4, Michael): that lead's
   * reference is never handed to whoever typed the email or phone.
   */
  leadId: string | null
  bookingId?: string | null
  stage: string
  /** Unit UUID — used by the route for additive fire-and-forget hooks (agent email alert). */
  unitId: string
  /** Occupied advert: the date the home comes free (YYYY-MM-DD); null otherwise. Same as the 027 RPC. */
  availableFrom: string | null
  /** T3: the same email/phone already has a lead on this listing; nothing new was saved and no reference is returned (F4). */
  duplicate?: boolean
  /**
   * H1 item 7 (server-internal; the route strips it): a repeat carried a NEW
   * note, which was appended to the existing lead. The route alerts the agent
   * once for it; the caller never sees this flag.
   */
  noteAppended?: string
}

/** Lower-case, whitespace collapsed: "  Is parking   included? " equals "is parking included?". */
function normaliseNote(v: string): string {
  return v.toLowerCase().replace(/\s+/g, ' ').trim()
}

const REPEAT_PREFIX_RE = /^repeat enquiry(?: \([^)]*\))?:\s*/i

/** Every line already on the lead, normalised, with the repeat prefix removed. */
function noteLines(notes: string): Set<string> {
  const out = new Set<string>()
  for (const line of notes.split('\n')) {
    const n = normaliseNote(line.replace(REPEAT_PREFIX_RE, ''))
    if (n) out.add(n)
  }
  return out
}

/**
 * H1 item 7: append a repeat enquiry's note to the existing lead, once. The
 * note is new unless every one of its lines is already a line on the lead
 * (case and spacing ignored), so a re-send is never appended twice, while a
 * short fragment of an earlier note ("pets?") still counts as new. Existing
 * notes are never overwritten. Returns true when it appended.
 */
export async function appendRepeatNote(leadId: string, note: string): Promise<boolean> {
  const lines = note.split('\n').map((l) => normaliseNote(l)).filter(Boolean)
  if (lines.length === 0) return false
  const rows = await query<{ notes: string | null }>(
    `SELECT notes FROM leads WHERE id = $1::uuid FOR UPDATE -- repeat_note_lock`,
    [leadId],
  )
  if (rows.length === 0) return false
  const existing = rows[0]?.notes ?? ''
  const have = noteLines(existing)
  if (lines.every((l) => have.has(l))) return false
  const day = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())
  const appended = `Repeat enquiry (${day}): ${note.trim()}`
  const next = existing ? `${existing}\n${appended}` : appended
  await query(`UPDATE leads SET notes = $2, updated_at = NOW() WHERE id = $1::uuid -- repeat_note_append`, [leadId, next])
  return true
}

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v).trim()
}

/** Lead note on an occupied advert; same text as submit_public_listing_enquiry (027). */
export function occupiedInterestNote(availableFromIso: string): string {
  return `Interested, ${availableFromLabel(availableFromIso).replace(/^Available/, 'available')}`
}

async function resolvePublicUnit(propertyFeId: string): Promise<{
  unitId: string
  clientId: string
  agentId: string | null
  statusKey: string
  listingType: string | null
  occupiedAdvert: boolean
  availableFrom: string | null
  value: number
} | null> {
  // query() returns the row array, not { rows }. Destructuring { rows }
  // left rows undefined and rows[0] threw "reading '0'" on Register interest.
  // Also skip the static Framesby uuid resolveUuid returns for PR-1011.
  let listing: { unitId: string; clientId: string }
  try {
    listing = await resolveLiveListing(propertyFeId)
  } catch (err) {
    if (err instanceof Error && err.message === 'application requires propertyId') return null
    throw err
  }

  const rows = await query<{
    id: string
    client_id: string
    agent_id: string | null
    status_config_key: string
    price: string | null
    rent: string | null
    listing_type?: string | null
    advertise_while_occupied?: boolean | null
    available_from?: string | null
  }>(
    `SELECT id, client_id, agent_id, status_config_key, price::text, rent::text,
            listing_type, advertise_while_occupied, available_from::text AS available_from
     FROM units WHERE id = $1::uuid LIMIT 1`,
    [listing.unitId],
  )
  const row = rows[0]
  if (!row) return null
  const value = Number(row.price ?? row.rent ?? 0)
  return {
    unitId: row.id,
    clientId: listing.clientId || row.client_id,
    agentId: row.agent_id,
    statusKey: row.status_config_key,
    listingType: row.listing_type ?? null,
    availableFrom: row.available_from ? String(row.available_from).slice(0, 10) : null,
    occupiedAdvert: isOccupiedAdvert({
      statusKey: row.status_config_key,
      listingType: row.listing_type ?? null,
      advertiseWhileOccupied: row.advertise_while_occupied ?? null,
      availableFrom: row.available_from ?? null,
    }),
    value,
  }
}

export async function submitPublicListingEnquiry(
  input: PublicEnquiryInput,
): Promise<PublicEnquiryResult> {
  const propertyFeId = str(input.propertyId)
  const firstName = str(input.firstName)
  const lastName = str(input.lastName)
  const email = str(input.email).toLowerCase()
  const phone = str(input.phone)
  const notes = str(input.notes)
  const action = input.action === 'viewing' ? 'viewing' : 'lead'

  if (!propertyFeId || !firstName || !lastName || !email) {
    const err = new Error('contact_required') as Error & { status?: number }
    err.status = 400
    throw err
  }

  const unit = await resolvePublicUnit(propertyFeId)
  if (!unit) {
    const err = new Error('property_not_found') as Error & { status?: number }
    err.status = 404
    throw err
  }

  // Michael's ruling: an advertised occupied listing takes enquiries. Unlisted
  // units, and occupied units that are not advertised, stay closed.
  if (
    String(unit.listingType ?? 'rent').toLowerCase() === 'not_listed' ||
    (!unit.occupiedAdvert &&
      !['PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE'].includes(unit.statusKey))
  ) {
    const err = new Error('property_not_public') as Error & { status?: number }
    err.status = 422
    throw err
  }

  const fullName = `${firstName} ${lastName}`
  const interest = input.interestType === 'Buy' ? 'BUY' : 'RENT'
  let extraNotes = notes
  if (input.monthlyIncome != null && input.monthlyIncome > 0) {
    extraNotes = [extraNotes, `Monthly income: ${input.monthlyIncome}`].filter(Boolean).join('\n')
  }
  // T1: input.idNumber is ignored; an ID never goes into lead / booking notes.
  if (unit.occupiedAdvert && unit.availableFrom) {
    extraNotes = [occupiedInterestNote(unit.availableFrom), extraNotes].filter(Boolean).join('\n')
  }

  let stage = 'New Lead'
  if (action === 'viewing') {
    stage = input.slotId ? 'Viewing Scheduled' : 'Viewing Requested'
  }

  const saved = await withTransaction(async () => {
    const snap = await lockAndCount(unit.unitId)
    const duplicateLeadId = await findDuplicateLead(unit.unitId, snap.roundStartedAt, email, phone)
    // T3 F4 (Michael): a match on email OR phone may be someone else, so the
    // existing lead's reference (or uuid) is never returned to the caller.
    const booksSlot = action === 'viewing' && Boolean(input.slotId)
    if (!booksSlot && duplicateLeadId) {
      // H1 item 7: no new lead and no confirmation; a NEW note is appended
      // once (the user's own words only, not the income/occupied lines).
      const appended = notes ? await appendRepeatNote(duplicateLeadId, notes) : false
      return {
        full: false as const,
        leadId: null as string | null,
        bookingId: null as string | null,
        stage,
        duplicate: true,
        noteAppended: appended ? notes : undefined,
      }
    }
    const decision = booksSlot
      ? capacityDecision(snap.viewingCount, snap.maxViewings, snap.limitAction)
      : capacityDecision(snap.enquiryCount, snap.maxEnquiries, snap.limitAction)

    if (decision !== 'allow') {
      let waitlistId: string | null = null
      if (decision === 'waitlist') {
        if (booksSlot) {
          const inserted = await query<{ id: string }>(
            `INSERT INTO viewing_waitlist (client_id, unit_id, name, email, phone)
             VALUES ($1::uuid, $2::uuid, $3, $4, NULLIF($5, ''))
             RETURNING id::text AS id`,
            [unit.clientId, unit.unitId, fullName, email, phone],
          )
          waitlistId = inserted[0]?.id ?? null
        } else {
          const leadFeId = `LD-guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          const leadUuid = await ensureUuid('lead', leadFeId)
          await query(
            `INSERT INTO leads (
               id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
               interest_type, value_amount, notes, is_waitlisted, updated_at
             ) VALUES (
               $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, 'Web Form', 'Waitlist',
               $8, $9, $10, true, NOW()
             )`,
            [
              leadUuid,
              unit.clientId,
              unit.unitId,
              unit.agentId,
              fullName,
              email,
              phone || null,
              interest,
              unit.value,
              extraNotes || null,
            ],
          )
          waitlistId = leadUuid
        }
      }
      return { full: true as const, waitlist: decision === 'waitlist', waitlistId }
    }

    const leadFeId = `LD-guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const leadUuid = duplicateLeadId ?? (await ensureUuid('lead', leadFeId))
    if (!duplicateLeadId) {
      await query(
        `INSERT INTO leads (
           id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
           interest_type, value_amount, notes, metadata, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, 'Web Form', $8,
           $9, $10, $11, $12::jsonb, NOW()
         )`,
        [
          leadUuid,
          unit.clientId,
          unit.unitId,
          unit.agentId,
          fullName,
          email,
          phone || null,
          stage,
          interest,
          unit.value,
          extraNotes || null,
          JSON.stringify(booksSlot ? { limit_bucket: 'viewing' } : {}),
        ],
      )
    }

    let bookingFeId: string | null = null
    if (booksSlot) {
      const slotUuid = await resolveUuid('viewing_slot', str(input.slotId))
      const slotRows = await query<{
        slot_date: string
        slot_time: string
        capacity: number
        booked_count: number
        status: string
      }>(
        `SELECT slot_date::text, slot_time, capacity, booked_count, status
         FROM viewing_slots
         WHERE id = $1::uuid AND unit_id = $2::uuid AND client_id = $3::uuid
         FOR UPDATE`,
        [slotUuid, unit.unitId, unit.clientId],
      )
      const slot = slotRows[0]
      if (!slot) {
        const err = new Error('slot_not_found') as Error & { status?: number }
        err.status = 404
        throw err
      }
      if (slot.status !== 'OPEN' || slot.booked_count >= slot.capacity) {
        const err = new Error('slot_unavailable') as Error & { status?: number }
        err.status = 409
        throw err
      }
      // Slot date/time are SAST wall-clock; a real instant whatever the server TZ.
      const slotStart = slotStartSast(String(slot.slot_date), String(slot.slot_time))
      if (Number.isNaN(slotStart.getTime()) || slotStart.getTime() <= Date.now()) {
        const err = new Error('slot_not_found') as Error & { status?: number }
        err.status = 404
        throw err
      }
      const consent = await assertOccupiedBookingAllowed(unit.unitId, {
        date: String(slot.slot_date).slice(0, 10),
        time: String(slot.slot_time),
        startsAt: slotStart,
      })

      const viewingFeId = `VW-guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      bookingFeId = viewingFeId
      const bookingUuid = await ensureUuid('viewing', viewingFeId)
      // Stored as the slot's wall time labelled Z (app convention); slotStart
      // (the real SAST instant) is only for the notice / past checks above.
      const startsAt = slotStoredStart(String(slot.slot_date), String(slot.slot_time)).toISOString()

      await query(
        `INSERT INTO bookings (
           id, client_id, unit_id, slot_id, agent_id, visitor_name, visitor_email, visitor_phone,
           starts_at, status, notes, updated_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8,
           $9::timestamptz, 'SCHEDULED', $10, NOW()
         )`,
        [
          bookingUuid,
          unit.clientId,
          unit.unitId,
          slotUuid,
          unit.agentId,
          fullName,
          email,
          phone || null,
          startsAt,
          extraNotes || null,
        ],
      )
      if (consent === 'PENDING') await markBookingTenantPending(bookingUuid, unit.unitId)
      await query(
        `UPDATE viewing_slots
         SET booked_count = booked_count + 1,
             status = CASE WHEN booked_count + 1 >= capacity THEN 'FULL' ELSE status END,
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [slotUuid],
      )
    }

    return {
      full: false as const,
      // A fresh lead returns its own front-end id; a booking on an existing
      // lead returns only the new booking's id (F4).
      leadId: duplicateLeadId ? null : leadFeId,
      bookingId: bookingFeId,
      stage,
      duplicate: false,
      noteAppended: undefined as string | undefined,
    }
  })

  if (saved.full) throw listingFullError(saved.waitlist, saved.waitlistId)

  return {
    ok: true,
    leadId: saved.leadId,
    bookingId: saved.bookingId,
    stage: saved.stage,
    unitId: unit.unitId,
    availableFrom: unit.occupiedAdvert ? unit.availableFrom : null,
    ...(saved.duplicate ? { duplicate: true } : {}),
    ...(saved.noteAppended ? { noteAppended: saved.noteAppended } : {}),
  }
}
