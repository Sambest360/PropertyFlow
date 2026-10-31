/**
 * Fire-and-forget persistence through the server API (/api/persist).
 */
import { actorHeaders } from './actorAuth'
import { resolveApiAuthorizationHeader } from './authClient'
import { isApiEnabled } from './config'
import type { EntityType } from './persistTypes'
import { markLocalPersistWrite } from '../bootstrapMerge'
import { sanitizeUserFacingMessage } from '../displayIds'

export type { EntityType } from './persistTypes'

export type PersistAction = 'upsert' | 'delete'

export type PersistOp = {
  resource: EntityType
  action: PersistAction
  id: string
  data?: Record<string, unknown>
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

/** Shown when Vite returns the SPA shell or the Hono API on :8787 is down. */
export const LOCAL_API_REQUIRED_MESSAGE =
  'Local API is not running. Stop Vite and run `npm run dev:full`, then try again.'

/** Production: no dev hint (it sent an admin to run `npm run dev:full` on the live server). */
const SERVER_UNREACHABLE_MESSAGE = 'Could not reach the server. Check your connection and try again.'

/** A reverse proxy (nginx) refused the request body as too large. */
export const UPLOAD_TOO_LARGE_MESSAGE =
  'The server refused this save because it is too large (photos or attachments). Remove some photos and try again, or ask your administrator to raise the upload limit.'

function apiUnreachableMessage(): string {
  return import.meta.env.DEV ? LOCAL_API_REQUIRED_MESSAGE : SERVER_UNREACHABLE_MESSAGE
}

/** HTML instead of API JSON: nginx error pages live, the Vite SPA shell in dev. */
function htmlFailureMessage(status: number): string {
  if (status === 413) return UPLOAD_TOO_LARGE_MESSAGE
  if (import.meta.env.DEV) return LOCAL_API_REQUIRED_MESSAGE
  if (status === 502 || status === 503 || status === 504) {
    return 'Server is temporarily unavailable. Try again shortly.'
  }
  return status >= 400 ? `Could not save (${status}). Try again shortly.` : SERVER_UNREACHABLE_MESSAGE
}

function isSpaHtmlResponse(contentType: string | null | undefined, bodyText: string): boolean {
  const ct = (contentType ?? '').toLowerCase()
  if (ct.includes('text/html')) return true
  const t = bodyText.trim().toLowerCase()
  return t.startsWith('<!doctype') || t.startsWith('<html')
}

function messageFromPersistFailure(
  status: number,
  contentType: string | null | undefined,
  bodyText: string,
  refusalMessage?: string,
): string {
  const finish = (msg: string) => sanitizeUserFacingMessage(msg)
  if (refusalMessage) return finish(refusalMessage)
  if (isSpaHtmlResponse(contentType, bodyText)) return htmlFailureMessage(status)
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText) as { message?: string; error?: string }
      if (typeof parsed.message === 'string' && parsed.message.trim()) {
        return finish(parsed.message.trim())
      }
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        const code = parsed.error.trim()
        if (code === 'database_unconfigured') {
          return finish('Server database is not configured (DATABASE_URL).')
        }
        if (code !== 'persist_failed' && !/^[a-z][a-z0-9_]*$/.test(code)) return finish(code)
      }
    } catch {
      const trimmed = bodyText.trim()
      if (trimmed && !trimmed.startsWith('{') && trimmed.length < 500) return finish(trimmed)
    }
  }
  if (status === 401) return finish('Your session expired — sign in again and retry.')
  if (status === 403) return finish('You do not have permission to save this change.')
  if (status === 409) return finish('This email is already in use.')
  if (status === 503) return finish('Server is temporarily unavailable. Try again shortly.')
  if (status >= 500) return finish(`Server error (${status}). Try again or contact support.`)
  if (status >= 400) return finish(`Could not save (${status}).`)
  return finish('Could not save.')
}

async function jsonHeaders(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    ...actorHeaders(),
    ...(await resolveApiAuthorizationHeader()),
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
  if (status === 401) {
    try {
      const body = JSON.parse(bodyText) as { message?: unknown; error?: unknown }
      const message =
        typeof body.message === 'string'
          ? body.message
          : typeof body.error === 'string'
            ? body.error
            : null
      if (message) {
        return {
          resource: String(op.resource),
          id: String(op.id),
          action: String(op.action),
          status,
          code: 'ACTOR_REQUIRED',
          message,
        }
      }
    } catch {
      /* ignore */
    }
    return null
  }
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

/** `refused`: the server sent a coded refusal, already shown via PERSIST_REFUSED_EVENT. */
export type PersistApiResult = { ok: true; uuid?: string } | { ok: false; error?: string; refused?: boolean }

/** A save that failed without a coded refusal (5xx, network, uncoded 4xx). */
export type PersistFailure = { resource: string; id: string; action: string; message: string }

/** Window event the store listens to so a failed background save is never silent. */
export const PERSIST_FAILED_EVENT = 'pf:persist-failed'

export function reportPersistFailure(
  op: Pick<PersistOp, 'resource' | 'id' | 'action'>,
  result: PersistApiResult,
): void {
  if (result.ok !== false || result.refused) return
  const target = (globalThis as { dispatchEvent?: (e: Event) => boolean }).dispatchEvent
  if (typeof target !== 'function' || typeof CustomEvent === 'undefined') return
  globalThis.dispatchEvent(
    new CustomEvent<PersistFailure>(PERSIST_FAILED_EVENT, {
      detail: {
        resource: String(op.resource),
        id: String(op.id),
        action: String(op.action),
        message: result.error || 'Could not save.',
      },
    }),
  )
}

export function persistErrorMessage(result: PersistApiResult): string | undefined {
  if (result.ok === false) return result.error
  return undefined
}

/** POST /api/persist using DATABASE_URL (bypasses browser RLS). */
export async function persistViaServerApiDetailed(op: PersistOp): Promise<PersistApiResult> {
  try {
    const res = await fetch(`${API_BASE}/api/persist`, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify(op),
    })
    const text = await res.text().catch(() => '')
    const contentType = res.headers.get('content-type')
    if (!isPersistApiSuccessResponse(res.status, contentType, text)) {
      console.warn('[persist]', op.resource, op.action, op.id, res.status, text.slice(0, 200))
      const refusal = parsePersistRefusal(op, res.status, text)
      reportPersistRefusal(refusal)
      const message = messageFromPersistFailure(res.status, contentType, text, refusal?.message)
      return refusal ? { ok: false, error: message, refused: true } : { ok: false, error: message }
    }
    let uuid: string | undefined
    try {
      const parsed = JSON.parse(text) as { uuid?: unknown }
      if (typeof parsed.uuid === 'string' && parsed.uuid) uuid = parsed.uuid
    } catch {
      /* ignore */
    }
    return uuid ? { ok: true, uuid } : { ok: true }
  } catch (err) {
    console.warn('[persist] offline / failed', op.resource, op.id, err)
    return { ok: false, error: apiUnreachableMessage() }
  }
}

