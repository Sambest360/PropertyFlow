import { describe, expect, it } from 'vitest'
import type {
  PaymentRecord,
  PropertyAsset,
  PropertyDocument,
  Tenancy,
  TrustTransaction,
  AppUser,
} from '../../types/domain'
import {
  AUDIT_PACK_MODE_A_COPY,
  ManualSoftRemittanceAdapter,
  RENT_ROLL_MODE_A_COPY,
  RefuseClosedRemittanceAdapter,
  assertRemittanceNotLive,
  attemptLiveRemittance,
  buildRentRollAsAt,
  buildSoftAuditPack,
  generateRentRollPdf,
  isTenancyOnRentRollAsAt,
  remittanceAdapterFromEnv,
  rentRollToCsv,
  RENT_ROLL_TABLE_COLUMNS,
  rentRollCellText,
  rentRollTableToCsv,
} from './index'
import { RemittanceNotConfiguredError } from './types'

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
    status: 'Overdue',
    dueDate: '2026-09-01',
    paidAt: null,
    method: null,
    landlordVisible: true,
    ...overrides,
  }
}

function landlord(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: 'u-owner1',
    name: 'Horizon Trust',
    email: 'owner@horizon.test',
    role: 'landlord',
    agencyId: 'ag-horizon',
    active: true,
    ...overrides,
  } as AppUser
}

describe('isTenancyOnRentRollAsAt', () => {
  it('includes active tenancy spanning as-at', () => {
    expect(isTenancyOnRentRollAsAt(tenancy(), '2026-10-01')).toBe(true)
  })

  it('excludes not-yet-started and already-ended', () => {
    expect(isTenancyOnRentRollAsAt(tenancy({ startDate: '2026-11-01' }), '2026-10-01')).toBe(false)
    expect(
      isTenancyOnRentRollAsAt(tenancy({ endDate: '2026-09-30', status: 'Ended' }), '2026-10-01'),
    ).toBe(false)
  })
})

describe('buildRentRollAsAt', () => {
  it('builds point-in-time rows with in-app arrears', () => {
    const book = buildRentRollAsAt({
      agencyId: 'ag-horizon',
      agencyName: 'Horizon Realty',
      asAt: '2026-10-01',
      properties: [property()],
      tenancies: [tenancy()],
      payments: [payment()],
      landlords: [landlord()],
      generatedAt: '2026-10-02T08:00:00.000Z',
    })
    expect(book.rows).toHaveLength(1)
    expect(book.rows[0].landlordName).toBe('Horizon Trust')
    expect(book.rows[0].arrearsZar).toBe(12500)
    expect(book.totals.rentPcmZar).toBe(12500)
    expect(book.honesty).toBe(RENT_ROLL_MODE_A_COPY)
  })

  it('scopes to landlord when set', () => {
    const book = buildRentRollAsAt({
      agencyId: 'ag-horizon',
      agencyName: 'Horizon Realty',
      asAt: '2026-10-01',
      properties: [
        property(),
        property({ id: 'PR-9', landlordId: 'u-other', title: 'Other' }),
      ],
      tenancies: [
        tenancy(),
        tenancy({
          id: 'TN-9',
          propertyId: 'PR-9',
          landlordId: 'u-other',
          tenantName: 'Other Tenant',
        }),
      ],
      landlordUserId: 'u-owner1',
    })
    expect(book.rows.map((r) => r.tenancyId)).toEqual(['TN-1'])
  })

  it('honesty denies trust-audit / PPRA / bank', () => {
    const copy = RENT_ROLL_MODE_A_COPY.toLowerCase()
    expect(copy).toMatch(/not trust-audited/)
    expect(copy).toMatch(/not a ppra opinion/)
    expect(copy).toContain('recorded in propertyflow, not yet matched to the bank')
    expect(AUDIT_PACK_MODE_A_COPY.toLowerCase()).toMatch(/not a statutory audit pack/)
  })
})

describe('rentRollToCsv', () => {
  it('emits header + honesty column', () => {
    const book = buildRentRollAsAt({
      agencyId: 'ag-horizon',
      agencyName: 'Horizon Realty',
      asAt: '2026-10-01',
      properties: [property()],
      tenancies: [tenancy()],
      payments: [],
    })
    const csv = rentRollToCsv(book)
    expect(csv.split('\n')[0]).toMatch(/as_at/)
    expect(csv).toMatch(/not trust-audited/)
    expect(csv).toMatch(/Humewood B12/)
  })
})

describe('generateRentRollPdf', () => {
  it('generates real PDF bytes with %PDF header', async () => {
    const pdf = await generateRentRollPdf({
      agencyId: 'ag-horizon',
      agencyName: 'Horizon Realty',
      asAt: '2026-10-01',
      properties: [property()],
      tenancies: [tenancy()],
      payments: [payment()],
      landlords: [landlord()],
    })
    expect(pdf.fileName).toContain('rent-roll-as-at')
    expect(pdf.fileName).toContain('2026-10-01')
    expect(pdf.dataUrl.startsWith('data:application/pdf;base64,')).toBe(true)
    expect(pdf.bytes[0]).toBe(0x25)
    expect(pdf.bytes[1]).toBe(0x50)
    expect(pdf.bytes[2]).toBe(0x44)
    expect(pdf.bytes[3]).toBe(0x46)
    expect(pdf.book.honesty).toBe(RENT_ROLL_MODE_A_COPY)
  })
})

