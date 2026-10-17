/**
 * Server-side property scope: load links from Postgres, gate writes, filter bootstrap.
 * Reuses client rules from src/lib/scope.ts + scopeWrite.ts.
 */
import { isValidSignatureDataUrl, signatureInvalidError } from '../src/lib/signature/signatureImage.js'
import { query } from './db.js'
import { enforceStaffCreditCheckConsent, enforceStaffSignedStageMove } from './applicantApplicationPolicy.js'
import { enforceStaffTenancyESign, isClientLeaseSignedWrite, leaseSignedRefusedError } from './leaseSign.js'
import { MIN_PASSWORD_LENGTH } from './passwordPolicy.js'
import {
  APP_REF_TO_ID,
  CLIENT_TO_AGENCY,
  LEASE_IDS,
  TICKET_IDS,
  UNIT_TO_PROPERTY,
} from './idMap.js'
import { resolveUuid, ensureEntityMapTable } from './entityMap.js'
import {
  feAgencyFromCache,
  fePropertyFromUnitCache,
  feUserFromCache,
  loadIdMapCache,
} from './idMapCache.js'
import type { EntityType } from './entityMap.js'
import { agencyIdInFeSpace } from '../src/lib/agencyScope.js'
import type { PersistBody } from './writes.js'
import type { DemoActor } from './actor.js'
import { forbiddenError } from './actor.js'
import {
  buildPropertyScope,
  isAgencyWideRole,
  toPropertyLinks,
  type PropertyScope,
  type ScopeLinksInput,
} from '../src/lib/scope.js'
import { canWriteEntity } from '../src/lib/scopeWrite.js'
import type { PropertyAccessSubject } from '../src/lib/agencyScope.js'
import type { Permission, Role } from '../src/types/domain.js'
import { effectiveCan } from '../src/lib/permissions.js'
import {
  canResolveSupportTicket,
  supportTicketRoutingAgency,
} from '../src/lib/supportTickets.js'
import { isReservedSuperAdminEmail, resolveFrontendRole } from '../src/lib/supabase/idMap.js'
import {
  enforcePortalWritePolicy,
  landlordApplicationDecision,
  PORTAL_ROLES as PORTAL_WRITE_ROLES,
  type PortalOutcome,
} from './portalWritePolicy.js'

type FePropertyRow = PropertyAccessSubject & { id: string }

async function feUserId(uuid: string | null | undefined): Promise<string | null> {
  const cache = await loadIdMapCache()
  return feUserFromCache(cache, uuid)
}

async function fePropertyFromUnit(unitUuid: string | null | undefined): Promise<string | null> {
  const cache = await loadIdMapCache()
  return fePropertyFromUnitCache(cache, unitUuid)
}

/** Agency FE id — parity with bootstrap.ts agencyFe (entity_id_map first). */
export async function agencyFeId(clientOrFeId: string | null | undefined): Promise<string | null> {
  if (!clientOrFeId) return null
  return (await agencyFe(clientOrFeId)) ?? clientOrFeId
}

async function agencyFe(clientId: string | null | undefined): Promise<string | null> {
  if (!clientId) return null
  const cache = await loadIdMapCache()
  return feAgencyFromCache(cache, clientId)
}

async function loadPropertyRows(cache: Awaited<ReturnType<typeof loadIdMapCache>>): Promise<FePropertyRow[]> {
  const rows = await query<{
    unit_id: string
    client_id: string
    agent_id: string | null
    landlord_id: string | null
  }>(`
    SELECT u.id AS unit_id, u.client_id, u.agent_id, b.landlord_id
    FROM units u
    JOIN buildings b ON b.id = u.building_id
  `)
  return rows.map((r) => {
    const id =
      fePropertyFromUnitCache(cache, r.unit_id) ?? UNIT_TO_PROPERTY[r.unit_id] ?? r.unit_id
    const agencyId = feAgencyFromCache(cache, r.client_id) ?? CLIENT_TO_AGENCY[r.client_id] ?? r.client_id
    const agentId = feUserFromCache(cache, r.agent_id)
    // A building with a NULL or unmapped landlord_id has no landlord — never
    // hand it to a demo owner (was 'u-owner1'). Staff scope still lists it.
    const landlordId = feUserFromCache(cache, r.landlord_id) ?? null
    return { id, agencyId, agentId, landlordId }
  })
}

async function loadScopeLinks(): Promise<ScopeLinksInput> {
  const cache = await loadIdMapCache()
  const properties = await loadPropertyRows(cache)

  const appRows = await query<{
    applicant_id: string | null
    email: string | null
    unit_id: string
    status: string
    reference_code: string
    metadata: Record<string, unknown> | null
  }>(`
    SELECT a.applicant_id, u.email, a.unit_id, a.status, a.reference_code, a.metadata
    FROM applications a
    LEFT JOIN users u ON u.id = a.applicant_id
  `)

  const applications: Array<{
    applicantUserId: string | null
    email: string
    propertyId: string
    stage: NonNullable<ScopeLinksInput['applications']>[number]['stage']
  }> = []
  for (const a of appRows) {
    const propertyId = fePropertyFromUnitCache(cache, a.unit_id) ?? ''
    const metaStage = typeof a.metadata?.stage === 'string' ? a.metadata.stage : null
    const stage = (metaStage ??
      (a.status === 'REJECTED'
        ? 'Blocked'
        : a.status === 'APPROVED'
          ? 'Approved'
          : 'Under Review')) as NonNullable<ScopeLinksInput['applications']>[number]['stage']
    applications.push({
      applicantUserId: feUserFromCache(cache, a.applicant_id),
      email: a.email ?? '',
      propertyId,
      stage,
    })
  }

  const leaseRows = await query<{ tenant_id: string | null; unit_id: string }>(
    `SELECT tenant_id, unit_id FROM leases`,
  )
  const tenancies = leaseRows.map((l) => ({
    tenantUserId: feUserFromCache(cache, l.tenant_id) ?? '',
    propertyId: fePropertyFromUnitCache(cache, l.unit_id) ?? '',
  }))

  const ticketRows = await query<{
    contractor_id: string | null
    unit_id: string
    client_id: string
    status: string
    assigned_to: string | null
  }>(`
    SELECT contractor_id, unit_id, client_id, status, assigned_to
    FROM maintenance_tickets
  `)
  const tickets: Array<{
    contractorId: string | null
    propertyId: string
    agencyId: string
    status: 'Cancelled' | 'In Progress' | 'Awaiting Parts' | 'Completed' | 'Requested'
    assignedAgentId: string | null
  }> = []
  for (const t of ticketRows) {
    const status =
      t.status === 'COMPLETED' || t.status === 'RESOLVED'
        ? ('Completed' as const)
        : t.status === 'CANCELLED'
          ? ('Cancelled' as const)
          : t.status === 'IN_PROGRESS'
            ? ('In Progress' as const)
            : t.status === 'AWAITING_PARTS'
              ? ('Awaiting Parts' as const)
              : ('Requested' as const)
    tickets.push({
      contractorId: feUserFromCache(cache, t.contractor_id),
      propertyId: fePropertyFromUnitCache(cache, t.unit_id) ?? '',
      agencyId: feAgencyFromCache(cache, t.client_id) ?? t.client_id,
      status,
      assignedAgentId: feUserFromCache(cache, t.assigned_to),
    })
  }

  return {
    properties: toPropertyLinks(properties),
    applications,
    tenancies,
    tickets,
  }
}

