/** Frontend ↔ backend ID maps (mirrors server/idMap.ts seed aliases). */
export const CLIENT_TO_AGENCY: Record<string, string> = {
  'a1000001-0001-4000-8000-000000000001': 'ag-horizon',
  'a1000001-0001-4000-8000-000000000002': 'ag-cape',
  'a1000001-0001-4000-8000-000000000003': 'ag-garden',
}

export const EMAIL_TO_USER: Record<string, string> = {
  'ephraim.admin@example.test': 'u-super-ephraim',
  'samuel.admin@example.test': 'u-super',
  'super.propertyflow@example.test': 'u-super',
  'amelia.horizonrealty@example.test': 'u-amelia',
  'lerato.horizonrealty@example.test': 'u-lerato',
  'lerato.nkosi.propertyflow@example.test': 'u-admin-lerato',
  'james.horizonrealty@example.test': 'u-james',
  'james.okonkwo.propertyflow@example.test': 'u-agent-james',
  'priya.naidoo.propertyflow@example.test': 'u-agent-priya',
  'themba.maseko.propertyflow@example.test': 'u-agent-themba',
  'nadia.vanwyk.propertyflow@example.test': 'u-agent-nadia',
  'chris.daniels.propertyflow@example.test': 'u-agent-chris',
  'riaan.botha.propertyflow@example.test': 'u-tenant-riaan',
  'elena.costa.propertyflow@example.test': 'u-tenant-elena',
  'sarie.duplessis.propertyflow@example.test': 'u-tenant-sarie',
  'lucas.pretorius.propertyflow@example.test': 'u-tenant-lucas',
  'nomsa.dlamini.propertyflow@example.test': 'u-tenant-nomsa',
  'fatima.jacobs.propertyflow@example.test': 'u-tenant-fatima',
  'jobs.aquafix-propertyflow@example.test': 'u-aqua',
  'jobs.paintworks-propertyflow@example.test': 'u-paintworks',
  'priya.horizonrealty@example.test': 'u-priya',
  'jvdberg@example.test': 'u-owner2',
  'trust.owners@example.test': 'u-owner1',
  'lucas@example.test': 'u-lucas',
  'nomsa.d@example.test': 'u-nomsa-t',
  'fatima.j@example.test': 'u-fatima',
  'sipho.capecoastal@example.test': 'u-sipho',
  'anya.capecoastal@example.test': 'u-anya',
  'sea.owners@example.test': 'u-cape-owner',
  'm.khan@example.test': 'u-maryam',
  'jobs.aquafix@example.test': 'u-aqua',
  'zane.capecoastal@example.test': 'u-zane',
  'theo.capecoastal@example.test': 'u-theo',
  'nandi.capecoastal@example.test': 'u-nandi',
  'aya@example.test': 'u-aya',
  'jobs.bayfix@example.test': 'u-bayfix',
  'gita.gardenroutehomes@example.test': 'u-gita',
  'leigh.gardenroutehomes@example.test': 'u-leigh',
  'owners.gardenroutehomes@example.test': 'u-garden-owner',
  'mia@example.test': 'u-mia',
  'jobs.coastalfix@example.test': 'u-coastal-fix',
}

export const UNIT_TO_PROPERTY: Record<string, string> = {
  'a4000001-0001-4000-8000-000000000001': 'PR-1001',
  'a4000001-0001-4000-8000-000000000002': 'PR-1002',
  'a4000001-0001-4000-8000-000000000003': 'PR-1012',
  'a4000001-0001-4000-8000-000000000004': 'PR-1003',
  'a4000001-0001-4000-8000-000000000005': 'PR-1004',
  'a4000001-0001-4000-8000-000000000006': 'PR-1008',
  'a4000001-0001-4000-8000-000000000007': 'PR-1010',
  'a4000001-0001-4000-8000-000000000008': 'PR-1011',
}

export const ROLE_FROM_DB: Record<string, string> = {
  SUPER_ADMIN: 'super_admin',
  AGENCY_ADMIN: 'client_admin',
  AGENT_ADMIN: 'agent_admin',
  GROUND_AGENT: 'ground_agent',
  LANDLORD: 'landlord',
  END_USER: 'tenant',
  CONTRACTOR: 'contractor',
}

