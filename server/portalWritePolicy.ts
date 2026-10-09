/**
 * Portal-role write allow-list (Jim #80 B5).
 *
 * Tenants (end users), landlords and contractors may write ONLY what is listed
 * below. Every entry narrows: after it passes, the normal scope gate
 * (canWriteEntity / own-application rule) still runs, except for the two
 * server-side rewrites (lease signature, payment proof, viewing-slot recount)
 * which perform their own narrow UPDATE and skip the generic upsert.
 *
 * tenant
 *   user              own row (enforceUserWritePolicy)
 *   notification      own
 *   application       own (create / update, never delete)
 *   viewing           own booking: applicantEmail = their account email
 *   viewing_slot      booking recount only: booked_count = live count of
 *                     non-cancelled bookings, and only on a slot they booked
 *   ticket            own maintenance ticket / complaint (reportedByUserId)
 *   thread / message  threads they participate in; messages from themselves
 *   tenancy           their own lease signature only (eSign.tenant; the
 *                     server merges it into the stored envelope)
 *   payment           proof of payment on their own payment (reference + notes)
 *   lead              enquiry create only
 *   property_event    append only (create)
 * landlord
 *   user, notification, thread / message as above
 *   application       update (review decision) on their own properties, no create / delete
 *   tenancy           their own countersignature only (eSign.landlord)
 *   property / unit / building / room / asset
 *                     their own listings (landlordId, if sent, must be them), no delete
 *   property_event    append only
 * contractor
 *   user, notification, thread / message as above
 *   application       own (unchanged rule)
 *   ticket            update a job assigned to them (or the claimable pool,
 *                     via ticketInScope); never reassign it to someone else,
 *                     never create / delete
 *   property_event    append only
 *
 * Everything else (trust, payments other than proof, tenancies other than the
 * signature, documents, leads updates, viewing slots, invoices, lookups,
 * agencies, activity, suite alerts, deletes) is refused for portal roles.
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { LEASE_IDS, TICKET_IDS } from './idMap.js'
import { forbiddenError, type DemoActor } from './actor.js'
import type { PersistBody } from './writes.js'

export const PORTAL_ROLES: ReadonlySet<string> = new Set(['tenant', 'landlord', 'contractor'])

/** Minimal shape of scopeGate's ExistingRow used here. */
type Existing = {
  ownerUserId: string | null
  contractorId: string | null
  landlordId: string | null
} | null

export type HandledWrite = { ok: true; id: string; uuid: string }
export type PortalOutcome = { handled?: HandledWrite }

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

async function actorUuid(actor: DemoActor): Promise<string | null> {
  return resolveUuid('user', actor.userId)
}

async function actorEmail(actor: DemoActor): Promise<string | null> {
  const uuid = await actorUuid(actor)
  if (!uuid) return null
  const rows = await query<{ email: string | null }>(`SELECT email FROM users WHERE id = $1::uuid`, [uuid])
  const e = rows[0]?.email
  return typeof e === 'string' && e ? e.trim().toLowerCase() : null
}

async function leaseUuid(feId: string): Promise<string | null> {
  const hit = await resolveUuid('tenancy', feId)
  if (hit) return hit
  return Object.entries(LEASE_IDS).find(([, v]) => v === feId)?.[0] ?? null
}

async function ticketUuid(feId: string): Promise<string | null> {
  const reverse = Object.entries(TICKET_IDS).find(([, v]) => v === feId)?.[0]
  return reverse ?? (await resolveUuid('ticket', feId))
}

const SIGN_PARTY_STATUSES = new Set(['pending', 'signed', 'declined'])

/** Overall envelope status from the two parties (never taken from the client). */
function envelopeStatus(
  prev: string,
  tenant: Record<string, unknown> | undefined,
  landlord: Record<string, unknown> | undefined,
): string {
  const t = String(tenant?.status ?? 'pending')
  const l = String(landlord?.status ?? 'pending')
  if (t === 'declined' || l === 'declined') return 'declined'
  const done = (s: string) => s === 'signed' || s === 'waived'
  if (done(t) && done(l)) return 'completed'
  if (done(t) || done(l)) return 'partially_signed'
  return prev
}

