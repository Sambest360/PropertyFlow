import type { Application } from '../types/domain'

/** P3b: per-file cap for application documents. */
export const APPLICATION_DOC_MAX_BYTES = 3 * 1024 * 1024
export const APPLICATION_DOC_TOO_LARGE =
  'This file is larger than 3 MB. Upload a smaller copy or split it into separate months.'
export const APPLICATION_DOC_WRONG_TYPE = 'Upload a PDF, JPEG or PNG file.'
export const APPLICATION_DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_EXT = /\.(pdf|jpe?g|png)$/i

/** Null when the file may be uploaded, else the refusal copy. */
export function applicationDocFileError(file: { size: number; type?: string; name?: string }): string | null {
  const typeOk = file.type ? ALLOWED_TYPES.has(file.type) : ALLOWED_EXT.test(file.name ?? '')
  if (!typeOk) return APPLICATION_DOC_WRONG_TYPE
  if (file.size > APPLICATION_DOC_MAX_BYTES) return APPLICATION_DOC_TOO_LARGE
  return null
}

/**
 * P3b: persist payload for an upload. The applicant's own write goes through
 * the applicant policy, which keeps stored documents missing from the payload,
 * so only the changed document is sent (keeps the request small). Staff writes
 * replace the list whole (writes.ts mergeRedactedApplicationFields), so staff
 * keep sending every document.
 */
export function applicationUploadPayload(
  app: Application,
  key: string,
  actorUserId: string | undefined,
): Record<string, unknown> {
  const isApplicant = Boolean(actorUserId && app.applicantUserId && actorUserId === app.applicantUserId)
  if (!isApplicant) return app as unknown as Record<string, unknown>
  return { ...app, documents: app.documents.filter((d) => d.key === key) } as unknown as Record<string, unknown>
}
