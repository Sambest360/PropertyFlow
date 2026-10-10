import { describe, expect, it } from 'vitest'
import type {
  PaymentRecord,
  PayoutInstruction,
  PropertyAsset,
  Tenancy,
  TrustAllocation,
} from '../../types/domain'
import {
  OWNER_STATEMENT_MODE_A_COPY,
  buildOwnerStatementBook,
  generateOwnerStatementPdf,
  isModeAStatementPayout,
  ownerStatementDocumentDraft,
  OWNER_STATEMENT_TABLE_COLUMNS,
  OWNER_STATEMENT_TABLE_FOOTER,
  buildOwnerStatementTable,
  ownerStatementTableToCsv,
  ownerStatementPaymentsSubtotal,
} from './index'
import type { OwnerStatementBook } from './types'

function property(overrides: Partial<PropertyAsset> = {}): PropertyAsset {
  return {
    id: 'PR-1002',
    agencyId: 'ag-horizon',
    landlordId: 'u-owner1',
    title: 'Humewood B12',
    status: 'Rented',
    type: 'Apartment',
    address: '12 Beach Rd',
    suburb: 'Humewood',
    city: 'Gqeberha',
    province: 'Eastern Cape',
    country: 'ZA',
    price: 12500,
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    sizeSqm: 75,
    description: '',
    features: [],
    images: [],
    listedAt: '2026-01-01',
    ...overrides,
  } as PropertyAsset
}

function tenancy(overrides: Partial<Tenancy> = {}): Tenancy {
  return {
    id: 'TN-1',
    agencyId: 'ag-horizon',
    propertyId: 'PR-1002',
    landlordId: 'u-owner1',
    agentId: 'u-james',
    applicationId: null,
    tenantUserId: 'u-lucas',
    tenantName: 'Lucas Pretorius',
    tenantEmail: 'lucas@email.com',
    startDate: '2026-06-01',
    endDate: '2026-12-31',
    rent: 12500,
    deposit: 25000,
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
    agencyId: 'ag-horizon',
    propertyId: 'PR-1002',
    applicationId: null,
    tenancyId: 'TN-1',
    partyName: 'Lucas Pretorius',
    partyUserId: 'u-lucas',
    type: 'Rent',
    amount: 12500,
    status: 'Paid',
    dueDate: '2026-08-01',
    paidAt: '2026-08-01',
    method: 'EFT',
    landlordVisible: true,
    ...overrides,
  }
}

function allocation(overrides: Partial<TrustAllocation> = {}): TrustAllocation {
  return {
    id: 'TA-001',
    agencyId: 'ag-horizon',
    trustTransactionId: 'TT-001',
    occupancyId: 'TN-1',
    bucketCode: 'rent',
    chargeId: 'CH-001',
    amountCents: 1250000,
    allocatedBy: 'u-lerato',
    allocatedAt: '2026-08-01T10:30:00.000Z',
    ...overrides,
  }
}

function payout(overrides: Partial<PayoutInstruction> = {}): PayoutInstruction {
  return {
    id: 'PI-new',
    agencyId: 'ag-horizon',
    occupancyId: 'TN-1',
    propertyId: 'PR-1002',
    payeeType: 'landlord',
    payeeId: 'u-owner1',
    bankAccountId: 'BA-001',
    amountCents: 1125000,
    bucketCode: 'owner_payable',
    status: 'submitted',
    proposedBy: 'u-lerato',
    approvedBy: 'u-amelia',
    submittedAt: '2026-08-05T09:00:00.000Z',
    settledAt: null,
    partnerPayoutId: null,
    failureReason: null,
    idempotencyKey: 'PI-test',
    createdAt: '2026-08-04T08:00:00.000Z',
    updatedAt: '2026-08-05T09:00:00.000Z',
    ...overrides,
  }
}

const baseInput = {
  landlordUserId: 'u-owner1',
  landlordName: 'Horizon Trust',
  agencyId: 'ag-horizon',
  agencyName: 'Horizon Realty',
  period: { start: '2026-08-01', end: '2026-08-31' },
  properties: [property()],
  tenancies: [tenancy()],
  payments: [payment()],
  trustAllocations: [allocation()],
  payoutInstructions: [payout()],
  generatedAt: '2026-10-01T12:00:00.000Z',
}

