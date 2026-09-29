const PENDING_DOCS_KEY = 'pf-pending-verification-docs'

export type PendingRegistrationDocs = {
  email: string
  role: string
  profile?: Record<string, unknown>
  documents: import('../verification').VerificationDocument[]
}

export function stashPendingRegistrationDocs(payload: PendingRegistrationDocs) {
  try {
    sessionStorage.setItem(PENDING_DOCS_KEY, JSON.stringify(payload))
  } catch {
    /* quota exceeded — docs must be re-uploaded after sign-in */
  }
}

export function readPendingRegistrationDocs(email: string): PendingRegistrationDocs | null {
  try {
    const raw = sessionStorage.getItem(PENDING_DOCS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingRegistrationDocs
    if (parsed.email.toLowerCase() !== email.trim().toLowerCase()) return null
    return parsed
  } catch {
    return null
  }
}

export function clearPendingRegistrationDocs() {
  try {
    sessionStorage.removeItem(PENDING_DOCS_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Per-document upload cap for ID and verification docs. 800 KB keeps the
 * data-URL payload small enough to attach after signup.
 */
export const REGISTRATION_DOC_MAX_BYTES = 800 * 1024
export const REGISTRATION_DOCS_MAX_TOTAL_BYTES = 3 * REGISTRATION_DOC_MAX_BYTES

/** Human-readable form of the per-doc cap, e.g. "800 KB". */
export function formatDocSizeLabel(bytes = REGISTRATION_DOC_MAX_BYTES): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024)
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`
  }
  return `${Math.round(bytes / 1024)} KB`
}

export function registrationDocsPayloadBytes(
  documents: readonly { dataUrl: string }[],
): number {
  return documents.reduce((sum, doc) => sum + doc.dataUrl.length, 0)
}

export function validateRegistrationDocSizes(
  documents: readonly { dataUrl: string; label: string }[],
): string | null {
  const maxLabel = formatDocSizeLabel()
  for (const doc of documents) {
    if (doc.dataUrl.length > REGISTRATION_DOC_MAX_BYTES * 1.4) {
      return `File too large. ${doc.label} must be under ${maxLabel}.`
    }
  }
  if (registrationDocsPayloadBytes(documents) > REGISTRATION_DOCS_MAX_TOTAL_BYTES) {
    return `File too large. Combined uploads must stay under ${maxLabel} each.`
  }
  return null
}
