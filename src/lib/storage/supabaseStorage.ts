import {
  SIGNED_URL_TTL_MS,
  StorageAccessError,
  accessStatusFromError,
  buildStoragePath,
  extensionForFile,
  validateUploadFile,
  type SignedFile,
} from './contract'
import type { FileStorage, ListFilesQuery, UploadRequest } from './types'

type RpcError = {
  message?: string
  code?: string
  status?: number
  statusCode?: number | string
}

/**
 * The slice of supabase-js this adapter needs. Kept narrow so tests can pass a
 * fake and the UI never calls `.storage` itself.
 */
export type SupabaseStorageLike = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Blob,
        options: { contentType?: string; upsert?: boolean },
      ) => Promise<{ error: RpcError | null }>
      remove: (paths: string[]) => Promise<{ error: RpcError | null }>
    }
  }
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>
}

function throwIfAccess(error: RpcError | null): void {
  if (!error) return
  const status = accessStatusFromError(error)
  if (status) throw new StorageAccessError(status, error.message)
  throw new Error(error.message || 'Storage request failed')
}

function parseFiles(data: unknown): SignedFile[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { files?: unknown }).files)
      ? (data as { files: unknown[] }).files
      : []
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => ({
      file_id: String(row.file_id ?? ''),
      kind: String(row.kind ?? ''),
      url: String(row.url ?? ''),
      expires_at:
        typeof row.expires_at === 'string' && row.expires_at
          ? row.expires_at
          : new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString(),
    }))
    .filter((row) => row.file_id && row.url)
}

/**
 * Real client. Not selected until `FILE_STORAGE_DRIVER` is `'supabase'`
 * (migration 013). Upload order is fixed: storage upload, then `register_file`.
 * A failed register deletes the object.
 */
export function createSupabaseFileStorage(client: SupabaseStorageLike): FileStorage {
  return {
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
      const uploaded = await client.storage.from(request.bucket).upload(path, request.file, {
        contentType,
        upsert: false,
      })
      if (uploaded.error) throwIfAccess(uploaded.error)

      const registered = await client.rpc('register_file', {
        bucket: request.bucket,
        path,
        entity_type: request.entityType,
        entity_id: request.entityId,
        kind: request.kind,
      })
      if (registered.error) {
        await client.storage.from(request.bucket).remove([path]).catch(() => undefined)
        throwIfAccess(registered.error)
      }
      const payload = registered.data
      const returnedId =
        payload && typeof payload === 'object' && typeof (payload as { file_id?: unknown }).file_id === 'string'
          ? (payload as { file_id: string }).file_id
          : fileId
      return { file_id: returnedId, bucket: request.bucket, path }
    },

    async listFiles(query: ListFilesQuery) {
      const listed = await client.rpc('list_files', {
        entity_type: query.entityType,
        entity_id: query.entityId,
      })
      if (listed.error) throwIfAccess(listed.error)
      return parseFiles(listed.data)
    },

    async getFile(fileId: string) {
      const listed = await client.rpc('list_files', { file_id: fileId })
      if (listed.error) throwIfAccess(listed.error)
      const match = parseFiles(listed.data).find((file) => file.file_id === fileId) ?? parseFiles(listed.data)[0]
      if (!match) throw new StorageAccessError(404)
      return match
    },
  }
}
