import type { Application } from '../types/domain'
import { allDocsUploaded } from './workflow'
import { applyWorkflowTransition, normalizeApplication, resolveWorkflowStatus } from './applicationWorkflow'
import { appendWorkflowEvent } from './applicationWorkflowEvents'
import { captureScreeningConsent } from './screening/pipeline'

/** P3b: per-file cap for application documents (images: measured after downscaling). */
export const APPLICATION_DOC_MAX_BYTES = 2 * 1024 * 1024
export const APPLICATION_DOC_TOO_LARGE =
  'This file is larger than 2 MB. Upload a smaller copy.'
export const APPLICATION_DOC_WRONG_TYPE = 'Upload a PDF, JPEG or PNG file.'
export const APPLICATION_DOC_ACCEPT = 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png'

const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])
const ALLOWED_EXT = /\.(pdf|jpe?g|png)$/i

/** Null when the file type may be uploaded, else the refusal copy. */
export function applicationDocTypeError(file: { type?: string; name?: string }): string | null {
  const typeOk = file.type ? ALLOWED_TYPES.has(file.type) : ALLOWED_EXT.test(file.name ?? '')
  return typeOk ? null : APPLICATION_DOC_WRONG_TYPE
}

/** Decoded byte size of a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',')
  const body = i >= 0 ? dataUrl.slice(i + 1) : dataUrl
  const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((body.length * 3) / 4) - pad)
}

/** Null when the file may be uploaded, else the refusal copy. Images: pass the size after downscaling. */
export function applicationDocFileError(file: { size: number; type?: string; name?: string }): string | null {
  const typeError = applicationDocTypeError(file)
  if (typeError) return typeError
  if (file.size > APPLICATION_DOC_MAX_BYTES) return APPLICATION_DOC_TOO_LARGE
  return null
}

export type UploadedDocFile = { name: string; mimeType: string; dataUrl: string }

/** P3b: the store's upload step as a pure function (doc set to uploaded, stage moves when all are in). */
export function applyDocumentUpload(
  a: Application,
  key: string,
  file: UploadedDocFile,
  actor?: { userId?: string; name?: string } | null,
  now: Date = new Date(),
): Application {
  const documents = a.documents.map((d) =>
    d.key === key
      ? {
          ...d,
          status: 'uploaded' as const,
          file: {
            name: file.name,
            mimeType: file.mimeType,
            dataUrl: file.dataUrl,
            uploadedAt: now.toISOString(),
            uploadedBy: actor?.name ?? a.applicantName,
          },
          rejectedReason: undefined,
        }
      : d,
  )
  const uploaded = allDocsUploaded(documents)
  let next = appendWorkflowEvent(
    { ...a, documents },
    {
      stage: resolveWorkflowStatus(a),
      actionKey: 'DOC_UPLOADED',
      actorUserId: actor?.userId ?? a.applicantUserId,
      actorName: actor?.name ?? a.applicantName,
      summary: `Uploaded ${documents.find((d) => d.key === key)?.label ?? key}`,
      payload: { documentKey: key, fileName: file.name },
    },
  )
  if (uploaded && resolveWorkflowStatus(a) === 'documents_requested') {
    next = applyWorkflowTransition({ ...next, documents }, 'documents_uploaded')
    next = appendWorkflowEvent(next, {
      stage: 'documents_uploaded',
      actionKey: 'UPLOAD_DOCS',
      actorUserId: actor?.userId ?? a.applicantUserId,
      actorName: actor?.name ?? a.applicantName,
      summary: 'All required documents uploaded',
    })
  } else {
    next = normalizeApplication({ ...next, documents })
  }
  let result: Application = {
    ...next,
    docs: documents.filter((d) => d.status !== 'required').map((d) => d.label),
    updatedAt: now.toISOString().slice(0, 10),
  }
  if (key === 'credit_consent') {
    result = captureScreeningConsent(result, {
      method: 'document',
      grantedBy: actor?.userId ?? a.applicantUserId ?? a.applicantName,
      note: `Consent document uploaded: ${file.name}`,
    })
  }
  return result
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
