import { createClient } from '../../utils/supabase/client'
import { createMockFileStorage } from './mockStorage'
import { createSupabaseFileStorage, type SupabaseStorageLike } from './supabaseStorage'
import type { FileStorage } from './types'

/**
 * Switch this to `'supabase'` when migration 013 has been applied.
 * Nothing in the screens calls Storage or the RPCs directly.
 *
 * Migration 013 must provide:
 * - Private buckets `property-media` and `documents`
 * - `register_file({ bucket, path, entity_type, entity_id, kind }) → { file_id }`
 *   The file id embedded in the path is the one the RPC returns.
 * - `list_files({ entity_type, entity_id }) → { files: [{ file_id, kind, url, expires_at }] }`
 * - `list_files({ file_id })` for the same shape, so a stored ref can refresh
 *   its signed URL. URLs are valid for 1 hour.
 * - Storage RLS that returns 403 or 404 (not a 500) when the caller cannot read.
 */
export const FILE_STORAGE_DRIVER = 'mock' as 'mock' | 'supabase'

let singleton: FileStorage | null = null

export function getFileStorage(): FileStorage {
  if (!singleton) {
    singleton =
      FILE_STORAGE_DRIVER === 'supabase'
        ? createSupabaseFileStorage(createClient() as unknown as SupabaseStorageLike)
        : createMockFileStorage()
  }
  return singleton
}

/** Tests and a future driver flip can drop the cached adapter. */
export function resetFileStorage(): void {
  singleton = null
}

export { createMockFileStorage } from './mockStorage'
export { createSupabaseFileStorage } from './supabaseStorage'
export type { SupabaseStorageLike } from './supabaseStorage'
export type { FileStorage, ListFilesQuery, UploadRequest } from './types'
