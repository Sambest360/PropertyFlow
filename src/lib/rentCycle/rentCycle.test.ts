import { describe, expect, it } from 'vitest'
import type { PaymentRecord, Tenancy } from '../../types/domain'
import {
  appendDunningNotes,
  buildDunningNotice,
  canSendDunningNotice,
  clampRentDueDay,
  dunningStageForDays,
  hasRentRow,
  nextMonthDueDate,
  planNextRentPayments,
  planOverdueEscalations,
  planRentCycle,
  rentPeriodKey,
  targetRentDueDate,
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
    startDate: '2026-06-01',
    endDate: null,
    rent: 12_500,
    deposit: 25_000,
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

function payment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'PAY-1',
    agencyId: 'ag-1',
    propertyId: 'PR-1',
    applicationId: 'APP-1',
    tenancyId: 'TN-1',
    partyName: 'Ada Tenant',
    partyUserId: 'u-tn',
    type: 'Rent',
    amount: 12_500,
    status: 'Due',
    dueDate: '2026-09-01',
    paidAt: null,
    method: null,
    landlordVisible: true,
    ...overrides,
  }
}

describe('clampRentDueDay / due dates from rent_due_day', () => {
  it('clamps to 1–28', () => {
    expect(clampRentDueDay(undefined)).toBe(1)
    expect(clampRentDueDay(0)).toBe(1)
    expect(clampRentDueDay(29)).toBe(28)
    expect(clampRentDueDay(15)).toBe(15)
  })

  it('keys by YYYY-MM', () => {
    expect(rentPeriodKey('2026-10-01')).toBe('2026-10')
  })

  it('uses rentDueDay for asOf month (not start-date DOM)', () => {
    expect(targetRentDueDate(tenancy({ rentDueDay: 1 }), '2026-10-15')).toBe('2026-10-01')
    expect(targetRentDueDate(tenancy({ rentDueDay: 7 }), '2026-10-15')).toBe('2026-10-07')
  })

  it('rolls forward past lease start without inventing start DOM', () => {
    // Mid-month start; due day 1 of start month is before start → next month
    expect(
      targetRentDueDate(tenancy({ startDate: '2026-05-15', rentDueDay: 1 }), '2026-05-20'),
    ).toBe('2026-06-01')
  })

  it('next month preserves rent due day', () => {
    expect(nextMonthDueDate('2026-12-07', 7)).toBe('2027-01-07')
  })
})

describe('planNextRentPayments', () => {
  it('schedules current + next month using rentDueDay', () => {
    const planned = planNextRentPayments({
      tenancies: [tenancy({ rentDueDay: 1 })],
      payments: [],
      asOf: '2026-10-05',
    })
    expect(planned.map((p) => p.dueDate)).toEqual(['2026-10-01', '2026-11-01'])
    expect(planned.every((p) => p.type === 'Rent' && p.status === 'Due')).toBe(true)
    expect(planned[0]?.notes).toMatch(/Non-production: in-app notice/)
  })

  it('is idempotent per (tenancyId, dueDate, RENT) — skips manual Add payment rows', () => {
    const existing = payment({ type: 'Rent', dueDate: '2026-10-01', status: 'Due' })
    const planned = planNextRentPayments({
      tenancies: [tenancy()],
      payments: [existing],
      asOf: '2026-10-05',
    })
    expect(planned.map((p) => p.dueDate)).toEqual(['2026-11-01'])
  })

  it('does not treat First Month Rent as blocking a different dueDate Rent row', () => {
    // Same due date First Month Rent does not match RENT idempotency key —
    // but same dueDate + type Rent would. First Month on different date is fine.
    const fmr = payment({ type: 'First Month Rent', dueDate: '2026-06-05', status: 'Paid' })
    expect(hasRentRow([fmr], 'TN-1', '2026-06-05')).toBe(false)
    const planned = planNextRentPayments({
      tenancies: [tenancy({ startDate: '2026-06-01' })],
      payments: [fmr],
      asOf: '2026-06-10',
    })
    expect(planned.some((p) => p.dueDate === '2026-06-01')).toBe(true)
  })

  it('ignores non-Active and zero-rent tenancies', () => {
    const planned = planNextRentPayments({
      tenancies: [
        tenancy({ status: 'Pending Move-In' }),
        tenancy({ id: 'TN-2', rent: 0 }),
        tenancy({ id: 'TN-3', status: 'Ended' }),
      ],
      payments: [],
      asOf: '2026-10-05',
    })
    expect(planned).toEqual([])
  })

  it('hasRentRow matches exact due_date + RENT', () => {
    expect(hasRentRow([payment()], 'TN-1', '2026-09-01')).toBe(true)
    expect(hasRentRow([payment()], 'TN-1', '2026-10-01')).toBe(false)
    expect(hasRentRow([payment({ status: 'Cancelled' })], 'TN-1', '2026-09-01')).toBe(false)
  })
})

