import { describe, expect, it } from 'vitest'
import {
  isVerificationApproved,
  isVerificationPending,
  missingRequiredDocs,
  type VerificationDocument,
} from './verification'

const doc = (key: string): VerificationDocument => ({
  key,
  label: key,
  name: `${key}.pdf`,
  mimeType: 'application/pdf',
  dataUrl: 'data:application/pdf;base64,AAA',
  uploadedAt: '2026-07-27T00:00:00.000Z',
})

describe('verification helpers', () => {
  it('treats missing verification as approved for seeded landlords', () => {
    expect(isVerificationApproved(undefined, 'landlord')).toBe(true)
    expect(isVerificationPending(undefined, 'landlord')).toBe(false)
  })

  it('flags pending landlords and contractors', () => {
    expect(isVerificationApproved({ status: 'pending' }, 'landlord')).toBe(false)
    expect(isVerificationPending({ status: 'pending' }, 'landlord')).toBe(true)
    expect(isVerificationApproved({ status: 'approved' }, 'contractor')).toBe(true)
  })

  it('requires landlord ownership docs', () => {
    const missing = missingRequiredDocs('landlord', [doc('id_copy'), doc('proof_of_address')])
    expect(missing).toContain('Proof of ownership or signed mandate')
    expect(
      missingRequiredDocs('landlord', [
        doc('id_copy'),
        doc('proof_of_address'),
        doc('proof_of_ownership'),
      ]),
    ).toEqual([])
  })

  it('requires contractor insurance docs', () => {
    const missing = missingRequiredDocs('contractor', [doc('id_copy')])
    expect(missing.length).toBeGreaterThan(0)
    expect(
      missingRequiredDocs('contractor', [
        doc('id_copy'),
        doc('proof_of_address'),
        doc('public_liability'),
      ]),
    ).toEqual([])
  })

  it('skips docs for tenants', () => {
    expect(missingRequiredDocs('tenant', [])).toEqual([])
    expect(isVerificationApproved({ status: 'not_required' }, 'tenant')).toBe(true)
  })
})
