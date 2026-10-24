import { describe, expect, it } from 'vitest'
import type { Tenancy } from '../../types/domain'
import { daysLabel, daysUntil, renewalSnapshot } from './renewalStatus'

function tenancy(overrides: Partial<Tenancy> = {}): Tenancy {
  return {
    id: 'TN-1',
    agencyId: 'ag-1',
    propertyId: 'PR-1',
    landlordId: 'u-ll',
    agentId: 'u-ag',
    applicationId: 'APP-1',
    tenantUserId: 'u-tn',
    tenantName: 'Ada Tenant',
    tenantEmail: 'ada@example.com',
    startDate: '2025-11-01',
    endDate: '2026-10-31',
    rent: 10_000,
    deposit: 20_000,
    rentDueDay: 1,
    status: 'Active',
    keyCollection: { location: 'Office', instructions: '', contactName: 'Agent', contactPhone: '' },
    ...overrides,
  }
}

describe('renewalSnapshot', () => {
  it('suggests nothing for a lease far from its end', () => {
    const s = renewalSnapshot(tenancy({ endDate: '2027-12-31' }), '2026-01-10')
    expect(s.nextStep).toBe('none')
    expect(s.electionLabel).toBe('No decision yet')
  })

  it('prompts an offer inside 90 days when no notice is due', () => {
    // Window for a 31 Oct end closes ~40 business days before, so pick a date after the notice was sent.
    const t = tenancy({
      renewalOps: {
        election: 'none',
        offeredAt: null,
        offeredEndDate: null,
        offeredRent: null,
        offeredTermMonths: 12,
        acceptedAt: null,
        declinedAt: null,
        noticeGivenAt: null,
        monthToMonthNote: null,
        cpaNotice: { windowOpen: null, windowClose: null, noticeSentAt: '2026-08-01', late: false, lateFlagNote: null },
        auditNotes: [],
      },
    })
    const s = renewalSnapshot(t, '2026-08-20')
    expect(s.notice.state).toBe('sent')
    expect(s.nextStep).toBe('offer')
  })

  it('flags a due rent increase and previews the new rent', () => {
    const t = tenancy({
      endDate: '2027-12-31',
      billingSchedule: { escalationPct: 5, nextEscalationOn: '2026-01-01' } as Tenancy['billingSchedule'],
    })
    const s = renewalSnapshot(t, '2026-01-10')
    expect(s.escalation.due).toBe(true)
    expect(s.escalation.newRent).toBe(10_500)
    expect(s.nextStep).toBe('escalate')
  })

  it('puts an ended lease with no decision first', () => {
    const s = renewalSnapshot(tenancy({ endDate: '2026-01-01' }), '2026-01-10')
    expect(s.nextStep).toBe('month_to_month')
    expect(s.urgency).toBe(0)
  })
})

describe('day helpers', () => {
  it('counts and labels days to lease end', () => {
    expect(daysUntil('2026-01-11', '2026-01-10')).toBe(1)
    expect(daysLabel(1)).toBe('in 1 day')
    expect(daysLabel(0)).toBe('Ends today')
    expect(daysLabel(-3)).toBe('ended 3 days ago')
    expect(daysLabel(null)).toBe('No end date')
  })
})
