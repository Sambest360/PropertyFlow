import { describe, expect, it, beforeEach, vi } from 'vitest'
import { generateLeasePdf } from './generateLeasePdf'
import {
  DocuSignESignProviderPlaceholder,
  MockDevESignProvider,
  SigniFlowESignProvider,
  SigniFlowESignProviderPlaceholder,
  eSignProviderFromEnv,
  resetMockESignEnvelopes,
} from './providers'
import {
  eSignStatusLabel,
  issueLeaseOnTenancyCreate,
  recordLeaseSignature,
  workflowStatusFromESign,
} from './pipeline'
import type { Tenancy } from '../../types/domain'

function tenancy(overrides: Partial<Tenancy> = {}): Tenancy {
  return {
    id: 'TN-test-1',
    agencyId: 'ag-horizon',
    propertyId: 'PR-1002',
    landlordId: 'u-owner1',
    agentId: 'u-james',
    applicationId: 'APP-1',
    tenantUserId: 'u-lucas',
    tenantName: 'Lucas Pretorius',
    tenantEmail: 'lucas@email.com',
    startDate: '2026-06-01',
    endDate: '2026-12-31',
    rent: 12500,
    deposit: 25000,
    status: 'Pending Move-In',
    keyCollection: {
      location: 'Office',
      instructions: 'Bring ID',
      contactName: 'Agent',
      contactPhone: '',
    },
    ...overrides,
  }
}

describe('lease PDF', () => {
  it('generates a real PDF with %PDF header', async () => {
    const pdf = await generateLeasePdf({
      tenancyId: 'TN-1',
      leaseReference: 'TN-1',
      agencyName: 'Horizon Realty',
      propertyTitle: 'Walmer flat',
      propertyAddress: '12 Main Rd, Walmer, Gqeberha',
      tenantName: 'Lucas Pretorius',
      tenantEmail: 'lucas@email.com',
      landlordName: 'Owner One',
      startDate: '2026-06-01',
      endDate: '2026-12-31',
      rent: 12500,
      deposit: 25000,
    })
    expect(pdf.fileName).toContain('lease-TN-1')
    expect(pdf.dataUrl.startsWith('data:application/pdf;base64,')).toBe(true)
    expect(pdf.bytes[0]).toBe(0x25) // %
    expect(pdf.bytes[1]).toBe(0x50) // P
    expect(pdf.bytes[2]).toBe(0x44) // D
    expect(pdf.bytes[3]).toBe(0x46) // F
  })
})

