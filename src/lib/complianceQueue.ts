import type { AppUser } from '../types/domain'

export type ComplianceVerificationRow = {
  userId: string
  name: string
  email: string
  role: string
  status: 'pending'
  submittedAt?: string
}

type QueueUser = Pick<AppUser, 'id' | 'name' | 'email' | 'role' | 'agencyId' | 'verification'>

/** Landlords / contractors awaiting principal verification (compliance dashboard). */
export function buildComplianceVerificationQueue(
  users: readonly QueueUser[],
  inScope: (user: QueueUser) => boolean,
): ComplianceVerificationRow[] {
  return users
    .filter(
      (u) =>
        inScope(u) &&
        (u.role === 'landlord' || u.role === 'contractor') &&
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
