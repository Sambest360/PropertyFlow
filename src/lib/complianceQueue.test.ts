import { describe, expect, it } from 'vitest'
import { buildComplianceVerificationQueue } from './complianceQueue'
import { canSeeAgency } from './agencyScope'

const clientUuid = '7515d803-1111-4111-8111-111111111111'

describe('buildComplianceVerificationQueue (FW-15)', () => {
  it('lists pending landlords and contractors in scope', () => {
    const rows = buildComplianceVerificationQueue(
      [
        {
          id: 'u-ll',
          name: 'Pat Owner',
          email: 'p@example.test',
          role: 'landlord',
          agencyId: 'ag-vision',
          verification: { status: 'pending', submittedAt: '2026-10-01T00:00:00.000Z' },
        },
        {
          id: 'u-c',
          name: 'Fix Co',
          email: 'c@example.test',
          role: 'contractor',
          agencyId: 'ag-vision',
          verification: { status: 'pending' },
        },
        {
          id: 'u-ok',
          name: 'Approved',
          email: 'a@example.test',
          role: 'landlord',
          agencyId: 'ag-vision',
          verification: { status: 'approved' },
        },
      ],
      () => true,
    )
    expect(rows.map((r) => r.userId)).toEqual(['u-ll', 'u-c'])
  })

  it('agency scope uses FE id space (session UUID vs user ag-*)', () => {
    const users = [
      {
        id: 'u-ll',
        name: 'Pat Owner',
        email: 'p@example.test',
        role: 'landlord' as const,
        agencyId: 'ag-vision',
        verification: { status: 'pending' as const },
      },
    ]
    const inScope = (u: { agencyId: string | null | undefined }) =>
      canSeeAgency('client_admin', clientUuid, false, u.agencyId, {
        agencies: [{ id: 'ag-vision' }],
        bootstrapAgencyId: 'ag-vision',
      })
    expect(buildComplianceVerificationQueue(users, inScope)).toHaveLength(1)
    expect(
      buildComplianceVerificationQueue(users, (u) => u.agencyId === clientUuid),
    ).toHaveLength(0)
  })
})