async function resolveAgencySuspended(agencyId: string | null): Promise<boolean> {
  if (!agencyId) return false
  const clientUuid = await resolveUuid('agency', agencyId)
  if (!clientUuid) return false
  const rows = await query<{ status: string }>(
    `SELECT status FROM clients WHERE id = $1::uuid LIMIT 1`,
    [clientUuid],
  )
  const st = String(rows[0]?.status ?? '').toLowerCase()
  return st === 'suspended' || st === 'cancelled'
}

/** Enrich actor agency from DB user row when header omitted; normalize UUID → FE. */
export async function enrichActor(actor: DemoActor): Promise<DemoActor> {
  let agencyId = actor.agencyId
  if (!agencyId && actor.role !== 'super_admin') {
    const uuid = await resolveUuid('user', actor.userId)
    if (!uuid) return actor
    const rows = await query<{ client_id: string | null }>(
      `SELECT client_id FROM users WHERE id = $1::uuid LIMIT 1`,
      [uuid],
    )
    agencyId = (await agencyFe(rows[0]?.client_id ?? null)) ?? null
  } else if (agencyId) {
    agencyId = (await agencyFe(agencyId)) ?? agencyId
  }
  return agencyId === actor.agencyId ? actor : { ...actor, agencyId }
}

export async function buildActorPropertyScope(actor: DemoActor): Promise<PropertyScope> {
  await ensureEntityMapTable()
  const enriched = await enrichActor(actor)
  // Header / enrich may still carry a client UUID — normalize to FE for canSeeAgency.
  const agencyId = (await agencyFe(enriched.agencyId)) ?? enriched.agencyId
  const links = await loadScopeLinks()
  const agencySuspended = await resolveAgencySuspended(agencyId)
  return buildPropertyScope(
    {
      role: enriched.role,
      userId: enriched.userId,
      agencyId,
      agencySuspended,
    },
    links,
  )
}

export type TenancyAccess = {
  leaseUuid: string
  propertyId: string | null
  agencyId: string | null
  tenantUserId: string | null
  eSign: Record<string, unknown> | null
}

/**
 * Read gate for one lease (tenancy): super admin; the lease's tenant; or the
 * lease's property is in the actor's property scope (agency-wide roles: the
 * lease is in their agency). Throws 404 when the lease is unknown, 403 when
 * it is outside scope.
 */
export async function assertTenancyReadable(
  actor: DemoActor,
  tenancyFeId: string,
): Promise<TenancyAccess> {
  let uuid = await resolveUuid('tenancy', tenancyFeId)
  if (!uuid) {
    uuid = Object.entries(LEASE_IDS).find(([, v]) => v === tenancyFeId)?.[0] ?? null
  }
  const notFound = Object.assign(new Error('Lease not found'), { status: 404 })
  if (!uuid) throw notFound
  const rows = await query<{
    id: string
    unit_id: string | null
    client_id: string | null
    tenant_id: string | null
    metadata: Record<string, unknown> | null
  }>(
    `SELECT id::text AS id, unit_id::text AS unit_id, client_id::text AS client_id,
            tenant_id::text AS tenant_id, metadata
     FROM leases WHERE id = $1::uuid LIMIT 1`,
    [uuid],
  )
  const r = rows[0]
  if (!r) throw notFound
  const meta = r.metadata ?? {}
  const access: TenancyAccess = {
    leaseUuid: r.id,
    propertyId: await fePropertyFromUnit(r.unit_id),
    agencyId: await agencyFe(r.client_id),
    tenantUserId: await feUserId(r.tenant_id),
    eSign:
      meta.eSign && typeof meta.eSign === 'object' ? (meta.eSign as Record<string, unknown>) : null,
  }
  if (actor.role === 'super_admin') return access
  if (access.tenantUserId && access.tenantUserId === actor.userId) return access
  const scope = await buildActorPropertyScope(actor)
  if (access.propertyId && scope.allowedPropertyIds.has(access.propertyId)) return access
  if (
    isAgencyWideRole(actor.role as Role) &&
    scope.viewer.agencyId &&
    access.agencyId === scope.viewer.agencyId
  ) {
    return access
  }
  throw forbiddenError('Lease is outside your scope')
}

/** FE agency id for a client UUID (entity_id_map first, then seed map). */
export async function agencyFeForClient(clientId: string | null | undefined): Promise<string | null> {
  return agencyFe(clientId)
}

/** Actor agency normalised to the FE id space used by bootstrap rows. */
export async function normalizedActorAgency(actor: DemoActor): Promise<string | null> {
  const enriched = await enrichActor(actor)
  return (await agencyFe(enriched.agencyId)) ?? enriched.agencyId
}

type ExistingRow = {
  propertyId: string | null
  agencyId: string | null
  agentId: string | null
  landlordId: string | null
  assignedAgentId: string | null
  contractorId: string | null
  ownerUserId: string | null
  partyUserId: string | null
  threadId: string | null
}

/**
 * Helper to safely quote PostgreSQL identifiers (table/column names).
 * Protects against SQL injection for identifiers.
 */