describe('buildSoftAuditPack', () => {
  it('bundles index + rent roll + trust soft CSV + docs inventory', async () => {
    const docs: PropertyDocument[] = [
      {
        id: 'DOC-1',
        agencyId: 'ag-horizon',
        propertyId: 'PR-1002',
        name: 'Lease PDF',
        category: 'Lease',
        status: 'uploaded',
        uploadedAt: '2026-06-01',
        note: 'Mode A',
      },
    ]
    const trust: TrustTransaction[] = [
      {
        id: 'TT-1',
        agencyId: 'ag-horizon',
        direction: 'in',
        amountCents: 1250000,
        currency: 'ZAR',
        valueDate: '2026-09-01',
        postedAt: '2026-09-01T10:00:00.000Z',
        partnerTxnId: 'tpl-csv:1',
        bankRef: 'TPL-001',
        description: 'Rent template',
        counterpartyHash: null,
        status: 'unallocated',
        rawPayloadDocumentId: null,
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
      },
    ]
    const pack = await buildSoftAuditPack({
      agencyId: 'ag-horizon',
      agencyName: 'Horizon Realty',
      asAt: '2026-10-01',
      properties: [property()],
      tenancies: [tenancy()],
      payments: [payment()],
      landlords: [landlord()],
      documents: docs,
      trustTransactions: trust,
      ownerStatementPdfs: [
        {
          landlordName: 'Horizon Trust',
          fileName: 'owner-statement-Horizon-Trust-2026-09-01_2026-09-30.pdf',
          dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
        },
      ],
      generatedAt: '2026-10-02T08:00:00.000Z',
    })
    expect(pack.honesty).toBe(AUDIT_PACK_MODE_A_COPY)
    expect(pack.files.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        'INDEX.md',
        'index.json',
        'rent-roll-as-at-2026-10-01.csv',
        'trust-soft-export-2026-10-01.csv',
        'documents-index-2026-10-01.csv',
        'owner-statements/owner-statement-Horizon-Trust-2026-09-01_2026-09-30.pdf',
      ]),
    )
    expect(pack.indexMarkdown).toMatch(/not a statutory audit pack/i)
    expect(pack.indexMarkdown).toMatch(/not PPRA/i)
    expect(pack.indexJson).toMatch(/live remittance/)
    expect(pack.rentRoll.rows).toHaveLength(1)
    const trustFile = pack.files.find((f) => f.path.startsWith('trust-soft'))
    expect(trustFile?.content).toMatch(/not yet matched to the bank/i)
  })
})

describe('remittance adapters', () => {
  it('manual soft succeeds; partner refuse-closed', async () => {
    const manual = new ManualSoftRemittanceAdapter()
    const ok = await attemptLiveRemittance(manual)
    expect(ok).toEqual({ ok: true, mode: 'manual_soft', status: 'exported_soft' })

    const refuse = new RefuseClosedRemittanceAdapter('payprop', { configured: false })
    const bad = await attemptLiveRemittance(refuse)
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error.toLowerCase()).toMatch(/refuse/)
      expect(bad.error.toLowerCase()).toMatch(/payprop|remittance/)
    }
    expect(() => assertRemittanceNotLive(refuse)).toThrow(RemittanceNotConfiguredError)
  })

  it('env partner path stays refuse-closed even with key present', async () => {
    const adapter = remittanceAdapterFromEnv('payprop', {
      REMITTANCE_ADAPTER: 'partner',
      REMITTANCE_PARTNER_API_KEY: 'fake-key',
    })
    expect(adapter.live).toBe(true)
    const result = await adapter.pushLiveRemittance()
    expect(result.ok).toBe(false)
  })
})

describe('rent roll table (Reports tab)', () => {
  const base = {
    agencyId: 'ag-horizon',
    agencyName: 'Horizon Realty',
    asAt: '2026-10-01',
    properties: [property()],
    payments: [payment()],
    landlords: [landlord()],
    generatedAt: '2026-10-02T08:00:00.000Z',
  }

  it('keeps the column order tenant, unit, owner, charged, outstanding, lease expiry, increase date', () => {
    expect(RENT_ROLL_TABLE_COLUMNS.map((c) => c.label)).toEqual([
      'Tenant',
      'Unit',
      'Owner',
      'Charged',
      'Outstanding',
      'Lease expiry',
      'Increase date',
    ])
  })

  it('reads the increase date from the billing schedule and leaves lease expiry blank when null', () => {
    const book = buildRentRollAsAt({
      ...base,
      tenancies: [
        tenancy({
          endDate: null,
          billingSchedule: {
            id: 'BS-1',
            agencyId: 'ag-horizon',
            occupancyId: 'TN-1',
            chargeType: 'rent',
            amountCents: 1250000,
            dayOfMonth: 1,
            startOn: '2026-06-01',
            endOn: null,
            escalationPct: 8,
            nextEscalationOn: '2027-06-01',
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
          },
        }),
      ],
    })
    const row = book.rows[0]
    expect(row.increaseDate).toBe('2027-06-01')
    expect(row.escalationPct).toBe(8)
    expect(rentRollCellText(row, 'leaseExpiry')).toBe('')
    expect(rentRollCellText(row, 'increaseDate')).toBe('2027-06-01 (+8%)')
  })

  it('has a blank increase date when no billing schedule is set', () => {
    const book = buildRentRollAsAt({ ...base, tenancies: [tenancy()] })
    expect(book.rows[0].increaseDate).toBeNull()
    expect(rentRollCellText(book.rows[0], 'increaseDate')).toBe('')
    expect(rentRollCellText(book.rows[0], 'leaseExpiry')).toBe('2026-12-31')
  })

  it('exports CSV with the on-screen names and order for visible columns', () => {
    const book = buildRentRollAsAt({ ...base, tenancies: [tenancy()] })
    const csv = rentRollTableToCsv(book.rows, ['tenant', 'outstanding', 'unit'])
    const [header, first] = csv.split('\n')
    expect(header).toBe('Tenant,Unit,Outstanding')
    expect(first).toBe('Lucas Pretorius,Humewood B12,12500.00')
  })
})
