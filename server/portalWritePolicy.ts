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
 *   application       own (create / update, never delete); workflow moves
 *                     limited to applicantApplicationPolicy (coded 403
 *                     otherwise), document review fields locked,
 *                     APPLICANT_SERVER_FIELDS stripped, stored listing kept
 *                     on update, create only on a publicly listed property
 *   viewing           own booking: applicantEmail = their account email
 *   viewing_slot      booking recount only: booked_count = live count of
 *                     non-cancelled bookings, and only on a slot they booked
 *   ticket            own maintenance ticket / complaint (reportedByUserId);
 *                     contractorId / assignedAgentId / cost / status stripped
 *   thread / message  threads they participate in; messages from themselves
 *   tenancy           their own lease signature only (eSign.tenant; the
 *                     server merges it into the stored envelope)
 *   payment           proof of payment on their own payment (reference + notes)
 *   lead              enquiry create only
 *   property_event    append only (create)
 * landlord
 *   user, notification, thread / message as above
 *   application       review decision only (LANDLORD_APPLICATION_DECISION_FIELDS,
 *                     landlord_review -> conditionally_approved | rejected) on
 *                     their own properties; narrow UPDATE; no create / delete
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
import { ensureUuid, resolveUuid } from './entityMap.js'
import { leaseFeId, tenantOwnLeaseFeOnUnit } from './ticketLease.js'
import { SEED_VENDOR_ROUTES, resolvePreferredVendor } from '../src/lib/maintenanceApi.js'
import { TENANT_TICKET_PRIORITIES, normalizeTenantTicketPriority } from '../src/lib/tenantTicketPriority.js'
import { LEASE_IDS, TICKET_IDS } from './idMap.js'
import { forbiddenError, type DemoActor } from './actor.js'
import { APP_STAGE_TO_DB, type PersistBody } from './writes.js'
import { resolveLiveListing } from './listingResolve.js'
import { isAcceptanceStatus, notifyAcceptedElsewhereServer } from './acceptedElsewhere.js'
import {
  ESIGN_MIRROR_STATUSES,
  enforceApplicantApplicationWrite,
  stageOrder,
  storedLeaseESignStatus,
} from './applicantApplicationPolicy.js'
import { workflowProgress, workflowStageLabel } from '../src/lib/applicationWorkflow.js'

/**
 * Staff-owned application fields an applicant's write never changes
 * (create or update); the writer keeps the stored value when absent. On a new
 * application the agency comes from the listing and the agent is the
 * listing's agent. Workflow fields are NOT here: see
 * enforceApplicantApplicationWrite.
 */
export const APPLICANT_SERVER_FIELDS = ['agentId', 'agencyId', 'clientId', 'screening', 'creditCheck'] as const

/**
 * The only application fields a landlord write may change: the review
 * decision. Stage and progress are derived on the server from workflowStatus;
 * updated_at is set by the server. Everything else in the payload is ignored.
 */
export const LANDLORD_APPLICATION_DECISION_FIELDS = ['workflowStatus', 'stage', 'progress'] as const

/**
 * Landlord decisions: only out of landlord_review (rental template actions
 * CONDITIONALLY_APPROVE / LANDLORD_REJECTED). Stage label and progress mirror
 * src/lib/applicationWorkflow (workflowStageLabel / workflowProgress, pinned by
 * a test) so the server bundle does not pull the client workflow module.
 */
export const LANDLORD_APPLICATION_DECISIONS: Readonly<
  Record<string, { stage: string; progress: number }>
> = {
  conditionally_approved: { stage: 'Conditionally approved', progress: 45 },
  rejected: { stage: 'Rejected', progress: 0 },
}

const PUBLIC_UNIT_STATUS_KEYS = new Set(['PUBLISHED', 'FEATURED', 'VACANT', 'UNDER_OFFER', 'AVAILABLE'])

/**
 * Server-side isPubliclyListed for a single listing (same rule as the guest
 * marketplace slice): live unit with a public status, listed (not NOT_LISTED),
 * and a landlord who is not pending / rejected verification.
 */
