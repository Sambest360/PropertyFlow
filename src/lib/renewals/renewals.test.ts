import { describe, expect, it } from 'vitest'
import type { Tenancy } from '../../types/domain'
import {
  CPA_NOTICE_LATE_COPY,
  RENEWALS_MODE_A_COPY,
  acceptRenewalOnBook,
  addBusinessDays,
  applyEscalationOnBook,
  attemptLiveCpaDelivery,
  attemptLiveCpiFetch,
  buildCpaExpiryNotice,
  canSendCpaExpiryNotice,
  computeCpaNoticeWindow,
  declineRenewalOnBook,
  isEscalationDue,
  markMonthToMonthOnBook,
  needsMonthToMonthNote,
  offerRenewalOnBook,
  planDueEscalations,
  setEscalationOnBook,
  syncCpaNoticeClock,
  emptyRenewalOps,
} from './index'

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
    keyCollection: {
      location: 'Office',
      instructions: '',
      contactName: 'Agent',
      contactPhone: '',
    },
    ...overrides,
  }
}

describe('biz days + CPA notice clock', () => {
  it('addBusinessDays skips weekends', () => {
    // 2026-10-02 is Friday → +1 biz day = Mon 5th
    expect(addBusinessDays('2026-10-02', 1)).toBe('2026-10-05')
    expect(addBusinessDays('2026-10-05', -1)).toBe('2026-10-02')
  })

  it('computes ≈80–40 biz-day window before lease_end', () => {
    const w = computeCpaNoticeWindow('2026-10-31', '2026-07-01')
    expect(w).not.toBeNull()
    expect(w!.windowOpen).toBe(addBusinessDays('2026-10-31', -80))
    expect(w!.windowClose).toBe(addBusinessDays('2026-10-31', -40))
    expect(w!.windowOpen < w!.windowClose).toBe(true)
  })

  it('flags late only when past close without notice — copy is seek counsel', () => {
    const end = '2026-10-31'
    const pastClose = addBusinessDays(end, -39) // after close
    const ops = syncCpaNoticeClock(emptyRenewalOps(), end, pastClose)
    expect(ops.cpaNotice.late).toBe(true)
    expect(ops.cpaNotice.lateFlagNote).toBe(CPA_NOTICE_LATE_COPY)
    expect(ops.cpaNotice.lateFlagNote).toMatch(/seek counsel/i)
    expect(ops.cpaNotice.lateFlagNote).not.toMatch(/penalty|forfeit|void/i)
  })

  it('canSendCpaExpiryNotice after window opens (incl. late)', () => {
    const end = '2026-10-31'
    const open = addBusinessDays(end, -80)
    const before = addBusinessDays(end, -81)
    const ops = emptyRenewalOps()
    expect(canSendCpaExpiryNotice(end, ops, before)).toBe(false)
    expect(canSendCpaExpiryNotice(end, ops, open)).toBe(true)
    expect(canSendCpaExpiryNotice(null, ops, open)).toBe(false)
  })

  it('buildCpaExpiryNotice is in-app only and honest', () => {
    const draft = buildCpaExpiryNotice({
      tenantName: 'Ada',
      propertyTitle: 'Flat 1',
      leaseEnd: '2026-10-31',
      asOf: '2026-08-01',
      late: true,
    })
    expect(draft.channel).toBe('in_app')
    expect(draft.kind).toBe('cpa_expiry_notice')
    expect(draft.body).toMatch(/seek counsel/i)
    expect(draft.body).toMatch(/not CPA legal service/i)
    expect(draft.notesLine).toMatch(/cpa_expiry_notice/)
  })
})

