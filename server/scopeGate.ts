/**
 * Server-side property scope: load links from Postgres, gate writes, filter bootstrap.
 * Reuses client rules from src/lib/scope.ts + scopeWrite.ts.
 */
import { query } from './db.js'
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
import type { PersistBody } from './writes.js'
import type { DemoActor } from './actor.js'
import { forbiddenError } from './actor.js'
import {
  buildPropertyScope,
  dealInScope,
  isAgencyWideRole,
  ticketInScope,
  toPropertyLinks,
  type PropertyScope,
  type ScopeLinksInput,
} from '../src/lib/scope.js'
import { canWriteEntity } from '../src/lib/scopeWrite.js'
import type { PropertyAccessSubject } from '../src/lib/agencyScope.js'
import type { Permission, Role } from '../src/types/domain.js'
import { effectiveCan } from '../src/lib/permissions.js'
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
    const landlordId = feUserFromCache(cache, r.landlord_id) ?? 'u-owner1'
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
  return rows[0]?.status === 'suspended' || rows[0]?.status === 'Suspended'
}

/** Enrich actor agency from DB user row when header omitted. */
export async function enrichActor(actor: DemoActor): Promise<DemoActor> {
  if (actor.agencyId || actor.role === 'super_admin') return actor
  const uuid = await resolveUuid('user', actor.userId)
  if (!uuid) return actor
  const rows = await query<{ client_id: string | null }>(
    `SELECT client_id FROM users WHERE id = $1::uuid LIMIT 1`,
    [uuid],
  )
  const agencyId = await agencyFe(rows[0]?.client_id ?? null)
  return { ...actor, agencyId }
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
async function actorHasUsersManage(actor: DemoActor): Promise<boolean> {
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
    if (!existing && createTempPassword) data.tempPassword = createTempPassword
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
 * Enforce property / agency scope on a persist op. Throws 403/401-style errors.
 */
export async function assertPersistAllowed(
  actor: DemoActor,
  body: PersistBody,
): Promise<PortalOutcome> {
  const scope = await buildActorPropertyScope(actor)
  const data = body.data ?? {}
  const existing = await loadExisting(body.resource, body.id)

  // An existing application stays on its stored listing: a payload propertyId
  // must not move the scope check onto another property.
  let propertyId =
    (body.resource === 'application' && existing?.propertyId ? existing.propertyId : null) ??
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
  const rawAgencyId =
    strField(data, 'agencyId') ??
    strField(data, 'clientId') ??
    existing?.agencyId ??
    actor.agencyId
  const agencyId = (await agencyFe(rawAgencyId)) ?? rawAgencyId

  const agentId = strField(data, 'agentId') ?? existing?.agentId ?? null
  const landlordId = strField(data, 'landlordId') ?? existing?.landlordId ?? null
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
  return {}
}

type BootstrapPayload = {
  source: string
  fetchedAt: string
  scoped?: boolean
  actor?: { userId: string; role: string; agencyId: string | null } | null
  agencies: Array<{ id: string; status?: string }>
  users: unknown[]
  buildings: Array<{ id: string; clientId?: string }>
  units: Array<{ id: string; clientId?: string; buildingId?: string }>
  properties: Array<{
    id: string
    agencyId: string
    agentId: string | null
    landlordId: string
    buildingId?: string
  }>
  leads: Array<{ propertyId: string; agencyId: string; agentId: string | null }>
  applications: Array<{
    propertyId: string
    agencyId: string
    agentId: string | null
    applicantUserId?: string | null
    email?: string
  }>
  tenancies: Array<{
    propertyId: string
    agencyId?: string
    agentId?: string | null
  }>
  viewings: Array<{ propertyId: string; agencyId: string; agentId: string | null }>
  viewingSlots?: Array<{ propertyId: string; agencyId: string; agentId: string | null }>
  payments: Array<{
    propertyId: string
    agencyId: string
    partyUserId: string | null
    partyName: string
    landlordVisible: boolean
  }>
  propertyDocuments: Array<{ propertyId: string; agencyId: string }>
  tickets: Array<{
    propertyId: string
    agencyId: string
    assignedAgentId: string | null
    contractorId: string | null
  }>
  threads: Array<{
    id: string
    agencyId: string
    propertyId: string | null
    participantIds: string[]
  }>
  messages: Array<{ threadId: string; agencyId: string }>
  notifications: Array<{ userId: string; agencyId: string | null }>
  suiteAlerts?: Array<{ agencyId: string | null }>
  activities?: Array<{ agencyId: string | null }>
  propertyEvents?: Array<{ propertyId?: string; agencyId?: string | null }>
  invoices?: Array<{ agencyId?: string | null; clientId?: string | null }>
  trustTransactions?: Array<{ agencyId?: string | null }>
  trustAllocations?: Array<{ agencyId?: string | null }>
  payoutInstructions?: Array<{ agencyId?: string | null }>
  depositHoldings?: Array<{ agencyId?: string | null }>
  arrearsSnapshots?: Array<{ agencyId?: string | null }>
  csvImportBatches?: Array<{ agencyId?: string | null }>
  [key: string]: unknown
}

type BootstrapUser = {
  id?: string
  name?: string
  email?: string
  phone?: string
  role?: string
  agencyId?: string | null
  enabledPermissions?: string[]
  idNumberOrPassport?: string
  verification?: Record<string, unknown> | null
  [key: string]: unknown
}

/** Agency staff roles (not tenants / landlords / contractors). */
const AGENCY_STAFF_ROLES: ReadonlySet<string> = new Set([
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
])

/** Record fields that name another user — used to keep names visible on scoped rows. */
const USER_REF_FIELDS = [
  'agentId',
  'landlordId',
  'applicantUserId',
  'tenantUserId',
  'tenantId',
  'partyUserId',
  'assignedAgentId',
  'contractorId',
  'ownerUserId',
  'fromUserId',
  'senderId',
  'createdBy',
  'createdByUserId',
  'reportedByUserId',
  'uploadedByUserId',
  'userId',
] as const

const USER_REF_COLLECTIONS = [
  'properties',
  'leads',
  'applications',
  'tenancies',
  'viewings',
  'viewingSlots',
  'payments',
  'tickets',
  'threads',
  'messages',
] as const

/** User ids referenced by the actor's already-scoped rows (names only are exposed for these). */
export function referencedUserIds(
  filtered: BootstrapPayload,
  actorRole?: string,
): Set<string> {
  const ids = new Set<string>()
  for (const key of USER_REF_COLLECTIONS) {
    const rows = filtered[key]
    if (!Array.isArray(rows)) continue
    // A tenant's tickets add only their reporters to the users list (not the
    // assigned agent or contractor).
    const fields: readonly string[] =
      actorRole === 'tenant' && key === 'tickets' ? ['reportedByUserId'] : USER_REF_FIELDS
    for (const row of rows as Array<Record<string, unknown>>) {
      if (!row || typeof row !== 'object') continue
      for (const f of fields) {
        const v = row[f]
        if (typeof v === 'string' && v) ids.add(v)
      }
      const participants = row.participantIds
      if (Array.isArray(participants)) {
        for (const v of participants) if (typeof v === 'string' && v) ids.add(v)
      }
    }
  }
  return ids
}

/**
 * Directory view of another user: no email, phone, ID/passport number,
 * verification documents or verification profile. Verification keeps status
 * dates only (listing visibility + contractor roster read the status).
 */
export function redactBootstrapUser(u: BootstrapUser): BootstrapUser {
  const { email: _e, phone: _p, idNumberOrPassport: _id, verification, ...rest } = u
  void _e
  void _p
  void _id
  const out: BootstrapUser = { ...rest }
  if (verification && typeof verification === 'object') {
    const v = verification as Record<string, unknown>
    out.verification = {
      status: v.status,
      ...(v.submittedAt !== undefined ? { submittedAt: v.submittedAt } : {}),
      ...(v.reviewedAt !== undefined ? { reviewedAt: v.reviewedAt } : {}),
      ...(v.reviewedBy !== undefined ? { reviewedBy: v.reviewedBy } : {}),
    }
  }
  return out
}

/** Agency admin who may see contact + verification details of their agency's users. */
function actorManagesAgencyUsers(actor: DemoActor, self: BootstrapUser | undefined): boolean {
  if (actor.role !== 'client_admin' && actor.role !== 'agent_admin') return false
  return effectiveCan(
    actor.role as Role,
    'users.manage',
    undefined,
    (self?.enabledPermissions as Permission[] | undefined) ?? undefined,
  )
}

/**
 * Users in bootstrap for a non-super-admin actor.
 * - Self: full record.
 * - Own agency's users: agency staff see all of them; tenants / landlords /
 *   contractors see only their agency's staff (not other tenants or owners).
 * - Users named on the actor's scoped rows (agent on their lease, landlord on
 *   their thread, null-agency tenant on an agency's application): name only.
 * - Agency users.manage admins also see contractor names (any agency) so the
 *   add-to-roster picker keeps working.
 * Contact fields, ID/passport and verification documents are stripped for
 * everyone except self and the actor's own agency when the actor is a
 * users.manage admin. Super admin is not filtered here.
 */
export function filterBootstrapUsersForActor(
  users: unknown[],
  actor: DemoActor,
  filtered: BootstrapPayload,
): BootstrapUser[] {
  const all = users as BootstrapUser[]
  const self = all.find((u) => u.id === actor.userId)
  const ag = actor.agencyId
  const isStaff = AGENCY_STAFF_ROLES.has(actor.role)
  const manager = Boolean(ag) && actorManagesAgencyUsers(actor, self)
  const related = referencedUserIds(filtered, actor.role)
  const out: BootstrapUser[] = []
  for (const u of all) {
    if (!u?.id) continue
    if (u.id === actor.userId) {
      out.push(u)
      continue
    }
    const sameAgency = Boolean(ag) && u.agencyId === ag
    const visible =
      (sameAgency && (isStaff || AGENCY_STAFF_ROLES.has(String(u.role)))) ||
      related.has(u.id) ||
      (manager && u.role === 'contractor')
    if (!visible) continue
    out.push(manager && sameAgency ? u : redactBootstrapUser(u))
  }
  return out
}

/** Portal (non-staff) roles: rows are narrowed to the actor's own records. */
const PORTAL_ROLES: ReadonlySet<string> = new Set(['tenant', 'landlord', 'contractor'])

/** Roles that never receive trust-book rows in bootstrap (B1). */
const NO_TRUST_ROLES: ReadonlySet<string> = new Set([
  'tenant',
  'landlord',
  'contractor',
  'agent',
  'ground_agent',
])

type Row = Record<string, unknown>

const lc = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '')

/** Lead with the prospect's contact fields removed (name kept). */
export function redactLeadContact<T extends object>(row: T): T {
  return { ...row, email: '', phone: '' }
}

/**
 * Application with the applicant's contact + identity fields and pack files
 * removed. Name, stage, income, employment and the document checklist
 * (key / label / status only, no file, note or reviewer) stay so a landlord can
 * still do landlord review. keyCollection.contactPhone is blanked.
 */
export function redactApplicationContact<T extends object>(row: T): T {
  const {
    idNumberOrPassport: _id,
    uploadedDocs: _docs,
    documents,
    keyCollection,
    ...rest
  } = row as Row
  void _id
  void _docs
  const out: Row = { ...rest, email: '', phone: '' }
  if (Array.isArray(documents)) {
    out.documents = (documents as Row[]).map((d) => ({
      key: d?.key,
      label: d?.label,
      status: d?.status,
    }))
  }
  if (keyCollection && typeof keyCollection === 'object') {
    out.keyCollection = { ...(keyCollection as Row), contactPhone: '' }
  }
  return out as T
}

/** Viewing with the visitor's email removed (name kept). */
export function redactViewingContact<T extends object>(row: T): T {
  const { applicantEmail: _e, ...rest } = row as Row
  void _e
  return rest as T
}

/** Tenancy with the tenant's email and the key-collection phone removed. */
export function redactTenancyContact<T extends object>(row: T): T {
  const r = row as Row
  const kc = r.keyCollection
  return {
    ...r,
    tenantEmail: '',
    ...(kc && typeof kc === 'object'
      ? { keyCollection: { ...(kc as Row), contactPhone: '' } }
      : {}),
  } as T
}

/**
 * Applicant-pack document (a person's own files), classified by type and
 * category, never by whether it is linked to a lease:
 * - source type ID (documents.category = 'ID', mapped to 'Other' in the FE),
 *   whoever it belongs to;
 * - any document tied to an applicant (applicationId or applicantName) whose
 *   category is not 'Lease' — i.e. Other (payslips, bank statements, proof of
 *   address, ID copies), Compliance (FICA), Title, Inspection, Marketing.
 * The signed lease (category 'Lease') is the only applicant-linked document
 * that is not pack: both lease parties are entitled to it.
 */
export const APPLICANT_PACK_SOURCE_TYPES: ReadonlySet<string> = new Set(['ID'])

export function isApplicantPackDocument(d: Row): boolean {
  if (typeof d.sourceType === 'string' && APPLICANT_PACK_SOURCE_TYPES.has(d.sourceType.toUpperCase())) {
    return true
  }
  const applicantLinked = Boolean(d.applicationId) || Boolean(d.applicantName)
  return applicantLinked && d.category !== 'Lease'
}

type PortalCollections = {
  leads: unknown[]
  applications: unknown[]
  viewings: unknown[]
  tenancies: unknown[]
  propertyDocuments: unknown[]
}

/**
 * Own-rows rule for portal roles (tenant, landlord, contractor) on the
 * collections that carry other people's contact details or files.
 *
 * Tenant (incl. a public applicant whose property entered scope by applying):
 * - leads: only leads under their own email
 * - applications: only their own (applicantUserId or email)
 * - viewings: only viewings booked under their email (or, when the viewing has
 *   no email, under their exact name)
 * - tenancies: only their own (tenantUserId, or an unlinked lease created from
 *   their own application)
 * - propertyDocuments: documents they uploaded, documents linked to their own
 *   application or tenancy (incl. the lease PDF), and non-pack Compliance
 *   documents on a property where they hold their own Active tenancy
 * - tickets: only tickets they reported (see filterBootstrapEntitiesForActor)
 *
 * Landlord (property scope = properties they own):
 * - leads / applications / viewings / tenancies on their own properties stay
 *   (owner portal landlord review, owner statement, rent roll, messaging a
 *   tenant on the book), with other people's email, phone, ID number,
 *   key-collection phone and application document files removed. Names and
 *   the document checklist status stay.
 * - propertyDocuments on their own properties, minus applicant-pack files.
 *
 * Contractor (property scope = properties with their jobs):
 * - no leads, applications, viewings or tenancies
 * - propertyDocuments: only documents they uploaded
 * - no payments; threads only where they are a participant (+ their messages)
 */
export function narrowPortalCollections(
  input: PortalCollections,
  actor: DemoActor,
  actorUser: { email?: string; name?: string } | undefined,
): PortalCollections {
  const role = actor.role
  if (role === 'contractor') {
    return {
      leads: [],
      applications: [],
      viewings: [],
      tenancies: [],
      propertyDocuments: (input.propertyDocuments as Row[]).filter(
        (d) => d.uploadedByUserId === actor.userId,
      ),
    }
  }
  if (role === 'landlord') {
    return {
      leads: (input.leads as Row[]).map(redactLeadContact),
      applications: (input.applications as Row[]).map(redactApplicationContact),
      viewings: (input.viewings as Row[]).map(redactViewingContact),
      tenancies: (input.tenancies as Row[]).map((t) =>
        t.tenantUserId === actor.userId ? t : redactTenancyContact(t),
      ),
      propertyDocuments: (input.propertyDocuments as Row[]).filter(
        (d) => d.uploadedByUserId === actor.userId || !isApplicantPackDocument(d),
      ),
    }
  }
  if (role !== 'tenant') return input

  const email = lc(actorUser?.email)
  const name = lc(actorUser?.name)
  const ownApps = (input.applications as Row[]).filter(
    (a) =>
      (Boolean(a.applicantUserId) && a.applicantUserId === actor.userId) ||
      (Boolean(email) && lc(a.email) === email),
  )
  const ownAppIds = new Set(ownApps.map((a) => a.id).filter((id): id is string => typeof id === 'string'))
  const ownTenancies = (input.tenancies as Row[]).filter(
    (t) =>
      (Boolean(t.tenantUserId) && t.tenantUserId === actor.userId) ||
      (!t.tenantUserId && typeof t.applicationId === 'string' && ownAppIds.has(t.applicationId)),
  )
  const ownTenancyIds = new Set(
    ownTenancies.map((t) => t.id).filter((id): id is string => typeof id === 'string'),
  )
  const leaseDocIds = new Set(
    ownTenancies
      .flatMap((t) => [t.leaseDocumentId, (t.eSign as Row | null | undefined)?.leaseDocumentId])
      .filter((id): id is string => typeof id === 'string' && Boolean(id)),
  )
  // Unit compliance documents only while the tenancy is Active (not Pending
  // Move-In, not Ended).
  const activeTenancyPropertyIds = new Set(
    ownTenancies.filter((t) => t.status === 'Active').map((t) => t.propertyId as string),
  )
  return {
    leads: (input.leads as Row[]).filter((l) => Boolean(email) && lc(l.email) === email),
    applications: ownApps,
    viewings: (input.viewings as Row[]).filter((v) => {
      const vEmail = lc(v.applicantEmail)
      if (vEmail) return Boolean(email) && vEmail === email
      return Boolean(name) && lc(v.applicantName) === name
    }),
    tenancies: ownTenancies,
    propertyDocuments: (input.propertyDocuments as Row[]).filter((d) => {
      if (d.uploadedByUserId === actor.userId) return true
      if (typeof d.applicationId === 'string' && ownAppIds.has(d.applicationId)) return true
      if (typeof d.tenancyId === 'string' && ownTenancyIds.has(d.tenancyId)) return true
      if (typeof d.id === 'string' && leaseDocIds.has(d.id)) return true
      return (
        d.category === 'Compliance' &&
        !isApplicantPackDocument(d) &&
        !d.tenancyId &&
        activeTenancyPropertyIds.has(d.propertyId as string)
      )
    }),
  }
}

/**
 * Filter a full bootstrap payload for an actor (super admin keeps everything).
 * Users are always narrowed + redacted for non-super-admins (see
 * filterBootstrapUsersForActor).
 */
/**
 * Every id form the actor may appear under on bootstrap rows: the session id
 * as given, its uuid and its front-end id (rows carry front-end ids, falling
 * back to the raw uuid when unmapped; session ids may be either form).
 */
export async function actorIdAliases(actor: DemoActor): Promise<ReadonlySet<string>> {
  const ids = new Set<string>([actor.userId])
  const uuid = (await resolveUuid('user', actor.userId)) ?? (isUuidLike(actor.userId) ? actor.userId : null)
  if (!uuid) return ids
  ids.add(uuid)
  // Front-end ids mapped to this backend id in entity_id_map only (never an
  // email lookup), each kept only if it round-trips back to this uuid.
  const rows = await query<{ frontend_id: string }>(
    `SELECT frontend_id FROM entity_id_map WHERE entity_type = 'user' AND backend_id::text = $1`,
    [uuid],
  )
  for (const r of rows) {
    if (r.frontend_id && (await resolveUuid('user', r.frontend_id)) === uuid) ids.add(r.frontend_id)
  }
  return ids
}

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export function filterBootstrapForActor(
  raw: BootstrapPayload,
  actorIn: DemoActor,
  scope: PropertyScope,
  actorIds?: ReadonlySet<string>,
): BootstrapPayload {
  // Session / header agency may be a client UUID; scope.viewer carries the FE id.
  const normalizedAgency = scope.viewer?.agencyId ?? actorIn.agencyId
  const actor =
    normalizedAgency !== actorIn.agencyId ? { ...actorIn, agencyId: normalizedAgency } : actorIn
  const entities = filterBootstrapEntitiesForActor(raw, actor, scope, actorIds ?? new Set([actor.userId]))
  if (actor.role === 'super_admin') return entities
  const roster = Array.isArray(raw.agencyContractors)
    ? (raw.agencyContractors as Array<{ agencyId?: string | null; contractorUserId?: string }>).filter(
        (r) =>
          r.contractorUserId === actor.userId || (Boolean(actor.agencyId) && r.agencyId === actor.agencyId),
      )
    : raw.agencyContractors
  return {
    ...entities,
    users: filterBootstrapUsersForActor(raw.users, actor, entities),
    ...(roster !== undefined ? { agencyContractors: roster } : {}),
  }
}

function filterBootstrapEntitiesForActor(
  raw: BootstrapPayload,
  actor: DemoActor,
  scope: PropertyScope,
  actorIds: ReadonlySet<string>,
): BootstrapPayload {
  const agencyWide = isAgencyWideRole(actor.role as Role) || actor.role === 'super_admin'
  const scoped = !agencyWide

  // Users are narrowed + redacted by filterBootstrapForActor after this runs.
  // Agencies for super_admin stay full; others get their own agency only.
  let agencies = raw.agencies
  if (actor.role !== 'super_admin' && actor.agencyId) {
    agencies = raw.agencies.filter((a) => a.id === actor.agencyId)
  }

  if (!scoped) {
    // Agency-wide: filter property-linked entities to agency when not platform
    if (actor.role === 'super_admin') {
      return {
        ...raw,
        scoped: false,
        actor: { userId: actor.userId, role: actor.role, agencyId: actor.agencyId },
      }
    }
    const ag = actor.agencyId
    // No pass-through for agency-wide staff without an agency (B1).
    const inAg = (agencyId: string | null | undefined) => Boolean(ag) && agencyId === ag
    const props = raw.properties.filter((p) => inAg(p.agencyId))
    const propIds = new Set(props.map((p) => p.id))
    const buildingIds = new Set(
      raw.buildings.filter((b) => inAg(b.clientId)).map((b) => b.id),
    )
    return {
      ...raw,
      scoped: false,
      actor: { userId: actor.userId, role: actor.role, agencyId: actor.agencyId },
      agencies,
      properties: props,
      buildings: raw.buildings.filter((b) => inAg(b.clientId)),
      units: raw.units.filter(
        (u) => inAg(u.clientId) || (u.buildingId ? buildingIds.has(u.buildingId) : false),
      ),
      leads: raw.leads.filter((x) => inAg(x.agencyId)),
      applications: raw.applications.filter((x) => inAg(x.agencyId)),
      tenancies: raw.tenancies.filter((x) => inAg(x.agencyId)),
      viewings: raw.viewings.filter((x) => inAg(x.agencyId)),
      viewingSlots: (raw.viewingSlots ?? []).filter((x) => inAg(x.agencyId)),
      payments: raw.payments.filter((x) => inAg(x.agencyId)),
      propertyDocuments: raw.propertyDocuments.filter((x) => inAg(x.agencyId)),
      tickets: raw.tickets.filter((x) => inAg(x.agencyId)),
      threads: raw.threads.filter((x) => inAg(x.agencyId)),
      messages: raw.messages.filter((x) => inAg(x.agencyId)),
      notifications: raw.notifications.filter(
        (n) => n.userId === actor.userId || inAg(n.agencyId),
      ),
      // No null-agency pass-through: a platform alert with no agency is not
      // one agency's to read.
      suiteAlerts: (raw.suiteAlerts ?? []).filter((s) => s.agencyId != null && inAg(s.agencyId)),
      activities: (raw.activities ?? []).filter((a) => inAg(a.agencyId)),
      propertyEvents: (raw.propertyEvents ?? []).filter(
        (e) => inAg(e.agencyId) && (!e.propertyId || propIds.has(e.propertyId)),
      ),
      invoices: (raw.invoices ?? []).filter(
        (i) => inAg(i.agencyId) || inAg(i.clientId),
      ),
      // Trust books are agency-scoped financials (P0-7)
      trustTransactions: (raw.trustTransactions ?? []).filter((x) => inAg(x.agencyId)),
      trustAllocations: (raw.trustAllocations ?? []).filter((x) => inAg(x.agencyId)),
      payoutInstructions: (raw.payoutInstructions ?? []).filter((x) => inAg(x.agencyId)),
      depositHoldings: (raw.depositHoldings ?? []).filter((x) => inAg(x.agencyId)),
      arrearsSnapshots: (raw.arrearsSnapshots ?? []).filter((x) => inAg(x.agencyId)),
      csvImportBatches: (raw.csvImportBatches ?? []).filter((x) => inAg(x.agencyId)),
    }
  }

  // Property-locked
  const allowed = scope.allowedPropertyIds
  const props = raw.properties.filter((p) => allowed.has(p.id))
  const propIds = new Set(props.map((p) => p.id))
  const buildingIds = new Set(
    props.map((p) => p.buildingId).filter((id): id is string => Boolean(id)),
  )

  const leads = raw.leads.filter((x) =>
    dealInScope(scope, { propertyId: x.propertyId, agentId: x.agentId, agencyId: x.agencyId }),
  )
  // Tenants keep own apps by applicant identity (no canSeeAgency) — mirrors client
  // Applications / TenantPortal filters. Null-agency public applicants must retain APP
  // after LiveSync bootstrap or the portal hangs empty after apply.
  const actorEmail =
    actor.role === 'tenant'
      ? (
          raw.users as Array<{ id?: string; email?: string }>
        ).find((u) => u.id === actor.userId)?.email?.toLowerCase()
      : undefined
  const applications = raw.applications.filter((x) => {
    if (actor.role === 'tenant') {
      if (x.applicantUserId && x.applicantUserId === actor.userId) return true
      if (actorEmail && x.email?.toLowerCase() === actorEmail) return true
      return false
    }
    return dealInScope(scope, {
      propertyId: x.propertyId,
      agentId: x.agentId,
      agencyId: x.agencyId,
    })
  })
  const viewings = raw.viewings.filter((x) =>
    dealInScope(scope, { propertyId: x.propertyId, agentId: x.agentId, agencyId: x.agencyId }),
  )
  const viewingSlots = (raw.viewingSlots ?? []).filter((x) =>
    dealInScope(scope, { propertyId: x.propertyId, agentId: x.agentId, agencyId: x.agencyId }),
  )
  const tenancies = raw.tenancies.filter((x) => allowed.has(x.propertyId))
  const tickets = raw.tickets.filter((t) => {
    // Tenants: only tickets they reported. Property scope alone would hand an
    // applicant every ticket on a listing they applied to.
    if (actor.role === 'tenant') {
      const reporter = (t as { reportedByUserId?: string | null }).reportedByUserId
      return Boolean(reporter) && reporter === actor.userId
    }
    return ticketInScope(scope, t)
  })
  const payments = raw.payments.filter((p) => {
    if (actor.role === 'tenant') {
      return p.partyUserId === actor.userId
    }
    // Contractors get no payment rows (their invoices are not payments).
    if (actor.role === 'contractor') return false
    if (actor.role === 'landlord') {
      return p.landlordVisible && allowed.has(p.propertyId)
    }
    return allowed.has(p.propertyId)
  })
  const propertyDocuments = raw.propertyDocuments.filter((d) => allowed.has(d.propertyId))
  const threads = raw.threads.filter((th) => {
    // Mode A: landlords/tenants/contractors see only threads where they are
    // participants (match client threadInScope).
    if (actor.role === 'landlord' || actor.role === 'tenant' || actor.role === 'contractor') {
      return th.participantIds.includes(actor.userId)
    }
    if (th.participantIds.includes(actor.userId)) return true
    if (!th.propertyId) return false
    return allowed.has(th.propertyId)
  })
  const threadIds = new Set(threads.map((t) => t.id as string))
  const messages = raw.messages.filter((m) => threadIds.has(m.threadId))
  const notifications = raw.notifications.filter((n) => n.userId === actor.userId)

  // Portal roles: own rows only in the collections that carry other people's
  // contact details or files (property scope alone is too wide — applying to a
  // listing puts that property in a tenant's scope).
  const portal = PORTAL_ROLES.has(actor.role)
    ? narrowPortalCollections(
        { leads, applications, viewings, tenancies, propertyDocuments },
        actor,
        (raw.users as Array<{ id?: string; email?: string; name?: string }>).find(
          (u) => u.id === actor.userId,
        ),
      )
    : null
  const ownAgency = actor.agencyId
  const noTrust = NO_TRUST_ROLES.has(actor.role)
  const trustRows = <T extends { agencyId?: string | null }>(rows: T[] | undefined): T[] =>
    noTrust || !ownAgency ? [] : (rows ?? []).filter((x) => x.agencyId === ownAgency)

  // Landlords (owner statement): trust allocations on their own tenancies and
  // payout instructions paying them on their own properties. Nothing else
  // from the trust books. Ids matched in every form the actor may carry.
  const isLandlord = actor.role === 'landlord'
  const mine = (id: unknown) => typeof id === 'string' && id !== '' && actorIds.has(id)
  // Agency comes from the property, never the session: a row passes only
  // with a non-null agencyId equal to its property's non-null agencyId.
  const ownPropertyAgency = new Map<string, string>(
    isLandlord
      ? (raw.properties as Array<{ id: string; landlordId?: string | null; agencyId?: string | null }>)
          .filter((p) => mine(p.landlordId) && Boolean(p.agencyId))
          .map((p) => [p.id, p.agencyId as string])
      : [],
  )
  const tenancyProperty = new Map<string, string>(
    isLandlord
      ? (raw.tenancies as Array<{ id: string; landlordId?: string | null; propertyId?: string }>)
          .filter((t) => mine(t.landlordId) && Boolean(t.propertyId) && ownPropertyAgency.has(t.propertyId!))
          .map((t) => [t.id, t.propertyId as string])
      : [],
  )
  const sameAgency = (rowAgency: unknown, propertyId: string | undefined) =>
    typeof rowAgency === 'string' &&
    rowAgency !== '' &&
    Boolean(propertyId) &&
    ownPropertyAgency.get(propertyId!) === rowAgency
  const landlordAllocations = isLandlord
    ? (raw.trustAllocations ?? []).filter((a) => {
        const r = a as { occupancyId?: string | null; agencyId?: string | null }
        return Boolean(r.occupancyId) && sameAgency(r.agencyId, tenancyProperty.get(r.occupancyId!))
      })
    : null
  const landlordPayouts = isLandlord
    ? (raw.payoutInstructions ?? []).filter((p) => {
        const r = p as { payeeType?: string; payeeId?: string; propertyId?: string; agencyId?: string | null }
        return r.payeeType === 'landlord' && mine(r.payeeId) && sameAgency(r.agencyId, r.propertyId)
      })
    : null

  return {
    ...raw,
    scoped: true,
    actor: { userId: actor.userId, role: actor.role, agencyId: actor.agencyId },
    agencies,
    properties: props,
    buildings: raw.buildings.filter(
      (b) => buildingIds.has(b.id) || (actor.agencyId ? b.clientId === actor.agencyId : false),
    ),
    units: raw.units.filter((u) => {
      const pid = u.id.startsWith('unt-') ? u.id.slice(4) : null
      return (pid && propIds.has(pid)) || (u.buildingId ? buildingIds.has(u.buildingId) : false)
    }),
    leads: (portal?.leads ?? leads) as BootstrapPayload['leads'],
    applications: (portal?.applications ?? applications) as BootstrapPayload['applications'],
    tenancies: (portal?.tenancies ?? tenancies) as BootstrapPayload['tenancies'],
    viewings: (portal?.viewings ?? viewings) as BootstrapPayload['viewings'],
    viewingSlots,
    payments,
    propertyDocuments: (portal?.propertyDocuments ??
      propertyDocuments) as BootstrapPayload['propertyDocuments'],
    tickets,
    threads,
    messages,
    notifications,
    // No null-agency pass-through (B1): a no-agency actor gets none of these.
    suiteAlerts: (raw.suiteAlerts ?? []).filter(
      (s) => Boolean(ownAgency) && s.agencyId === ownAgency,
    ),
    activities: (raw.activities ?? []).filter(
      (a) => Boolean(ownAgency) && a.agencyId === ownAgency,
    ),
    propertyEvents: (raw.propertyEvents ?? []).filter(
      (e) => e.propertyId && propIds.has(e.propertyId),
    ),
    invoices: [],
    // Trust books (B1): tenants, contractors and field agents get none;
    // landlords only the allocation / payout rows above (never transactions,
    // deposits, arrears or CSV batches); everyone else only their own
    // agency's rows, never a null-agency pass-through.
    trustTransactions: trustRows(raw.trustTransactions),
    trustAllocations: landlordAllocations ?? trustRows(raw.trustAllocations),
    payoutInstructions: landlordPayouts ?? trustRows(raw.payoutInstructions),
    depositHoldings: trustRows(raw.depositHoldings),
    arrearsSnapshots: trustRows(raw.arrearsSnapshots),
    csvImportBatches: trustRows(raw.csvImportBatches),
  }
}