describe('planOverdueEscalations', () => {
  it('marks Due past asOf as Overdue', () => {
    const esc = planOverdueEscalations(
      [payment({ dueDate: '2026-09-01' }), payment({ id: 'PAY-2', dueDate: '2026-10-15' })],
      '2026-10-05',
    )
    expect(esc).toHaveLength(1)
    expect(esc[0]?.paymentId).toBe('PAY-1')
    expect(esc[0]?.toStatus).toBe('Overdue')
    expect(esc[0]?.daysPastDue).toBeGreaterThan(0)
  })

  it('does not escalate Paid or already Overdue', () => {
    expect(
      planOverdueEscalations(
        [
          payment({ status: 'Paid', paidAt: '2026-09-02' }),
          payment({ id: 'PAY-2', status: 'Overdue' }),
        ],
        '2026-10-05',
      ),
    ).toEqual([])
  })
})

describe('dunning', () => {
  it('stages by day thresholds', () => {
    expect(dunningStageForDays(2)).toBeNull()
    expect(dunningStageForDays(3)).toBe('reminder_1')
    expect(dunningStageForDays(7)).toBe('reminder_2')
    expect(dunningStageForDays(14)).toBe('final')
  })

  it('builds honest in-app notice', () => {
    const draft = buildDunningNotice({
      payment: payment({ status: 'Overdue', dueDate: '2026-09-01' }),
      propertyTitle: 'Humewood B12',
      asOf: '2026-09-10',
      amountLabel: 'R12,500',
    })
    expect(draft?.stage).toBe('reminder_2')
    expect(draft?.nonProduction).toBe(true)
    expect(draft?.channel).toBe('in_app')
    expect(draft?.body).toMatch(/Non-production: in-app notice/)
    expect(draft?.notesLine).toMatch(/\[Dunning/)
  })

  it('canSendDunningNotice requires past-due rent-like line', () => {
    expect(canSendDunningNotice(payment({ status: 'Overdue', dueDate: '2026-09-01' }), '2026-10-01')).toBe(
      true,
    )
    expect(canSendDunningNotice(payment({ status: 'Due', dueDate: '2026-10-15' }), '2026-10-01')).toBe(
      false,
    )
    expect(
      canSendDunningNotice(payment({ type: 'Commission', status: 'Overdue', dueDate: '2026-09-01' }), '2026-10-01'),
    ).toBe(false)
  })

  it('appendDunningNotes stacks lines', () => {
    expect(appendDunningNotes(null, 'line-a')).toBe('line-a')
    expect(appendDunningNotes('old', 'line-b')).toBe('old\nline-b')
  })
})

describe('planRentCycle', () => {
  it('returns both escalations and new rents', () => {
    const plan = planRentCycle({
      tenancies: [tenancy()],
      payments: [payment({ dueDate: '2026-08-01' })],
      asOf: '2026-10-05',
    })
    expect(plan.escalations).toHaveLength(1)
    expect(plan.newRents.length).toBeGreaterThanOrEqual(1)
  })
})
