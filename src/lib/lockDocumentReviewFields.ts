/** Shared applicant document merge (browser-safe — no server imports). */

type Row = Record<string, unknown>

function asRow(v: unknown): Row | null {
  if (typeof v === 'string') {
    try {
      return asRow(JSON.parse(v))
    } catch {
      return null
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null
}

const REVIEW_FIELDS = ['reviewedBy', 'reviewedAt', 'rejectedReason', 'note', 'lookedAt'] as const

function fileKey(f: unknown): string | null {
  const r = asRow(f)
  if (!r) return null
  return `${String(r.dataUrl ?? '')}|${String(r.uploadedAt ?? '')}|${String(r.name ?? '')}`
}

/**
 * Lock document review fields for a portal write: review state comes from the
 * stored document; a new upload becomes `uploaded` with review fields cleared.
 */
export function lockDocumentReviewFields(sent: unknown, storedDocs: Row[]): unknown {
  if (!Array.isArray(sent)) return sent
  const out = sent.map((raw) => {
    const doc = asRow(raw)
    if (!doc) return raw
    const prev = storedDocs.find((d) => d && d.key === doc.key) ?? null
    const next: Row = { ...doc }
    const newUpload = doc.file != null && fileKey(doc.file) !== fileKey(prev?.file)
    if (newUpload) {
      next.status = 'uploaded'
      for (const k of REVIEW_FIELDS) delete next[k]
      return next
    }
    next.status = prev?.status ?? (doc.file != null || prev?.file != null ? 'uploaded' : 'required')
    for (const k of REVIEW_FIELDS) {
      if (prev && prev[k] !== undefined) next[k] = prev[k]
      else delete next[k]
    }
    return next
  })
  const sentKeys = new Set(out.map((d) => asRow(d)?.key))
  for (const prev of storedDocs) if (prev && !sentKeys.has(prev.key)) out.push(prev)
  return out
}