export async function enforcePortalWritePolicy(
  actor: DemoActor,
  body: PersistBody,
  existing: Existing,
): Promise<PortalOutcome> {
  const role = actor.role
  const deny = (why: string) =>
    forbiddenError(`Forbidden: ${role} ${actor.userId} cannot ${body.action} ${body.resource} ${body.id} (${why})`)
  const data = (body.data ?? {}) as Record<string, unknown>
  const isTenant = role === 'tenant'
  const isLandlord = role === 'landlord'
  const isContractor = role === 'contractor'

  if (body.action === 'delete') {
    // Only an own notification may be removed by a portal user.
    if (body.resource === 'notification' && existing?.ownerUserId === actor.userId) return {}
    throw deny('portal users do not delete records')
  }

  switch (body.resource) {
    case 'notification': {
      const owner = existing ? existing.ownerUserId : str(data.userId)
      if (owner !== actor.userId) throw deny('not their notification')
      return {}
    }

    case 'application': {
      if (isLandlord) {
        if (!existing) throw deny('landlords review applications, they do not create them')
        return {} // property ownership checked by canWriteEntity
      }
      return {} // tenant / contractor: own-application rule in assertPersistAllowed
    }

    case 'viewing': {
      if (!isTenant) throw deny('not on the portal allow-list')
      const mine = await actorEmail(actor)
      if (!mine) throw deny('no account email to match the booking')
      const sent = str(data.applicantEmail)?.toLowerCase() ?? null
      if (sent !== mine) throw deny('a booking must be under their own email')
      const uuid = await resolveUuid('viewing', body.id)
      if (uuid) {
        const rows = await query<{ visitor_email: string | null }>(
          `SELECT visitor_email FROM bookings WHERE id = $1::uuid`,
          [uuid],
        )
        if (rows[0] && (rows[0].visitor_email ?? '').trim().toLowerCase() !== mine) {
          throw deny('not their booking')
        }
      }
      return {}
    }

    case 'viewing_slot': {
      if (!isTenant) throw deny('not on the portal allow-list')
      const uuid = await resolveUuid('viewing_slot', body.id)
      if (!uuid) throw deny('tenants cannot create viewing slots')
      const mine = await actorEmail(actor)
      if (!mine) throw deny('no account email to match the booking')
      const counts = await query<{ n: number | string; mine: number | string }>(
        `SELECT COUNT(*)::int AS n,
                COUNT(*) FILTER (WHERE lower(visitor_email) = $2)::int AS mine
           FROM bookings WHERE slot_id = $1::uuid AND status <> 'CANCELLED'`,
        [uuid, mine],
      )
      if (!Number(counts[0]?.mine ?? 0)) throw deny('they have no booking on this slot')
      const n = Number(counts[0]?.n ?? 0)
      // Payload ignored: the count is the live number of bookings, so it can
      // never be inflated by replaying the write.
      await query(
        `UPDATE viewing_slots
            SET booked_count = $2,
                status = CASE WHEN status = 'OPEN' AND $2 >= capacity THEN 'FULL' ELSE status END,
                updated_at = NOW()
          WHERE id = $1::uuid`,
        [uuid, n],
      )
      return { handled: { ok: true, id: body.id, uuid } }
    }

    case 'ticket': {
      if (isTenant) {
        const sentReporter = str(data.reportedByUserId)
        if (sentReporter && sentReporter !== actor.userId) throw deny('reportedByUserId must be themselves')
        const uuid = await ticketUuid(body.id)
        const rows = uuid
          ? await query<{ reported_by: string | null }>(
              `SELECT reported_by::text AS reported_by FROM maintenance_tickets WHERE id = $1::uuid`,
              [uuid],
            )
          : []
        if (rows[0]) {
          const me = await actorUuid(actor)
          if (!me || rows[0].reported_by !== me) throw deny('not their ticket')
        } else if (sentReporter !== actor.userId) {
          throw deny('a new ticket must be reported by themselves')
        }
        return {}
      }
      if (isContractor) {
        if (!existing) throw deny('contractors do not create tickets')
        if (Object.prototype.hasOwnProperty.call(data, 'contractorId')) {
          const c = str(data.contractorId)
          if (c && c !== actor.userId) throw deny('cannot assign a job to someone else')
        }
        return {} // assignment / claimable pool checked by ticketInScope
      }
      throw deny('not on the portal allow-list')
    }

    case 'thread': {
      const sent = Array.isArray(data.participantIds) ? data.participantIds.map(String) : null
      if (sent && !sent.includes(actor.userId)) throw deny('they must stay a participant')
      const uuid = await resolveUuid('thread', body.id)
      const rows = uuid
        ? await query<{ participant_ids: unknown }>(
            `SELECT participant_ids FROM message_threads WHERE id = $1::uuid`,
            [uuid],
          )
        : []
      if (rows[0]) {
        const me = await actorUuid(actor)
        const parts = Array.isArray(rows[0].participant_ids) ? rows[0].participant_ids.map(String) : []
        if (!parts.includes(actor.userId) && !(me && parts.includes(me))) throw deny('not their thread')
      } else if (!sent) {
        throw deny('a new thread must list them as a participant')
      }
      return {}
    }

    case 'message': {
      const owner = existing ? existing.ownerUserId : str(data.fromUserId)
      if (owner !== actor.userId) throw deny('messages are sent as themselves only')
      if (str(data.fromUserId) && str(data.fromUserId) !== actor.userId) throw deny('fromUserId must be themselves')
      if (!existing) {
        const threadUuid = await resolveUuid('thread', str(data.threadId))
        const rows = threadUuid
          ? await query<{ participant_ids: unknown }>(
              `SELECT participant_ids FROM message_threads WHERE id = $1::uuid`,
              [threadUuid],
            )
          : []
        const me = await actorUuid(actor)
        const parts = Array.isArray(rows[0]?.participant_ids) ? (rows[0]!.participant_ids as unknown[]).map(String) : []
        if (!parts.includes(actor.userId) && !(me && parts.includes(me))) {
          throw deny('they are not a participant in that thread')
        }
      }
      return {}
    }

    case 'tenancy': {
      if (!isTenant && !isLandlord) throw deny('not on the portal allow-list')
      const party = isTenant ? 'tenant' : 'landlord'
      const other = isTenant ? 'landlord' : 'tenant'
      const uuid = await leaseUuid(body.id)
      if (!uuid) throw deny('portal users cannot create leases')
      const rows = await query<{ tenant_id: string | null; landlord_id: string | null; metadata: Record<string, unknown> | null }>(
        `SELECT tenant_id::text AS tenant_id, landlord_id::text AS landlord_id, metadata FROM leases WHERE id = $1::uuid`,
        [uuid],
      )
      const lease = rows[0]
      if (!lease) throw deny('portal users cannot create leases')
      const me = await actorUuid(actor)
      const partyId = isTenant ? lease.tenant_id : lease.landlord_id
      if (!me || partyId !== me) throw deny(`not the ${party} on this lease`)
      const stored = (lease.metadata?.eSign ?? null) as Record<string, unknown> | null
      if (!stored || !stored.envelopeId) throw deny('no lease envelope has been issued yet')
      const sent = (data.eSign ?? null) as Record<string, unknown> | null
      if (!sent || sent.envelopeId !== stored.envelopeId) throw deny('signature must be for the issued envelope')
      const sentParty = (sent[party] ?? null) as Record<string, unknown> | null
      if (!sentParty || !SIGN_PARTY_STATUSES.has(String(sentParty.status))) {
        throw deny('missing or invalid signature')
      }
      const nextParty: Record<string, unknown> = { status: sentParty.status }
      for (const k of ['signedAt', 'signerName', 'signatureDataUrl']) {
        if (typeof sentParty[k] === 'string') nextParty[k] = sentParty[k]
      }
      const merged: Record<string, unknown> = { ...stored, [party]: nextParty }
      merged.status = envelopeStatus(
        String(stored.status ?? 'sent'),
        merged.tenant as Record<string, unknown> | undefined,
        merged.landlord as Record<string, unknown> | undefined,
      )
      // The other party's block is always the stored one.
      merged[other] = stored[other]
      await query(
        `UPDATE leases
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('eSign', $2::jsonb),
                updated_at = NOW()
          WHERE id = $1::uuid`,
        [uuid, JSON.stringify(merged)],
      )
      return { handled: { ok: true, id: body.id, uuid } }
    }

    case 'payment': {
      if (!isTenant) throw deny('not on the portal allow-list')
      const uuid = await resolveUuid('payment', body.id)
      if (!uuid) throw deny('tenants cannot create payments')
      const me = await actorUuid(actor)
      const rows = await query<{ party_user_id: string | null }>(
        `SELECT party_user_id::text AS party_user_id FROM payments WHERE id = $1::uuid`,
        [uuid],
      )
      if (!rows[0] || !me || rows[0].party_user_id !== me) throw deny('not their payment')
      // Proof of payment only: status, amount, dates stay the agency's.
      await query(
        `UPDATE payments
            SET reference = COALESCE($2, reference),
                notes = COALESCE($3, notes),
                updated_at = NOW()
          WHERE id = $1::uuid AND party_user_id = $4::uuid`,
        [uuid, str(data.reference), str(data.notes), me],
      )
      return { handled: { ok: true, id: body.id, uuid } }
    }

    case 'property':
    case 'unit':
    case 'building':
    case 'room':
    case 'asset': {
      if (!isLandlord) throw deny('not on the portal allow-list')
      const sentLandlord = str(data.landlordId)
      if (sentLandlord && sentLandlord !== actor.userId) throw deny('landlordId must be themselves')
      if (existing?.landlordId && existing.landlordId !== actor.userId) throw deny('not their property')
      return {} // ownership checked by canWriteEntity
    }

    case 'lead': {
      if (!isTenant) throw deny('not on the portal allow-list')
      if (await resolveUuid('lead', body.id)) throw deny('enquiries are create-only')
      return {}
    }

    case 'property_event': {
      if (await resolveUuid('property_event', body.id)) throw deny('events are append-only')
      return {}
    }

    default:
      throw deny('not on the portal allow-list')
  }
}
