/**
 * Safe in-app return paths for create flows that leave the current screen.
 * Only same-origin relative paths are accepted.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.includes('://')) return null
  return value
}

export function readReturnTo(searchParams: URLSearchParams): string | null {
  return sanitizeReturnTo(searchParams.get('returnTo'))
}

/** Append `returnTo` to a relative app path (preserves existing query). */
export function withReturnTo(target: string, returnTo: string | null | undefined): string {
  const safe = sanitizeReturnTo(returnTo)
  if (!safe) return target

  try {
    const url = new URL(target, 'http://propertyflow.local')
    // Avoid sending people back into another create hop
    if (url.searchParams.has('returnTo')) return target
    url.searchParams.set('returnTo', safe)
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return target
  }
}

export function currentReturnPath(pathname: string, search: string): string {
  return `${pathname}${search}`
}
