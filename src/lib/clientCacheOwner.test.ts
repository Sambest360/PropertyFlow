import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  bootstrapMatchesSession,
  createClientCacheWriter,
  handleAuthKeyStorageEvent,
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

  it('writer stores { ownerUserId, state } and drops PII/trust books in live modes (LIVE_MODE_UNPERSISTED_KEYS)', () => {
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

describe('live mode defaults', () => {
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

function liveWriter(memoryOwner: { current: string | null }) {
  const writes: Array<{ owner: string | null; state: unknown }> = []
  const writer = createClientCacheWriter<{ properties: string[] }>({
    delayMs: 900,
    liveMode: true,
    getMemoryOwner: () => memoryOwner.current,
    getStoredAuthUser: () => ls.getItem(AUTH_KEY),
    write: (state, owner) => {
      writes.push({ owner, state })
      ls.setItem(APP_STATE_STORAGE_KEY, serializeClientCache(state, owner, true))
    },
  })
  return { writer, writes }
}

describe('cache write ownership (live modes)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('a write scheduled as A is never saved under B after a switch', () => {
    ls.setItem(AUTH_KEY, 'u-a')
    const mem = { current: 'u-a' as string | null }
    const { writer, writes } = liveWriter(mem)
    writer.schedule({ properties: ['p-agency-a'] })
    ls.setItem(AUTH_KEY, 'u-b')
    vi.advanceTimersByTime(1000)
    expect(writes).toEqual([])
    writer.schedule({ properties: ['p-agency-a'] })
    writer.cancel()
    vi.advanceTimersByTime(1000)
    expect(writes).toEqual([])
  })

  it("two tabs: tab 2 switches A→B, tab 1's next change does not write A's data tagged B", () => {
    ls.setItem(AUTH_KEY, 'u-a')
    const tab1Memory = { current: 'u-a' as string | null } // tab 1 still holds A's data
    const { writer, writes } = liveWriter(tab1Memory)
    ls.setItem(AUTH_KEY, 'u-b') // tab 2 signs in as B (shared key)
    writer.schedule({ properties: ['p-agency-a'] }) // tab 1 state change
    vi.advanceTimersByTime(1000)
    expect(writes).toEqual([])
    expect(readOwnedClientCache(ls.getItem(APP_STATE_STORAGE_KEY), 'u-b')).toBeNull()
  })

  it('no write with no owner in live mode', () => {
    ls.setItem(AUTH_KEY, 'u-a')
    const { writer, writes } = liveWriter({ current: null }) // not hydrated / guest
    writer.schedule({ properties: ['p'] })
    vi.advanceTimersByTime(1000)
    expect(writes).toEqual([])
    expect(ls.getItem(APP_STATE_STORAGE_KEY)).toBeNull()
  })

  it('a state change after signOutAndRedirect writes nothing, and a guest never reads A\'s cache', async () => {
    ls.setItem(AUTH_KEY, 'u-a')
    ls.setItem(APP_STATE_STORAGE_KEY, serializeClientCache({ properties: [{ id: 'p-agency-a' }] }, 'u-a', true))
    const { writer, writes } = liveWriter({ current: 'u-a' })
    vi.stubGlobal('window', { location: { assign: vi.fn() } })
    await signOutAndRedirect(async () => {})
    writer.schedule({ properties: ['p-agency-a'] })
    vi.advanceTimersByTime(1000)
    expect(writes).toEqual([])
    expect(ls.getItem(APP_STATE_STORAGE_KEY)).toBeNull()
    // Even if A's cache were still there, a guest loads the empty default.
    ls.setItem(APP_STATE_STORAGE_KEY, serializeClientCache({ properties: [{ id: 'p-agency-a' }] }, 'u-a', true))
    expect(appStore.loadState().properties).toEqual([])
  })

  it('cross-tab auth-key removal cancels the pending write and resets the store', () => {
    ls.setItem(AUTH_KEY, 'u-a')
    const { writer, writes } = liveWriter({ current: 'u-a' })
    let store = { properties: ['p-agency-a'] }
    writer.schedule(store)
    const acted = handleAuthKeyStorageEvent({ key: AUTH_KEY, newValue: null }, {
      cancel: writer.cancel,
      reset: () => {
        store = { properties: [] }
      },
    })
    vi.advanceTimersByTime(1000)
    expect(acted).toBe(true)
    expect(store.properties).toEqual([])
    expect(writes).toEqual([])
    expect(handleAuthKeyStorageEvent({ key: AUTH_KEY, oldValue: 'u-b', newValue: 'u-b' }, { cancel: vi.fn(), reset: vi.fn() })).toBe(false)
    expect(handleAuthKeyStorageEvent({ key: 'other', newValue: null }, { cancel: vi.fn(), reset: vi.fn() })).toBe(false)
  })

  it('another tab sets the auth key A→B: store resets and nothing is written', () => {
    ls.setItem(AUTH_KEY, 'u-a')
    const { writer, writes } = liveWriter({ current: 'u-a' })
    let store = { properties: ['p-agency-a'] }
    writer.schedule(store)
    ls.setItem(AUTH_KEY, 'u-b') // tab 2
    const acted = handleAuthKeyStorageEvent({ key: AUTH_KEY, oldValue: 'u-a', newValue: 'u-b' }, {
      cancel: writer.cancel,
      reset: () => {
        store = { properties: [] }
      },
    })
    vi.advanceTimersByTime(1000)
    expect(acted).toBe(true)
    expect(store.properties).toEqual([])
    expect(writes).toEqual([])
    expect(ls.getItem(APP_STATE_STORAGE_KEY)).toBeNull()
  })

  it('a bootstrap for a user who is no longer the session user is ignored', () => {
    expect(bootstrapMatchesSession('u-a', 'u-b')).toBe(false)
    expect(bootstrapMatchesSession('u-b', 'u-b')).toBe(true)
    expect(bootstrapMatchesSession(null, null)).toBe(true)
    expect(bootstrapMatchesSession(null, 'u-b')).toBe(false)
  })

  it('demo mode writes unkeyed as on main', () => {
    const write = vi.fn()
    const w = createClientCacheWriter({ delayMs: 900, liveMode: false, getMemoryOwner: () => null, getStoredAuthUser: () => null, write })
    w.schedule({ properties: [] })
    vi.advanceTimersByTime(1000)
    expect(write).toHaveBeenCalledTimes(1)
  })
})

describe('support tickets in the cache', () => {
  it('live-mode cache has no supportTickets or maintenance tickets; demo mode keeps them unchanged', () => {
    const state = {
      properties: [{ id: 'p1' }],
      supportTickets: [{ id: 'st-1', submitterName: 'Sipho' }],
      tickets: [{ id: 'mt-1', title: 'Geyser leak', tenantName: 'Sipho' }],
    }
    const live = JSON.parse(serializeClientCache(state, 'u-a', true))
    expect(live.state).not.toHaveProperty('supportTickets')
    expect(live.state).not.toHaveProperty('tickets')
    expect(live.state.properties).toEqual([{ id: 'p1' }])
    const demo = JSON.parse(serializeClientCache(state, null, false))
    expect(demo.state.supportTickets).toEqual(state.supportTickets)
    expect(demo.state.tickets).toEqual(state.tickets)
  })
})
