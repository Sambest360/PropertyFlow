import type { SignedFile, StorageUploadTarget, UploadResult } from './contract'

export type UploadRequest = StorageUploadTarget & {
  file: File
}

export type ListFilesQuery = {
  entityType: string
  entityId: string
}

/**
 * Browser file storage. The mock stands in until migration 013 exposes
 * `register_file` and `list_files` on the Supabase project.
 */
export interface FileStorage {
  upload(request: UploadRequest): Promise<UploadResult>
  /** Signed URLs valid for one hour. */
  listFiles(query: ListFilesQuery): Promise<SignedFile[]>
  /** One file by id. Throws StorageAccessError on 403 or 404. */
  getFile(fileId: string): Promise<SignedFile>
}