export async function isPubliclyListedForApplication(propertyId: unknown): Promise<boolean> {
  let unitId: string
  try {
    unitId = (await resolveLiveListing(propertyId)).unitId
  } catch {
    return false
  }
  if (!unitId) return false
  const rows = await query<{
    status_config_key: string | null
    listing_type: string | null
    landlord_verification: string | null
  }>(
    `SELECT u.status_config_key, u.listing_type,
            l.metadata->'verification'->>'status' AS landlord_verification
       FROM units u
       LEFT JOIN buildings b ON b.id = u.building_id
       LEFT JOIN users l ON l.id = b.landlord_id
      WHERE u.id = $1::uuid`,
    [unitId],
  )
  const r = rows[0]
  if (!r) return false
  if (!PUBLIC_UNIT_STATUS_KEYS.has(String(r.status_config_key ?? '').toUpperCase())) return false
  if (String(r.listing_type ?? '').toUpperCase() === 'NOT_LISTED') return false
  if (r.landlord_verification === 'pending' || r.landlord_verification === 'rejected') return false
  return true
}

/**
 * Landlord application write, after the scope gate passed (own property): a
 * narrow UPDATE of the decision fields only, conditional on the application
 * still waiting for the landlord. Stage / progress / status are derived here.
 */
export async function landlordApplicationDecision(
  actor: DemoActor,
  body: PersistBody,
): Promise<PortalOutcome> {
  const deny = (why: string) =>
    forbiddenError(`Forbidden: landlord ${actor.userId} cannot ${body.action} application ${body.id} (${why})`)
  const data = (body.data ?? {}) as Record<string, unknown>
  const to = str(data.workflowStatus)
  if (to && ESIGN_MIRROR_STATUSES.has(to)) return landlordESignMirror(actor, body, to)
  const decision = to ? LANDLORD_APPLICATION_DECISIONS[to] : undefined
  if (!to || !decision) {
    throw deny('a landlord may only record the review decision (conditionally_approved or rejected)')
  }
  const uuid = await resolveUuid('application', body.id)
  if (!uuid) throw deny('unknown application')
  const { stage, progress } = decision
  const status = APP_STAGE_TO_DB[stage] ?? null
  const rows = await query<{ id: string }>(
    `UPDATE applications
        SET status = COALESCE($2, status),
            metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object('workflow_status', $3::text, 'stage', $4::text, 'progress', $5::int),
            updated_at = NOW()
      WHERE id = $1::uuid
        AND application_type = 'RENTAL'
        AND metadata->>'workflow_status' = 'landlord_review'
      RETURNING id::text AS id`,
    [uuid, status, to, stage, progress],
  )
  if (!rows[0]) {
    throw Object.assign(new Error('Conflict: application is not waiting for the landlord decision'), {
      status: 409,
    })
  }
  if (isAcceptanceStatus(to)) await notifyAcceptedElsewhereServer(uuid)
  return { handled: { ok: true, id: body.id, uuid } }
}

/**
 * The landlord's countersign mirrors the lease envelope onto the application
 * (AppStore recordTenancyLeaseSign: { ...app, workflowStatus: derived }).
 * Allowed only for the status the stored envelope of the linked lease shows,
 * and only forward; stage / progress derived here, applications.status kept.
 */
async function landlordESignMirror(actor: DemoActor, body: PersistBody, to: string): Promise<PortalOutcome> {
  const uuid = await resolveUuid('application', body.id)
  if (!uuid) throw forbiddenError(`Forbidden: unknown application ${body.id}`)
  const fromLease = await storedLeaseESignStatus(uuid)
  if (fromLease !== to) {
    throw Object.assign(
      forbiddenError(`Forbidden: landlord ${actor.userId} cannot set ${to}; the stored lease envelope does not show it`),
      { code: 'LEASE_SIGNATURE_NOT_RECORDED' },
    )
  }
  const rows = await query<{ workflow_status: string | null }>(
    `SELECT metadata->>'workflow_status' AS workflow_status FROM applications WHERE id = $1::uuid`,
    [uuid],
  )
  const from = rows[0]?.workflow_status ?? null
  const key = to as Parameters<typeof workflowStageLabel>[1]
  if (from && stageOrder('Rental', from as typeof key) >= stageOrder('Rental', key)) {
    // Already at or past this point: nothing to mirror.
    return { handled: { ok: true, id: body.id, uuid } }
  }
  await query(
    `UPDATE applications
        SET metadata = COALESCE(metadata, '{}'::jsonb)
              || jsonb_build_object('workflow_status', $2::text, 'stage', $3::text, 'progress', $4::int),
            updated_at = NOW()
      WHERE id = $1::uuid`,
    [uuid, to, workflowStageLabel('Rental', key), workflowProgress('Rental', key)],
  )
  if (!from || !isAcceptanceStatus(from)) await notifyAcceptedElsewhereServer(uuid)
  return { handled: { ok: true, id: body.id, uuid } }
}

