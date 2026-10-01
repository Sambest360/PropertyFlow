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
} from './index'

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
    expect(OWNER_STATEMENT_MODE_A_COPY.toLowerCase()).toMatch(/not bank-confirmed/)
    expect(OWNER_STATEMENT_MODE_A_COPY.toLowerCase()).toMatch(/not payprop settled/)
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
    expect(pdf.book.honesty.toLowerCase()).toMatch(/not bank-confirmed/)
    expect(pdf.book.honesty.toLowerCase()).toMatch(/not payprop settled/)
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