function quoteIdentifier(name: string): string {
  if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}. Must match [a-zA-Z_][a-zA-Z0-9_]*`)
  }
  return `"${name}"`
}

async function loadExisting(resource: EntityType, feId: string): Promise<ExistingRow | null> {
  const empty: ExistingRow = {
    propertyId: null,
    agencyId: null,
    agentId: null,
    landlordId: null,
    assignedAgentId: null,
    contractorId: null,
    ownerUserId: null,
    partyUserId: null,
    threadId: null,
  }

  const cache = await loadIdMapCache()
  const toAgencyFe = (clientId: string | null | undefined) => feAgencyFromCache(cache, clientId)

  if (resource === 'property' || resource === 'unit') {
    const uuid = (await resolveUuid('property', feId)) ?? (await resolveUuid('unit', feId))
    if (!uuid) return { ...empty, propertyId: feId }
    const rows = await query<{
      client_id: string
      agent_id: string | null
      landlord_id: string | null
    }>(`
      SELECT u.client_id, u.agent_id, b.landlord_id
      FROM units u JOIN buildings b ON b.id = u.building_id
      WHERE u.id = $1::uuid LIMIT 1
    `, [uuid])
    const r = rows[0]
    if (!r) return { ...empty, propertyId: feId }
    return {
      ...empty,
      propertyId: feId,
      agencyId: toAgencyFe(r.client_id),
      agentId: await feUserId(r.agent_id),
      landlordId: await feUserId(r.landlord_id),
    }
  }

  const tableMap: Partial<
    Record<
      EntityType,
      {
        table: string
        unitCol?: string
        clientCol?: string
        agentCol?: string
        /** Column naming the row's owner (own-row write shortcut). */
        ownerCol?: string
        extra?: string
      }
    >
  > = {
    lead: { table: 'leads', unitCol: 'unit_id', clientCol: 'client_id', agentCol: 'agent_id' },
    application: {
      table: 'applications',
      unitCol: 'unit_id',
      clientCol: 'client_id',
      agentCol: 'agent_id',
      ownerCol: 'applicant_id',
    },
    tenancy: { table: 'leases', unitCol: 'unit_id', clientCol: 'client_id', agentCol: 'agent_id' },
    viewing: { table: 'bookings', unitCol: 'unit_id', clientCol: 'client_id', agentCol: 'agent_id' },
    viewing_slot: {
      table: 'viewing_slots',
      unitCol: 'unit_id',
      clientCol: 'client_id',
      agentCol: 'agent_id',
    },
    payment: { table: 'payments', unitCol: 'unit_id', clientCol: 'client_id' },
    ticket: {
      table: 'maintenance_tickets',
      unitCol: 'unit_id',
      clientCol: 'client_id',
    },
    document: { table: 'documents', unitCol: 'unit_id', clientCol: 'client_id' },
    thread: { table: 'message_threads', unitCol: 'unit_id', clientCol: 'client_id' },
    message: { table: 'messages', clientCol: 'client_id' },
    notification: { table: 'notifications', clientCol: 'client_id' },
    building: { table: 'buildings', clientCol: 'client_id' },
    agency: { table: 'clients' },
    user: { table: 'users', clientCol: 'client_id' },
    property_event: { table: 'event_log', clientCol: 'client_id' },
    activity: { table: 'event_log', clientCol: 'client_id' },
    invoice: { table: 'invoices', clientCol: 'client_id' },
    suite_alert: { table: 'suite_alerts', clientCol: 'client_id' },
    lookup: { table: 'client_lookup_configs', clientCol: 'client_id' },
    room: { table: 'rooms', clientCol: 'client_id' },
    asset: { table: 'internal_assets', clientCol: 'client_id' },
    trust_transaction: { table: 'trust_transactions', clientCol: 'client_id' },
    trust_allocation: { table: 'trust_allocations', clientCol: 'client_id' },
    csv_import_batch: { table: 'csv_import_batches', clientCol: 'client_id' },
    payout_instruction: { table: 'payout_instructions', clientCol: 'client_id' },
    deposit_holding: { table: 'deposit_holdings', clientCol: 'client_id' },
    support_ticket: { table: 'event_log', clientCol: 'client_id' },
  }

  const spec = tableMap[resource]
  if (!spec) return null

  let uuid = await resolveUuid(resource, feId)
  if (!uuid && resource === 'tenancy') {
    // seed lease FE ids
    const reverse = Object.entries(LEASE_IDS).find(([, v]) => v === feId)?.[0]
    uuid = reverse ?? null
  }
  if (!uuid && resource === 'application') {
    const reverse = Object.entries(APP_REF_TO_ID).find(([, v]) => v === feId)?.[0]
    if (reverse) {
      const rows = await query<{ id: string }>(
        `SELECT id::text AS id FROM applications WHERE reference_code = $1 LIMIT 1`,
        [feId],
      )
      uuid = rows[0]?.id ?? null
    } else {
      const rows = await query<{ id: string }>(
        `SELECT id::text AS id FROM applications WHERE reference_code = $1 LIMIT 1`,
        [feId],
      )
      uuid = rows[0]?.id ?? null
    }
  }
  if (!uuid && resource === 'ticket') {
    const reverse = Object.entries(TICKET_IDS).find(([, v]) => v === feId)?.[0]
    uuid = reverse ?? (await resolveUuid('ticket', feId))
  }
  if (!uuid) return null

  if (resource === 'agency') {
    return { ...empty, agencyId: toAgencyFe(uuid) ?? feId }
  }

  if (resource === 'ticket') {
    const rows = await query<{
      unit_id: string
      client_id: string
      assigned_to: string | null
      contractor_id: string | null
    }>(
      `SELECT unit_id, client_id, assigned_to, contractor_id FROM maintenance_tickets WHERE id = $1::uuid`,
      [uuid],
    )
    const r = rows[0]
    if (!r) return null
    return {
      ...empty,
      propertyId: await fePropertyFromUnit(r.unit_id),
      agencyId: toAgencyFe(r.client_id),
      assignedAgentId: await feUserId(r.assigned_to),
      contractorId: await feUserId(r.contractor_id),
    }
  }

  if (resource === 'message') {
    const rows = await query<{ client_id: string; thread_id: string; from_user_id: string }>(
      `SELECT client_id, thread_id, from_user_id FROM messages WHERE id = $1::uuid`,
      [uuid],
    )
    const r = rows[0]
    if (!r) return null
    const th = await query<{ unit_id: string | null }>(
      `SELECT unit_id FROM message_threads WHERE id = $1::uuid`,
      [r.thread_id],
    )
    return {
      ...empty,
      agencyId: toAgencyFe(r.client_id),
      propertyId: await fePropertyFromUnit(th[0]?.unit_id ?? null),
      ownerUserId: await feUserId(r.from_user_id),
      threadId: r.thread_id,
    }
  }

  if (resource === 'notification') {
    const rows = await query<{ client_id: string | null; user_id: string }>(
      `SELECT client_id, user_id FROM notifications WHERE id = $1::uuid`,
      [uuid],
    )
    const r = rows[0]
    if (!r) return null
    return {
      ...empty,
      agencyId: toAgencyFe(r.client_id),
      ownerUserId: await feUserId(r.user_id),
    }
  }

  if (resource === 'user') {
    const rows = await query<{ client_id: string | null }>(
      `SELECT client_id FROM users WHERE id = $1::uuid`,
      [uuid],
    )
    // No row: a create, not an edit (the user write policy needs to know).
    if (!rows[0]) return null
    return {
      ...empty,
      agencyId: toAgencyFe(rows[0].client_id ?? null),
      ownerUserId: feId,
    }
  }

  if (resource === 'building') {
    const rows = await query<{ client_id: string; landlord_id: string | null }>(
      `SELECT client_id, landlord_id FROM buildings WHERE id = $1::uuid`,
      [uuid],
    )
    const r = rows[0]
    if (!r) return null
    return {
      ...empty,
      agencyId: toAgencyFe(r.client_id),
      landlordId: await feUserId(r.landlord_id),
    }
  }

  if (resource === 'room' || resource === 'asset') {
    const unitCol = resource === 'room' ? 'unit_id' : 'unit_id'
    // Use quoted identifiers to prevent SQL injection
    const rows = await query<{ unit_id: string; client_id: string }>(
      `SELECT ${quoteIdentifier(unitCol)} AS unit_id, ${quoteIdentifier('client_id')} FROM ${quoteIdentifier(spec.table)} WHERE id = $1::uuid`,
      [uuid],
    )
    const r = rows[0]
    if (!r) return null
    return {
      ...empty,
      propertyId: await fePropertyFromUnit(r.unit_id),
      agencyId: toAgencyFe(r.client_id),
    }
  }

  if (resource === 'payment') {
    const rows = await query<{
      unit_id: string | null
      client_id: string
      party_user_id: string | null
    }>(`SELECT unit_id, client_id, party_user_id FROM payments WHERE id = $1::uuid`, [uuid])
    const r = rows[0]
    if (!r) return null
    return {
      ...empty,
      propertyId: await fePropertyFromUnit(r.unit_id),
      agencyId: toAgencyFe(r.client_id),
      partyUserId: await feUserId(r.party_user_id),
    }
  }

  // Generic unit + client + agent
  const cols = ['id']
  if (spec.unitCol) cols.push(spec.unitCol)
  if (spec.clientCol) cols.push(spec.clientCol)
  if (spec.agentCol) cols.push(spec.agentCol)
  if (spec.ownerCol) cols.push(spec.ownerCol)
  // Use quoted identifiers for all columns and table name
  const quotedCols = cols.map(quoteIdentifier)
  const rows = await query<Record<string, string | null>>(
    `SELECT ${quotedCols.join(', ')} FROM ${quoteIdentifier(spec.table)} WHERE id = $1::uuid LIMIT 1`,
    [uuid],
  )
  const r = rows[0]
  if (!r) return null
  return {
    ...empty,
    propertyId: spec.unitCol ? await fePropertyFromUnit(r[spec.unitCol] as string | null) : null,
    agencyId: spec.clientCol
      ? toAgencyFe(r[spec.clientCol] as string | null)
      : null,
    agentId: spec.agentCol ? await feUserId(r[spec.agentCol] as string | null) : null,
    ownerUserId: spec.ownerCol ? await feUserId(r[spec.ownerCol] as string | null) : null,
  }
}

function strField(data: Record<string, unknown> | undefined, key: string): string | null {
  const v = data?.[key]
  if (v == null || v === '') return null
  return String(v)
}

async function propertySubject(propertyId: string | null): Promise<PropertyAccessSubject | null> {
  if (!propertyId) return null
  const cache = await loadIdMapCache()
  const rows = await loadPropertyRows(cache)
  return rows.find((p) => p.id === propertyId) ?? null
}

/** User fields only a super admin (or, partly, an agency users.manage admin) may set. */
export const PRIVILEGED_USER_FIELDS = [
  'role',
  'agencyId',
  'active',
  'enabledPermissions',
  'verification',
  'licenseStatus',
  'mentorId',
  'commissionSharePct',
] as const

/** Credential fields stripped from every non-super user write. */
export const CREDENTIAL_USER_FIELDS = ['passwordHash', 'password', 'tempPassword'] as const

/**
 * Does the actor hold any of these permissions, from their role defaults and
 * the enabledPermissions stored on their user row (never from the request)?
 */
export async function actorStoredCan(actor: DemoActor, perms: readonly Permission[]): Promise<boolean> {
  if (actor.role === 'super_admin') return true
  let enabled: Permission[] | undefined
  const uuid = await resolveUuid('user', actor.userId)
  if (uuid) {
    const rows = await query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM users WHERE id = $1::uuid`,
      [uuid],
    )
    const p = rows[0]?.metadata?.enabledPermissions
    if (Array.isArray(p)) enabled = p as Permission[]
  }
  return perms.some((perm) => effectiveCan(actor.role as Role, perm, undefined, enabled))
}

