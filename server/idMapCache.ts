/**
 * In-memory caches for entity_id_map + user email lookups.
 * Eliminates N+1 queries in scopeGate.loadScopeLinks().
 */
import { query } from './db.js'
import { EMAIL_TO_USER, UNIT_TO_PROPERTY, mapProperty } from './idMap.js'
import { ensureEntityMapTable } from './entityMap.js'

export type IdMapCache = {
  userBackendToFe: Map<string, string>
  unitBackendToPropertyFe: Map<string, string>
}

let cached: IdMapCache | null = null
let cachedAt = 0
const TTL_MS = 30_000

export function invalidateIdMapCache(): void {
  cached = null
  cachedAt = 0
}

export async function loadIdMapCache(force = false): Promise<IdMapCache> {
  const now = Date.now()
  if (!force && cached && now - cachedAt < TTL_MS) return cached

  const userBackendToFe = new Map<string, string>()
  const unitBackendToPropertyFe = new Map<string, string>()

  await ensureEntityMapTable()

  const [idRows, userRows] = await Promise.all([
    query<{ entity_type: string; frontend_id: string; backend_id: string }>(
      `SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map`,
    ),
    query<{ id: string; email: string }>(`SELECT id::text AS id, email FROM users`),
  ])

  for (const row of idRows) {
    if (row.entity_type === 'user') {
      userBackendToFe.set(row.backend_id, row.frontend_id)
    }
    if (row.entity_type === 'property' || row.entity_type === 'unit') {
      const fe = row.frontend_id.startsWith('unt-')
        ? row.frontend_id.slice(4)
        : row.frontend_id
      unitBackendToPropertyFe.set(row.backend_id, fe)
    }
  }

  for (const u of userRows) {
    const fe = EMAIL_TO_USER[u.email.toLowerCase()]
    if (fe) userBackendToFe.set(u.id, fe)
  }

  cached = { userBackendToFe, unitBackendToPropertyFe }
  cachedAt = now
  return cached
}

export function feUserFromCache(cache: IdMapCache, uuid: string | null | undefined): string | null {
  if (!uuid) return null
  return cache.userBackendToFe.get(uuid) ?? uuid
}

export function fePropertyFromUnitCache(
  cache: IdMapCache,
  unitUuid: string | null | undefined,
): string | null {
  if (!unitUuid) return null
  return (
    cache.unitBackendToPropertyFe.get(unitUuid) ??
    UNIT_TO_PROPERTY[unitUuid] ??
    mapProperty(unitUuid) ??
    unitUuid
  )
}
