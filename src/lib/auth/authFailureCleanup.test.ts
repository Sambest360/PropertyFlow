import { beforeEach, describe, expect, it, vi } from 'vitest'

function memStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  }
}
vi.stubGlobal('localStorage', memStorage())
vi.stubGlobal('sessionStorage', memStorage())
import { clearStaleAuthOnFailure } from './authFailureCleanup'
import { APP_STATE_STORAGE_KEY } from '../clientCache'

function fakeDoc(initial: string[]) {
  const jar = new Map(initial.map((c) => c.split('=') as [string, string]))
  return {
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    },
    set cookie(v: string) {
      const [kv, ...attrs] = v.split(';')
      const [k, val] = kv.split('=')
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) jar.delete(k.trim())
      else jar.set(k.trim(), val)
    },
  }
}

const QUEUE_KEYS = ['propertyflow-persist-queue', 'pf-persist-save-queue']

describe('clearStaleAuthOnFailure', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('propertyflow-auth-token', 't')
    localStorage.setItem('sb-ref-auth-token', 'x')
    sessionStorage.setItem('sb-ref-auth-token-code-verifier', 'y')
    localStorage.setItem(APP_STATE_STORAGE_KEY, '{"s":1}')
    for (const k of QUEUE_KEYS) localStorage.setItem(k, '[1]')
  })

  it('API mode + 401 clears token, sb-* storage and sb-* cookies only', () => {
    const doc = fakeDoc(['sb-ref-auth-token.0=a', 'sb-ref-auth-token.1=b', 'other=keep'])
    const err = Object.assign(new Error('Invalid email or password'), { status: 401 })
    expect(clearStaleAuthOnFailure(err, { supabaseMode: false, doc })).toBe(true)
    expect(localStorage.getItem('propertyflow-auth-token')).toBeNull()
    expect(localStorage.getItem('sb-ref-auth-token')).toBeNull()
    expect(sessionStorage.getItem('sb-ref-auth-token-code-verifier')).toBeNull()
    expect(doc.cookie).toBe('other=keep')
    // persist save-queue + app state untouched
    for (const k of QUEUE_KEYS) expect(localStorage.getItem(k)).toBe('[1]')
    expect(localStorage.getItem(APP_STATE_STORAGE_KEY)).toBe('{"s":1}')
  })

  it('non-auth failures (timeout, 500, 429) clear nothing', () => {
    const doc = fakeDoc(['sb-ref-auth-token=a'])
    for (const status of [undefined, 500, 429, 503]) {
      const err = Object.assign(new Error('x'), { status })
      expect(clearStaleAuthOnFailure(err, { supabaseMode: false, doc })).toBe(false)
    }
    expect(localStorage.getItem('propertyflow-auth-token')).toBe('t')
    expect(doc.cookie).toBe('sb-ref-auth-token=a')
  })

  it('Supabase mode clears nothing', () => {
    const err = Object.assign(new Error('x'), { status: 401 })
    expect(clearStaleAuthOnFailure(err, { supabaseMode: true, doc: fakeDoc([]) })).toBe(false)
    expect(localStorage.getItem('propertyflow-auth-token')).toBe('t')
  })
})