/** Does the actor (agency admin) hold users.manage, from their stored permissions? */
export async function actorHasUsersManage(actor: DemoActor): Promise<boolean> {
  if (actor.role !== 'client_admin' && actor.role !== 'agent_admin') return false
  return actorStoredCan(actor, ['users.manage'])
}

/** Trust-account resources (persistable). Arrears snapshots are derived, not written. */
export const TRUST_RESOURCES: ReadonlySet<string> = new Set([
  'trust_transaction',
  'trust_allocation',
  'csv_import_batch',
  'payout_instruction',
  'deposit_holding',
])

/** Permission (any of) an agency admin needs to write each trust resource. */
const TRUST_WRITE_PERMS: Record<string, readonly Permission[]> = {
  trust_transaction: ['trust.allocate', 'trust.import_csv'],
  trust_allocation: ['trust.allocate'],
  csv_import_batch: ['trust.import_csv'],
  // Proposing a payout (the approve / submit steps have their own routes).
  payout_instruction: ['trust.approve_payout', 'trust.allocate'],
  deposit_holding: ['trust.allocate'],
}

/** Agency roles that may ever write trust rows (with the permission above). */
const TRUST_ADMIN_ROLES: ReadonlySet<string> = new Set(['client_admin', 'agent_admin'])

/**
 * Trust writes: super admin, or an agency admin (client_admin / agent_admin)
 * holding the resource's trust permission, in their own agency only. No other
 * role (field agents, landlords, tenants, contractors) writes trust rows.
 *
 * payout_instruction through generic persist is create-only and always lands
 * as a fresh proposal by the actor: status, approvedBy, submittedAt, settledAt
 * and partnerPayoutId are forced, and an update / delete is refused for every
 * actor. Approve / submit go through POST /api/trust/payouts/:id/(approve|submit).
 */
