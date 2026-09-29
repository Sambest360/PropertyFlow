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
  agencyBackendToFe: Map<string, string>
}

const caches = new Map<string, { at: number; value: IdMapCache }>()
const TTL_MS = 30_000

export function invalidateIdMapCache(): void {
  caches.clear()
}

function cacheKey(clientUuid: string | null): string {
  return clientUuid ?? '*'
}

/**
 * `clientUuid` limits the map to one agency. A platform-wide cache is never
 * reused for an agency-scoped caller, and the reverse.
 */
export async function loadIdMapCache(
  opts: boolean | { force?: boolean; clientUuid?: string | null } = false,
): Promise<IdMapCache> {
  const force = typeof opts === 'boolean' ? opts : Boolean(opts.force)
  const clientUuid = typeof opts === 'boolean' ? null : (opts.clientUuid ?? null)
  const key = cacheKey(clientUuid)
  const now = Date.now()
  const hit = caches.get(key)
  if (!force && hit && now - hit.at < TTL_MS) return hit.value

  const userBackendToFe = new Map<string, string>()
  const unitBackendToPropertyFe = new Map<string, string>()
  const agencyBackendToFe = new Map<string, string>()

  await ensureEntityMapTable()

  const idSql = clientUuid
    ? `SELECT entity_type, frontend_id, backend_id::text
       FROM entity_id_map m
       WHERE (m.entity_type = 'agency' AND m.backend_id = $1::uuid)
          OR m.backend_id IN (
            SELECT id FROM users WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM buildings WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM units WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM rooms WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM leads WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM applications WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM leases WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM bookings WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM viewing_slots WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM payments WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM documents WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM maintenance_tickets WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM message_threads WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM messages WHERE client_id = $1::uuid
            UNION ALL SELECT id FROM notifications WHERE client_id = $1::uuid
          )`
    : `SELECT entity_type, frontend_id, backend_id::text FROM entity_id_map`
  const userSql = clientUuid
    ? `SELECT id::text AS id, email FROM users WHERE client_id = $1::uuid`
    : `SELECT id::text AS id, email FROM users`
  const idParams = clientUuid ? [clientUuid] : []

  const [idRows, userRows] = await Promise.all([
    query<{ entity_type: string; frontend_id: string; backend_id: string }>(idSql, idParams),
    query<{ id: string; email: string }>(userSql, idParams),
  ])

  for (const row of idRows) {
    if (row.entity_type === 'user') {
      userBackendToFe.set(row.backend_id, row.frontend_id)
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

  for (const u of userRows) {
    const fe = EMAIL_TO_USER[u.email.toLowerCase()]
    if (fe) userBackendToFe.set(u.id, fe)
  }

  const value = { userBackendToFe, unitBackendToPropertyFe, agencyBackendToFe }
  caches.set(key, { at: now, value })
  return value
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
