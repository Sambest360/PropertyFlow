import { beforeEach, describe, expect, it, vi } from 'vitest'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  }
}

vi.mock('./api/config', async (orig) => ({
  ...(await orig<typeof import('./api/config')>()),
  isApiEnabled: true,
  isSupabaseMode: false,
}))

let ls: ReturnType<typeof fakeStorage>
beforeEach(() => {
  ls = fakeStorage()
  vi.stubGlobal('localStorage', ls)
  vi.stubGlobal('sessionStorage', fakeStorage())
})

import {
  APP_STATE_STORAGE_KEY,
  PG_SOURCE_STORAGE_KEY,
  readOwnedClientCache,
  serializeClientCache,
  createClientCacheWriter,
  sessionUserSwitched,
  shouldDeferMountBootstrap,
} from './clientCache'
import { AUTH_STORAGE_KEYS, clearSessionArtifacts } from './auth/sessionArtifacts'
import { STALE_KEYS, signOutAndRedirect } from './auth/signOut'
import * as appStore from '../context/AppStore'

const AUTH_KEY = 'propertyflow-auth-user'

describe('sign-out wipes the client cache', () => {
  it('signOut clears propertyflow-v18 and propertyflow-pg-source', async () => {
    expect(appStore.APP_STATE_STORAGE_KEY).toBe('propertyflow-v18')
    expect(appStore.PG_SOURCE_STORAGE_KEY).toBe('propertyflow-pg-source')
    expect(STALE_KEYS).toContain(APP_STATE_STORAGE_KEY)
    expect(STALE_KEYS).toContain(PG_SOURCE_STORAGE_KEY)
    vi.stubGlobal('window', { location: { assign: vi.fn() } })
    ls.setItem('propertyflow-v18', '{"ownerUserId":"u-a","state":{}}')
    ls.setItem('propertyflow-pg-source', 'postgres')
    await signOutAndRedirect(async () => {})
    expect(ls.getItem('propertyflow-v18')).toBeNull()
    expect(ls.getItem('propertyflow-pg-source')).toBeNull()
  })

  it('clearSessionArtifacts clears propertyflow-v18 and propertyflow-pg-source', () => {
    expect(AUTH_STORAGE_KEYS).toContain('propertyflow-v18')
    expect(AUTH_STORAGE_KEYS).toContain('propertyflow-pg-source')
    ls.setItem('propertyflow-v18', '{}')
    ls.setItem('propertyflow-pg-source', 'postgres')
    clearSessionArtifacts({ setSessionUser: vi.fn(), setUserId: vi.fn(), setRealUserId: vi.fn() })
    expect(ls.getItem('propertyflow-v18')).toBeNull()
    expect(ls.getItem('propertyflow-pg-source')).toBeNull()
  })
})

describe('owner-keyed cache', () => {
  const cachedA = {
    properties: [{ id: 'p-agency-a' }],
    users: [{ id: 'u-x', email: 'x@a.co.za' }],
  }

  it('loadState with a cache owned by A and stored auth user B returns the default (empty) state', () => {
    ls.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({ ownerUserId: 'u-a', state: cachedA }))
    ls.setItem(AUTH_KEY, 'u-b')
    const s = appStore.loadState()
    expect(s.properties).toEqual([])
    expect(s.users).toEqual([])
  })

  it('loadState returns the cache for its own owner', () => {
    ls.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({ ownerUserId: 'u-a', state: cachedA }))
    ls.setItem(AUTH_KEY, 'u-a')
    expect(appStore.loadState().properties.map((p) => p.id)).toEqual(['p-agency-a'])
  })

  it('a legacy untagged blob is never loaded', () => {
    ls.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(cachedA))
    ls.setItem(AUTH_KEY, 'u-a')
    expect(appStore.loadState().properties).toEqual([])
    expect(readOwnedClientCache(JSON.stringify(cachedA), 'u-a')).toBeNull()
  })

  it('writer stores { ownerUserId, state } and drops PII/trust books in API mode', () => {
    const state = { properties: [{ id: 'p1' }], users: [{ id: 'u' }], tenancies: [1], payments: [1], applications: [1], trustTransactions: [1], trustAllocations: [1], payoutInstructions: [1], depositHoldings: [1] }
    const api = JSON.parse(serializeClientCache(state, 'u-a', true))
    expect(api.ownerUserId).toBe('u-a')
    expect(Object.keys(api.state)).toEqual(['properties'])
    const demo = JSON.parse(serializeClientCache(state, 'u-a', false))
    expect(demo.state.users).toEqual([{ id: 'u' }])
  })

  it('session user change A→B is a switch (store resets to empty before B bootstrap)', () => {
    expect(sessionUserSwitched('u-a', 'u-b')).toBe(true)
    expect(sessionUserSwitched('u-a', 'u-a')).toBe(false)
    expect(sessionUserSwitched(null, 'u-b')).toBe(false)
    const fresh = appStore.defaultStateFor(true)
    expect(fresh.properties).toEqual([])
    expect(fresh.users).toEqual([])
  })
})

describe('API mode defaults', () => {
  it('API/Supabase mode defaultState has no seed trust/charge arrays', () => {
    const s = appStore.defaultStateFor(true)
    for (const k of ['trustTransactions', 'trustAllocations', 'payoutInstructions', 'depositHoldings', 'arrearsSnapshots', 'charges', 'csvImportBatches'] as const) {
      expect(s[k]).toEqual([])
    }
    const demo = appStore.defaultStateFor(false)
    expect(demo.trustTransactions.length + demo.charges.length).toBeGreaterThan(0)
  })

  it('mount with pg-source=postgres + cache + live session → bootstrap is not deferred', () => {
    expect(shouldDeferMountBootstrap({ storedAuthUserId: 'u-a', pgSource: 'postgres', cachedPropertyCount: 5 })).toBe(false)
    expect(shouldDeferMountBootstrap({ storedAuthUserId: null, pgSource: 'postgres', cachedPropertyCount: 5 })).toBe(true)
  })
})

describe('debounced cache write', () => {
  it('a write scheduled as A is never saved under B after a switch', () => {
    vi.useFakeTimers()
    try {
      ls.setItem(AUTH_KEY, 'u-a')
      const writes: Array<{ owner: string | null; state: unknown }> = []
      const writer = createClientCacheWriter<{ properties: string[] }>({
        delayMs: 900,
        getOwner: () => ls.getItem(AUTH_KEY),
        write: (state, owner) => {
          writes.push({ owner, state })
          ls.setItem(APP_STATE_STORAGE_KEY, serializeClientCache(state, owner, true))
        },
      })
      writer.schedule({ properties: ['p-agency-a'] })
      ls.setItem(AUTH_KEY, 'u-b') // user switch before the timer fires
      vi.advanceTimersByTime(1000)
      expect(writes).toEqual([])
      expect(readOwnedClientCache(ls.getItem(APP_STATE_STORAGE_KEY), 'u-b')).toBeNull()

      writer.schedule({ properties: ['p-agency-a'] })
      writer.cancel() // sign-out / resetForUserSwitch
      vi.advanceTimersByTime(1000)
      expect(writes).toEqual([])

      writer.schedule({ properties: ['p-b'] })
      vi.advanceTimersByTime(1000)
      expect(writes).toEqual([{ owner: 'u-b', state: { properties: ['p-b'] } }])
    } finally {
      vi.useRealTimers()
    }
  })
})
