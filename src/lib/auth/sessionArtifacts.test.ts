import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  clearSessionArtifacts,
  isLoginInFlight,
  setLoginInFlight,
  registerWithSessionGuard,
  AUTH_STORAGE_KEYS,
} from './sessionArtifacts'

/** Minimal localStorage stand-in (node environment safe). */
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

function makeSetters() {
  return {
    setSessionUser: vi.fn(),
    setUserId: vi.fn(),
    setRealUserId: vi.fn(),
  }
}

describe('P0-1 session bleed guard', () => {
  let storage: ReturnType<typeof fakeStorage>
  let setters: ReturnType<typeof makeSetters>

  beforeEach(() => {
    storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('sessionStorage', fakeStorage())
    setters = makeSetters()
  })

  it('clears in-memory identity and persisted auth keys', () => {
    storage.setItem(AUTH_STORAGE_KEYS[0], 'u-admin-samuel')
    storage.setItem(AUTH_STORAGE_KEYS[1], 'u-admin-samuel')
    storage.setItem(AUTH_STORAGE_KEYS[2], 'stale-api-token')
    storage.setItem('sb-xyz-auth-token', 'stale-supabase')

    clearSessionArtifacts(setters)

    expect(setters.setSessionUser).toHaveBeenCalledWith(null)
    expect(setters.setUserId).toHaveBeenCalledWith('')
    expect(setters.setRealUserId).toHaveBeenCalledWith(null)
    expect(storage.getItem(AUTH_STORAGE_KEYS[0])).toBeNull()
    expect(storage.getItem(AUTH_STORAGE_KEYS[1])).toBeNull()
    expect(storage.getItem(AUTH_STORAGE_KEYS[2])).toBeNull()
    expect(storage.getItem('sb-xyz-auth-token')).toBeNull()
  })

  it('signup 500 → artifacts cleared and error rethrown (no silent success)', async () => {
    storage.setItem(AUTH_STORAGE_KEYS[0], 'u-admin-samuel')
    const clear = () => clearSessionArtifacts(setters)

    await expect(
      registerWithSessionGuard(
        async () => {
          throw new Error('Server error (500): unexpected_failure')
        },
        clear,
      ),
    ).rejects.toThrow(/500/)

    expect(setters.setSessionUser).toHaveBeenCalledWith(null)
    expect(storage.getItem(AUTH_STORAGE_KEYS[0])).toBeNull()
  })

  it('P0-1 acceptance: multiple storage keys all cleared on error', async () => {
    storage.setItem(AUTH_STORAGE_KEYS[0], 'u-admin-samuel')
    storage.setItem(AUTH_STORAGE_KEYS[1], 'u-admin-samuel')
    const clear = () => clearSessionArtifacts(setters)

    await expect(
      registerWithSessionGuard(
        async () => {
          throw new Error('HTTP 500: Internal server error')
        },
        clear,
      ),
    ).rejects.toThrow(/500/)

    expect(setters.setSessionUser).toHaveBeenCalledWith(null)
    expect(setters.setUserId).toHaveBeenCalledWith('')
    expect(setters.setRealUserId).toHaveBeenCalledWith(null)
    expect(storage.getItem(AUTH_STORAGE_KEYS[0])).toBeNull()
    expect(storage.getItem(AUTH_STORAGE_KEYS[1])).toBeNull()
  })

  it('P0-1 acceptance: successful signup does NOT clear session', async () => {
    const clear = vi.fn(() => clearSessionArtifacts(setters))
    const fresh = { user: { id: 'u-new' } }

    const out = await registerWithSessionGuard(async () => fresh, clear)

    expect(out).toBe(fresh)
    expect(clear).not.toHaveBeenCalled()
    expect(setters.setSessionUser).not.toHaveBeenCalled()
  })

  it('successful signup does NOT clear the fresh session', async () => {
    const clear = vi.fn(() => clearSessionArtifacts(setters))
    const fresh = { user: { id: 'u-new' } }

    const out = await registerWithSessionGuard(async () => fresh, clear)

    expect(out).toBe(fresh)
    expect(clear).not.toHaveBeenCalled()
    expect(setters.setSessionUser).not.toHaveBeenCalled()
  })

  it('P0-1 acceptance: multiple storage keys all cleared on error', async () => {
    storage.setItem(AUTH_STORAGE_KEYS[0], 'u-admin-samuel')
    storage.setItem(AUTH_STORAGE_KEYS[1], 'u-admin-samuel')
    const clear = () => clearSessionArtifacts(setters)

    await expect(
      registerWithSessionGuard(
        async () => {
          throw new Error('HTTP 500: Internal server error')
        },
        clear,
      ),
    ).rejects.toThrow(/500/)

    expect(setters.setSessionUser).toHaveBeenCalledWith(null)
    expect(setters.setUserId).toHaveBeenCalledWith('')
    expect(setters.setRealUserId).toHaveBeenCalledWith(null)
    expect(storage.getItem(AUTH_STORAGE_KEYS[0])).toBeNull()
    expect(storage.getItem(AUTH_STORAGE_KEYS[1])).toBeNull()
  })

  it('storage removal failure still clears in-memory identity', () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(() => clearSessionArtifacts(setters)).not.toThrow()
    expect(setters.setSessionUser).toHaveBeenCalledWith(null)
  })
})

describe('loginInFlight (P0 empty-DB SA)', () => {
  it('toggles login in-flight flag', () => {
    setLoginInFlight(false)
    expect(isLoginInFlight()).toBe(false)
    setLoginInFlight(true)
    expect(isLoginInFlight()).toBe(true)
    setLoginInFlight(false)
    expect(isLoginInFlight()).toBe(false)
  })
})
