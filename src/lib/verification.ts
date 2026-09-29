/**
 * Landlord / contractor onboarding verification helpers.
 */

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'not_required'

export type VerificationDocument = {
  key: string
  label: string
  name: string
  mimeType: string
  /** Legacy data URL, or a `pfstore:v1:` ref after upload. */
  dataUrl: string
  fileId?: string
  uploadedAt: string
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
