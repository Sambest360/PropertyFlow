import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearLogoutStorage, purgeSensitiveLocalCache } from './sensitiveStorage'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key(index: number) {
      return [...map.keys()][index] ?? null
    },
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('browser storage hygiene', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('logout wipes every sb-* and propertyflow-* key and leaves other keys', () => {
    const local = fakeStorage()
    const session = fakeStorage()
    local.setItem('sb-project-auth-token', 'jwt')
    local.setItem('sb-project-auth-token-code-verifier', 'pkce')
    local.setItem('propertyflow-v18', '{"users":[]}')
    local.setItem('propertyflow-auth-token', 'legacy')
    local.setItem('propertyflow-wishlist:u1', '["PR-1"]')
    local.setItem('pf-theme', 'dark')
    session.setItem('sb-other', '1')
    session.setItem('propertyflow-auth-user', 'u1')
    vi.stubGlobal('localStorage', local)
    vi.stubGlobal('sessionStorage', session)

    clearLogoutStorage()

    expect(local.getItem('sb-project-auth-token')).toBeNull()
    expect(local.getItem('sb-project-auth-token-code-verifier')).toBeNull()
    expect(local.getItem('propertyflow-v18')).toBeNull()
    expect(local.getItem('propertyflow-auth-token')).toBeNull()
    expect(local.getItem('propertyflow-wishlist:u1')).toBeNull()
    expect(local.getItem('pf-theme')).toBe('dark')
    expect(session.getItem('sb-other')).toBeNull()
    expect(session.getItem('propertyflow-auth-user')).toBeNull()
  })

  it('startup purge drops the workspace and legacy token without touching the supabase session', () => {
    const local = fakeStorage()
    local.setItem('sb-project-auth-token', 'jwt')
    local.setItem('propertyflow-v18', '{"applications":[]}')
    local.setItem('propertyflow-v16', '{}')
    local.setItem('propertyflow-auth-token', 'legacy')
    local.setItem('propertyflow-auth-user', 'u1')
    local.setItem('propertyflow-auth-real-user', 'u1')
    local.setItem('propertyflow-pg-source', 'postgres')
    local.setItem('propertyflow-nav-collapsed', '1')
    vi.stubGlobal('localStorage', local)
    vi.stubGlobal('sessionStorage', fakeStorage())

    purgeSensitiveLocalCache()

    expect(local.getItem('sb-project-auth-token')).toBe('jwt')
    expect(local.getItem('propertyflow-v18')).toBeNull()
    expect(local.getItem('propertyflow-v16')).toBeNull()
    expect(local.getItem('propertyflow-auth-token')).toBeNull()
    expect(local.getItem('propertyflow-auth-user')).toBeNull()
    expect(local.getItem('propertyflow-auth-real-user')).toBeNull()
    expect(local.getItem('propertyflow-pg-source')).toBeNull()
    expect(local.getItem('propertyflow-nav-collapsed')).toBe('1')
  })
})
