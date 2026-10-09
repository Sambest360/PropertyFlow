/**
 * Fire-and-forget persistence — Supabase in production, Hono API locally.
 */
import { actorHeaders } from './actorAuth'
import { authHeaders } from './authClient'
import { isApiEnabled, isSupabaseMode } from './config'
import type { EntityType } from './persistTypes'
import {
  persistBatchToSupabase,
  persistToSupabase,
  supabaseMarkNotificationsRead,
} from '../supabase/persist'
import { markLocalPersistWrite } from '../bootstrapMerge'

export type { EntityType } from './persistTypes'

export type PersistAction = 'upsert' | 'delete'

export type PersistOp = {
  resource: EntityType
  action: PersistAction
  id: string
  data?: Record<string, unknown>
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

function jsonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...actorHeaders(),
    ...authHeaders(),
  }
}

/**
 * Saves never wait on GET /api/health. That check pings the database and
 * answered in 1.3-2.3 s live, past the old 800 ms abort, so every Postgres-API
 * save returned false without posting. Each save now posts and the real
 * response decides: a non-ok answer or a network error still fails the save.
 * The only pre-check is configuration: with no API configured there is nothing
 * to post to.
 */
function apiConfigured(): boolean {
  return isApiEnabled
}

/**
 * True only when /api/persist answered with JSON `{ ok: true }`.
 * An HTTP 200 HTML/SPA shell (Vercel rewrite miss) must NOT count as durable.
 */
export function isPersistApiSuccessResponse(
  status: number,
  contentType: string | null | undefined,
  bodyText: string,
): boolean {
  if (status < 200 || status >= 300) return false
  const ct = (contentType ?? '').toLowerCase()
  if (!ct.includes('application/json')) return false
  try {
    const parsed: unknown = JSON.parse(bodyText)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { ok?: unknown }).ok === true
    )
  } catch {
    return false
  }
}

/** A write the server refused with a policy code (e.g. APPLICATION_TRANSITION_FORBIDDEN). */
export type PersistRefusal = {
  resource: string
  id: string
  action: string
  status: number
  code: string
  message: string
}

/** Window event the store listens to so a coded refusal is never silent. */
export const PERSIST_REFUSED_EVENT = 'pf:persist-refused'

/** Parse a coded refusal out of a failed /api/persist response (null if none). */
export function parsePersistRefusal(
  op: Pick<PersistOp, 'resource' | 'id' | 'action'>,
  status: number,
  bodyText: string,
): PersistRefusal | null {
  // Coded 400 / 403 / 409: a policy refusal the UI must show (toast + refresh).
  if (status !== 400 && status !== 403 && status !== 409) return null
  try {
    const body = JSON.parse(bodyText) as { code?: unknown; message?: unknown }
    if (typeof body.code !== 'string' || !body.code) return null
    return {
      resource: String(op.resource),
      id: String(op.id),
      action: String(op.action),
      status,
      code: body.code,
      message: typeof body.message === 'string' ? body.message : body.code,
    }
  } catch {
    return null
  }
}

function reportPersistRefusal(refusal: PersistRefusal | null): void {
  if (!refusal) return
  const target = (globalThis as { dispatchEvent?: (e: Event) => boolean }).dispatchEvent
  if (typeof target !== 'function' || typeof CustomEvent === 'undefined') return
  globalThis.dispatchEvent(new CustomEvent<PersistRefusal>(PERSIST_REFUSED_EVENT, { detail: refusal }))
}

