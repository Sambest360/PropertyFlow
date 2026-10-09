import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PaymentRecord, Tenancy } from '../../types/domain'
import { seedArrearsSnapshots } from '../../data/seedTrust'
import {
  buildTenancyArrears,
  computeTenancyArrears,
  rentCentsForDue,
  resolveRentSchedule,
  scheduledDueDates,
} from './tenancyArrears'

function tenancy(over: Partial<Tenancy> = {}): Tenancy {
  return {
    id: 'TN-1',
    agencyId: 'ag-1',
    propertyId: 'p-1',
    landlordId: 'u-landlord',
    agentId: null,
    applicationId: null,
    tenantUserId: 'u-tenant',
    tenantName: 'Thandi Tenant',
    tenantEmail: 't@example.com',
    startDate: '2026-07-01',
    endDate: null,
    rent: 10000,
    deposit: 10000,
    rentDueDay: 1,
    status: 'Active',
    keyCollection: { location: '', instructions: '', contactName: '', contactPhone: '' },
    ...over,
  }
}

let payN = 0
function paid(amount: number, paidAt: string, over: Partial<PaymentRecord> = {}): PaymentRecord {
  payN += 1
  return {
    id: `PAY-${payN}`,
    agencyId: 'ag-1',
    propertyId: 'p-1',
    applicationId: null,
    tenancyId: 'TN-1',
    partyName: 'Thandi Tenant',
    partyUserId: 'u-tenant',
    type: 'Rent',
    amount,
    status: 'Paid',
    dueDate: paidAt,
    paidAt,
    method: 'EFT',
    landlordVisible: true,
    ...over,
  }
}

const AS_OF = '2026-10-09'

describe('CR9 tenancy arrears (due from schedule minus paid)', () => {
  it('due dates come from the rent schedule up to today', () => {
    const s = resolveRentSchedule(tenancy())!
    expect(scheduledDueDates(s, AS_OF)).toEqual(['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'])
  })

  it('arrears equals due minus paid for a tenancy with partial payments', () => {
    const payments = [paid(10000, '2026-07-02'), paid(10000, '2026-08-03'), paid(4000, '2026-09-05')]
    const row = computeTenancyArrears(tenancy(), payments, AS_OF)!
    expect(row.dueCents).toBe(4 * 10000 * 100)
    expect(row.paidCents).toBe(24000 * 100)
    expect(row.arrearsCents).toBe((40000 - 24000) * 100)
    // Oldest first: Sep short R6 000 (38 days), Oct R10 000 (8 days).
    expect(row.d30).toBe(10000 * 100)
    expect(row.d60).toBe(6000 * 100)
    expect(row.d90 + row.d90plus).toBe(0)
    expect(row.d30 + row.d60 + row.d90 + row.d90plus).toBe(row.arrearsCents)
  })

  it('arrears is zero for a tenancy that is fully paid', () => {
    const payments = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'].map((d) => paid(10000, d))
    const row = computeTenancyArrears(tenancy(), payments, AS_OF)!
    expect(row.dueCents).toBe(row.paidCents)
    expect(row.arrearsCents).toBe(0)
    expect(row.d30 + row.d60 + row.d90 + row.d90plus).toBe(0)
  })

  it('ignores unpaid, cancelled, deposit, other-tenancy and future-dated payments', () => {
    const payments = [
      paid(10000, '2026-07-01', { status: 'Due', paidAt: null }),
      paid(10000, '2026-07-01', { status: 'Cancelled' }),
      paid(10000, '2026-07-01', { type: 'Deposit' }),
      paid(10000, '2026-07-01', { tenancyId: 'TN-other' }),
      paid(10000, '2026-10-20'),
    ]
    const row = computeTenancyArrears(tenancy(), payments, AS_OF)!
    expect(row.paidCents).toBe(0)
    expect(row.arrearsCents).toBe(40000 * 100)
  })

  it('uses the saved billing schedule amount and day when present; paidAmount wins over amount', () => {
    const t = tenancy({
      billingSchedule: {
        id: 'BS-1', agencyId: 'ag-1', occupancyId: 'TN-1', chargeType: 'RENT', amountCents: 1_200_000,
        dayOfMonth: 5, startOn: '2026-08-10', endOn: null, escalationPct: null, nextEscalationOn: null,
        createdAt: '', updatedAt: '',
      },
    })
    const row = computeTenancyArrears(t, [paid(12000, '2026-09-05', { amount: 99999, paidAmount: 12000 })], AS_OF)!
    // Start month charged in full on the start date (10 Aug), then 5 Sep and 5 Oct.
    expect(row.dueCents).toBe(3 * 1_200_000)
    expect(row.arrearsCents).toBe(2 * 1_200_000)
  })

  it('a tenancy with no rent schedule gets no arrears row (no guess)', () => {
    expect(computeTenancyArrears(tenancy({ rent: 0 }), [], AS_OF)).toBeNull()
    expect(computeTenancyArrears(tenancy({ startDate: '' }), [], AS_OF)).toBeNull()
    expect(buildTenancyArrears({ tenancies: [tenancy({ rent: 0 })], payments: [], asOf: AS_OF })).toEqual([])
  })

  it('stops charging after the lease end date and scopes to the agency', () => {
    const ended = tenancy({ endDate: '2026-08-15', status: 'Ended' })
    expect(computeTenancyArrears(ended, [], AS_OF)!.dueCents).toBe(2 * 10000 * 100)
    const other = tenancy({ id: 'TN-2', agencyId: 'ag-2' })
    const rows = buildTenancyArrears({ tenancies: [tenancy(), other], payments: [], asOf: AS_OF, agencyId: 'ag-1' })
    expect(rows.map((r) => r.occupancyId)).toEqual(['TN-1'])
  })
})

