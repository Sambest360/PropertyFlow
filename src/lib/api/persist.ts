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

let apiLikelyUp: boolean | null = null
let lastHealthCheck = 0

function jsonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...actorHeaders(),
    ...authHeaders(),
  }
}

async function quickHealth(): Promise<boolean> {
  if (!isApiEnabled) return false
  const now = Date.now()
  if (apiLikelyUp != null && now - lastHealthCheck < 15_000) return apiLikelyUp
  lastHealthCheck = now
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 800)
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: ctrl.signal })
    apiLikelyUp = res.ok
  } catch {
    apiLikelyUp = false
  } finally {
    clearTimeout(t)
  }
  return apiLikelyUp
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
      apiLikelyUp = res.status !== 503 && res.status !== 0
      return false
    }
    apiLikelyUp = true
    return true
  } catch (err) {
    apiLikelyUp = false
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
  // PR #69: guest Apply in Postgres-API mode (production: no VITE_SUPABASE_*).
  // createApplication awaits this and deletes the optimistic APP on false.
  // quickHealth() aborts /api/health after 800 ms, and live /api/health pings
  // the database on a cold function (1.3-2.3 s measured), so the gate returned
  // false and /api/persist was never called. Enquiry worked because it posts
  // straight to its route. Post the application and let the route answer.
  if (preferServerPersistForApplication(op.resource, op.action)) {
    return persistViaServerApi(op)
  }
  if (!(await quickHealth())) return false
  return persistViaServerApi(op)
}

export async function persistBatchToApi(ops: PersistOp[]): Promise<boolean> {
  if (!ops.length) return true
  if (isSupabaseMode) return persistBatchToSupabase(ops)
  if (!(await quickHealth())) return false
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
    apiLikelyUp = false
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
  if (!(await quickHealth())) return false
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
    apiLikelyUp = false
    return false
  }
}

export async function persistMarkNotificationsRead(params: {
  ids?: string[]
  userId?: string
  all?: boolean
}): Promise<boolean> {
  if (isSupabaseMode) return supabaseMarkNotificationsRead(params)
  if (!(await quickHealth())) return false
  try {
    const res = await fetch(`${API_BASE}/api/notifications/mark-read`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(params),
    })
    return res.ok
  } catch {
    apiLikelyUp = false
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