export async function enforceTrustWritePolicy(
  actor: DemoActor,
  body: PersistBody,
  existing: ExistingRow | null,
): Promise<void> {
  const deny = (why: string) =>
    forbiddenError(`Forbidden: ${actor.role} ${actor.userId} cannot ${body.action} ${body.resource} ${body.id} (${why})`)

  if (body.resource === 'payout_instruction') {
    if (body.action === 'delete' && actor.role !== 'super_admin') {
      throw deny('payout instructions are not deleted through persist')
    }
    if (body.action !== 'delete') {
      if (existing) {
        throw deny('approve / submit go through /api/trust/payouts/:id; a payout is never edited through persist')
      }
      const data = (body.data ?? {}) as Record<string, unknown>
      body.data = data
      data.status = 'proposed'
      data.proposedBy = actor.userId
      data.approvedBy = null
      data.submittedAt = null
      data.settledAt = null
      data.partnerPayoutId = null
    }
  }

  if (actor.role === 'super_admin') return
  if (body.action === 'delete') throw deny('trust rows are not deleted through persist')
  if (!TRUST_ADMIN_ROLES.has(actor.role) || !actor.agencyId) {
    throw deny('trust writes need an agency admin')
  }
  const actorAgency = await agencyFeId(actor.agencyId)
  const data = (body.data ?? {}) as Record<string, unknown>
  const payloadAgencyRaw = strField(data, 'agencyId') ?? strField(data, 'clientId')
  const payloadAgency = await agencyFeId(payloadAgencyRaw)
  if (existing) {
    const rowAgency = await agencyFeId(existing.agencyId)
    if (!rowAgency || rowAgency !== actorAgency) throw deny('row is outside your agency')
  }
  if (payloadAgency && payloadAgency !== actorAgency) throw deny('agencyId is not your agency')
  if (!payloadAgency && body.data) data.agencyId = actor.agencyId
  if (!(await actorStoredCan(actor, TRUST_WRITE_PERMS[body.resource] ?? []))) {
    throw deny('missing trust permission')
  }
  if (body.resource === 'payout_instruction') {
    // Deletes were refused above, so this is a create.
    await assertBankAccountInAgency(data, actor.agencyId, deny)
  }
}

/**
 * bank_account_id is free text (no bank account register yet). A non-super
 * payout may only name a bank account already on file for the actor's agency:
 * one that appears on that agency's existing payout instructions and on no
 * other agency's. Blank is allowed (the account is captured later). A new
 * account id is refused until a super admin records it.
 */
async function assertBankAccountInAgency(
  data: Record<string, unknown>,
  actorAgencyFe: string,
  deny: (why: string) => Error,
): Promise<void> {
  const raw = data.bankAccountId ?? data.bank_account_id
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return
  if (typeof raw !== 'string') throw deny('bankAccountId must be a string')
  const bank = raw.trim()
  const client = (await resolveUuid('agency', actorAgencyFe)) ?? actorAgencyFe
  const rows = await query<{ client_id: string }>(
    `SELECT DISTINCT client_id::text AS client_id FROM payout_instructions WHERE bank_account_id = $1`,
    [bank],
  )
  const owners = new Set<string>()
  for (const r of rows) owners.add((await agencyFeId(r.client_id)) ?? r.client_id)
  const mine = owners.has(actorAgencyFe) || rows.some((r) => r.client_id === client)
  if (!mine || owners.size > 1) {
    throw deny(`bank account ${bank} is not on file for your agency`)
  }
}

async function storedUserEmail(feId: string): Promise<string | null> {
  const uuid = await resolveUuid('user', feId)
  if (!uuid) return null
  const rows = await query<{ email: string | null }>(
    `SELECT email FROM users WHERE id = $1::uuid`,
    [uuid],
  )
  const e = rows[0]?.email
  return typeof e === 'string' ? e.trim().toLowerCase() : null
}

/** Every new password (incl. a temp password on create) has at least 10 characters. */
function assertTempPasswordLength(value: unknown): void {
  if (typeof value === 'string' && value !== '' && value.length < MIN_PASSWORD_LENGTH) {
    throw Object.assign(new Error(`Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters`), { status: 400 })
  }
}

function stripFields(data: Record<string, unknown>, keys: readonly string[]): void {
  for (const k of keys) delete data[k]
}

/** Roles an agency admin may assign (never super_admin). */
export const AGENCY_ASSIGNABLE_ROLES: ReadonlySet<string> = new Set([
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
])
const ALL_ROLES: ReadonlySet<string> = new Set([...AGENCY_ASSIGNABLE_ROLES, 'super_admin'])

/**
 * Trim + lowercase data.role in place so ' super_admin' / 'Super_Admin' cannot
 * slip past an exact-match check and get stored. Blank / non-string roles are
 * dropped (upsertUser then keeps the stored role). Returns the normalised role.
 */
function normaliseRoleField(data: Record<string, unknown>): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(data, 'role')) return undefined
  const raw = data.role
  const role = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!role) {
    delete data.role
    return undefined
  }
  data.role = role
  return role
}

/** Roles whose accounts need a super-admin verification decision before going live. */
const VERIFIED_ROLES: ReadonlySet<string> = new Set(['landlord', 'contractor'])

/**
 * Non-super create of a landlord / contractor: the server sets verification to
 * pending itself, whatever the client sent. Only the submission keys (profile,
 * documents: what the staff wizard uploaded) are kept; status, review fields and
 * notes are always the server's. Pending landlords stay off the marketplace.
 */
function pendingVerificationForCreate(submitted: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {
    status: 'pending',
    submittedAt: new Date().toISOString(),
  }
  if (submitted && typeof submitted === 'object') {
    const s = submitted as Record<string, unknown>
    if (s.profile && typeof s.profile === 'object' && !Array.isArray(s.profile)) out.profile = s.profile
    // lookedAt is set by the reviewer when they open a document, never by the
    // submitter: drop it so a create cannot pre-mark documents as reviewed.
    if (Array.isArray(s.documents)) {
      out.documents = (s.documents as unknown[]).map((doc) => {
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc
        const { lookedAt: _l, ...rest } = doc as Record<string, unknown>
        void _l
        return rest
      })
    }
  }
  return out
}

/**
 * Non-super role change of an existing user onto landlord / contractor: back to
 * pending with a server-set submittedAt, review fields cleared. upsertUser
 * merges verification by key, so the stored profile and documents stay.
 */
function pendingVerificationForRoleChange(): Record<string, unknown> {
  return {
    status: 'pending',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    rejectNote: null,
  }
}

/** Stored frontend role of a user row (null when the row is unknown). */
async function storedUserRole(feId: string): Promise<string | null> {
  const uuid = await resolveUuid('user', feId)
  if (!uuid) return null
  const rows = await query<{ role: string | null; metadata: Record<string, unknown> | null; email: string | null }>(
    `SELECT role, metadata, email FROM users WHERE id = $1::uuid`,
    [uuid],
  )
  const r = rows[0]
  if (!r) return null
  return resolveFrontendRole(String(r.role ?? ''), r.metadata ?? null, r.email)
}

