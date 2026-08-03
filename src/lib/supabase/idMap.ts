/** Frontend ↔ backend ID maps (mirrors server/idMap.ts seed aliases). */
export const CLIENT_TO_AGENCY: Record<string, string> = {
    'a1000001-0001-4000-8000-000000000001': 'ag-horizon',
    'a1000001-0001-4000-8000-000000000002': 'ag-cape',
    'a1000001-0001-4000-8000-000000000003': 'ag-garden',
  }
  
  export const EMAIL_TO_USER: Record<string, string> = {
    'sambampo200@gmail.com': 'u-super',
    'super@propertyflow.app': 'u-super',
    'amelia@horizonrealty.co.za': 'u-amelia',
    'lerato@horizonrealty.co.za': 'u-lerato',
    'james@horizonrealty.co.za': 'u-james',
    'priya@horizonrealty.co.za': 'u-priya',
    'jvdberg@email.com': 'u-owner2',
    'trust@owners.co.za': 'u-owner1',
    'lucas@email.com': 'u-lucas',
    'nomsa.d@email.com': 'u-nomsa-t',
    'fatima.j@email.com': 'u-fatima',
    'sipho@capecoastal.co.za': 'u-sipho',
    'anya@capecoastal.co.za': 'u-anya',
    'sea@owners.co.za': 'u-cape-owner',
    'm.khan@email.com': 'u-maryam',
    'jobs@aquafix.co.za': 'u-aqua',
    'zane@capecoastal.co.za': 'u-zane',
    'theo@capecoastal.co.za': 'u-theo',
    'nandi@capecoastal.co.za': 'u-nandi',
    'aya@email.com': 'u-aya',
    'jobs@bayfix.co.za': 'u-bayfix',
    'gita@gardenroutehomes.co.za': 'u-gita',
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
  