/** Designated platform super-admin emails — never demote to applicant when DB row is stale. */
export const SUPER_ADMIN_EMAILS = new Set([
  'ephraim.admin@example.test',
  'samuel.admin@example.test',
  'super.propertyflow@example.test',
])

/** Staff DB roles must not be demoted by stale metadata (e.g. after self-registration). */
const DB_ROLE_OVERRIDES_META = new Set([
  'SUPER_ADMIN',
  'AGENCY_ADMIN',
  'AGENT_ADMIN',
  'GROUND_AGENT',
])

export function resolveFrontendRole(
  dbRole: string,
  meta: Record<string, unknown> | null | undefined,
  email?: string | null,
): string {
  const normalizedEmail = email?.trim().toLowerCase() ?? ''

  if (normalizedEmail && SUPER_ADMIN_EMAILS.has(normalizedEmail)) {
    if (dbRole === 'SUPER_ADMIN') return 'super_admin'
    // Self-registration can leave END_USER + applicant metadata on the super-admin email.
    return 'super_admin'
  }

  const fromDb = ROLE_FROM_DB[dbRole]
  if (fromDb && DB_ROLE_OVERRIDES_META.has(dbRole)) {
    return fromDb
  }
  const metaRole =
    typeof meta?.frontend_role === 'string' && meta.frontend_role.trim()
      ? meta.frontend_role.trim()
      : ''
  if (metaRole) return metaRole
  return fromDb ?? 'tenant'
}

export const ROLE_TO_DB: Record<string, string> = {
  super_admin: 'SUPER_ADMIN',
  client_admin: 'AGENCY_ADMIN',
  agency_admin: 'AGENCY_ADMIN',
  agent_admin: 'AGENT_ADMIN',
  agent: 'GROUND_AGENT',
  ground_agent: 'GROUND_AGENT',
  landlord: 'LANDLORD',
  tenant: 'END_USER',
  applicant: 'END_USER',
  contractor: 'CONTRACTOR',
}

export type IdMapCache = {
  byType: Map<string, Map<string, string>>
  agencyByClient: Map<string, string>
}

export function buildIdMapCache(
  rows: Array<{ entity_type: string; backend_id: string; frontend_id: string }>,
  clients: Array<{ id: string; settings: Record<string, unknown> | null }>,
): IdMapCache {
  const byType = new Map<string, Map<string, string>>()
  for (const row of rows) {
    let m = byType.get(row.entity_type)
    if (!m) {
      m = new Map()
      byType.set(row.entity_type, m)
    }
    m.set(row.backend_id, row.frontend_id)
  }

  const agencyByClient = new Map<string, string>(Object.entries(CLIENT_TO_AGENCY))
  for (const c of clients) {
    const fe = c.settings?.frontend_id
    if (typeof fe === 'string' && fe) agencyByClient.set(c.id, fe)
  }

  return { byType, agencyByClient }
}

export function feFromCache(
  cache: IdMapCache,
  entityType: string,
  uuid: string | null | undefined,
  fallback?: string,
): string | null {
  if (!uuid) return null
  const mapped = cache.byType.get(entityType)?.get(uuid)
  if (mapped) return mapped
  if (entityType === 'agency') return cache.agencyByClient.get(uuid) ?? fallback ?? uuid
  if (entityType === 'property' || entityType === 'unit') {
    return (
      cache.byType.get('property')?.get(uuid) ??
      cache.byType.get('unit')?.get(uuid) ??
      UNIT_TO_PROPERTY[uuid] ??
      fallback ??
      uuid
    )
  }
  return fallback ?? uuid
}

export function mapAgency(cache: IdMapCache, clientId: string | null | undefined): string | null {
  if (!clientId) return null
  return feFromCache(cache, 'agency', clientId, CLIENT_TO_AGENCY[clientId] ?? clientId)
}

export function mapUser(
  cache: IdMapCache,
  userByUuid: Map<string, string>,
  id: string | null | undefined,
): string | null {
  if (!id) return null
  return userByUuid.get(id) ?? feFromCache(cache, 'user', id, id)
}

export function mapProperty(cache: IdMapCache, unitId: string | null | undefined): string | null {
  if (!unitId) return null
  return feFromCache(cache, 'property', unitId, UNIT_TO_PROPERTY[unitId] ?? unitId)
}
