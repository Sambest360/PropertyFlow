import { query } from './db.js'
import { ensureUuid, resolveUuid } from './entityMap.js'
import { resolveLiveListing } from './listingResolve.js'

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
  }>(
    `SELECT id, client_id, agent_id, status_config_key, price::text, rent::text
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

  if (!['PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE'].includes(unit.statusKey)) {
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

  const leadFeId = `LD-guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const leadUuid = await ensureUuid('lead', leadFeId)

  await query(
    `INSERT INTO leads (
       id, client_id, unit_id, agent_id, name, email, phone, channel, stage,
       interest_type, value_amount, notes, updated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, 'Web Form', $8,
       $9, $10, $11, NOW()
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
    ],
  )

  let bookingFeId: string | null = null
  if (action === 'viewing' && input.slotId) {
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
    ok: true,
    leadId: leadFeId,
    bookingId: bookingFeId,
    stage,
    unitId: unit.unitId,
  }
}