/**
 * User row writes (resource 'user'). The owner is body.id only.
 *
 * - super_admin: anything.
 * - Non-super: never delete a user row; verification is always stripped
 *   (verification decisions go through the super-admin route only). On a
 *   create of a landlord / contractor the server sets it to pending instead.
 * - Agency admin (client_admin / agent_admin with users.manage): may create and
 *   edit users in their own agency, incl. role (never super_admin), active and
 *   permissions. 403 for a user outside their agency, a super_admin role, or
 *   any agencyId other than their own. A create without agencyId is pinned to
 *   their agency.
 * - Anyone else: only their own row, with role, agencyId, active,
 *   enabledPermissions, verification and staff settings stripped server-side
 *   (the client sends the whole user object on a profile edit, so a 403 on
 *   presence would break name / phone edits; upsertUser keeps the stored value
 *   for any field the payload lacks).
 *
 * Mutates body.data when stripping. Throws 403 otherwise.
 */
export async function enforceUserWritePolicy(
  actor: DemoActor,
  body: PersistBody,
  existing: ExistingRow | null,
): Promise<void> {
  const deny = (why: string) =>
    forbiddenError(`Forbidden: ${actor.role} ${actor.userId} cannot ${body.action} user ${body.id} (${why})`)
  const data = (body.data ?? {}) as Record<string, unknown>
  if (body.action !== 'delete') body.data = data
  // CR10 A: a user writes only their own signature. Every other actor
  // (agency admins and super admin included) has it stripped; on your own row
  // it must be a PNG data URL within the cap (or null to clear).
  if (Object.prototype.hasOwnProperty.call(data, 'signature')) {
    if (body.id !== actor.userId) delete data.signature
    else if (data.signature !== null && data.signature !== undefined && !isValidSignatureDataUrl(data.signature)) {
      throw signatureInvalidError()
    }
  }
  const role = normaliseRoleField(data)
  // Designated super-admin addresses are reserved: no write (any actor) may
  // move a row onto one unless that row already has it.
  if (body.action !== 'delete' && isReservedSuperAdminEmail(data.email as string | undefined)) {
    const stored = await storedUserEmail(body.id)
    if (stored !== String(data.email).trim().toLowerCase()) {
      throw deny('that email address is reserved')
    }
  }
  if (actor.role === 'super_admin') {
    if (role !== undefined && !ALL_ROLES.has(role)) {
      throw Object.assign(new Error(`Unknown role: ${role}`), { status: 400 })
    }
    // D3: no hash ever passes through persist, and an existing user's password
    // changes only through change-password / reset-password.
    stripFields(data, ['passwordHash'])
    if (existing) stripFields(data, ['password', 'tempPassword'])
    else assertTempPasswordLength(data.tempPassword ?? data.password)
    return
  }
  if (body.action === 'delete') throw deny('only a super admin may delete users')
  const submittedVerification = data.verification
  stripFields(data, ['verification'])
  // Credentials: never a raw hash or a plain password through a non-super write.
  // A temp password survives only on an agency admin's create (below); password
  // changes go through POST /api/auth/change-password (checks the current one).
  const createTempPassword =
    typeof data.tempPassword === 'string' && data.tempPassword
      ? data.tempPassword
      : typeof data.password === 'string' && data.password
        ? data.password
        : null
  stripFields(data, CREDENTIAL_USER_FIELDS)

  const own = body.id === actor.userId
  if (actor.agencyId && (await actorHasUsersManage(actor))) {
    if (existing && existing.agencyId !== actor.agencyId) {
      throw deny('user is outside your agency')
    }
    if (role === 'super_admin') throw deny('cannot assign super_admin')
    if (role !== undefined && !AGENCY_ASSIGNABLE_ROLES.has(role)) {
      throw deny(`role ${role} is not agency-assignable`)
    }
    if (Object.prototype.hasOwnProperty.call(data, 'agencyId') && data.agencyId !== undefined) {
      const raw = data.agencyId == null || data.agencyId === '' ? null : String(data.agencyId)
      const target = raw ? ((await agencyFe(raw)) ?? raw) : null
      if (target !== actor.agencyId) throw deny('cannot move a user to another agency')
    } else if (!existing) {
      data.agencyId = actor.agencyId
    }
    if (!existing && createTempPassword) {
      assertTempPasswordLength(createTempPassword)
      data.tempPassword = createTempPassword
    }
    if (!existing && role !== undefined && VERIFIED_ROLES.has(role)) {
      data.verification = pendingVerificationForCreate(submittedVerification)
    }
    if (existing && role !== undefined && VERIFIED_ROLES.has(role)) {
      const before = await storedUserRole(body.id)
      if (before !== role) data.verification = pendingVerificationForRoleChange()
    }
    return
  }
  if (!own) throw deny('not your user row')
  stripFields(data, PRIVILEGED_USER_FIELDS)
}

/**
 * CR7 help desk gate for event_log support tickets. Runs before the generic
 * property/agency gate. Mutates body.data with server-derived fields so the
 * writer never trusts the client for submitter or routing.
 *  - delete: super admin only
 *  - submit (new id): submitter must be the actor; agencyId derived from the
 *    actor's role + agency (staff / no agency → platform null)
 *  - resolve (existing id): desk role with users.manage; agency desk only for
 *    its own agency, platform tickets super admin only; resolved = read-only
 */
async function loadSupportTicketRow(feId: string): Promise<
  | { kind: 'none' }
  | { kind: 'other' }
  | { kind: 'ticket'; agencyId: string | null; status: string; submittedByUserId: string | null; submitterRole: string | null }
> {
  const uuid = await resolveUuid('support_ticket', feId)
  if (!uuid) return { kind: 'none' }
  const rows = await query<{
    event_type: string
    client_id: string | null
    status: string | null
    submitted_by: string | null
    submitter_role: string | null
  }>(
    `SELECT event_type, client_id::text AS client_id,
            payload->>'status' AS status, payload->>'submittedByUserId' AS submitted_by,
            payload->>'submitterRole' AS submitter_role
     FROM event_log WHERE id = $1::uuid LIMIT 1`,
    [uuid],
  )
  const r = rows[0]
  if (!r) return { kind: 'none' }
  if (r.event_type !== 'support_ticket') return { kind: 'other' }
  return {
    kind: 'ticket',
    agencyId: await agencyFe(r.client_id),
    status: r.status ?? 'open',
    submittedByUserId: r.submitted_by,
    submitterRole: r.submitter_role,
  }
}

function permissionList(v: unknown): Permission[] | null {
  // Empty / missing = not configured → role defaults (parity with AppStore
  // applyPostgresBootstrap and userBasePermissions).
  return Array.isArray(v) && v.length ? (v.filter((p) => typeof p === 'string') as Permission[]) : null
}

/**
 * users.manage as the actor effectively holds it: user pack ∩ agency
 * enabledPermissions (clients.settings), via effectiveCan. Loads the agency
 * row the same way resolveAgencySuspended does.
 */