describe('buildOwnerStatementBook', () => {
  it('includes payments, allocations, and ≤submitted landlord payouts', () => {
    const book = buildOwnerStatementBook(baseInput)
    expect(book.payments).toHaveLength(1)
    expect(book.allocations).toHaveLength(1)
    expect(book.payouts).toHaveLength(1)
    expect(book.payouts[0].status).toBe('submitted')
    expect(book.honesty).toBe(OWNER_STATEMENT_MODE_A_COPY)
  })

  it('excludes settled payouts and never surfaces partnerPayoutId as settlement claim', () => {
    const settled = payout({
      id: 'PI-settled',
      status: 'settled',
      settledAt: '2026-08-05T10:00:00.000Z',
      partnerPayoutId: 'FNB-FAKE',
    })
    const book = buildOwnerStatementBook({
      ...baseInput,
      payoutInstructions: [settled, payout({ id: 'PI-ok', partnerPayoutId: null })],
    })
    expect(book.payouts.every((p) => p.status !== 'settled')).toBe(true)
    expect(book.payouts.map((p) => p.id)).toEqual(['PI-ok'])
    expect(isModeAStatementPayout(settled, 'u-owner1')).toBe(false)
  })

  it('excludes non-landlord-visible payments and other landlords', () => {
    const book = buildOwnerStatementBook({
      ...baseInput,
      payments: [
        payment({ id: 'PAY-hidden', landlordVisible: false }),
        payment({ id: 'PAY-other', propertyId: 'PR-999' }),
        payment({ id: 'PAY-ok' }),
      ],
      properties: [property()],
    })
    expect(book.payments.map((p) => p.id)).toEqual(['PAY-ok'])
  })

  it('honesty banner denies PayProp / bank', () => {
    expect(OWNER_STATEMENT_MODE_A_COPY.toLowerCase()).toContain('recorded in propertyflow, not yet matched to the bank')
    expect(OWNER_STATEMENT_MODE_A_COPY.toLowerCase()).not.toMatch(/payprop/)
    expect(OWNER_STATEMENT_MODE_A_COPY.toLowerCase()).not.toMatch(/live payprop remittance api/)
  })
})

describe('generateOwnerStatementPdf', () => {
  it('generates real PDF bytes with %PDF header and honesty text', async () => {
    const pdf = await generateOwnerStatementPdf(baseInput)
    expect(pdf.fileName).toContain('owner-statement')
    expect(pdf.fileName).toContain('2026-08-01')
    expect(pdf.dataUrl.startsWith('data:application/pdf;base64,')).toBe(true)
    expect(pdf.bytes[0]).toBe(0x25) // %
    expect(pdf.bytes[1]).toBe(0x50) // P
    expect(pdf.bytes[2]).toBe(0x44) // D
    expect(pdf.bytes[3]).toBe(0x46) // F
    expect(pdf.book.payouts[0].status).toBe('submitted')

    // FlateDecode streams hide literals; honesty is asserted on book + constant (drawn into PDF).
    expect(pdf.book.honesty).toBe(OWNER_STATEMENT_MODE_A_COPY)
    expect(pdf.book.honesty.toLowerCase()).toContain('recorded in propertyflow, not yet matched to the bank')
    expect(pdf.book.honesty.toLowerCase()).not.toMatch(/partnerpayoutid/)
    expect(JSON.stringify(pdf.book.payouts)).not.toMatch(/partnerPayoutId/)
  })

  it('never mints settled status or partnerPayoutId on the book', async () => {
    const pdf = await generateOwnerStatementPdf({
      ...baseInput,
      payoutInstructions: [
        payout({ status: 'approved', submittedAt: null, partnerPayoutId: null }),
      ],
    })
    for (const p of pdf.book.payouts) {
      expect(p.status).not.toBe('settled')
      expect(['proposed', 'pending_approval', 'approved', 'submitted']).toContain(p.status)
    }
    // Generator is read-only — input payout unchanged conceptually
    expect(pdf.book.payouts[0].status).toBe('approved')
  })
})

describe('ownerStatementDocumentDraft', () => {
  it('stores as Other with honesty note', () => {
    const draft = ownerStatementDocumentDraft({
      agencyId: 'ag-horizon',
      propertyId: 'PR-1002',
      landlordName: 'Horizon Trust',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      fileUrl: 'data:application/pdf;base64,AAA',
    })
    expect(draft.category).toBe('Other')
    expect(draft.note).toBe(OWNER_STATEMENT_MODE_A_COPY)
    expect(draft.name).toMatch(/Owner statement/)
  })
})

