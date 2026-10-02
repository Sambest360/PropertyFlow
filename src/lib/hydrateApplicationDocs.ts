/**
 * P0 Approve→occupancy: hydrate document checklist (+ credit fields) from
 * applications.uploaded_docs_json. Invalid / missing JSON → blank checklist
 * template — never invent verified statuses.
 */
import type { Application, ApplicationDocument } from '../types/domain'
import { buildDocumentChecklist, ensureApplicationDocuments } from './workflow'

export type UploadedDocsPayload = {
  documents?: unknown
  creditCheck?: unknown
  creditConsent?: unknown
  screening?: unknown
}

function isDocStatus(v: unknown): v is ApplicationDocument['status'] {
  return v === 'required' || v === 'uploaded' || v === 'verified' || v === 'rejected'
}

function parseDocumentRow(raw: unknown): ApplicationDocument | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const key = typeof row.key === 'string' ? row.key : null
  if (!key) return null
  const status = isDocStatus(row.status) ? row.status : 'required'
  const label = typeof row.label === 'string' && row.label ? row.label : key
  const out: ApplicationDocument = { key, label, status }
  if (typeof row.note === 'string') out.note = row.note
  if (typeof row.rejectedReason === 'string') out.rejectedReason = row.rejectedReason
  if (typeof row.reviewedAt === 'string') out.reviewedAt = row.reviewedAt
  if (typeof row.reviewedBy === 'string') out.reviewedBy = row.reviewedBy
  if (row.file && typeof row.file === 'object' && !Array.isArray(row.file)) {
    out.file = row.file as ApplicationDocument['file']
  }
  return out
}

/** Parse uploaded_docs_json column (object or JSON string). Invalid → null. */
export function parseUploadedDocsJson(raw: unknown): UploadedDocsPayload | null {
  if (raw == null) return null
  let value: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return null
    try {
      value = JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UploadedDocsPayload
}

/**
 * Build checklist from durable uploaded_docs_json + type template.
 * Never invents verified — unknown/invalid statuses fall back to required.
 */
export function hydrateDocumentsFromUploadedJson(
  type: Application['type'],
  uploadedDocsJson: unknown,
): {
  documents: ApplicationDocument[]
  creditCheck?: Application['creditCheck']
  creditConsent?: Application['creditConsent']
  screening?: Application['screening']
} {
  const parsed = parseUploadedDocsJson(uploadedDocsJson)
  if (!parsed) {
    return { documents: buildDocumentChecklist(type) }
  }

  const fromJson: ApplicationDocument[] = []
  if (Array.isArray(parsed.documents)) {
    for (const row of parsed.documents) {
      const doc = parseDocumentRow(row)
      if (doc) fromJson.push(doc)
    }
  }

  const documents = ensureApplicationDocuments({ type, documents: fromJson })

  const creditCheck =
    typeof parsed.creditCheck === 'string' && parsed.creditCheck
      ? (parsed.creditCheck as Application['creditCheck'])
      : undefined
  const creditConsent =
    typeof parsed.creditConsent === 'boolean' ? parsed.creditConsent : undefined
  const screening =
    parsed.screening && typeof parsed.screening === 'object' && !Array.isArray(parsed.screening)
      ? (parsed.screening as Application['screening'])
      : undefined

  return { documents, creditCheck, creditConsent, screening }
}
