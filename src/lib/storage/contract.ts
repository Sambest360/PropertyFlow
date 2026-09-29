/**
 * Frontend contract for private Supabase Storage.
 *
 * Migration 013 (backend, not this change) creates the buckets, `register_file`,
 * and `list_files`. Until that migration is applied, `FILE_STORAGE_DRIVER` in
 * `./index.ts` stays `'mock'`. Switching it to `'supabase'` is the only wiring
 * change — the UI calls this adapter and does not talk to Storage directly.
 */

export const PROPERTY_MEDIA_BUCKET = 'property-media' as const
export const DOCUMENTS_BUCKET = 'documents' as const

export type StorageBucket = typeof PROPERTY_MEDIA_BUCKET | typeof DOCUMENTS_BUCKET

/** Signed URLs from `list_files` are valid for one hour. */
export const SIGNED_URL_TTL_MS = 60 * 60 * 1000

/** Refresh a signed URL this long before `expires_at`. */
export const SIGNED_URL_REFRESH_LEAD_MS = 5 * 60 * 1000

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const

export type FileClass = 'image' | 'document'

export type StorageUploadTarget = {
  bucket: StorageBucket
  agencyId: string
  entityType: string
  entityId: string
  kind: string
  fileClass: FileClass
}

/** Row returned by `list_files`. */
export type SignedFile = {
  file_id: string
  kind: string
  url: string
  expires_at: string
}

export type UploadResult = {
  file_id: string
  bucket: StorageBucket
  path: string
}

export const STORAGE_REF_PREFIX = 'pfstore:v1:'

export function shouldRefreshSignedUrl(expiresAt: string, now = Date.now()): boolean {
  const exp = Date.parse(expiresAt)
  if (!Number.isFinite(exp)) return true
  return exp - now <= SIGNED_URL_REFRESH_LEAD_MS
}

export function toStorageRef(fileId: string): string {
  return `${STORAGE_REF_PREFIX}${fileId}`
}

export function fileIdFromStorageRef(value: string): string | null {
  if (!value.startsWith(STORAGE_REF_PREFIX)) return null
  const id = value.slice(STORAGE_REF_PREFIX.length).trim()
  return id || null
}

export function isStorageRef(value: string): boolean {
  return fileIdFromStorageRef(value) != null
}

export function isLegacyDataUrl(value: string): boolean {
  return value.startsWith('data:')
}

/** Values the UI can put on an img/href without asking Storage. */
export function isDirectMediaUrl(value: string): boolean {
  return (
    isLegacyDataUrl(value) ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('blob:')
  )
}

/**
 * Prefer an unmigrated data URL or remote URL. Otherwise use the storage ref
 * (`fileId`, or a `pfstore:v1:` value sitting in the old string field).
 */
export function mediaLocator(
  value:
    | string
    | null
    | undefined
    | { dataUrl?: string | null; fileId?: string | null },
): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.trim() || null
  const dataUrl = value.dataUrl?.trim() ?? ''
  if (dataUrl && (isLegacyDataUrl(dataUrl) || isDirectMediaUrl(dataUrl))) return dataUrl
  if (value.fileId) return toStorageRef(value.fileId)
  if (dataUrl && isStorageRef(dataUrl)) return dataUrl
  return dataUrl || null
}

function pathSegment(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  return cleaned || 'unknown'
}

/** `{agency_id}/{entity_type}/{entity_id}/{file_id}.{ext}` */
export function buildStoragePath(parts: {
  agencyId: string
  entityType: string
  entityId: string
  fileId: string
  ext: string
}): string {
  const ext = pathSegment(parts.ext).replace(/^\.+/, '') || 'bin'
  return [
    pathSegment(parts.agencyId),
    pathSegment(parts.entityType),
    pathSegment(parts.entityId),
    `${pathSegment(parts.fileId)}.${ext}`,
  ].join('/')
}

export function extensionForFile(file: { name: string; type: string }): string {
  const fromName = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (fromName && /^[a-z0-9]{1,8}$/.test(fromName) && fromName !== file.name.toLowerCase()) {
    if (fromName === 'jpeg') return 'jpg'
    return fromName
  }
  if (file.type === 'image/jpeg' || file.type === 'image/jpg' || file.type === 'image/pjpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'application/pdf' || file.type === 'application/x-pdf') return 'pdf'
  return 'bin'
}

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileValidationError'
  }
}

export class StorageAccessError extends Error {
  readonly status: 403 | 404

  constructor(status: 403 | 404, message?: string) {
    super(message ?? (status === 403 ? 'You do not have access to this file.' : 'This file is no longer available.'))
    this.name = 'StorageAccessError'
    this.status = status
  }
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 10) return `${mb.toFixed(0)} MB`
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function canonicalMime(file: { name: string; type: string }): string {
  const raw = file.type.trim().toLowerCase()
  if (raw === 'image/jpg' || raw === 'image/pjpeg') return 'image/jpeg'
  if (raw === 'application/x-pdf') return 'application/pdf'
  if (raw && raw !== 'application/octet-stream') return raw
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'pdf') return 'application/pdf'
  return raw
}

/** Client-side gate. Runs before `storage.upload` / `register_file`. */
export function validateUploadFile(file: { name: string; type: string; size: number }, fileClass: FileClass): string {
  if (!file || file.size <= 0) {
    throw new FileValidationError('Choose a file to upload.')
  }
  const mime = canonicalMime(file)
  if (fileClass === 'image') {
    if (!IMAGE_MIME_TYPES.includes(mime as (typeof IMAGE_MIME_TYPES)[number])) {
      throw new FileValidationError('Photos must be JPEG, PNG, or WebP.')
    }
    if (file.size > IMAGE_MAX_BYTES) {
      throw new FileValidationError(
        `This photo is ${formatSize(file.size)}. Photos can be up to ${formatSize(IMAGE_MAX_BYTES)}.`,
      )
    }
    return mime
  }
  if (!DOCUMENT_MIME_TYPES.includes(mime as (typeof DOCUMENT_MIME_TYPES)[number])) {
    throw new FileValidationError('Documents must be PDF, JPEG, or PNG.')
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    throw new FileValidationError(
      `This document is ${formatSize(file.size)}. Documents can be up to ${formatSize(DOCUMENT_MAX_BYTES)}.`,
    )
  }
  return mime
}

export function accessStatusFromError(error: unknown): 403 | 404 | null {
  if (error instanceof StorageAccessError) return error.status
  if (!error || typeof error !== 'object') return null
  const record = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown }
  const candidates = [record.status, record.statusCode, record.code, record.message]
  for (const value of candidates) {
    const text = String(value ?? '')
    if (text === '403' || text.includes('403') || text.toLowerCase() === 'forbidden') return 403
    if (text === '404' || text.includes('404') || text.toLowerCase() === 'not_found' || text.toLowerCase().includes('not found')) {
      return 404
    }
  }
  return null
}