describe('owner statement table (Reports tab)', () => {
  const book = {
    landlordUserId: 'u-owner1',
    landlordName: 'Horizon Trust',
    agencyId: 'ag-horizon',
    agencyName: 'Horizon Realty',
    period: { start: '2026-09-01', end: '2026-09-30' },
    propertyTitles: ['Humewood B12', 'Summerstrand 4'],
    payments: [],
    allocations: [],
    payouts: [],
    lines: [
      { kind: 'payment', id: 'P1', date: '2026-09-01', propertyTitle: 'Humewood B12', description: 'Rent, September', amountZar: 12500, status: 'Paid', paymentType: 'Rent' },
      { kind: 'payment', id: 'P2', date: '2026-09-02', propertyTitle: 'Humewood B12', description: 'Commission', amountZar: 1000, status: 'Paid', paymentType: 'Commission' },
      { kind: 'allocation', id: 'A1', date: '2026-09-03', propertyTitle: 'Humewood B12', description: 'Levies', amountZar: 300, bucketCode: 'levies' },
      { kind: 'payout', id: 'O1', date: '2026-09-05', propertyTitle: 'Humewood B12', description: 'Owner payout', amountZar: 11200, status: 'submitted' },
      { kind: 'payment', id: 'P3', date: '2026-09-01', propertyTitle: 'Summerstrand 4', description: 'Rent', amountZar: 9000, status: 'Paid', paymentType: 'Rent' },
      { kind: 'payment', id: 'P4', date: '2026-09-01', propertyTitle: 'Summerstrand 4', description: 'First month', amountZar: 4000, status: 'Paid', paymentType: 'First Month Rent' },
      { kind: 'payment', id: 'P5', date: '2026-09-10', propertyTitle: 'Summerstrand 4', description: 'Rent due', amountZar: 9000, status: 'Due', paymentType: 'Rent' },
      { kind: 'payment', id: 'P6', date: '2026-09-11', propertyTitle: 'Summerstrand 4', description: 'Deposit', amountZar: 18000, status: 'Paid', paymentType: 'Deposit' },
      { kind: 'payment', id: 'P7', date: '2026-09-12', propertyTitle: 'Summerstrand 4', description: 'Overdue rent', amountZar: 9000, status: 'Overdue', paymentType: 'Rent' },
    ],
    totals: { paymentsZar: 0, allocationsZar: 0, payoutsSubmittedZar: 0 },
    honesty: OWNER_STATEMENT_MODE_A_COPY,
    generatedAt: '2026-10-02T08:00:00.000Z',
  } as unknown as OwnerStatementBook

  it('uses Rent, Commission, Other allocations, Net paid and no Recoveries/Expenses columns', () => {
    const labels = OWNER_STATEMENT_TABLE_COLUMNS.map((c) => c.label)
    expect(labels).toEqual(['Date', 'Property', 'Description', 'Rent', 'Commission', 'Other allocations', 'Net paid'])
    expect(labels).not.toContain('Recoveries')
    expect(labels).not.toContain('Expenses')
  })

  it('places each line in one column and filters by property', () => {
    const { rows, totals } = buildOwnerStatementTable(book, { propertyTitle: 'Humewood B12' })
    expect(rows).toHaveLength(4)
    expect(totals).toEqual({ rent: 12500, commission: 1000, otherAllocations: 300, netPaid: 11200 })
  })

  it('Rent counts only Paid Rent / First Month Rent; other payments stay out of the totals', () => {
    const { rows, totals } = buildOwnerStatementTable(book, { propertyTitle: 'Summerstrand 4' })
    expect(rows).toHaveLength(5)
    expect(totals).toEqual({ rent: 13000, commission: 0, otherAllocations: 0, netPaid: 0 })
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId['payment-P4'].rent).toBe(4000)
    for (const id of ['payment-P5', 'payment-P6', 'payment-P7']) {
      expect(byId[id]).toMatchObject({ rent: null, commission: null, otherAllocations: null, netPaid: null })
    }
  })

  it('exports CSV with on-screen headers, a total row and the in-app-book footer', () => {
    const { rows, totals } = buildOwnerStatementTable(book)
    const lines = ownerStatementTableToCsv(rows, totals, ['date', 'description', 'rent', 'netPaid']).split('\n')
    expect(lines[0]).toBe('Date,Description,Rent,Net paid')
    expect(lines[1]).toBe('2026-09-01,"Rent, September",12500.00,')
    expect(lines[lines.length - 3]).toBe('Total,,25500.00,11200.00')
    expect(lines[lines.length - 2]).toBe(
      'Only paid rent and commission are totalled; other lines are shown for reference.',
    )
    expect(lines[lines.length - 1]).toBe(`"${OWNER_STATEMENT_TABLE_FOOTER}"`)
  })
})

describe('owner statement PDF payments subtotal (shared table rule)', () => {
  const pay = (id: string, paymentType: PaymentRecord['type'], status: PaymentRecord['status'], amountZar: number) => ({
    kind: 'payment' as const,
    id,
    date: '2026-09-01',
    propertyTitle: 'Humewood B12',
    description: `${paymentType} (${status})`,
    amountZar,
    status,
    paymentType,
  })
  const payments = [
    pay('R1', 'Rent', 'Paid', 12500),
    pay('R2', 'First Month Rent', 'Paid', 4000),
    pay('R3', 'Rent', 'Due', 12500),
    pay('R4', 'Rent', 'Overdue', 12500),
    pay('D1', 'Deposit', 'Paid', 25000),
    pay('C1', 'Commission', 'Paid', 1000),
    pay('C2', 'Commission', 'Due', 900),
  ]

  it('totals Paid rent and Paid commission only', () => {
    expect(ownerStatementPaymentsSubtotal(payments)).toBe(12500 + 4000 + 1000)
    expect(ownerStatementPaymentsSubtotal([pay('R3', 'Rent', 'Due', 12500), pay('R4', 'Rent', 'Overdue', 1)])).toBe(0)
    expect(ownerStatementPaymentsSubtotal([pay('D1', 'Deposit', 'Paid', 25000)])).toBe(0)
    expect(ownerStatementPaymentsSubtotal([pay('C2', 'Commission', 'Due', 900)])).toBe(0)
  })

  it('matches the table rent + payment-commission totals', () => {
    const book = { lines: payments } as unknown as OwnerStatementBook
    const { totals } = buildOwnerStatementTable(book)
    expect(ownerStatementPaymentsSubtotal(payments)).toBe(totals.rent + totals.commission)
  })
})
