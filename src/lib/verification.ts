/**
 * Landlord / contractor onboarding verification helpers.
 * Credit / bureau screening for applicants lives in `./screening` (roadmap Step 4).
 */

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'not_required'

export type VerificationDocument = {
  key: string
  label: string
  name: string
  mimeType: string
  dataUrl: string
  uploadedAt: string
  /** Set on this document when a reviewer opens it. Absent means not opened. */
  lookedAt?: string
}

export type LandlordVerificationProfile = {
  company?: string
  idNumberOrPassport: string
}

export type ContractorVerificationProfile = {
  company: string
  idNumberOrPassport: string
  trades: string[]
  serviceAreas: string[]
  taxNumberOrTcsPin?: string
}

export type VerificationProfile =
  | LandlordVerificationProfile
  | ContractorVerificationProfile
  | Record<string, unknown>

export type UserVerification = {
  status: VerificationStatus
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: string | null
  rejectNote?: string
  profile?: VerificationProfile
  documents?: VerificationDocument[]
}

export const CONTRACTOR_TRADES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'General maintenance',
  'Painting',
  'Carpentry',
  'Locksmith',
  'Gardening / landscaping',
] as const

export const LANDLORD_REQUIRED_DOCS: { key: string; label: string; required: boolean }[] = [
  { key: 'id_copy', label: 'ID or passport copy', required: true },
  { key: 'proof_of_address', label: 'Proof of residential address (≤ 3 months)', required: true },
  { key: 'proof_of_ownership', label: 'Proof of ownership or signed mandate', required: true },
  { key: 'bank_confirmation', label: 'Bank confirmation letter (optional)', required: false },
]

export const CONTRACTOR_REQUIRED_DOCS: { key: string; label: string; required: boolean }[] = [
  { key: 'id_copy', label: 'ID or passport copy', required: true },
  { key: 'proof_of_address', label: 'Proof of address (≤ 3 months)', required: true },
  { key: 'public_liability', label: 'Public liability insurance certificate', required: true },
  { key: 'coida', label: 'COIDA letter of good standing (if you employ others)', required: false },
  { key: 'trade_cert', label: 'Trade / CIDB / trade-test certificate (optional)', required: false },
]

/** Seeded / legacy users without verification metadata are treated as approved. */
export function isVerificationApproved(
  verification: UserVerification | null | undefined,
  role?: string,
): boolean {
  if (role === 'tenant' || role === 'applicant' || role === 'super_admin') return true
  if (!verification) return true
  if (verification.status === 'not_required') return true
  return verification.status === 'approved'
}

export function isVerificationPending(
  verification: UserVerification | null | undefined,
  role?: string,
): boolean {
  if (role !== 'landlord' && role !== 'contractor') return false
  return verification?.status === 'pending'
}

export function requiredDocsForRole(role: string) {
  if (role === 'landlord') return LANDLORD_REQUIRED_DOCS
  if (role === 'contractor') return CONTRACTOR_REQUIRED_DOCS
  return []
}

export function missingRequiredDocs(
  role: string,
  documents: VerificationDocument[],
): string[] {
  const required = requiredDocsForRole(role).filter((d) => d.required)
  const have = new Set(documents.map((d) => d.key))
  return required.filter((d) => !have.has(d.key)).map((d) => d.label)
}

/** Copy of the document list with lookedAt set on the opened document only. */
export function markDocumentLookedAt<T extends { key: string; lookedAt?: string }>(
  documents: readonly T[],
  documentKey: string,
  lookedAt: string,
): T[] {
  return documents.map((doc) => (doc.key === documentKey ? { ...doc, lookedAt } : doc))
}

export function documentOpenLabel(doc: { lookedAt?: string }): 'Not opened' | 'Looked at' {
  return doc.lookedAt ? 'Looked at' : 'Not opened'
}

/**
 * Approve and Decline stay available when there are no documents.
 * With documents, both stay disabled until every document has lookedAt.
 */
export function verificationDecisionsEnabled(
  documents: readonly { lookedAt?: string }[] | null | undefined,
): boolean {
  const docs = documents ?? []
  if (docs.length === 0) return true
  return docs.every((doc) => typeof doc.lookedAt === 'string' && doc.lookedAt.length > 0)
}

/**
 * Decision write used by updateUserVerification.
 * Spreads the stored verification so lookedAt on each document is kept.
 */
export function applyVerificationDecision<T extends { status: string; rejectNote?: string }>(
  prev: T,
  decision: {
    status: 'approved' | 'rejected'
    reviewedAt: string
    reviewedBy?: string | null
    rejectNote?: string
  },
): T & {
  status: 'approved' | 'rejected'
  reviewedAt: string
  reviewedBy: string | null
  rejectNote?: string
} {
  return {
    ...prev,
    status: decision.status,
    reviewedAt: decision.reviewedAt,
    reviewedBy: decision.reviewedBy ?? null,
    rejectNote:
      decision.status === 'rejected' ? decision.rejectNote?.trim() || 'Rejected' : undefined,
  }
}