describe('e-sign providers', () => {
  beforeEach(() => resetMockESignEnvelopes())

  it('defaults to mock from env', () => {
    const p = eSignProviderFromEnv({})
    expect(p.id).toBe('mock')
    expect(p.live).toBe(false)
    expect(p.nonProduction).toBe(true)
  })

  it('SigniFlow refuses without keys / unreachable API (honest stub)', async () => {
    const p = new SigniFlowESignProviderPlaceholder({ forceUnconfigured: true })
    const res = await p.createEnvelope({
      tenancyId: 'TN-1',
      applicationId: null,
      leaseDocumentId: 'PD-1',
      pdfUrl: 'data:application/pdf;base64,AA==',
      subject: 'Lease',
      tenant: { name: 'T', email: 't@e.com' },
      landlord: null,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/partner keys/i)
  })

  it('DocuSign refuses without keys', async () => {
    const p = new DocuSignESignProviderPlaceholder({})
    const res = await p.createEnvelope({
      tenancyId: 'TN-1',
      applicationId: null,
      leaseDocumentId: 'PD-1',
      pdfUrl: 'data:application/pdf;base64,AA==',
      subject: 'Lease',
      tenant: { name: 'T', email: 't@e.com' },
      landlord: null,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/partner keys/i)
  })

  it('DocuSign with keys still refuses live HTTP (Mode A OUT placeholder)', async () => {
    const p = new DocuSignESignProviderPlaceholder({
      integrationKey: 'k',
      accountId: 'a',
      apiUrl: 'https://example.invalid',
    })
    const res = await p.createEnvelope({
      tenancyId: 'TN-1',
      applicationId: null,
      leaseDocumentId: 'PD-1',
      pdfUrl: 'data:application/pdf;base64,AA==',
      subject: 'Lease',
      tenant: { name: 'T', email: 't@e.com' },
      landlord: null,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/placeholder|Mode A OUT/i)
  })

  it('SigniFlow createEnvelope uses server API (mocked) — never invents without ok:true', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          provider: 'signiflow',
          live: true,
          nonProduction: false,
          envelopeId: 'SF-77',
          externalReference: '77',
          status: 'sent',
          summary: 'SigniFlow workflow created and initiated (DocID 77).',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch
    const p = new SigniFlowESignProvider({ fetchImpl })
    const res = await p.createEnvelope({
      tenancyId: 'TN-1',
      applicationId: null,
      leaseDocumentId: 'PD-1',
      pdfUrl: 'data:application/pdf;base64,AA==',
      subject: 'Lease',
      tenant: { name: 'T', email: 't@e.com' },
      landlord: null,
    })
    expect(res.ok).toBe(true)
    expect(res.envelopeId).toBe('SF-77')
    expect(res.live).toBe(true)
    expect(res.nonProduction).toBe(false)
  })

  it('SigniFlow recordSign does not invent signed-live when partner status is pending', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          status: 'sent',
          docStatus: 'Pending',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch
    const p = new SigniFlowESignProvider({ fetchImpl })
    const res = await p.recordSign({
      envelopeId: 'SF-77',
      party: 'tenant',
      signerName: 'T',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/not yet signed|partner/i)
  })
})

describe('issue + countersign pipeline', () => {
  beforeEach(() => resetMockESignEnvelopes())

  it('issues PDF + document + mock envelope on tenancy create', async () => {
    const mock = new MockDevESignProvider()
    const result = await issueLeaseOnTenancyCreate({
      tenancy: tenancy(),
      property: {
        id: 'PR-1002',
        agencyId: 'ag-horizon',
        title: 'Walmer flat',
        address: '12 Main',
        suburb: 'Walmer',
        city: 'Gqeberha',
      } as never,
      agencyName: 'Horizon Realty',
      landlordUser: { id: 'u-owner1', name: 'Owner One', email: 'o@e.com' } as never,
      documentId: 'PD-lease-1',
      provider: mock,
      now: '2026-10-01T12:00:00.000Z',
    })
    expect(result.ok).toBe(true)
    expect(result.document?.category).toBe('Lease')
    expect(result.document?.fileUrl?.startsWith('data:application/pdf')).toBe(true)
    expect(result.eSign?.status).toBe('sent')
    expect(result.eSign?.nonProduction).toBe(true)
    expect(result.eSign?.landlord?.status).toBe('pending')
    expect(result.workflowStatus).toBe('lease_sent')
    expect(result.tenancyPatch.leaseDocumentId).toBe('PD-lease-1')
  })

  it('skips landlord party when landlordId absent', async () => {
    const result = await issueLeaseOnTenancyCreate({
      tenancy: tenancy({ landlordId: '' }),
      documentId: 'PD-lease-2',
      provider: new MockDevESignProvider(),
    })
    expect(result.ok).toBe(true)
    expect(result.eSign?.landlord).toBeNull()
  })

  it('countersign: tenant then landlord → completed / landlord_signed workflow', async () => {
    const mock = new MockDevESignProvider()
    const issued = await issueLeaseOnTenancyCreate({
      tenancy: tenancy(),
      documentId: 'PD-lease-3',
      landlordUser: { id: 'u-owner1', name: 'Owner', email: 'o@e.com' } as never,
      provider: mock,
    })
    expect(issued.eSign).toBeTruthy()

    const tenant = await recordLeaseSignature({
      eSign: issued.eSign!,
      party: 'tenant',
      signerName: 'Lucas Pretorius',
      provider: mock,
    })
    expect(tenant.ok).toBe(true)
    expect(tenant.eSign.status).toBe('partially_signed')
    expect(tenant.workflowStatus).toBe('tenant_signed')

    const landlord = await recordLeaseSignature({
      eSign: tenant.eSign,
      party: 'landlord',
      signerName: 'Owner One',
      provider: mock,
    })
    expect(landlord.ok).toBe(true)
    expect(landlord.eSign.status).toBe('completed')
    expect(landlord.workflowStatus).toBe('landlord_signed')
    expect(workflowStatusFromESign(landlord.eSign)).toBe('landlord_signed')
  })

  it('tenant-only completes when no landlord', async () => {
    const mock = new MockDevESignProvider()
    const issued = await issueLeaseOnTenancyCreate({
      tenancy: tenancy({ landlordId: '' }),
      documentId: 'PD-lease-4',
      provider: mock,
    })
    const tenant = await recordLeaseSignature({
      eSign: issued.eSign!,
      party: 'tenant',
      signerName: 'Lucas',
      provider: mock,
    })
    expect(tenant.eSign.status).toBe('completed')
    expect(tenant.workflowStatus).toBe('tenant_signed')
  })

  it('labels statuses for UI', () => {
    expect(eSignStatusLabel('sent')).toMatch(/sent/i)
    expect(eSignStatusLabel('completed')).toMatch(/signed/i)
  })
})
