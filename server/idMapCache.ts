/**
 * In-memory caches for entity_id_map + user email lookups.
 * Eliminates N+1 queries in scopeGate.loadScopeLinks().
 */
import { query } from './db.js'
import { EMAIL_TO_USER, UNIT_TO_PROPERTY, mapAgency, mapProperty } from './idMap.js'
import { ensureEntityMapTable, staticUuidFor } from './entityMap.js'

export type IdMapCache = {
  userBackendToFe: Map<string, string>
  unitBackendToPropertyFe: Map<string, string>
  agencyBackendToFe: Map<string, string>
  /** Every entity_id_map row as `${entity_type}:${backend_id}` → frontend_id. */
  aliasByTypeBackend: Map<string, string>
  /** The entity_id_map rows this cache was built from. */
  rows: Array<{ entity_type: string; frontend_id: string; backend_id: string }>
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
  const agencyBackendToFe = new Map<string, string>()
  const aliasByTypeBackend = new Map<string, string>()
  const userFeToBackend = new Map<string, string>()

  await ensureEntityMapTable()

  const [idRows, userRows] = await Promise.all([
    query<{ entity_type: string; frontend_id: string; backend_id: string }>(
      `SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map`,
    ),
    query<{ id: string; email: string }>(`SELECT id::text AS id, email FROM users`),
  ])

  for (const row of idRows) {
    aliasByTypeBackend.set(`${row.entity_type}:${row.backend_id}`, row.frontend_id)
    if (row.entity_type === 'user') {
      userBackendToFe.set(row.backend_id, row.frontend_id)
      userFeToBackend.set(row.frontend_id, row.backend_id)
    }
    if (row.entity_type === 'agency') {
      agencyBackendToFe.set(row.backend_id, row.frontend_id)
    }
    if (row.entity_type === 'property' || row.entity_type === 'unit') {
      const fe = row.frontend_id.startsWith('unt-')
        ? row.frontend_id.slice(4)
        : row.frontend_id
      unitBackendToPropertyFe.set(row.backend_id, fe)
    }
  }

  // Email-derived seed ids pass the round-trip rule only: the front-end id
  // must resolve back to this very row. A user who registers with a seed
  // email gets a new uuid, fails the check, and never inherits the seed id
  // (or its trust rows, payouts and bank account).
  // Same answer as resolveUuid('user', fe) — static seed map, then the
  // entity_id_map rows read above — without one query per seed email.
  for (const u of userRows) {
    const fe = u.email ? EMAIL_TO_USER[u.email.toLowerCase()] : undefined
    if (!fe) continue
    if ((staticUuidFor('user', fe) ?? userFeToBackend.get(fe)) === u.id) userBackendToFe.set(u.id, fe)
  }

  cached = { userBackendToFe, unitBackendToPropertyFe, agencyBackendToFe, aliasByTypeBackend, rows: idRows }
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

/** Agency FE id: entity_id_map alias first, then seed CLIENT_TO_AGENCY / passthrough. */
export function feAgencyFromCache(
  cache: IdMapCache,
  clientId: string | null | undefined,
): string | null {
  if (!clientId) return null
  return cache.agencyBackendToFe.get(clientId) ?? mapAgency(clientId)
}