/** Fields a tenant never sets on their own ticket (create or update). */
export const TENANT_TICKET_LOCKED_FIELDS = [
  'contractorId',
  'assignedAgentId',
  'assignedTo',
  'cost',
  'status',
  'warrantyCovered',
  'warranty_covered',
  'escalatedAt',
  'escalated_at',
] as const

function badRequest(code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(`Bad request: ${message}`), { status: 400, code })
}

/**
 * Warranty cover for a ticket, worked out on the server: the linked asset
 * (internal_assets.warranty_expires_at; it must be on the ticket's unit)
 * still under warranty on the ticket date (stored created_at, now for a new
 * ticket). Units carry no warranty fields in the schema, so no asset means
 * not covered.
 */
export async function ticketWarrantyCovered(
  assetUuid: string | null,
  unitUuid: string | null,
  ticketDate: Date | string | null,
): Promise<boolean> {
  if (!assetUuid) return false
  const rows = await query<{ warranty_expires_at: Date | string | null; unit_id: string | null }>(
    `SELECT warranty_expires_at, unit_id::text AS unit_id FROM internal_assets WHERE id = $1::uuid`,
    [assetUuid],
  )
  const a = rows[0]
  if (!a || (unitUuid && a.unit_id !== unitUuid)) {
    throw badRequest('TICKET_ASSET_NOT_ON_UNIT', 'the linked asset is not on this unit')
  }
  if (!a.warranty_expires_at) return false
  const at = ticketDate ? new Date(ticketDate) : new Date()
  return new Date(a.warranty_expires_at).getTime() >= at.getTime()
}

/**
 * Server mirror of AppStore createTicket's vendor routing
 * (resolvePreferredVendor over the agency's category routes): the preferred
 * contractor for a new tenant ticket on a listing of `unitClientUuid`.
 * Routes are the shared SEED_VENDOR_ROUTES (there is no vendor-route table;
 * the client reads the same seed).
 */
