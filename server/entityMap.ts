/**
 * Frontend demo IDs ↔ Postgres UUIDs.
 * Seed aliases live in idMap.ts; runtime creates land in entity_id_map.
 */
import { randomUUID } from 'node:crypto'
import { query } from './db.js'
import { canonicalListingId, unitIdForProperty, listingIdAliases } from '../src/lib/listingIds.js'
import {
  AGENCY_TO_CLIENT,
  BUILDING_TO_FRONTEND,
  CLIENT_TO_AGENCY,
  DOC_IDS,
  EMAIL_TO_USER,
  ACTIVITY_IDS,
  INVOICE_IDS,
  LEAD_IDS,
  LEASE_IDS,
  MESSAGE_IDS,
  NOTIF_IDS,
  PAYMENT_IDS,
  SLOT_IDS,
  SUITE_ALERT_IDS,
  THREAD_IDS,
  TICKET_IDS,
  UNIT_TO_PROPERTY,
} from './idMap.js'

export type EntityType =
  | 'agency'
  | 'user'
  | 'building'
  | 'unit'
  | 'property'
  | 'room'
  | 'asset'
  | 'lead'
  | 'application'
  | 'tenancy'
  | 'viewing'
  | 'viewing_slot'
  | 'payment'
  | 'ticket'
  | 'document'
  | 'notification'
  | 'thread'
  | 'message'
  | 'lookup'
  | 'suite_alert'
  | 'activity'
  | 'property_event'
  | 'invoice'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(id: string | null | undefined): boolean {
  return Boolean(id && UUID_RE.test(id))
}

/** Seed user frontend id → Postgres UUID (matches seed.sql). */
export const USER_TO_UUID: Record<string, string> = {
  'u-super': 'a2000001-0001-4000-8000-000000000001',
  'u-amelia': 'a2000001-0001-4000-8000-000000000002',
  'u-lerato': 'a2000001-0001-4000-8000-000000000003',
  'u-james': 'a2000001-0001-4000-8000-000000000004',
  'u-priya': 'a2000001-0001-4000-8000-000000000005',
  'u-owner2': 'a2000001-0001-4000-8000-000000000006',
  'u-owner1': 'a2000001-0001-4000-8000-000000000007',
  'u-lucas': 'a2000001-0001-4000-8000-000000000008',
  'u-nomsa-t': 'a2000001-0001-4000-8000-000000000009',
  'u-fatima': 'a2000001-0001-4000-8000-000000000010',
  'u-sipho': 'a2000001-0001-4000-8000-000000000011',
  'u-anya': 'a2000001-0001-4000-8000-000000000012',
  'u-cape-owner': 'a2000001-0001-4000-8000-000000000013',
  'u-maryam': 'a2000001-0001-4000-8000-000000000014',
  'u-aqua': 'a2000001-0001-4000-8000-000000000015',
  'u-zane': 'a2000001-0001-4000-8000-000000000016',
  'u-theo': 'a2000001-0001-4000-8000-000000000017',
  'u-nandi': 'a2000001-0001-4000-8000-000000000018',
  'u-aya': 'a2000001-0001-4000-8000-000000000019',
  'u-bayfix': 'a2000001-0001-4000-8000-000000000020',
  'u-gita': 'a2000001-0001-4000-8000-000000000021',
  'u-leigh': 'a2000001-0001-4000-8000-000000000022',
  'u-garden-owner': 'a2000001-0001-4000-8000-000000000023',
  'u-mia': 'a2000001-0001-4000-8000-000000000024',
  'u-coastal-fix': 'a2000001-0001-4000-8000-000000000025',
}

export const PROPERTY_TO_UNIT: Record<string, string> = Object.fromEntries(
  Object.entries(UNIT_TO_PROPERTY).map(([uuid, fe]) => [fe, uuid]),
)

export const FRONTEND_TO_BUILDING: Record<string, string> = Object.fromEntries(
  Object.entries(BUILDING_TO_FRONTEND).map(([uuid, fe]) => [fe, uuid]),
)

