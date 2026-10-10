import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersistOp } from './persist'
import {
  PERSIST_QUEUE_UNOWNED_KEY,
  dropUnownedPersistQueues,
  enqueuePersistItem,
  persistQueueKey,
  readPersistQueue,
  replayPersistQueue,
} from './persistQueue'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  }
}

const opA: PersistOp = { resource: 'ticket', action: 'upsert', id: 'tk-a', data: { id: 'tk-a', title: 'A leak' } }

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage())
})

describe('owner-keyed save queue', () => {
  it('stores items as { ownerUserId, items } under the owner', () => {
    enqueuePersistItem('u-a', opA)
    const raw = JSON.parse(localStorage.getItem(persistQueueKey('u-a'))!)
    expect(raw.ownerUserId).toBe('u-a')
    expect(raw.items.map((i: { op: PersistOp }) => i.op.id)).toEqual(['tk-a'])
    expect(enqueuePersistItem(null, opA)).toBeNull()
  })

  it("A's queue is not sent after B signs in", async () => {
    enqueuePersistItem('u-a', opA)
    const send = vi.fn().mockResolvedValue('ok')
    const n = await replayPersistQueue('u-b', send)
    expect(n).toBe(0)
    expect(send).not.toHaveBeenCalled()
    expect(readPersistQueue('u-a').items).toHaveLength(1) // held, not dropped
  })

  it("A's queue is replayed when A signs back in", async () => {
    enqueuePersistItem('u-a', opA)
    dropUnownedPersistQueues() // A signed out
    expect(readPersistQueue('u-a').items).toHaveLength(1)
    await replayPersistQueue('u-b', vi.fn()) // B's session in between
    const send = vi.fn().mockResolvedValue('ok')
    await replayPersistQueue('u-a', send)
    expect(send).toHaveBeenCalledWith(opA)
    expect(readPersistQueue('u-a').items).toHaveLength(0)
  })

  it('network failures stay queued; refusals are dropped', async () => {
    enqueuePersistItem('u-a', opA)
    await replayPersistQueue('u-a', vi.fn().mockResolvedValue('network'))
    expect(readPersistQueue('u-a').items).toHaveLength(1)
    await replayPersistQueue('u-a', vi.fn().mockResolvedValue('rejected'))
    expect(readPersistQueue('u-a').items).toHaveLength(0)
  })

  it('sign-out drops queue buckets without an ownerUserId', () => {
    localStorage.setItem(PERSIST_QUEUE_UNOWNED_KEY, JSON.stringify({ items: [{ qid: 'x', op: opA }] }))
    localStorage.setItem(persistQueueKey('u-c'), JSON.stringify({ ownerUserId: 'u-other', items: [] }))
    enqueuePersistItem('u-a', opA)
    dropUnownedPersistQueues()
    expect(localStorage.getItem(PERSIST_QUEUE_UNOWNED_KEY)).toBeNull()
    expect(localStorage.getItem(persistQueueKey('u-c'))).toBeNull()
    expect(readPersistQueue('u-a').items).toHaveLength(1)
  })
})
