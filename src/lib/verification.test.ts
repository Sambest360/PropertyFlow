import { describe, expect, it } from 'vitest'
import {
  applyVerificationDecision,
  documentOpenLabel,
  isVerificationApproved,
  isVerificationPending,
  markDocumentLookedAt,
  missingRequiredDocs,
  verificationDecisionsEnabled,
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

describe('document lookedAt', () => {
  it('sets lookedAt on the opened document only', () => {
    const idCopy = doc('id_copy')
    const proof = doc('proof_of_address')
    const next = markDocumentLookedAt([idCopy, proof], 'id_copy', '2026-10-03T11:00:00.000Z')
    expect(next[0]).toMatchObject({ key: 'id_copy', lookedAt: '2026-10-03T11:00:00.000Z' })
    expect(next[1]).toBe(proof)
    expect(next[1].lookedAt).toBeUndefined()
    expect(documentOpenLabel(next[0])).toBe('Looked at')
    expect(documentOpenLabel(next[1])).toBe('Not opened')
  })

  it('keeps Approve and Decline disabled until every document has lookedAt', () => {
    const unread = [doc('id_copy'), doc('proof_of_address')]
    expect(verificationDecisionsEnabled(unread)).toBe(false)
    const oneOpened = markDocumentLookedAt(unread, 'id_copy', '2026-10-03T11:00:00.000Z')
    expect(verificationDecisionsEnabled(oneOpened)).toBe(false)
    const bothOpened = markDocumentLookedAt(oneOpened, 'proof_of_address', '2026-10-03T11:05:00.000Z')
    expect(verificationDecisionsEnabled(bothOpened)).toBe(true)
  })

  it('keeps Approve and Decline available when there are no documents', () => {
    expect(verificationDecisionsEnabled([])).toBe(true)
    expect(verificationDecisionsEnabled(undefined)).toBe(true)
  })

  it('keeps stored lookedAt when a verification decision is written', () => {
    const opened = markDocumentLookedAt([doc('id_copy'), doc('proof_of_address')], 'id_copy', '2026-10-03T11:00:00.000Z')
    const stored = {
      status: 'pending' as const,
      submittedAt: '2026-10-03T08:00:00.000Z',
      documents: opened,
    }
    const decided = applyVerificationDecision(stored, {
      status: 'approved',
      reviewedAt: '2026-10-03T12:00:00.000Z',
      reviewedBy: 'u-samuel',
    })
    expect(decided.status).toBe('approved')
    expect(decided.documents?.[0].lookedAt).toBe('2026-10-03T11:00:00.000Z')
    expect(decided.documents?.[1].lookedAt).toBeUndefined()
    expect(decided.documents?.[1]).toBe(opened[1])
  })
})
