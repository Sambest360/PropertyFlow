/**
 * Title/type publish confirmation (Kelly PR A). Shared by property persist
 * and listing approval so a 409 cannot leave an approval marked reviewed.
 */
import { query } from './db.js'
import { titleTypeWarning } from '../src/lib/listingSizes.js'
import { propertyTypeToDb } from '../src/lib/propertyType.js'
import { PUBLIC_UNIT_STATUS_KEYS } from './publicUnitStatus.js'

export const TITLE_TYPE_CONFIRM_EVENT = 'listing_title_type_confirmed'
export const TITLE_TYPE_CONFIRMATION_REQUIRED = 'TITLE_TYPE_CONFIRMATION_REQUIRED'
export const TITLE_TYPE_PLAIN =
  "The listing title and the chosen type don't match. Change the type, or confirm you want to publish with this title."

export function isPublicUnitStatus(statusKey: string | null | undefined): boolean {
  return PUBLIC_UNIT_STATUS_KEYS.has(String(statusKey ?? '').toUpperCase())
}

/** Persist any non-empty explicit type; ignore typeInferred; never guess. */
export function explicitPersistType(d: Record<string, unknown>): string | null {
  if (!Object.prototype.hasOwnProperty.call(d, 'type') || d.type == null) return null
  const raw = String(d.type).trim()
  if (!raw) return null
  return propertyTypeToDb(raw)
}

export function normalizeTypeKey(type: string | null | undefined): string {
  return (type ?? '').trim().toLowerCase().replace(/\s+/g, '_')
}

export function titleTypeConfirmExists(
  rows: Array<{ payload?: { title?: string; type?: string } | null }>,
  title: string,
  type: string,
): boolean {
  const wantType = normalizeTypeKey(type)
  return rows.some((r) => r.payload?.title === title && normalizeTypeKey(r.payload?.type) === wantType)
}

export function titleTypeConfirmError(frontendId: string): Error & { status: number; code: string } {
  const path = frontendId ? `/workspace/properties/${frontendId}/edit` : '/workspace/properties'
  return Object.assign(new Error(`${TITLE_TYPE_PLAIN} ${path}`), {
    status: 409,
    code: TITLE_TYPE_CONFIRMATION_REQUIRED,
  })
}

export async function loadTitleTypeConfirms(unitId: string) {
  return query<{ payload: { title?: string; type?: string; warning?: string } }>(
    `SELECT payload FROM event_log WHERE event_type = $1 AND subject_id = $2::uuid`,
    [TITLE_TYPE_CONFIRM_EVENT, unitId],
  )
}

export async function insertTitleTypeConfirm(opts: {
  clientId: string
  unitId: string
  actorUserId: string | null
  title: string
  type: string
  warning: string
}): Promise<void> {
  await query(
    `INSERT INTO event_log (client_id, event_type, subject_type, subject_id, actor_user_id, payload, created_at)
     VALUES ($1::uuid, $2, 'unit', $3::uuid, $4::uuid, $5::jsonb, NOW())`,
    [
      opts.clientId,
      TITLE_TYPE_CONFIRM_EVENT,
      opts.unitId,
      opts.actorUserId,
      JSON.stringify({ title: opts.title, type: opts.type, warning: opts.warning }),
    ],
  )
}

export async function frontendIdForUnit(unitId: string): Promise<string> {
  const rows = await query<{ frontend_id: string }>(
    `SELECT frontend_id FROM entity_id_map
      WHERE backend_id = $1::uuid AND entity_type IN ('property', 'unit')
      ORDER BY CASE WHEN frontend_id LIKE 'p-%' THEN 0 ELSE 1 END
      LIMIT 1`,
    [unitId],
  )
  return rows[0]?.frontend_id ?? unitId
}

export async function assertUnitTitleTypeConfirmed(unitId: string): Promise<void> {
  const units = await query<{ title: string | null; property_type: string | null }>(
    `SELECT title, property_type FROM units WHERE id = $1::uuid`,
    [unitId],
  )
  const unit = units[0]
  if (!unit) return
  const title = unit.title ?? ''
  const type = unit.property_type ?? ''
  const warning = titleTypeWarning(title, type)
  if (!warning) return
  const rows = await loadTitleTypeConfirms(unitId)
  if (titleTypeConfirmExists(rows, title, type)) return
  throw titleTypeConfirmError(await frontendIdForUnit(unitId))
}