const STATIC_FE_TO_UUID: Partial<Record<EntityType, Record<string, string>>> = {
  agency: AGENCY_TO_CLIENT,
  user: USER_TO_UUID,
  building: FRONTEND_TO_BUILDING,
  unit: Object.fromEntries(
    Object.entries(UNIT_TO_PROPERTY).map(([uuid, prop]) => [`unt-${prop}`, uuid]),
  ),
  property: PROPERTY_TO_UNIT,
  lead: Object.fromEntries(Object.entries(LEAD_IDS).map(([u, f]) => [f, u])),
  payment: Object.fromEntries(Object.entries(PAYMENT_IDS).map(([u, f]) => [f, u])),
  document: Object.fromEntries(Object.entries(DOC_IDS).map(([u, f]) => [f, u])),
  ticket: Object.fromEntries(Object.entries(TICKET_IDS).map(([u, f]) => [f, u])),
  thread: Object.fromEntries(Object.entries(THREAD_IDS).map(([u, f]) => [f, u])),
  message: Object.fromEntries(Object.entries(MESSAGE_IDS).map(([u, f]) => [f, u])),
  notification: Object.fromEntries(Object.entries(NOTIF_IDS).map(([u, f]) => [f, u])),
  tenancy: Object.fromEntries(Object.entries(LEASE_IDS).map(([u, f]) => [f, u])),
  viewing_slot: Object.fromEntries(Object.entries(SLOT_IDS).map(([u, f]) => [f, u])),
  suite_alert: Object.fromEntries(Object.entries(SUITE_ALERT_IDS).map(([u, f]) => [f, u])),
  activity: Object.fromEntries(Object.entries(ACTIVITY_IDS).map(([u, f]) => [f, u])),
  invoice: Object.fromEntries(Object.entries(INVOICE_IDS).map(([u, f]) => [f, u])),
}

const STATIC_UUID_TO_FE: Partial<Record<EntityType, Record<string, string>>> = {
  agency: CLIENT_TO_AGENCY,
  building: BUILDING_TO_FRONTEND,
  unit: Object.fromEntries(
    Object.entries(UNIT_TO_PROPERTY).map(([uuid, prop]) => [uuid, `unt-${prop}`]),
  ),
  property: UNIT_TO_PROPERTY,
  lead: LEAD_IDS,
  payment: PAYMENT_IDS,
  document: DOC_IDS,
  ticket: TICKET_IDS,
  thread: THREAD_IDS,
  message: MESSAGE_IDS,
  notification: NOTIF_IDS,
  tenancy: LEASE_IDS,
  viewing_slot: SLOT_IDS,
  suite_alert: SUITE_ALERT_IDS,
  activity: ACTIVITY_IDS,
  invoice: INVOICE_IDS,
}

let ensured = false
let ensuring: Promise<void> | null = null

