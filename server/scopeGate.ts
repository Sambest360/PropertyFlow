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
import type { Role } from '../src/types/domain.js'
import {
  canResolveSupportTicket,
  filterSupportTicketsForViewer,
  supportTicketRoutingAgency,
} from '../src/lib/supportTickets.js'

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
      { table: string; unitCol?: string; clientCol?: string; agentCol?: string; extra?: string }
    >
  > = {
    lead: { table: 'leads', unitCol: 'unit_id', clientCol: 'client_id', agentCol: 'agent_id' },
    application: {
      table: 'applications',
      unitCol: 'unit_id',
      clientCol: 'client_id',
      agentCol: 'agent_id',
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
    return {
      ...empty,
      agencyId: toAgencyFe(rows[0]?.client_id ?? null),
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
  | { kind: 'ticket'; agencyId: string | null; status: string; submittedByUserId: string | null }
> {
  const uuid = await resolveUuid('support_ticket', feId)
  if (!uuid) return { kind: 'none' }
  const rows = await query<{
    event_type: string
    client_id: string | null
    status: string | null
    submitted_by: string | null
  }>(
    `SELECT event_type, client_id::text AS client_id,
            payload->>'status' AS status, payload->>'submittedByUserId' AS submitted_by
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
  }
}

export async function assertSupportTicketAllowed(
  actor: DemoActor,
  body: PersistBody,
): Promise<void> {
  const deny = (why: string) =>
    forbiddenError(`Forbidden: ${actor.role} ${actor.userId} cannot ${body.action} support_ticket ${body.id} (${why})`)
  const actorAgency = (await agencyFe(actor.agencyId)) ?? actor.agencyId ?? null
  const viewer = { userId: actor.userId, role: actor.role, agencyId: actorAgency }

  if (body.action === 'delete') {
    if (actor.role !== 'super_admin') throw deny('delete is super admin only')
    return
  }

  const data = body.data ?? {}
  const row = await loadSupportTicketRow(body.id)
  if (row.kind === 'other') throw deny('id belongs to another record')

  if (row.kind === 'none') {
    const claimed = strField(data, 'submittedByUserId')
    if (!claimed || claimed !== actor.userId) throw deny('submitter must be the signed-in user')
    body.data = {
      subject: data.subject,
      body: data.body,
      category: data.category,
      submitterName: data.submitterName,
      submittedByUserId: actor.userId,
      submitterRole: actor.role,
      agencyId: supportTicketRoutingAgency(actor.role, actorAgency),
      status: 'open',
    }
    return
  }

  if (row.status === 'resolved') throw deny('resolved tickets are read-only')
  if (!canResolveSupportTicket(viewer, { agencyId: row.agencyId })) {
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
): Promise<void> {
  if (body.resource === 'support_ticket') {
    await assertSupportTicketAllowed(actor, body)
    return
  }
  const scope = await buildActorPropertyScope(actor)
  const data = body.data ?? {}
  const existing = await loadExisting(body.resource, body.id)

  let propertyId =
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
  const ownerUserId =
    strField(data, 'userId') ??
    strField(data, 'fromUserId') ??
    strField(data, 'applicantUserId') ??
    strField(data, 'tenantUserId') ??
    (body.resource === 'user' ? body.id : null) ??
    existing?.ownerUserId ??
    null

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
  supportTickets?: Array<{ agencyId: string | null; submittedByUserId: string }>
  [key: string]: unknown
}

/**
 * Filter a full bootstrap payload for a property-locked actor.
 * Agency-wide / super_admin: agency (or platform) filter only; users kept for RoleSwitcher.
 */
export function filterBootstrapForActor(
  raw: BootstrapPayload,
  actor: DemoActor,
  scope: PropertyScope,
): BootstrapPayload {
  const agencyWide = isAgencyWideRole(actor.role as Role) || actor.role === 'super_admin'
  const scoped = !agencyWide

  // Always keep full users + agencies so RoleSwitcher can swap personas.
  // Non-platform staff still see other agencies in the switcher list from seed merge;
  // bootstrap agencies for super_admin stay full; others get their agency + all users.
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
    const inAg = (agencyId: string | null | undefined) => !ag || agencyId === ag
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
      suiteAlerts: (raw.suiteAlerts ?? []).filter(
        (s) => s.agencyId == null || inAg(s.agencyId),
      ),
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
      // CR7: own submissions + this agency's desk; platform (null) stays super admin only.
      supportTickets: filterSupportTicketsForViewer(raw.supportTickets ?? [], {
        userId: actor.userId,
        role: actor.role as Role,
        agencyId: actor.agencyId,
      }),
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
  const tickets = raw.tickets.filter((t) => ticketInScope(scope, t))
  const payments = raw.payments.filter((p) => {
    if (actor.role === 'tenant') {
      return p.partyUserId === actor.userId
    }
    if (actor.role === 'landlord') {
      return p.landlordVisible && allowed.has(p.propertyId)
    }
    return allowed.has(p.propertyId)
  })
  const propertyDocuments = raw.propertyDocuments.filter((d) => allowed.has(d.propertyId))
  const threads = raw.threads.filter((th) => {
    // Mode A: landlords/tenants see threads where they are participants (match client threadInScope).
    if (actor.role === 'landlord' || actor.role === 'tenant') {
      return th.participantIds.includes(actor.userId)
    }
    if (th.participantIds.includes(actor.userId)) return true
    if (!th.propertyId) return false
    return allowed.has(th.propertyId)
  })
  const threadIds = new Set(threads.map((t) => t.id as string))
  const messages = raw.messages.filter((m) => threadIds.has(m.threadId))
  const notifications = raw.notifications.filter((n) => n.userId === actor.userId)

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
    leads,
    applications,
    tenancies,
    viewings,
    viewingSlots,
    payments,
    propertyDocuments,
    tickets,
    threads,
    messages,
    notifications,
    suiteAlerts: (raw.suiteAlerts ?? []).filter(
      (s) => s.agencyId == null || s.agencyId === actor.agencyId,
    ),
    activities: (raw.activities ?? []).filter(
      (a) => !a.agencyId || a.agencyId === actor.agencyId,
    ),
    propertyEvents: (raw.propertyEvents ?? []).filter(
      (e) => e.propertyId && propIds.has(e.propertyId),
    ),
    invoices: [],
    // Trust books: property-locked actors get only their own agency's rows (P0-7).
    trustTransactions: (raw.trustTransactions ?? []).filter(
      (x) => !actor.agencyId || x.agencyId === actor.agencyId,
    ),
    trustAllocations: (raw.trustAllocations ?? []).filter(
      (x) => !actor.agencyId || x.agencyId === actor.agencyId,
    ),
    payoutInstructions: (raw.payoutInstructions ?? []).filter(
      (x) => !actor.agencyId || x.agencyId === actor.agencyId,
    ),
    depositHoldings: (raw.depositHoldings ?? []).filter(
      (x) => !actor.agencyId || x.agencyId === actor.agencyId,
    ),
    arrearsSnapshots: (raw.arrearsSnapshots ?? []).filter(
      (x) => !actor.agencyId || x.agencyId === actor.agencyId,
    ),
    csvImportBatches: (raw.csvImportBatches ?? []).filter(
      (x) => !actor.agencyId || x.agencyId === actor.agencyId,
    ),
    // CR7: property-locked roles never hold the desk — own submissions only.
    // Explicit so the ...raw spread above cannot leak other people's tickets.
    supportTickets: (raw.supportTickets ?? []).filter(
      (t) => t.submittedByUserId === actor.userId,
    ),
  }
}
