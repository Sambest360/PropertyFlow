import { isListingUuid } from '../listingIds.js'

/** Frontend ↔ backend ID maps (mirrors server/idMap.ts seed aliases). */
export const CLIENT_TO_AGENCY: Record<string, string> = {
  'a1000001-0001-4000-8000-000000000001': 'ag-horizon',
  'a1000001-0001-4000-8000-000000000002': 'ag-cape',
  'a1000001-0001-4000-8000-000000000003': 'ag-garden',
}

export const EMAIL_TO_USER: Record<string, string> = {
  'ephraimbampo317@gmail.com': 'u-super-ephraim',
  'sambampo200@gmail.com': 'u-super',
  'super@propertyflow.app': 'u-super',
  'lerato@horizonrealty.co.za': 'u-lerato',
  'lerato.nkosi@propertyflow.demo': 'u-admin-lerato',
  'james@horizonrealty.co.za': 'u-james',
  'james.okonkwo@propertyflow.demo': 'u-agent-james',
  'priya.naidoo@propertyflow.demo': 'u-agent-priya',
  'themba.maseko@propertyflow.demo': 'u-agent-themba',
  'nadia.vanwyk@propertyflow.demo': 'u-agent-nadia',
  'chris.daniels@propertyflow.demo': 'u-agent-chris',
  'riaan.botha@propertyflow.demo': 'u-tenant-riaan',
  'elena.costa@propertyflow.demo': 'u-tenant-elena',
  'sarie.duplessis@propertyflow.demo': 'u-tenant-sarie',
  'lucas.pretorius@propertyflow.demo': 'u-tenant-lucas',
  'nomsa.dlamini@propertyflow.demo': 'u-tenant-nomsa',
  'fatima.jacobs@propertyflow.demo': 'u-tenant-fatima',
  'jobs@aquafix.propertyflow.demo': 'u-aqua',
  'jobs@paintworks.propertyflow.demo': 'u-paintworks',
  'jvdberg@email.com': 'u-owner2',
  'trust@owners.co.za': 'u-owner1',
  'lucas@email.com': 'u-lucas',
  'nomsa.d@email.com': 'u-nomsa-t',
  'fatima.j@email.com': 'u-fatima',
  'anya@capecoastal.co.za': 'u-anya',
  'sea@owners.co.za': 'u-cape-owner',
  'm.khan@email.com': 'u-maryam',
  'jobs@aquafix.co.za': 'u-aqua',
  'zane@capecoastal.co.za': 'u-zane',
  'nandi@capecoastal.co.za': 'u-nandi',
  'aya@email.com': 'u-aya',
  'jobs@bayfix.co.za': 'u-bayfix',
  'leigh@gardenroutehomes.co.za': 'u-leigh',
  'owners@gardenroutehomes.co.za': 'u-garden-owner',
  'mia@email.com': 'u-mia',
  'jobs@coastalfix.co.za': 'u-coastal-fix',
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

/**
 * Designated platform super-admin emails. Honoured only when the DB role is
 * already SUPER_ADMIN (the list never grants the role by itself), and reserved:
 * no registration or email change may claim one of these addresses.
 */
export const SUPER_ADMIN_EMAILS = new Set([
  'ephraimbampo317@gmail.com',
  'sambampo200@gmail.com',
  'super@propertyflow.app',
])

export function isReservedSuperAdminEmail(email: string | null | undefined): boolean {
  const e = typeof email === 'string' ? email.trim().toLowerCase() : ''
  return Boolean(e) && SUPER_ADMIN_EMAILS.has(e)
}

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

  // The designated list only confirms an existing SUPER_ADMIN row; it never
  // promotes an END_USER / staff row that happens to carry a listed email.
  if (normalizedEmail && SUPER_ADMIN_EMAILS.has(normalizedEmail) && dbRole === 'SUPER_ADMIN') {
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
  // metadata.frontend_role can never grant super_admin on a non-SUPER_ADMIN row.
  if (metaRole && metaRole.toLowerCase() !== 'super_admin') return metaRole
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

const USER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function mapUser(
  cache: IdMapCache,
  userByUuid: Map<string, string>,
  id: string | null | undefined,
): string | null {
  if (!id) return null
  const fromUsers = userByUuid.get(id)
  if (fromUsers) return fromUsers
  const fromCache = cache.byType.get('user')?.get(id)
  if (fromCache) return fromCache
  // P0-5 residual: hydrate to session FE id only. Unmapped backend UUID must
  // become Unassigned (null) — leaking raw UUID breaks FA canSeeAgentRecord
  // (viewer FE id !== agent UUID) so the book vanishes after reload.
  if (USER_UUID_RE.test(id)) return null
  return id
}

export function mapProperty(cache: IdMapCache, unitId: string | null | undefined): string | null {
  if (!unitId) return null
  return feFromCache(cache, 'property', unitId, UNIT_TO_PROPERTY[unitId] ?? unitId)
}

export type IdMapRow = { entity_type: string; backend_id: string; frontend_id: string }

export function buildIdMapCacheFromRows(rows: IdMapRow[]): IdMapCache {
  return buildIdMapCache(rows, [])
}

/** Map a backend UUID route segment to a frontend id when entity_id_map has a row. */
export function resolveFrontendRouteId(
  cache: IdMapCache | null | undefined,
  entityTypes: string[],
  param: string | null | undefined,
): string | null {
  if (!cache || !param?.trim()) return null
  const id = param.trim()
  if (!isListingUuid(id)) return null
  for (const entityType of entityTypes) {
    const mapped = cache.byType.get(entityType)?.get(id)
    if (mapped && mapped !== id && !isListingUuid(mapped)) return mapped
  }
  const agencyFe = cache.agencyByClient.get(id)
  if (agencyFe && agencyFe !== id && !isListingUuid(agencyFe)) return agencyFe
  return null
}
