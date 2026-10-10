/**
 * Owner-keyed save queue.
 *
 * Before this, saves were fire-and-forget promises (queuePersist → persistToApi)
 * held only in memory: nothing was stored in propertyflow-v18 or anywhere else,
 * so a save that failed on the network was simply lost on reload.
 *
 * Now every queued op is written to localStorage under
 * `propertyflow-persist-queue:<ownerUserId>` as `{ ownerUserId, items }` before
 * it is sent, and removed once it lands or the server refuses it. An item only
 * survives a network failure. It is replayed ONLY under the same user's session
 * — replaying A's writes with B's token would act as B. A different user's
 * bucket is held untouched (never sent) until its owner signs back in.
 * Items with no owner (guest) are never stored durably, and sign-out drops any
 * bucket that lacks an ownerUserId.
 */
import type { PersistOp } from './persist'

export const PERSIST_QUEUE_KEY_PREFIX = 'propertyflow-persist-queue'
/** Legacy/unowned bucket key — always dropped on sign-out. */
export const PERSIST_QUEUE_UNOWNED_KEY = PERSIST_QUEUE_KEY_PREFIX

export type QueuedPersistItem = { qid: string; op: PersistOp; queuedAt: string }
export type PersistQueueBucket = { ownerUserId: string; items: QueuedPersistItem[] }
export type SendOutcome = 'ok' | 'rejected' | 'network'

export function persistQueueKey(ownerUserId: string): string {
  return `${PERSIST_QUEUE_KEY_PREFIX}:${ownerUserId}`
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readPersistQueue(ownerUserId: string): PersistQueueBucket {
  const empty = { ownerUserId, items: [] }
  const s = storage()
  if (!s || !ownerUserId) return empty
  try {
    const raw = s.getItem(persistQueueKey(ownerUserId))
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<PersistQueueBucket>
    if (parsed.ownerUserId !== ownerUserId || !Array.isArray(parsed.items)) return empty
    return { ownerUserId, items: parsed.items }
  } catch {
    return empty
  }
}

function writePersistQueue(bucket: PersistQueueBucket): void {
  const s = storage()
  if (!s) return
  try {
    if (!bucket.items.length) s.removeItem(persistQueueKey(bucket.ownerUserId))
    else s.setItem(persistQueueKey(bucket.ownerUserId), JSON.stringify(bucket))
  } catch {
    /* quota — in-memory send still happens */
  }
}

let seq = 0
function newQid(): string {
  seq += 1
  return `q-${Date.now().toString(36)}-${seq}`
}

/** Durably record an op for `ownerUserId`. Returns the queue id (null if unowned). */
export function enqueuePersistItem(ownerUserId: string | null, op: PersistOp): string | null {
  if (!ownerUserId) return null
  const bucket = readPersistQueue(ownerUserId)
  const qid = newQid()
  bucket.items.push({ qid, op, queuedAt: new Date().toISOString() })
  writePersistQueue(bucket)
  return qid
}

export function removePersistItem(ownerUserId: string | null, qid: string | null): void {
  if (!ownerUserId || !qid) return
  const bucket = readPersistQueue(ownerUserId)
  const next = bucket.items.filter((i) => i.qid !== qid)
  if (next.length !== bucket.items.length) writePersistQueue({ ownerUserId, items: next })
}

/**
 * Replay the queue owned by `sessionUserId` only. Other users' buckets are
 * never read or sent. Landed and refused items are removed; network failures stay.
 */
export async function replayPersistQueue(
  sessionUserId: string | null,
  send: (op: PersistOp) => Promise<SendOutcome>,
): Promise<number> {
  if (!sessionUserId) return 0
  const bucket = readPersistQueue(sessionUserId)
  let sent = 0
  for (const item of bucket.items) {
    const outcome = await send(item.op)
    sent += 1
    if (outcome !== 'network') removePersistItem(sessionUserId, item.qid)
  }
  return sent
}

/** Sign-out: keep owned buckets (replayed when that owner returns); drop unowned ones. */
export function dropUnownedPersistQueues(): void {
  const s = storage()
  if (!s) return
  try {
    const keys: string[] = []
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k && k.startsWith(PERSIST_QUEUE_KEY_PREFIX)) keys.push(k)
    }
    for (const k of keys) {
      let owner: unknown = null
      try {
        owner = (JSON.parse(s.getItem(k) ?? 'null') as { ownerUserId?: unknown } | null)?.ownerUserId
      } catch {
        owner = null
      }
      if (typeof owner !== 'string' || !owner || k !== persistQueueKey(owner)) s.removeItem(k)
    }
  } catch {
    /* ignore */
  }
}