export async function persistViaServerApi(op: PersistOp): Promise<boolean> {
  const result = await persistViaServerApiDetailed(op)
  return result.ok
}

/**
 * Jim B2: staff user create through /api/persist. When no password was typed
 * the server generates a temp password and returns it once; the caller shows
 * it in the one-time modal and never stores it.
 */
export async function persistUserCreateViaServer(
  op: PersistOp,
): Promise<{ ok: true; tempPassword?: string } | { ok: false; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/persist`, {
      method: 'POST',
      headers: await jsonHeaders(),
      credentials: 'include',
      cache: 'no-store',
      body: JSON.stringify(op),
    })
    const text = await res.text().catch(() => '')
    if (!isPersistApiSuccessResponse(res.status, res.headers.get('content-type'), text)) {
      console.warn('[persist] user create refused', op.id, res.status, text.slice(0, 200))
      const refusal = parsePersistRefusal(op, res.status, text)
      reportPersistRefusal(refusal)
      const message = messageFromPersistFailure(
        res.status,
        res.headers.get('content-type'),
        text,
        refusal?.message,
      )
      return { ok: false, error: message }
    }
    const parsed = JSON.parse(text) as { tempPassword?: unknown }
    return typeof parsed.tempPassword === 'string' && parsed.tempPassword
      ? { ok: true, tempPassword: parsed.tempPassword }
      : { ok: true }
  } catch {
    console.warn('[persist] user create failed', op.id)
    return { ok: false, error: apiUnreachableMessage() }
  }
}

/** Guest Apply must land via DATABASE_URL — browser RLS cannot stamp listing client_id. */
export function preferServerPersistForApplication(
  resource: PersistOp['resource'],
  action: PersistOp['action'],
): boolean {
  return resource === 'application' && action === 'upsert'
}

/** User upserts that carry a temp/plain password must hit the server (it hashes them). */
/** CR10 fix 4: user writes carrying `signature` go to /api/persist (own-row, PNG, 150 KB). */
export function preferServerPersistForSignature(
  resource: PersistOp['resource'],
  action: PersistOp['action'],
  data?: Record<string, unknown>,
): boolean {
  return resource === 'user' && action === 'upsert' && !!data && Object.prototype.hasOwnProperty.call(data, 'signature')
}

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

export async function persistToApiDetailed(op: PersistOp): Promise<PersistApiResult> {
  if (!apiConfigured()) {
    return { ok: false, error: apiUnreachableMessage() }
  }
  return persistViaServerApiDetailed(op)
}

export async function persistToApi(op: PersistOp): Promise<boolean> {
  const result = await persistToApiDetailed(op)
  return result.ok
}

export async function persistBatchToApi(ops: PersistOp[]): Promise<boolean> {
  if (!ops.length) return true
  if (!apiConfigured()) return false
  try {
    const res = await fetch(`${API_BASE}/api/persist/batch`, {
      method: 'POST',
      headers: await jsonHeaders(),
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
  if (!apiConfigured()) return false
  try {
    const res = await fetch(
      `${API_BASE}/api/applications/${encodeURIComponent(params.applicationId)}/approve`,
      {
        method: 'POST',
        headers: await jsonHeaders(),
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
  if (!apiConfigured()) return false
  try {
    const res = await fetch(`${API_BASE}/api/notifications/mark-read`, {
      method: 'POST',
      headers: await jsonHeaders(),
      body: JSON.stringify(params),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Queue a mutation without blocking the UI. A failure is reported, not dropped. */
export function queuePersist(op: PersistOp): void {
  void persistToApiDetailed(op).then((result) => reportPersistFailure(op, result))
}

export function queuePersistBatch(ops: PersistOp[]): void {
  void persistBatchToApi(ops).then((ok) => {
    if (!ok && ops[0]) reportPersistFailure(ops[0], { ok: false, error: 'Could not save.' })
  })
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
