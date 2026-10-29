/**
 * On a REAL auth failure (401 from our API), drop the stale propertyflow
 * token and any sb-* leftovers from the old hosted auth (storage + cookies) so they
 * cannot pile up into 494 REQUEST_HEADER_TOO_LARGE. Never touches app state /
 * persist save-queue keys — only the explicit keys below.
 */
export const API_AUTH_TOKEN_KEY = 'propertyflow-auth-token'

export function isRealAuthFailure(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status
  return status === 401
}

export function clearStaleAuthOnFailure(
  err: unknown,
  opts: { doc?: Pick<Document, 'cookie'> | null } = {},
): boolean {
  if (!isRealAuthFailure(err)) return false
  try {
    localStorage.removeItem(API_AUTH_TOKEN_KEY)
    for (const store of [localStorage, sessionStorage]) {
      const keys: string[] = []
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        if (k && k.startsWith('sb-')) keys.push(k)
      }
      for (const k of keys) store.removeItem(k)
    }
  } catch {
    /* storage unavailable */
  }
  const doc = opts.doc === undefined ? (typeof document !== 'undefined' ? document : null) : opts.doc
  if (doc) {
    const names = doc.cookie
      .split(';')
      .map((c) => c.split('=')[0]?.trim())
      .filter((n): n is string => Boolean(n && n.startsWith('sb-')))
    for (const n of names) {
      doc.cookie = `${n}=; Max-Age=0; path=/`
    }
  }
  return true
}