describe('offer / accept / decline / month-to-month', () => {
  it('offerRenewalOnBook sets election offered without changing end/rent yet', () => {
    const t = offerRenewalOnBook(tenancy(), {
      asOf: '2026-08-01',
      offeredRent: 11_000,
      termMonths: 12,
    })
    expect(t.renewalOps?.election).toBe('offered')
    expect(t.renewalOps?.offeredRent).toBe(11_000)
    expect(t.endDate).toBe('2026-10-31')
    expect(t.rent).toBe(10_000)
    expect(t.renewalOps?.auditNotes.at(-1)).toMatch(/OFFER_RENEWAL/)
  })

  it('acceptRenewalOnBook extends term + rent on book', () => {
    const offered = offerRenewalOnBook(tenancy(), {
      asOf: '2026-08-01',
      offeredEndDate: '2027-10-31',
      offeredRent: 11_000,
    })
    const { tenancy: next, newEndDate, newRent } = acceptRenewalOnBook(offered, '2026-08-15')
    expect(newEndDate).toBe('2027-10-31')
    expect(newRent).toBe(11_000)
    expect(next.endDate).toBe('2027-10-31')
    expect(next.rent).toBe(11_000)
    expect(next.renewalOps?.election).toBe('accepted')
    expect(next.billingSchedule?.amountCents).toBe(1_100_000)
  })

  it('declineRenewalOnBook records notice_given', () => {
    const offered = offerRenewalOnBook(tenancy(), { asOf: '2026-08-01' })
    const { tenancy: next, noticeGivenAt } = declineRenewalOnBook(offered, '2026-08-20')
    expect(next.renewalOps?.election).toBe('declined')
    expect(next.renewalOps?.noticeGivenAt).toBe(noticeGivenAt)
    expect(next.endDate).toBe('2026-10-31') // lease end unchanged
  })

  it('no election past lease_end → month-to-month note (not auto 12-mo)', () => {
    const t = tenancy({ endDate: '2026-09-01', renewalOps: emptyRenewalOps() })
    expect(needsMonthToMonthNote(t, '2026-10-01')).toBe(true)
    const next = markMonthToMonthOnBook(t, '2026-10-01')
    expect(next.renewalOps?.election).toBe('month_to_month')
    expect(next.renewalOps?.monthToMonthNote).toMatch(/month-to-month/i)
    expect(next.renewalOps?.monthToMonthNote).toMatch(/not an auto-signed new 12-mo/i)
    expect(next.endDate).toBe('2026-09-01') // does not invent new fixed end
  })
})

describe('scheduled escalation (not live CPI)', () => {
  it('set + apply escalationPct / nextEscalationOn on book', () => {
    let t = setEscalationOnBook(tenancy({ rent: 10_000 }), {
      escalationPct: 5,
      nextEscalationOn: '2026-10-01',
      asOf: '2026-09-01',
    })
    expect(t.billingSchedule?.escalationPct).toBe(5)
    expect(t.billingSchedule?.nextEscalationOn).toBe('2026-10-01')
    expect(t.billingSchedule?.amountCents).toBe(1_000_000)
    expect(isEscalationDue(t.billingSchedule, '2026-09-30')).toBe(false)
    expect(isEscalationDue(t.billingSchedule, '2026-10-01')).toBe(true)

    const applied = applyEscalationOnBook(t, '2026-10-01')
    expect(applied).not.toBeNull()
    expect(applied!.result.newRentZar).toBe(10_500)
    expect(applied!.tenancy.rent).toBe(10_500)
    expect(applied!.tenancy.billingSchedule?.amountCents).toBe(1_050_000)
    expect(applied!.tenancy.billingSchedule?.nextEscalationOn).toBe('2027-10-01')
  })

  it('planDueEscalations lists Active rows due', () => {
    const t = setEscalationOnBook(tenancy(), {
      escalationPct: 8,
      nextEscalationOn: '2026-06-01',
      asOf: '2026-05-01',
    })
    expect(planDueEscalations([t], '2026-06-01')).toHaveLength(1)
    expect(planDueEscalations([t], '2026-05-01')).toHaveLength(0)
  })
})

describe('honesty / refuse-closed', () => {
  it('Mode A copy denies CPA legal / live notice / live CPI', () => {
    const c = RENEWALS_MODE_A_COPY.toLowerCase()
    expect(c).toMatch(/not cpa legal service/)
    expect(c).toMatch(/not live notice/)
    expect(c).toMatch(/not live cpi/)
  })

  it('live CPA delivery and CPI HTTP refuse-closed', () => {
    const d = attemptLiveCpaDelivery('whatsapp')
    expect(d.ok).toBe(false)
    expect(d.refused).toBe(true)
    expect(d.reason.toLowerCase()).toMatch(/refuse-closed|in-app/)
    const c = attemptLiveCpiFetch()
    expect(c.ok).toBe(false)
    expect(c.reason.toLowerCase()).toMatch(/cpi|refuse/)
  })
})
