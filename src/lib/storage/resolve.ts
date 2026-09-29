import {
  StorageAccessError,
  accessStatusFromError,
  fileIdFromStorageRef,
  isDirectMediaUrl,
  isLegacyDataUrl,
  shouldRefreshSignedUrl,
} from './contract'
import { getFileStorage } from './index'
import type { FileStorage } from './types'

export type ResolvedMedia = {
  status: 'empty' | 'loading' | 'ready' | 'unavailable'
  url: string | null
  expiresAt?: string
  /** Why a storage read did not yield a URL. */
  reason?: 'forbidden' | 'missing'
  source?: 'legacy' | 'storage'
}

const signedCache = new Map<string, { url: string; expiresAt: string }>()

export function clearSignedUrlCache(): void {
  signedCache.clear()
}

/**
 * Turn a stored string into something an `<img>` or link can use.
 * Data URLs and http(s) URLs are returned as-is (pre-migration rows).
 * Storage refs are exchanged for a signed URL, refreshed shortly before expiry.
 * 403 and 404 become `unavailable` instead of throwing. When a legacy data URL
 * is also supplied, it is used if Storage cannot serve the file.
 */
export async function resolveMediaSrc(
  value: string | null | undefined,
  options?: { legacyFallback?: string | null; storage?: FileStorage; now?: number },
): Promise<ResolvedMedia> {
  const storage = options?.storage ?? getFileStorage()
  const now = options?.now ?? Date.now()
  if (!value || !value.trim()) return { status: 'empty', url: null }
  const trimmed = value.trim()
  if (isDirectMediaUrl(trimmed)) {
    return { status: 'ready', url: trimmed, source: 'legacy' }
  }
  const fileId = fileIdFromStorageRef(trimmed)
  if (!fileId) return { status: 'unavailable', url: null, reason: 'missing' }

  const cached = signedCache.get(fileId)
  if (cached && !shouldRefreshSignedUrl(cached.expiresAt, now)) {
    return { status: 'ready', url: cached.url, expiresAt: cached.expiresAt, source: 'storage' }
  }

  try {
    const file = await storage.getFile(fileId)
    if (shouldRefreshSignedUrl(file.expires_at, now)) {
      const fresh = await storage.getFile(fileId)
      signedCache.set(fileId, { url: fresh.url, expiresAt: fresh.expires_at })
      return { status: 'ready', url: fresh.url, expiresAt: fresh.expires_at, source: 'storage' }
    }
    signedCache.set(fileId, { url: file.url, expiresAt: file.expires_at })
    return { status: 'ready', url: file.url, expiresAt: file.expires_at, source: 'storage' }
  } catch (error) {
    const status = error instanceof StorageAccessError ? error.status : accessStatusFromError(error)
    const fallback = options?.legacyFallback?.trim() ?? ''
    if ((status === 403 || status === 404) && fallback && (isLegacyDataUrl(fallback) || isDirectMediaUrl(fallback))) {
      return { status: 'ready', url: fallback, source: 'legacy' }
    }
    if (status === 403) return { status: 'unavailable', url: null, reason: 'forbidden' }
    if (status === 404 || status == null) return { status: 'unavailable', url: null, reason: 'missing' }
    return { status: 'unavailable', url: null, reason: 'missing' }
  }
}
