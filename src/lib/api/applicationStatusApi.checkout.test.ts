/**
 * open-checkout-real (plan T2, Jim C1/C3/C7): approve returns a checkout that
 * points ONLY at the real Due ledger rows it created (side_effects.payments,
 * the rows AppStore persists before reporting success). No made-up INV- id,
 * no client-side sandbox URL, merchant key or signature.
 */
import { describe, expect, it } from 'vitest'
import type { Application, PropertyAsset } from '../../types/domain'
import type { Unit } from '../../data/infrastructure'
import { buildDocumentChecklist } from '../workflow'
import { patchApplicationStatus } from './applicationStatusApi'

function app(overrides: Partial<Application> = {}): Application {
  const type = overrides.type ?? 'Rental'
  return {
    id: 'APP-1',
    agencyId: 'ag-1',
    propertyId: 'PR-1',
    agentId: null,
    applicantUserId: 'u-applicant-a',
    applicantName: 'Applicant A',
    email: 'a@test.example',
    phone: '',
    type,
    stage: 'Application submitted',
    progress: 20,
    income: 0,
    employment: '',
    creditCheck: 'Passed',
    creditConsent: true,
    screening: { status: 'passed', provider: 'mock' },
    documents: buildDocumentChecklist(type).map((d) =>
      d.key === 'id' || d.key === 'address' || d.key === 'fica'
        ? { ...d, status: 'verified' as const }
        : { ...d, status: 'uploaded' as const },
    ),
    docs: [],
    viewingSlotId: null,
    notes: '',
    submittedAt: '2026-09-18',
    updatedAt: '2026-09-18',
    workflowStatus: 'application_submitted',
    unitId: 'un-1',
    ...overrides,
  } as Application
}

const actor = {
  userId: 'u-staff',
  role: 'client_admin' as const,
  agencyId: 'ag-1',
  permissions: ['applications.review'] as import('../../types/domain').Permission[],
}

function listing(mode: 'rent' | 'sale') {
  const property = {
    id: 'PR-1',
    agencyId: 'ag-1',
    landlordId: 'u-landlord',
    agentId: null,
    unitId: 'un-1',
    title: 'QA listing',
    type: 'Apartment',
    status: 'Published',
    listingMode: mode,
    rent: mode === 'rent' ? 18500 : null,
    price: mode === 'sale' ? 2_000_000 : null,
    city: 'Cape Town',
    suburb: 'CBD',
    beds: 2,
    baths: 1,
    parking: 1,
    area: 80,
    amenities: [],
    images: [],
    featured: false,
    createdAt: '2026-09-01',
  } as unknown as PropertyAsset
  const unit = {
    id: 'un-1',
    buildingId: 'bld-1',
    unitNumber: '1',
    statusKey: 'PUBLISHED',
    listingType: mode,
    rent: mode === 'rent' ? 18500 : null,
    price: mode === 'sale' ? 2_000_000 : null,
    beds: 2,
    baths: 1,
    parking: 1,
    squareMeters: 80,
  } as unknown as Unit
  return { property, unit }
}

function approve(type: 'Rental' | 'Purchase', provider: 'auto' | 'peach' = 'auto') {
  const { property, unit } = listing(type === 'Rental' ? 'rent' : 'sale')
  const result = patchApplicationStatus({
    application: app({ type }),
    property,
    unit,
    viewings: [],
    slots: [],
    existingTenancies: [],
    request: { status: 'APPROVED', payment_provider: provider },
    actor,
  })
  if (result.status !== 'SUCCESS') throw new Error(`approve failed: ${result.error}`)
  return result
}

describe('approve checkout points at the real Due rows only', () => {
  for (const type of ['Rental', 'Purchase'] as const) {
    it(`${type}: payment_id / invoice.id are the first Due row; payment_ids are all rows`, () => {
      const r = approve(type)
      const rows = r.side_effects.payments
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((p) => p.status === 'Due' && p.applicationId === 'APP-1')).toBe(true)
      expect(r.checkout).not.toBeNull()
      const c = r.checkout as unknown as Record<string, unknown>
      expect(c.payment_id).toBe(rows[0].id)
      expect(c.payment_ids).toEqual(rows.map((p) => p.id))
      expect(c.amount_zar).toBe(rows.reduce((s, p) => s + p.amount, 0))
      expect(r.invoice?.id).toBe(rows[0].id)
      expect(JSON.stringify(r)).not.toMatch(/INV-/)
    })
  }

  it('Rental: two rows, deposit first, then first month rent', () => {
    const r = approve('Rental')
    expect(r.side_effects.payments.map((p) => p.type)).toEqual(['Deposit', 'First Month Rent'])
  })

  it('C7: the checkout object has no checkout_url, merchant_key, signature or url keys', () => {
    for (const type of ['Rental', 'Purchase'] as const) {
      for (const provider of ['auto', 'peach'] as const) {
        const c = approve(type, provider).checkout as unknown as Record<string, unknown>
        for (const k of ['checkout_url', 'merchant_key', 'merchant_id', 'signature', 'signature_fields', 'return_url', 'cancel_url', 'notify_url']) {
          expect(Object.keys(c)).not.toContain(k)
        }
        expect(Object.keys(c).sort()).toEqual(['amount_zar', 'payment_id', 'payment_ids', 'provider'])
        expect(JSON.stringify(c)).not.toMatch(/https?:/)
      }
    }
  })

  it('keeps the public keys AppStore reads (provider, payment_id) for t2 compatibility', () => {
    const c = approve('Rental').checkout!
    expect(c.provider).toBe('payfast')
    expect(typeof c.payment_id).toBe('string')
  })
})
