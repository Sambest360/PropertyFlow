import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseSupabaseProjectRef, purgeStaleSupabaseAuthCookies } from './supabaseCookieHygiene'

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

describe('supabaseCookieHygiene', () => {
  let storage: ReturnType<typeof fakeStorage>

  beforeEach(() => {
    storage = fakeStorage()
    vi.stubGlobal('localStorage', storage)
  })

  it('parses project ref from Supabase URL', () => {
    expect(parseSupabaseProjectRef('https://myproj.supabase.co')).toBe('myproj')
  })

  it('removes sb auth keys for other project refs', () => {
    storage.setItem('sb-current-auth-token', 'keep')
    storage.setItem('sb-oldproj-auth-token', 'drop')
    storage.setItem('propertyflow-auth-user', 'u1')
    purgeStaleSupabaseAuthCookies('current')
    expect(storage.getItem('sb-current-auth-token')).toBe('keep')
    expect(storage.getItem('sb-oldproj-auth-token')).toBeNull()
    expect(storage.getItem('propertyflow-auth-user')).toBe('u1')
  })
})
