import { describe, expect, it } from 'vitest'
import {
  buildComplianceRejectedVerifications,
  buildComplianceVerificationQueue,
} from './complianceQueue'

const users = [
  {
    id: 'LL-1',
    name: 'Pending Landlord',
    email: 'p@example.com',
    role: 'landlord' as const,
    agencyId: 'AG-1',
    verification: { status: 'pending' as const, submittedAt: '2026-10-01' },
  },
  {
    id: 'LL-2',
    name: 'Rejected Landlord',
    email: 'r@example.com',
    role: 'landlord' as const,
    agencyId: 'AG-1',
    verification: {
      status: 'rejected' as const,
      reviewedAt: '2026-10-10',
      rejectNote: 'Incomplete documents',
    },
  },
  {
    id: 'T-1',
    name: 'Tenant',
    email: 't@example.com',
    role: 'tenant' as const,
    agencyId: 'AG-1',
    verification: { status: 'pending' as const },
  },
  {
    id: 'LL-3',
    name: 'Other agency',
    email: 'o@example.com',
    role: 'landlord' as const,
    agencyId: 'AG-2',
    verification: { status: 'pending' as const },
  },
]

describe('complianceQueue', () => {
  const inScope = (u: { agencyId: string | null }) => u.agencyId === 'AG-1'

  it('buildComplianceVerificationQueue returns pending landlords/contractors in scope', () => {
    const queue = buildComplianceVerificationQueue(users, inScope)
    expect(queue).toHaveLength(1)
    expect(queue[0].userId).toBe('LL-1')
    expect(queue[0].status).toBe('pending')
  })

  it('buildComplianceRejectedVerifications returns rejected rows with notes', () => {
    const rejected = buildComplianceRejectedVerifications(users, inScope)
    expect(rejected).toHaveLength(1)
    expect(rejected[0].userId).toBe('LL-2')
    expect(rejected[0].rejectNote).toBe('Incomplete documents')
    expect(rejected[0].status).toBe('rejected')
  })
})
