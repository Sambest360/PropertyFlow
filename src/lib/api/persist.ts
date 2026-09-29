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
  supabaseApproveApplication,
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

export async function persistToApi(op: PersistOp): Promise<boolean> {
  if (isSupabaseMode) return persistToSupabase(op)
  if (!(await quickHealth())) return false
  try {
    const res = await fetch(`${API_BASE}/api/persist`, {
      method: 'POST',
      headers: jsonHeaders(),
      credentials: 'include',
      body: JSON.stringify(op),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('[persist]', op.resource, op.action, op.id, res.status, text)
      apiLikelyUp = res.status !== 503
      return false
    }
    return true
  } catch (err) {
    apiLikelyUp = false
    console.warn('[persist] offline / failed', op.resource, op.id, err)
    return false
  }
}

export async function persistBatchToApi(ops: PersistOp[]): Promise<boolean> {
  if (!ops.length) return true
  if (isSupabaseMode) return persistBatchToSupabase(ops)
  if (!(await quickHealth())) return false
  try {
    const res = await fetch(`${API_BASE}/api/persist/batch`, {
      method: 'POST',
      headers: jsonHeaders(),
      credentials: 'include',
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
    return supabaseApproveApplication({
      applicationId: params.applicationId,
      tenancy: params.tenancy,
    })
  }
  if (!(await quickHealth())) return false
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/${encodeURIComponent(params.applicationId)}/approve`,
      {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'include',
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

/** Staff EFT mark-paid. Goes to the dedicated route, not generic persist. */
export async function persistMarkPaymentPaid(params: {
  paymentId: string
  method?: string | null
  paidAt?: string | null
  reference?: string | null
  paidAmount?: number | null
  notes?: string | null
  attachments?: unknown
}): Promise<boolean> {
  if (isSupabaseMode) return false
  if (!(await quickHealth())) return false
  try {
    const res = await fetch(
      `${API_BASE}/api/payments/${encodeURIComponent(params.paymentId)}/mark-paid`,
      {
        method: 'POST',
        headers: jsonHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          method: params.method,
          paidAt: params.paidAt,
          reference: params.reference,
          paidAmount: params.paidAmount,
          notes: params.notes,
          attachments: params.attachments,
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
      credentials: 'include',
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
