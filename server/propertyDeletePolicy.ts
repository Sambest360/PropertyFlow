import { canDeletePropertyByRule } from '../src/lib/propertyDeletion.js'
import { canSeeAgency, type PropertyAccessSubject } from '../src/lib/agencyScope.js'
import { isAgencyWideRole } from '../src/lib/scope.js'
import type { Role } from '../src/types/domain.js'
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import type { DemoActor } from './actor.js'
import type { PersistBody } from './writes.js'
import { agencyIdInFeSpace } from '../src/lib/agencyScope.js'

export function policyError(message: string, status: number, code: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code })
}

export type UnitExistingRow = {
  propertyId: string
  agencyId: string | null
  agentId: string | null
  landlordId: string | null
  statusConfigKey: string | null
}

function strField(data: Record<string, unknown> | undefined, key: string): string | null {
  const v = data?.[key]
  if (v == null || v === '') return null
  return String(v)
}

function agenciesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const af = agencyIdInFeSpace(a)
  const bf = agencyIdInFeSpace(b)
  return af === bf
}

export async function assertUnitArchiveAllowed(unitUuid: string): Promise<void> {
  const leases = await query<{ n: string }>(
    `SELECT 1 AS n FROM leases WHERE unit_id = $1::uuid AND status IN ('ACTIVE', 'PENDING') LIMIT 1`,
    [unitUuid],
  )
  if (leases[0]) {
    throw policyError('End the active lease before archiving this property.', 409, 'PROPERTY_DELETE_BLOCKED')
  }
  const payments = await query<{ n: string }>(
    `SELECT 1 AS n FROM payments WHERE unit_id = $1::uuid AND status IN ('DUE', 'OVERDUE') LIMIT 1`,
    [unitUuid],
  )
  if (payments[0]) {
    throw policyError('Settle due or overdue payments before archiving this property.', 409, 'PROPERTY_DELETE_BLOCKED')
  }
}

async function assertBuildingArchiveAllowed(buildingUuid: string): Promise<void> {
  const leases = await query<{ n: string }>(
    `SELECT 1 AS n FROM leases l
     JOIN units u ON u.id = l.unit_id
     WHERE u.building_id = $1::uuid AND l.status IN ('ACTIVE', 'PENDING') LIMIT 1`,
    [buildingUuid],
  )
  if (leases[0]) {
    throw policyError('End active leases on this building before deleting it.', 409, 'PROPERTY_DELETE_BLOCKED')
  }
  const payments = await query<{ n: string }>(
    `SELECT 1 AS n FROM payments p
     JOIN units u ON u.id = p.unit_id
     WHERE u.building_id = $1::uuid AND p.status IN ('DUE', 'OVERDUE') LIMIT 1`,
    [buildingUuid],
  )
  if (payments[0]) {
    throw policyError('Settle due or overdue payments on this building before deleting it.', 409, 'PROPERTY_DELETE_BLOCKED')
  }
}

export async function assertHardPropertyDeleteAllowed(
  actor: DemoActor,
  resource: string,
  feId: string,
): Promise<void> {
  if (actor.role !== 'super_admin') {
    throw policyError('Use archive from the property screen.', 403, 'PROPERTY_HARD_DELETE_FORBIDDEN')
  }
  if (resource === 'building') {
    const uuid = await resolveUuid('building', feId)
    if (uuid) await assertBuildingArchiveAllowed(uuid)
    return
  }
  if (resource === 'property' || resource === 'unit') {
    const uuid =
      (await resolveUuid('property', feId)) ?? (await resolveUuid('unit', feId))
    if (uuid) await assertUnitArchiveAllowed(uuid)
  }
}

function isArchivePayload(data: Record<string, unknown>, storedStatus: string | null): boolean {
  const key = strField(data, 'statusKey')?.toUpperCase()
  const stored = (storedStatus ?? '').toUpperCase()
  return (key === 'DELETED' || data.deletedAt != null) && stored !== 'DELETED'
}

function isRestorePayload(data: Record<string, unknown>, storedStatus: string | null): boolean {
  return data.restore === true && (storedStatus ?? '').toUpperCase() === 'DELETED'
}

/**
 * Property/unit upsert gate: stored-row authority, archive/restore, immutability, reassign guards.
 * Mutates body.data. Returns scope subject from DB when row exists.
 */
export async function enforcePropertyUnitUpsert(
  actor: DemoActor,
  body: PersistBody,
  existing: UnitExistingRow | null,
): Promise<{ property: PropertyAccessSubject; agencyId: string; propertyId: string } | null> {
  if (body.action !== 'upsert' || !existing?.agencyId) return null
  const data = (body.data ?? {}) as Record<string, unknown>
  body.data = data

  const storedAgencyId = existing.agencyId!
  const storedAgentId = existing.agentId
  const storedStatus = existing.statusConfigKey
  const storedNorm = (storedStatus ?? '').toUpperCase()

  const payloadAgencyRaw = strField(data, 'agencyId') ?? strField(data, 'clientId')
  if (payloadAgencyRaw && actor.role !== 'super_admin' && !agenciesMatch(payloadAgencyRaw, storedAgencyId)) {
    delete data.agencyId
    delete data.clientId
  }

  const payloadAgent = strField(data, 'agentId')
  const storedAgent = storedAgentId ?? ''
  if (
    storedAgent !== '' &&
    payloadAgent != null &&
    payloadAgent !== storedAgent
  ) {
    const adminOk =
      actor.role === 'super_admin' ||
      (isAgencyWideRole(actor.role as Role) &&
        canSeeAgency(actor.role as Role, actor.agencyId, false, storedAgencyId))
    if (!adminOk) {
      throw policyError('Cannot reassign the listing agent.', 403, 'PROPERTY_AGENT_REASSIGN_FORBIDDEN')
    }
  }

  if (actor.role === 'ground_agent' || actor.role === 'agent') {
    delete data.agencyId
    delete data.clientId
    if (storedAgentId != null && storedAgentId !== '') {
      delete data.agentId
    }
  }

  const isArchive = isArchivePayload(data, storedStatus)
  const isRestore = isRestorePayload(data, storedStatus)

  if (storedNorm === 'DELETED' && !isRestore) {
    throw policyError('Archived properties cannot be changed except via restore.', 403, 'PROPERTY_ARCHIVED_IMMUTABLE')
  }

  if (isArchive || isRestore) {
    const allowed = canDeletePropertyByRule(
      { role: actor.role as Role, userId: actor.userId, agencyId: actor.agencyId },
      { agencyId: storedAgencyId, agentId: storedAgentId },
    )
    if (!allowed) {
      throw policyError('You do not have permission to archive or restore this property.', 403, 'PROPERTY_DELETE_FORBIDDEN')
    }
    if (isArchive) {
      const uuid =
        (await resolveUuid('property', body.id)) ?? (await resolveUuid('unit', body.id))
      if (uuid) await assertUnitArchiveAllowed(uuid)
    }
  }

  const property: PropertyAccessSubject = {
    agencyId: storedAgencyId,
    agentId: storedAgentId,
    landlordId: existing.landlordId ?? '',
  }
  return { property, agencyId: storedAgencyId, propertyId: existing.propertyId ?? body.id }
}