export async function resolveActorUsersManage(actor: DemoActor): Promise<boolean> {
  if (actor.role === 'super_admin') return true
  const agency = (await agencyFe(actor.agencyId)) ?? actor.agencyId
  let agencyEnabled: Permission[] | null = null
  if (agency) {
    const clientUuid = await resolveUuid('agency', agency)
    if (clientUuid) {
      const rows = await query<{ enabled: unknown }>(
        `SELECT settings->'enabledPermissions' AS enabled FROM clients WHERE id = $1::uuid LIMIT 1`,
        [clientUuid],
      )
      agencyEnabled = permissionList(rows[0]?.enabled)
    }
  }
  let userEnabled: Permission[] | null = null
  const userUuid = await resolveUuid('user', actor.userId)
  if (userUuid) {
    const rows = await query<{ enabled: unknown }>(
      `SELECT metadata->'enabledPermissions' AS enabled FROM users WHERE id = $1::uuid LIMIT 1`,
      [userUuid],
    )
    userEnabled = permissionList(rows[0]?.enabled)
  }
  return effectiveCan(actor.role, 'users.manage', agencyEnabled, userEnabled)
}

/** Cancelled agencies and status → Cancelled are super-admin only. */
export async function enforceAgencyWritePolicy(actor: DemoActor, body: PersistBody): Promise<void> {
  const deny = (why: string) =>
    forbiddenError(`Forbidden: ${actor.role} ${actor.userId} cannot ${body.action} agency ${body.id} (${why})`)
  if (actor.role === 'super_admin') return
  const data = body.data ?? {}
  const nextStatus = strField(data, 'status')
  if (nextStatus === 'Cancelled') throw deny('only a super admin may cancel an agency')
  const clientUuid = await resolveUuid('agency', body.id)
  if (!clientUuid) return
  const rows = await query<{ status: string }>(
    `SELECT status FROM clients WHERE id = $1::uuid LIMIT 1`,
    [clientUuid],
  )
  const st = String(rows[0]?.status ?? '').toLowerCase()
  if (st === 'cancelled') throw deny('agency is cancelled; only a super admin may update it')
}

export async function assertSupportTicketAllowed(
  actor: DemoActor,
  body: PersistBody,
): Promise<void> {
  const deny = (why: string) =>
    forbiddenError(`Forbidden: ${actor.role} ${actor.userId} cannot ${body.action} support_ticket ${body.id} (${why})`)
  const actorAgency = (await agencyFe(actor.agencyId)) ?? actor.agencyId ?? null
  const viewer = { userId: actor.userId, role: actor.role, agencyId: actorAgency }

  const row = await loadSupportTicketRow(body.id)
  if (row.kind === 'other') throw deny('id belongs to another record')

  if (body.action === 'delete') {
    if (actor.role !== 'super_admin') throw deny('delete is super admin only')
    return
  }

  const data = body.data ?? {}

  if (row.kind === 'none') {
    const claimed = strField(data, 'submittedByUserId')
    if (!claimed || !(await actorIdAliases(actor)).has(claimed)) throw deny('submitter must be the signed-in user')
    body.data = {
      subject: data.subject,
      body: data.body,
      submitterName: data.submitterName,
      submittedByUserId: actor.userId,
      submitterRole: actor.role,
      agencyId: supportTicketRoutingAgency(actor.role, actorAgency),
      status: 'open',
    }
    return
  }

  if (row.status === 'resolved') throw deny('resolved tickets are read-only')
  const hasUsersManage = await resolveActorUsersManage(actor)
  if (!canResolveSupportTicket({ ...viewer, hasUsersManage }, { agencyId: row.agencyId, submitterRole: row.submitterRole })) {
    throw deny('not on this desk')
  }
  if (strField(data, 'status') !== 'resolved') throw deny('only resolve is allowed')
  body.data = {
    status: 'resolved',
    resolvedByUserId: actor.userId,
    resolvedByName: data.resolvedByName,
    resolutionNote: data.resolutionNote,
    resolvedAt: new Date().toISOString(),
  }
}

/**
 * Enforce property / agency scope on a persist op. Throws 403/401-style errors.
 */
