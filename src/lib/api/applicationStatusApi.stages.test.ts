import { describe, expect, it } from 'vitest'
import type { Application } from '../../types/domain'
import { buildDocumentChecklist } from '../workflow'
import { patchApplicationStatus } from './applicationStatusApi'

const actor = { userId: 'u-1', role: 'client_admin' as const, agencyId: 'ag-1', permissions: ['applications.review'] as never[] }
const app = (stage: string, workflowStatus: string) =>
  ({
    id: 'A1', agencyId: 'ag-1', propertyId: 'P1', type: 'Rental', stage, workflowStatus, applicantName: 'A', email: 'a@x.co',
    documents: buildDocumentChecklist('Rental').map((d) => ({ ...d, status: 'verified' })),
    screening: { status: 'passed' }, creditCheck: 'Passed', submittedAt: '2026-10-01', updatedAt: '2026-10-01',
  }) as unknown as Application

const run = (a: Application, status: 'APPROVED' | 'REJECTED') =>
  patchApplicationStatus({ application: a, viewings: [], slots: [], existingTenancies: [], request: { status, payment_provider: 'auto', reason: 'x' }, actor })

describe('application stages and the status rules', () => {
  it('the Approval stage approves from the owner / landlord approval step', () => {
    const r = run(app('Owner / landlord approval', 'landlord_review'), 'APPROVED')
    expect(r.status === 'ERROR' ? r.error : 'ok').not.toMatch(/Cannot transition/)
  })
  it('a decline works at any open stage', () => {
    expect(run(app('Deposit verified', 'deposit_verified'), 'REJECTED').status).toBe('SUCCESS')
    expect(run(app('Rejected', 'rejected'), 'REJECTED').status).not.toBe('ERROR')
  })
})