export async function preferredVendorForTicket(
  unitClientUuid: string | null,
  categoryKey: string,
): Promise<string | null> {
  if (!unitClientUuid) return null
  const agencies = [...new Set(SEED_VENDOR_ROUTES.map((r) => r.clientId))]
  for (const agencyFe of agencies) {
    if ((await resolveUuid('agency', agencyFe)) !== unitClientUuid) continue
    return resolvePreferredVendor(SEED_VENDOR_ROUTES, agencyFe, categoryKey)
  }
  return null
}

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
        // Property ownership is checked by canWriteEntity; the write itself is
        // then narrowed to the decision fields (landlordApplicationDecision).
        return {}
      }
      // Tenant / contractor applicant (own-application rule in
      // assertPersistAllowed). Assignment, agency and the screening pipeline
      // are staff-owned and never sent back by the applicant UI as changes;
      // the listing of an existing application is fixed (stored unit kept).
      // Workflow moves are checked, never silently dropped
      // (enforceApplicantApplicationWrite: allowed moves or a coded 403).
      for (const k of APPLICANT_SERVER_FIELDS) delete data[k]
      if (existing) {
        delete data.propertyId
        delete data.unitId
      } else if (!(await isPubliclyListedForApplication(data.propertyId))) {
        throw deny('applications are only taken on publicly listed properties')
      }
      await enforceApplicantApplicationWrite(actor, body.id, data, Boolean(existing))
      return {}
    }

    case 'support_ticket': {
      // CR7: portal users may raise a ticket, never resolve or edit one.
      if (await resolveUuid('support_ticket', body.id)) throw deny('portal users submit tickets, they never resolve')
      return {}
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
        // Assignment, cost, status, warranty and escalation are staff /
        // contractor / server fields; the writer keeps the stored values when
        // they are absent (defaults on create).
        for (const k of TENANT_TICKET_LOCKED_FIELDS) delete data[k]
        // The tenancy link is fixed after create: a tenant can never move a
        // ticket onto (or off) a tenancy. Re-sending the stored link is no change.
        if (rows[0] && Object.prototype.hasOwnProperty.call(data, 'tenancyId')) {
          const leaseRow = (
            await query<{ lease_id: string | null }>(
              `SELECT lease_id::text AS lease_id FROM maintenance_tickets WHERE id = $1::uuid`,
              [uuid],
            )
          )[0]
          const storedFe = leaseRow?.lease_id ? await leaseFeId(leaseRow.lease_id) : null
          if ((str(data.tenancyId) ?? null) !== storedFe) throw deny('tenancyId cannot change after create')
          delete data.tenancyId
        }
        const stored = rows[0]
          ? (
              await query<{ priority: string | null; created_at: Date | string | null; unit_id: string | null; asset_id: string | null }>(
                `SELECT priority, created_at, unit_id::text AS unit_id, asset_id::text AS asset_id
                   FROM maintenance_tickets WHERE id = $1::uuid`,
                [uuid],
              )
            )[0] ?? null
          : null

        // Priority from the fixed tenant list; anything else is a 400.
        // Re-sending the stored priority (e.g. an Urgent set by staff) is no change.
        if (Object.prototype.hasOwnProperty.call(data, 'priority')) {
          const sent = data.priority
          const same = stored?.priority && typeof sent === 'string' && sent.trim().toUpperCase() === stored.priority.toUpperCase()
          if (same) {
            delete data.priority
          } else {
            const p = normalizeTenantTicketPriority(sent)
            if (!p) {
              throw badRequest(
                'TICKET_PRIORITY_INVALID',
                `priority must be one of ${TENANT_TICKET_PRIORITIES.join(', ')}`,
              )
            }
            data.priority = p
          }
        }

        let unit: string | null = stored?.unit_id ?? null
        if (!rows[0]) {
          unit =
            (await resolveUuid('property', str(data.propertyId) ?? '')) ??
            (await resolveUuid('unit', str(data.unitId ?? data.propertyId) ?? ''))
          // New ticket: route it to the agency's preferred vendor for the
          // category, as the client does (AppStore createTicket).
          const u = unit
            ? await query<{ client_id: string | null }>(`SELECT client_id::text AS client_id FROM units WHERE id = $1::uuid`, [unit])
            : []
          const vendor = await preferredVendorForTicket(u[0]?.client_id ?? null, str(data.categoryKey) ?? 'GENERAL')
          if (vendor) data.contractorId = vendor
          // New ticket: only on a unit where the tenant holds a lease (Active,
          // Notice or Pending) — never on a listing they have only applied
          // to. Linked to that lease (server-stamped); any other tenancy is
          // refused.
          const me = await actorUuid(actor)
          const own = me && unit ? await tenantOwnLeaseFeOnUnit(me, unit) : null
          if (!own) throw deny('no lease on this unit')
          const sentTenancy = str(data.tenancyId)
          if (sentTenancy && sentTenancy !== own) throw deny('not their tenancy')
          data.tenancyId = own
        }
        // Warranty cover: from the asset's warranty on the ticket date, never
        // from the tenant.
        const assetSent = Object.prototype.hasOwnProperty.call(data, 'internalAssetId')
        const asset = assetSent
          ? str(data.internalAssetId)
            ? await resolveUuid('asset', str(data.internalAssetId)!)
            : null
          : (stored?.asset_id ?? null)
        if (assetSent && str(data.internalAssetId) && !asset) {
          throw badRequest('TICKET_ASSET_NOT_ON_UNIT', 'unknown asset')
        }
        data.warrantyCovered = await ticketWarrantyCovered(asset, unit, stored?.created_at ?? null)
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

    case 'activity': {
      // Landlord actions (e.g. the review decision) log to the agency feed.
      // Append-only, only for an agency they own a listing with, written
      // under their own name (the client-sent `user` / `at` are not trusted).
      if (!isLandlord) throw deny('not on the portal allow-list')
      if (existing || (await resolveUuid('activity', body.id))) throw deny('activity entries are append-only')
      const me = await actorUuid(actor)
      const client = await resolveUuid('agency', str(data.agencyId) ?? '')
      const text = (str(data.text) ?? '').slice(0, 500)
      if (!me || !client || !text) throw deny('activity needs their agency and a text')
      const owns = await query<{ n: number | string }>(
        `SELECT COUNT(*)::int AS n FROM units u JOIN buildings b ON b.id = u.building_id
          WHERE b.landlord_id = $1::uuid AND u.client_id = $2::uuid`,
        [me, client],
      )
      if (!Number(owns[0]?.n ?? 0)) throw deny('no listing of theirs with that agency')
      const who = await query<{ name: string | null }>(
        `SELECT NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '') AS name FROM users WHERE id = $1::uuid`,
        [me],
      )
      const uuid = await ensureUuid('activity', body.id)
      await query(
        `INSERT INTO event_log (id, client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
         VALUES ($1::uuid, $2::uuid, 'activity', 'agency', NULL, $3::uuid, $4::jsonb, NOW())`,
        [uuid, client, me, JSON.stringify({ text, user: who[0]?.name ?? 'Landlord' })],
      )
      return { handled: { ok: true, id: body.id, uuid } }
    }

    default:
      throw deny('not on the portal allow-list')
  }
}
