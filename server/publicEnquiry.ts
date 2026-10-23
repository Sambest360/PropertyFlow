import { query, withTransaction } from './db.js'
import { isOccupiedAdvert } from '../src/lib/occupiedAdvert.js'
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
  idNumber?: string | null
  interestType?: 'Buy' | 'Rent'
}

export type PublicEnquiryResult = {
  ok: true
  leadId: string
  bookingId?: string | null
  stage: string
  /** Unit UUID — used by the route for additive fire-and-forget hooks (agent email alert). */
  unitId: string
}

function str(v: unknown, fallback = ''): string {
  return v == null ? fallback : String(v).trim()
}

async function resolvePublicUnit(propertyFeId: string): Promise<{
  unitId: string
  clientId: string
  agentId: string | null
  statusKey: string
  occupiedAdvert: boolean
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

  if (
    !unit.occupiedAdvert &&
    !['PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE'].includes(unit.statusKey)
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
  if (input.idNumber) {
    extraNotes = [extraNotes, `ID/Passport: ${input.idNumber}`].filter(Boolean).join('\n')
  }

  let stage = 'New Lead'
  if (action === 'viewing') {
    stage = input.slotId ? 'Viewing Scheduled' : 'Viewing Requested'
  }

  const saved = await withTransaction(async () => {
    const snap = await lockAndCount(unit.unitId)
    const duplicateLeadId = await findDuplicateLead(unit.unitId, snap.roundStartedAt, email, phone)
    const booksSlot = action === 'viewing' && Boolean(input.slotId)
    if (!booksSlot && duplicateLeadId) {
      return {
        full: false as const,
        leadId: duplicateLeadId,
        bookingId: null as string | null,
        stage,
        duplicate: true,
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
      const timeNorm = String(slot.slot_time).length === 5 ? `${slot.slot_time}:00` : slot.slot_time
      const slotStart = new Date(`${slot.slot_date}T${timeNorm}`)
      if (!Number.isNaN(slotStart.getTime()) && slotStart.getTime() <= Date.now()) {
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
      const startsAt = `${slot.slot_date}T${slot.slot_time}:00`

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
      leadId: duplicateLeadId ? duplicateLeadId : leadFeId,
      bookingId: bookingFeId,
      stage,
    }
  })

  if (saved.full) throw listingFullError(saved.waitlist, saved.waitlistId)

  return {
    ok: true,
    leadId: saved.leadId,
    bookingId: saved.bookingId,
    stage: saved.stage,
    unitId: unit.unitId,
  }
}