export async function ensureEntityMapTable(): Promise<void> {
  if (ensured) return
  if (ensuring) return ensuring
  ensuring = (async () => {
    try {
      await query(`
    CREATE TABLE IF NOT EXISTS entity_id_map (
      entity_type   VARCHAR(40) NOT NULL,
      frontend_id   VARCHAR(120) NOT NULL,
      backend_id    UUID NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (entity_type, frontend_id)
    )
  `)
      await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_id_map_backend
      ON entity_id_map (entity_type, backend_id)
  `)
    } catch (err) {
      // The API connects as a non-owner role. DDL is the migration's job;
      // a privilege error is fine when the table is already there.
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
      const message = err instanceof Error ? err.message : String(err)
      if (code !== '42501' && !/must be owner|permission denied/i.test(message)) throw err
      await query('SELECT 1 FROM entity_id_map LIMIT 1')
    }

  // Seed static aliases so writes resolve without a full schema rebuild.
  const inserts: Array<[string, string, string]> = []
  for (const [type, map] of Object.entries(STATIC_FE_TO_UUID) as Array<
    [EntityType, Record<string, string>]
  >) {
    for (const [fe, uuid] of Object.entries(map)) {
      inserts.push([type, fe, uuid])
    }
  }
  // Users also keyed by email for bootstrap fallbacks
  for (const [email, fe] of Object.entries(EMAIL_TO_USER)) {
    const uuid = USER_TO_UUID[fe]
    if (uuid) inserts.push(['user', fe, uuid], ['user_email', email, uuid])
  }

  // One round-trip batch instead of N sequential inserts (transaction pooler friendly).
  if (inserts.length > 0) {
    const values: unknown[] = []
    const placeholders: string[] = []
    inserts.forEach(([type, fe, uuid], i) => {
      const o = i * 3
      placeholders.push(`($${o + 1}, $${o + 2}, $${o + 3}::uuid)`)
      values.push(type, fe, uuid)
    })
    try {
      await query(
        `INSERT INTO entity_id_map (entity_type, frontend_id, backend_id)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT DO NOTHING`,
        values,
      )
    } catch (err) {
      // Seed aliases may already exist under a different frontend_id for the same UUID
      // (unique on entity_type+backend_id). Table is usable; continue.
      console.warn('[entity_id_map] seed aliases skipped', err instanceof Error ? err.message : err)
    }
  }
  ensured = true
  })()
  try {
    await ensuring
  } finally {
    ensuring = null
  }
}

export async function resolveUuid(
  entityType: EntityType,
  frontendId: string | null | undefined,
): Promise<string | null> {
  if (!frontendId) return null
  if (isUuid(frontendId)) return frontendId

  const staticHit = STATIC_FE_TO_UUID[entityType]?.[frontendId]
  if (staticHit) return staticHit

  const aliases =
    entityType === 'property' || entityType === 'unit' ? listingIdAliases(frontendId) : [frontendId]
  const types = entityType === 'property' || entityType === 'unit' ? ['property', 'unit'] : [entityType]

  await ensureEntityMapTable()
  const rows = await query<{ backend_id: string }>(
    `SELECT backend_id::text FROM entity_id_map
     WHERE entity_type = ANY($1::text[]) AND frontend_id = ANY($2::text[]) LIMIT 1`,
    [types, aliases],
  )
  return rows[0]?.backend_id ?? null
}

export async function resolveFrontendId(
  entityType: EntityType,
  backendId: string | null | undefined,
): Promise<string | null> {
  if (!backendId) return null
  const staticHit = STATIC_UUID_TO_FE[entityType]?.[backendId]
  if (staticHit) return staticHit

  await ensureEntityMapTable()
  const rows = await query<{ frontend_id: string }>(
    `SELECT frontend_id FROM entity_id_map
     WHERE entity_type = $1 AND backend_id = $2::uuid LIMIT 1`,
    [entityType, backendId],
  )
  return rows[0]?.frontend_id ?? backendId
}

/** Resolve existing UUID or allocate + register a new one for this frontend id. */
export async function ensureUuid(
  entityType: EntityType,
  frontendId: string,
  preferredUuid?: string,
): Promise<string> {
  const existing = await resolveUuid(entityType, frontendId)
  if (existing) return existing

  const uuid = preferredUuid && isUuid(preferredUuid) ? preferredUuid : randomUUID()
  await ensureEntityMapTable()
  const pairs: Array<{ et: EntityType; fe: string }> =
    entityType === 'property' || entityType === 'unit'
      ? [
          { et: 'property', fe: canonicalListingId(frontendId) },
          { et: 'unit', fe: unitIdForProperty(frontendId) },
        ]
      : [{ et: entityType, fe: frontendId }]
  for (const row of pairs) {
    await query(
      `INSERT INTO entity_id_map (entity_type, frontend_id, backend_id)
       VALUES ($1, $2, $3::uuid)
       ON CONFLICT (entity_type, frontend_id) DO UPDATE SET backend_id = EXCLUDED.backend_id`,
      [row.et, row.fe, uuid],
    )
  }
  return uuid
}

export async function forgetId(entityType: EntityType, frontendId: string): Promise<void> {
  await ensureEntityMapTable()
  await query(`DELETE FROM entity_id_map WHERE entity_type = $1 AND frontend_id = $2`, [
    entityType,
    frontendId,
  ])
}
