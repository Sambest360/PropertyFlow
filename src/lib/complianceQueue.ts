import type { AppUser } from '../types/domain'

export type ComplianceVerificationRow = {
  userId: string
  name: string
  email: string
  role: string
  status: 'pending' | 'rejected'
  submittedAt?: string
  reviewedAt?: string
  rejectNote?: string
}

type QueueUser = Pick<AppUser, 'id' | 'name' | 'email' | 'role' | 'agencyId' | 'verification'>

function isVerificationRole(role: string): boolean {
  return role === 'landlord' || role === 'contractor'
}

/** Landlords / contractors awaiting principal verification (compliance dashboard). */
export function buildComplianceVerificationQueue(
  users: readonly QueueUser[],
  inScope: (user: QueueUser) => boolean,
): ComplianceVerificationRow[] {
  return users
    .filter(
      (u) =>
        inScope(u) &&
        isVerificationRole(u.role) &&
        u.verification?.status === 'pending',
    )
    .map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email ?? '',
      role: u.role,
      status: 'pending' as const,
      submittedAt: u.verification?.submittedAt,
    }))
    .sort((a, b) => {
      const at = a.submittedAt ? Date.parse(a.submittedAt) : 0
      const bt = b.submittedAt ? Date.parse(b.submittedAt) : 0
      if (bt !== at) return bt - at
      return a.name.localeCompare(b.name)
    })
}

/** Declined landlord / contractor verifications (read-only history). */
export function buildComplianceRejectedVerifications(
  users: readonly QueueUser[],
  inScope: (user: QueueUser) => boolean,
): ComplianceVerificationRow[] {
  return users
    .filter(
      (u) =>
        inScope(u) &&
        isVerificationRole(u.role) &&
        u.verification?.status === 'rejected',
    )
    .map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email ?? '',
      role: u.role,
      status: 'rejected' as const,
      submittedAt: u.verification?.submittedAt,
      reviewedAt: u.verification?.reviewedAt,
      rejectNote: u.verification?.rejectNote,
    }))
    .sort((a, b) => {
      const at = a.reviewedAt ? Date.parse(a.reviewedAt) : 0
      const bt = b.reviewedAt ? Date.parse(b.reviewedAt) : 0
      if (bt !== at) return bt - at
      return a.name.localeCompare(b.name)
    })
}