describe('CR9 no seed arrears snapshot is read', () => {
  it('figures do not change when seed snapshots exist for the same occupancy', () => {
    expect(seedArrearsSnapshots.length).toBeGreaterThan(0)
    const snap = seedArrearsSnapshots[0]!
    const t = tenancy({ id: snap.occupancyId, agencyId: snap.agencyId })
    const payments = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'].map((d) =>
      paid(10000, d, { tenancyId: snap.occupancyId, agencyId: snap.agencyId }),
    )
    const [row] = buildTenancyArrears({ tenancies: [t], payments, asOf: AS_OF })
    expect(row!.arrearsCents).toBe(0)
    expect(row!.d30 + row!.d60 + row!.d90 + row!.d90plus).toBe(0)
  })

  it('arrears pages and the builder never reference arrearsSnapshots', () => {
    const root = resolve(__dirname, '../../..')
    for (const file of [
      'src/lib/trust/tenancyArrears.ts',
      'src/pages/trust/TrustArrears.tsx',
      'src/pages/trust/TrustDashboard.tsx',
    ]) {
      const src = readFileSync(resolve(root, file), 'utf8')
      expect(src, file).not.toMatch(/arrearsSnapshots|seedArrearsSnapshots|ArrearsSnapshot/)
      if (file.startsWith('src/pages')) expect(src, file).toMatch(/buildTenancyArrears\(/)
    }
  })
})

function schedule(over: Partial<NonNullable<Tenancy['billingSchedule']>>): NonNullable<Tenancy['billingSchedule']> {
  return {
    id: 'BS-1', agencyId: 'ag-1', occupancyId: 'TN-1', chargeType: 'RENT', amountCents: 1_000_000,
    dayOfMonth: 1, startOn: '2026-07-01', endOn: null, escalationPct: null, nextEscalationOn: null,
    createdAt: '', updatedAt: '', ...over,
  }
}