export async function assertPersistAllowed(
  actor: DemoActor,
  body: PersistBody,
): Promise<PortalOutcome> {
  // CR10: lease_signed audit rows are server-written only (generic policy).
  if (isClientLeaseSignedWrite(body)) throw leaseSignedRefusedError()
  if (body.resource === 'support_ticket') {
    // Portal users (tenant / landlord / contractor) pass the portal allow-list
    // first: submit only, never resolve.
    if (PORTAL_WRITE_ROLES.has(actor.role)) await enforcePortalWritePolicy(actor, body, null)
    await assertSupportTicketAllowed(actor, body)
    return {}
  }
  const scope = await buildActorPropertyScope(actor)
  const data = body.data ?? {}
  const existing = await loadExisting(body.resource, body.id)

  // An existing application stays on its stored listing: a payload propertyId
  // must not move the scope check onto another property.
  let propertyId =
    ((body.resource === 'application' || body.resource === 'ticket') && existing?.propertyId
      ? existing.propertyId
      : null) ??
    strField(data, 'propertyId') ??
    (body.resource === 'property' || body.resource === 'unit' ? body.id : null) ??
    existing?.propertyId ??
    null

  // Message: derive property from thread payload / existing
  if (body.resource === 'message' && !propertyId) {
    const threadFe = strField(data, 'threadId')
    if (threadFe) {
      const th = await loadExisting('thread', threadFe)
      propertyId = th?.propertyId ?? null
    } else if (existing?.propertyId) {
      propertyId = existing.propertyId
    }
  }

  // Normalize agency to FE id space (entity_id_map first) so FE actor agency
  // never compares against a raw client UUID from loadExisting / payload.
  // Tickets: the agency is the stored ticket's, else the property's — never
  // the payload (the writer also takes client_id from the unit).
  const ticketAgency =
    body.resource === 'ticket'
      ? (existing?.agencyId ?? (await propertySubject(propertyId))?.agencyId ?? null)
      : undefined
  const rawAgencyId =
    ticketAgency !== undefined
      ? ticketAgency
      : (strField(data, 'agencyId') ??
        strField(data, 'clientId') ??
        existing?.agencyId ??
        actor.agencyId)
  const agencyId = (await agencyFe(rawAgencyId)) ?? rawAgencyId

  const agentId = strField(data, 'agentId') ?? existing?.agentId ?? null
  let landlordId = strField(data, 'landlordId') ?? existing?.landlordId ?? null
  // L03: listing wizard sends building → unit → property; unit rows often omit
  // landlordId even though the parent building already carries it.
  if (
    !landlordId &&
    (body.resource === 'property' || body.resource === 'unit') &&
    actor.role === 'landlord'
  ) {
    const buildingFe = strField(data, 'buildingId')
    if (buildingFe) {
      const bld = await loadExisting('building', buildingFe)
      landlordId = bld?.landlordId ?? null
    }
  }
  if (!landlordId && body.resource === 'building' && actor.role === 'landlord') {
    landlordId = actor.userId
  }
  const assignedAgentId =
    strField(data, 'assignedAgentId') ?? existing?.assignedAgentId ?? null
  const contractorId = strField(data, 'contractorId') ?? existing?.contractorId ?? null
  // Own-row shortcut owner: a user row is owned by its id only (never a payload
  // field). For any other resource the existing row's owner wins over the
  // payload, so a known id cannot be taken over by claiming userId /
  // applicantUserId in the body; payload owner fields only count on create.
  const ownerUserId =
    body.resource === 'user'
      ? body.id
      : existing
        ? existing.ownerUserId
        : (strField(data, 'userId') ??
          strField(data, 'fromUserId') ??
          strField(data, 'applicantUserId') ??
          strField(data, 'tenantUserId') ??
          null)

  if (body.resource === 'user') {
    // Users have their own policy (may strip privileged fields from body.data).
    await enforceUserWritePolicy(actor, body, existing)
    return {}
  }

  if (body.resource === 'agency') {
    await enforceAgencyWritePolicy(actor, body)
  }

  if (TRUST_RESOURCES.has(body.resource)) {
    // Trust books have their own (stricter) policy; the property path below
    // would otherwise let any role with the property in scope write them.
    await enforceTrustWritePolicy(actor, body, existing)
    return {}
  }

  // Portal roles (tenant / landlord / contractor): explicit allow-list first.
  // It only narrows; the scope checks below still run unless it performed a
  // narrow server-side rewrite itself (lease signature, payment proof, slot
  // recount), in which case the generic upsert is skipped.
  if (PORTAL_WRITE_ROLES.has(actor.role)) {
    const outcome = await enforcePortalWritePolicy(actor, body, existing)
    if (outcome.handled) return outcome
  }

  // Tenants and contractors may only write their own application (existing
  // applicant, or the payload applicant on create). The property-book path
  // below would otherwise let them rewrite anyone's application on a listing
  // in their scope.
  if (
    body.resource === 'application' &&
    (actor.role === 'tenant' || actor.role === 'contractor') &&
    ownerUserId !== actor.userId
  ) {
    throw forbiddenError(
      `Forbidden: ${actor.role} ${actor.userId} cannot ${body.action} application ${body.id} (not their application)`,
    )
  }

  let property = await propertySubject(propertyId)
  if (propertyId && !property && (landlordId || agentId || agencyId)) {
    property = {
      agencyId: agencyId ?? '',
      agentId,
      landlordId: landlordId ?? '',
    }
  }
  // Prefer payload landlord/agent on property upserts
  if (body.resource === 'property' || body.resource === 'unit') {
    property = {
      agencyId: agencyId ?? property?.agencyId ?? '',
      agentId: agentId ?? property?.agentId ?? null,
      landlordId: landlordId ?? property?.landlordId ?? '',
    }
    propertyId = body.id
  }
  if (
    (body.resource === 'building' ||
      body.resource === 'room' ||
      body.resource === 'asset') &&
    landlordId
  ) {
    property = {
      agencyId: agencyId ?? '',
      agentId: agentId ?? null,
      landlordId,
    }
  }

  const allowed = canWriteEntity(scope, {
    resource: body.resource,
    propertyId,
    property,
    agencyId,
    agentId,
    ownerUserId,
    ticket:
      body.resource === 'ticket' && propertyId && agencyId
        ? {
            propertyId,
            assignedAgentId,
            contractorId,
            agencyId,
          }
        : null,
  })

  if (!allowed) {
    throw forbiddenError(
      `Forbidden: ${actor.role} ${actor.userId} cannot ${body.action} ${body.resource} ${body.id}`,
    )
  }
  if (actor.role === 'landlord' && body.resource === 'application') {
    // The decision belongs to the property's landlord only: canWriteEntity
    // also passes on the applicant-owner shortcut, and a landlord must never
    // decide an application they made themselves.
    // Re-read the stored property (never the payload-built fallback subject).
    const owned = await propertySubject(propertyId)
    if (!owned || owned.landlordId !== actor.userId || ownerUserId === actor.userId) {
      throw forbiddenError(
        `Forbidden: landlord ${actor.userId} cannot decide application ${body.id} (not the landlord of its property)`,
      )
    }
    // The write is narrowed to the decision fields.
    return landlordApplicationDecision(actor, body)
  }
  // CR10: staff lease saves never write eSign party blocks wholesale; any
  // signing on them goes through the one server sign function (after the
  // scope checks above passed).
  if (body.resource === 'tenancy' && !PORTAL_WRITE_ROLES.has(actor.role)) {
    await enforceStaffTenancyESign(actor, body)
  }
  // CR10 gate: staff stage moves to a signed status need the stored envelope.
  if (body.resource === 'application' && !PORTAL_WRITE_ROLES.has(actor.role)) {
    await enforceStaffSignedStageMove(body as never)
    await enforceStaffCreditCheckConsent(body as never)
  }
  return {}
}

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

/**
 * Every id form the actor may appear under on bootstrap rows (server / DB id map).
 */
export async function actorIdAliases(actor: DemoActor): Promise<ReadonlySet<string>> {
  const ids = new Set<string>([actor.userId])
  const uuid = (await resolveUuid('user', actor.userId)) ?? (isUuidLike(actor.userId) ? actor.userId : null)
  if (!uuid) return ids
  ids.add(uuid)
  const rows = await query<{ frontend_id: string }>(
    `SELECT frontend_id FROM entity_id_map WHERE entity_type = 'user' AND backend_id::text = $1`,
    [uuid],
  )
  for (const r of rows) {
    if (r.frontend_id && (await resolveUuid('user', r.frontend_id)) === uuid) ids.add(r.frontend_id)
  }
  return ids
}

export {
  APPLICANT_PACK_SOURCE_TYPES,
  filterBootstrapForActor,
  filterBootstrapUsersForActor,
  isApplicantPackDocument,
  narrowPortalCollections,
  redactApplicationContact,
  redactBootstrapUser,
  redactLeadContact,
  redactTenancyContact,
  redactViewingContact,
  referencedUserIds,
  scopeLeaseSignReads,
  staffTicketAccessNotes,
  stripOtherUsersSignatures,
  type BootstrapActor,
  type BootstrapPayload,
  type BootstrapUser,
} from '../src/lib/bootstrapActorFilter.js'