/** POST /api/persist using DATABASE_URL (bypasses browser RLS). */
export async function persistViaServerApi(op: PersistOp): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/persist`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(op),
    })
    const text = await res.text().catch(() => '')
    const contentType = res.headers.get('content-type')
    if (!isPersistApiSuccessResponse(res.status, contentType, text)) {
      console.warn('[persist]', op.resource, op.action, op.id, res.status, text.slice(0, 200))
      reportPersistRefusal(parsePersistRefusal(op, res.status, text))
      return false
    }
    return true
  } catch (err) {
    console.warn('[persist] offline / failed', op.resource, op.id, err)
    return false
  }
}

/** Guest Apply must land via DATABASE_URL — browser RLS cannot stamp listing client_id. */
export function preferServerPersistForApplication(
  resource: PersistOp['resource'],
  action: PersistOp['action'],
): boolean {
  return resource === 'application' && action === 'upsert'
}

/**
 * P0-sa-mint: user upserts that carry a temp/plain password must hit the server
 * path (upsertUser → linkStaffAuthUser). Browser Supabase persist only writes
 * public.users and leaves auth_user_id NULL — toast-only agents that cannot sign in.
 */
export function preferServerPersistForUserMint(
  resource: PersistOp['resource'],
  action: PersistOp['action'],
  data?: Record<string, unknown>,
): boolean {
  if (resource !== 'user' || action !== 'upsert') return false
  const d = data ?? {}
  return (
    (typeof d.tempPassword === 'string' && d.tempPassword.length > 0) ||
    (typeof d.password === 'string' && d.password.length > 0)
  )
}

/**
 * P0-5 residual: FA building→unit→property must hit /api/persist (DATABASE_URL).
 * Browser RLS soft-true on buildings (error null, 0 rows) let the wizard look
 * saved while Properties/public listing vanished on reload — #43 serialized
 * client awaits but did not close the soft-true path. Mirror application mint.
 */
export function preferServerPersistForListingHierarchy(
  resource: PersistOp['resource'],
  action: PersistOp['action'],
): boolean {
  return (
    (resource === 'building' || resource === 'unit' || resource === 'property') &&
    action === 'upsert'
  )
}

/**
 * P0-r21: lease mint must hit /api/persist (writes.upsertTenancy / unitIdFromProperty).
 * Browser resolveUuid was exact-only on unit/FE id and wrote unit_id null → 400;
 * even after alias-aware resolve, keep tenancy on the server path that already
 * resolves property↔unit aliases.
 */
export function preferServerPersistForTenancy(
  resource: PersistOp['resource'],
  action: PersistOp['action'],
): boolean {
  return resource === 'tenancy' && action === 'upsert'
}

export async function persistToApi(op: PersistOp): Promise<boolean> {
  if (isSupabaseMode) {
    // P0-sync (R12/R13): application upserts are fail-closed on /api/persist.
    // Browser RLS cannot stamp listing agency client_id for END_USER; a "soft"
    // supabase fallback that returns true (or leaves optimistic My Apps) while
    // staff bootstrap never loads the row is worse than a hard apply error.
    // createApplication awaits this and rolls back the optimistic APP on false.
    if (preferServerPersistForApplication(op.resource, op.action)) {
      return persistViaServerApi(op)
    }
    // P0-sa-mint: staff/agent create with temp password — Auth + link + verify
    // only exists on the server upsertUser path (not browser RLS upsert).
    if (preferServerPersistForUserMint(op.resource, op.action, op.data)) {
      console.info('[persist] path=server user-mint', { id: op.id })
      return persistViaServerApi(op)
    }
    // P0-5 residual: building/unit/property — same soft-true miss as applications.
    if (preferServerPersistForListingHierarchy(op.resource, op.action)) {
      console.info('[persist] path=server listing-hierarchy', {
        resource: op.resource,
        id: op.id,
      })
      return persistViaServerApi(op)
    }
    // P0-r21: tenancy/lease mint — unitIdFromProperty on server.
    if (preferServerPersistForTenancy(op.resource, op.action)) {
      console.info('[persist] path=server tenancy', { id: op.id })
      return persistViaServerApi(op)
    }
    return persistToSupabase(op)
  }
  if (!apiConfigured()) return false
  return persistViaServerApi(op)
}

export async function persistBatchToApi(ops: PersistOp[]): Promise<boolean> {
  if (!ops.length) return true
  if (isSupabaseMode) return persistBatchToSupabase(ops)
  if (!apiConfigured()) return false
  try {
    const res = await fetch(`${API_BASE}/api/persist/batch`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ ops }),
    })
    if (!res.ok) {
      console.warn('[persist/batch]', res.status)
      return false
    }
    return true
  } catch (err) {
    console.warn('[persist/batch] failed', err)
    return false
  }
}

export async function persistApproveApplication(params: {
  applicationId: string
  actorUserId?: string
  tenancy?: Record<string, unknown>
}): Promise<boolean> {
  if (isSupabaseMode) {
    // P0-approve (R8): the deployed approve_application RPC cannot commit —
    // its leases INSERT omits the NOT NULL lease_reference column, so every
    // call answers HTTP 400 "null value in column lease_reference". The direct
    // mirror writes (application + lease + payments, gated in the store) ARE
    // the durable transition, so the RPC is skipped entirely in Supabase mode
    // rather than left firing a doomed request. Postgres-API mode keeps the
    // server approve route below.
    return true
  }
  if (!apiConfigured()) return false
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/${encodeURIComponent(params.applicationId)}/approve`,
      {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          actorUserId: params.actorUserId,
          tenancy: params.tenancy,
        }),
      },
    )
    return res.ok
  } catch {
    return false
  }
}

export async function persistMarkNotificationsRead(params: {
  ids?: string[]
  userId?: string
  all?: boolean
}): Promise<boolean> {
  if (isSupabaseMode) return supabaseMarkNotificationsRead(params)
  if (!apiConfigured()) return false
  try {
    const res = await fetch(`${API_BASE}/api/notifications/mark-read`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(params),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Queue a mutation without blocking the UI. */
export function queuePersist(op: PersistOp): void {
  void persistToApi(op)
}

export function queuePersistBatch(ops: PersistOp[]): void {
  void persistBatchToApi(ops)
}

/** Upsert helper — strips undefined keys lightly. */
export function queueUpsert(
  resource: EntityType,
  id: string,
  data: Record<string, unknown>,
): void {
  markLocalPersistWrite(resource, id)
  queuePersist({ resource, action: 'upsert', id, data: { ...data, id } })
}

export function queueDelete(resource: EntityType, id: string): void {
  queuePersist({ resource, action: 'delete', id })
}
