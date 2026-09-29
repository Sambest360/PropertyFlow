import {
  SIGNED_URL_TTL_MS,
  StorageAccessError,
  buildStoragePath,
  extensionForFile,
  validateUploadFile,
  type SignedFile,
  type StorageBucket,
} from './contract'
import type { FileStorage, ListFilesQuery, UploadRequest } from './types'

type StoredObject = {
  fileId: string
  bucket: StorageBucket
  path: string
  entityType: string
  entityId: string
  kind: string
  contentType: string
  bytes: Uint8Array
}

export type MockFileStorageOptions = {
  now?: () => number
  /** When set, the next upload stores the object and then fails register_file. */
  failNextRegister?: boolean
}

/**
 * In-memory stand-in for private buckets + `register_file` + `list_files`.
 * Upload writes the object, then registers it. A failed register deletes the object.
 */
export function createMockFileStorage(options: MockFileStorageOptions = {}): FileStorage & {
  failNextRegister(): void
  /** Next read of this id fails with 403 or 404. */
  failRead(fileId: string, status: 403 | 404): void
  storedPaths(): string[]
} {
  const now = options.now ?? (() => Date.now())
  const objects = new Map<string, StoredObject>()
  const readFailures = new Map<string, 403 | 404>()
  let failRegister = Boolean(options.failNextRegister)
  const objectUrls = new Map<string, string>()

  function signedUrl(object: StoredObject, expiresAt: string): string {
    const previous = objectUrls.get(object.fileId)
    if (previous && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(previous)
    }
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const copy = new Uint8Array(object.bytes)
      const url = URL.createObjectURL(new Blob([copy], { type: object.contentType }))
      objectUrls.set(object.fileId, url)
      return url
    }
    return `mock-signed://${object.fileId}?exp=${encodeURIComponent(expiresAt)}`
  }

  function toSigned(object: StoredObject): SignedFile {
    const failure = readFailures.get(object.fileId)
    if (failure) throw new StorageAccessError(failure)
    const expiresAt = new Date(now() + SIGNED_URL_TTL_MS).toISOString()
    return {
      file_id: object.fileId,
      kind: object.kind,
      url: signedUrl(object, expiresAt),
      expires_at: expiresAt,
    }
  }

  const api: FileStorage & {
    failNextRegister(): void
    failRead(fileId: string, status: 403 | 404): void
    storedPaths(): string[]
  } = {
    async upload(request: UploadRequest) {
      if (!request.agencyId.trim() || !request.entityId.trim() || !request.entityType.trim()) {
        throw new Error('Agency, record type, and record id are required before uploading.')
      }
      const contentType = validateUploadFile(request.file, request.fileClass)
      const fileId = crypto.randomUUID()
      const path = buildStoragePath({
        agencyId: request.agencyId,
        entityType: request.entityType,
        entityId: request.entityId,
        fileId,
        ext: extensionForFile(request.file),
      })
      const bytes = new Uint8Array(await request.file.arrayBuffer())
      objects.set(fileId, {
        fileId,
        bucket: request.bucket,
        path,
        entityType: request.entityType,
        entityId: request.entityId,
        kind: request.kind,
        contentType,
        bytes,
      })
      if (failRegister) {
        failRegister = false
        objects.delete(fileId)
        throw new Error('register_file failed')
      }
      return { file_id: fileId, bucket: request.bucket, path }
    },

    async listFiles(query: ListFilesQuery): Promise<SignedFile[]> {
      const files: SignedFile[] = []
      for (const object of objects.values()) {
        if (object.entityType !== query.entityType || object.entityId !== query.entityId) continue
        if (readFailures.has(object.fileId)) continue
        files.push(toSigned(object))
      }
      return files
    },

    async getFile(fileId: string): Promise<SignedFile> {
      const failure = readFailures.get(fileId)
      if (failure) throw new StorageAccessError(failure)
      const object = objects.get(fileId)
      if (!object) throw new StorageAccessError(404)
      return toSigned(object)
    },

    failNextRegister() {
      failRegister = true
    },

    failRead(fileId: string, status: 403 | 404) {
      readFailures.set(fileId, status)
    },

    storedPaths() {
      return [...objects.values()].map((object) => object.path)
    },
  }

  return api
}