/** First of each month from start through end (inclusive), YYYY-MM-01. */
function monthsFrom(startYm: string, endYm: string): string[] {
  const out: string[] = []
  let [y, m] = startYm.split('-').map(Number) as [number, number]
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, '0')}`
    out.push(`${ym}-01`)
    if (ym === endYm) return out
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
}

describe('CR9 fix: each month charged at the rent that applied then', () => {
  // Jan 2025 lease at R10 000, +8% to R10 800 in Jan 2026; next increase Jan 2027.
  const escalated = tenancy({
    startDate: '2025-01-01',
    rent: 10800,
    billingSchedule: schedule({ amountCents: 1_080_000, startOn: '2025-01-01', escalationPct: 8, nextEscalationOn: '2027-01-01' }),
  })
  const months2025 = monthsFrom('2025-01', '2025-12')
  const months2026 = monthsFrom('2026-01', '2026-10')

  it('R10 000 → R10 800 lease paid in full every month at the right rent has 0 arrears as at 2026-10-09', () => {
    const payments = [...months2025.map((d) => paid(10000, d)), ...months2026.map((d) => paid(10800, d))]
    const row = computeTenancyArrears(escalated, payments, AS_OF)!
    expect(row.dueCents).toBe(12 * 1_000_000 + 10 * 1_080_000)
    expect(row.paidCents).toBe(row.dueCents)
    expect(row.arrearsCents).toBe(0)
    expect(row.d30 + row.d60 + row.d90 + row.d90plus).toBe(0)
  })

  it('partly paid variant: October unpaid and September short R800 gives R11 600 arrears', () => {
    const payments = [
      ...months2025.map((d) => paid(10000, d)),
      ...monthsFrom('2026-01', '2026-08').map((d) => paid(10800, d)),
      paid(10000, '2026-09-01'),
    ]
    const row = computeTenancyArrears(escalated, payments, AS_OF)!
    expect(row.arrearsCents).toBe((800 + 10800) * 100)
    expect(row.d30).toBe(10800 * 100) // 1 Oct, 8 days
    expect(row.d60).toBe(800 * 100) // 1 Sep, 38 days
    expect(row.d90 + row.d90plus).toBe(0)
  })

  it('walks back one 12-month step per year before the last increase; no escalation data uses current rent', () => {
    const s = resolveRentSchedule(escalated)!
    expect(rentCentsForDue(s, '2026-01-01')).toBe(1_080_000)
    expect(rentCentsForDue(s, '2025-12-01')).toBe(1_000_000)
    expect(rentCentsForDue(s, '2025-01-01')).toBe(1_000_000)
    expect(rentCentsForDue(s, '2024-12-01')).toBe(Math.round(1_080_000 / 1.08 ** 2))
    const flat = resolveRentSchedule(tenancy({ rent: 10800, startDate: '2025-01-01' }))!
    expect(rentCentsForDue(flat, '2025-03-01')).toBe(1_080_000)
    const noPct = resolveRentSchedule(tenancy({ billingSchedule: schedule({ amountCents: 1_080_000, nextEscalationOn: '2027-01-01' }) }))!
    expect(rentCentsForDue(noPct, '2025-03-01')).toBe(1_080_000)
  })
})

describe('CR9 fix: a mid-month start charges the start month in full', () => {
  it('start 15 Mar with due day 1 charges March at full rent', () => {
    const t = tenancy({ startDate: '2026-03-15', rentDueDay: 1 })
    const s = resolveRentSchedule(t)!
    const dues = scheduledDueDates(s, AS_OF)
    expect(dues[0]).toBe('2026-03-15')
    expect(dues).toEqual(['2026-03-15', '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'])
    const row = computeTenancyArrears(t, [], AS_OF)!
    expect(row.dueCents).toBe(8 * 10000 * 100)
    // Paying April–October only still leaves March owed in full.
    const payments = monthsFrom('2026-04', '2026-10').map((d) => paid(10000, d))
    expect(computeTenancyArrears(t, payments, AS_OF)!.arrearsCents).toBe(10000 * 100)
  })
})
