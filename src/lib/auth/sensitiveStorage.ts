/**
 * Browser storage hygiene.
 *
 * The Supabase session stays where supabase-js puts it (persistSession is
 * unchanged). We do not keep our own bearer token, user id, or workspace
 * snapshot in localStorage. Logout drops every `sb-*` and `propertyflow-*` key.
 */

const LEGACY_EXACT_KEYS = [
  'propertyflow-auth-token',
  'propertyflow-auth-user',
  'propertyflow-auth-real-user',
  'propertyflow-pg-source',
] as const

function storageList(store: Storage): string[] {
  const keys: string[] = []
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)
    if (key) keys.push(key)
  }
  return keys
}

function stores(): Storage[] {
  const found: Storage[] = []
  try {
    if (typeof localStorage !== 'undefined') found.push(localStorage)
  } catch {
    /* unavailable */
  }
  try {
    if (typeof sessionStorage !== 'undefined') found.push(sessionStorage)
  } catch {
    /* unavailable */
  }
  return found
}

/** Workspace snapshots are `propertyflow-v18` and older version bumps. */
export function isLegacyWorkspaceKey(key: string): boolean {
  return /^propertyflow-v\d+$/.test(key)
}

/**
 * Drop the legacy bearer token, cached user ids, and workspace snapshots.
 * Leaves `sb-*` (supabase-js) and UI preference keys alone.
 */
export function purgeSensitiveLocalCache(): void {
  for (const store of stores()) {
    try {
      for (const key of storageList(store)) {
        if (LEGACY_EXACT_KEYS.includes(key as (typeof LEGACY_EXACT_KEYS)[number]) || isLegacyWorkspaceKey(key)) {
          store.removeItem(key)
        }
      }
    } catch {
      /* storage unavailable */
    }
  }
}

function clearSbCookies(): void {
  if (typeof document === 'undefined') return
  try {
    const names = document.cookie
      .split(';')
      .map((part) => part.split('=')[0]?.trim())
      .filter((name): name is string => Boolean(name))
    for (const name of names) {
      if (!name.startsWith('sb-')) continue
      document.cookie = `${name}=; Max-Age=0; path=/`
    }
  } catch {
    /* cookies unavailable */
  }
}

/** Logout: every `sb-*` and `propertyflow-*` key, plus the Supabase session cookies. */
export function clearLogoutStorage(): void {
  for (const store of stores()) {
    try {
      for (const key of storageList(store)) {
        if (key.startsWith('sb-') || key.startsWith('propertyflow-')) store.removeItem(key)
      }
    } catch {
      /* storage unavailable */
    }
  }
  clearSbCookies()
}
