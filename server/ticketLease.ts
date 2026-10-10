/**
 * Maintenance ticket ↔ tenancy (maintenance_tickets.lease_id) link.
 *
 * The front-end tenancyId is resolved to a lease uuid and must round-trip
 * back to the same front-end id (entity_id_map / static LEASE_IDS). The lease
 * must be on the ticket's unit and in the unit's agency; a NEW link must be
 * to a Pending, Active or Notice lease (Ended / Cancelled refused). A client
 * uuid is never trusted on its own: every check reads the stored lease.
 */
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { LEASE_IDS } from './idMap.js'

const LINKABLE_LEASE_STATUSES = new Set(['PENDING', 'ACTIVE', 'NOTICE'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(code: string, message: string): Error {
  return Object.assign(new Error(message), { status: 400, code })
}

/**
 * Front-end id for a lease uuid — same order as bootstrap's tenancy ids
 * (entity_id_map, then the static seed map, else the uuid).
 */
export async function leaseFeId(leaseUuid: string): Promise<string> {
  const rows = await query<{ frontend_id: string }>(
    `SELECT frontend_id FROM entity_id_map WHERE entity_type = 'tenancy' AND backend_id::text = $1 LIMIT 1`,
    [leaseUuid],
  )
  return rows[0]?.frontend_id ?? LEASE_IDS[leaseUuid] ?? leaseUuid
}

/** Lease uuid for a front-end tenancy id, only when it round-trips. */
export async function leaseUuidRoundTrip(feId: string): Promise<string | null> {
  const uuid =
    (await resolveUuid('tenancy', feId)) ??
    Object.entries(LEASE_IDS).find(([, v]) => v === feId)?.[0] ??
    null
  if (!uuid || !UUID_RE.test(uuid)) return null
  return (await leaseFeId(uuid)) === feId ? uuid : null
}

/**
 * Validate a ticket's tenancy link and return the lease uuid to store.
 * `storedLeaseId` is the ticket's current lease (an unchanged link to a lease
 * that has since ended stays valid).
 */
export async function resolveTicketLease(
  tenancyFeId: string,
  unitUuid: string,
  clientUuid: string,
  storedLeaseId: string | null,
): Promise<string> {
  const lease = await leaseUuidRoundTrip(tenancyFeId)
  if (!lease) throw badRequest('TICKET_TENANCY_UNKNOWN', 'unknown tenancy')
  const rows = await query<{ unit_id: string; client_id: string; status: string }>(
    `SELECT unit_id::text AS unit_id, client_id::text AS client_id, status FROM leases WHERE id = $1::uuid`,
    [lease],
  )
  const r = rows[0]
  if (!r) throw badRequest('TICKET_TENANCY_UNKNOWN', 'unknown tenancy')
  if (r.unit_id !== unitUuid) throw badRequest('TICKET_TENANCY_NOT_ON_UNIT', 'tenancy is not on this unit')
  if (r.client_id !== clientUuid) throw badRequest('TICKET_TENANCY_OTHER_AGENCY', 'tenancy is in another agency')
  if (lease !== storedLeaseId && !LINKABLE_LEASE_STATUSES.has(String(r.status).toUpperCase())) {
    throw badRequest('TICKET_TENANCY_NOT_ACTIVE', 'only an Active, Pending or Notice tenancy can be linked')
  }
  return lease
}

/**
 * The tenant's own Active (else Notice / Pending) lease on a unit, as a front-end id,
 * for stamping a tenant-filed ticket. Null when they have none there.
 */
export async function tenantOwnLeaseFeOnUnit(tenantUuid: string, unitUuid: string): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `SELECT id::text AS id FROM leases
      WHERE unit_id = $1::uuid AND tenant_id = $2::uuid AND status IN ('ACTIVE', 'PENDING', 'NOTICE')
      ORDER BY (status = 'ACTIVE') DESC, start_date DESC LIMIT 1`,
    [unitUuid, tenantUuid],
  )
  return rows[0]?.id ? leaseFeId(rows[0].id) : null
}
