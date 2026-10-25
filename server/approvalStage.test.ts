import { describe, expect, it, vi } from 'vitest'

// An application at Documents uploaded with no lease yet (as at approval time).
const query = vi.fn(async (sql: string) =>
  sql.includes("metadata->>'workflow_status'") ? [{ workflow_status: 'documents_uploaded' }] : [],
)
vi.mock('./db.js', () => ({ query: (sql: string, p?: unknown[]) => query(sql, p as never) }))
vi.mock('./entityMap.js', () => ({ resolveUuid: vi.fn(async () => '00000000-0000-4000-8000-000000000001') }))

describe('approval landing stage vs the lease-signing gate', () => {
  it('lets staff save an approval at Lease generated before anyone has signed', async () => {
    const { enforceStaffSignedStageMove } = await import('./applicantApplicationPolicy.js')
    await expect(
      enforceStaffSignedStageMove({
        resource: 'application',
        action: 'upsert',
        id: 'APP-1',
        data: { type: 'Rental', workflowStatus: 'lease_generated' },
      }),
    ).resolves.toBeUndefined()
  })

  it('refuses Deposit invoice issued without a signed lease (the old approval landing)', async () => {
    const { enforceStaffSignedStageMove } = await import('./applicantApplicationPolicy.js')
    await expect(
      enforceStaffSignedStageMove({
        resource: 'application',
        action: 'upsert',
        id: 'APP-1',
        data: { type: 'Rental', workflowStatus: 'deposit_invoice_sent' },
      }),
    ).rejects.toMatchObject({ status: 409 })
  })
})

describe('applicant document hand-in', () => {
  it('allows Send documents for review from Application submitted as well as Documents requested', async () => {
    const { applicantMoveAllowed } = await import('./applicantApplicationPolicy.js')
    expect(applicantMoveAllowed('Rental', 'application_submitted', 'documents_uploaded')).toBe(true)
    expect(applicantMoveAllowed('Rental', 'documents_requested', 'documents_uploaded')).toBe(true)
    expect(applicantMoveAllowed('Rental', 'application_submitted', 'fica_verification')).toBe(false)
  })
})
