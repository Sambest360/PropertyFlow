import { describe, expect, it } from 'vitest'
import {
  SIGN_METHOD_LABELS,
  isOnBehalf,
  leaseSignCaptureError,
  onBehalfConfirmationText,
  signMethodFor,
  signaturePrefill,
  signerUserIdFor,
} from './signaturePrefill'

const SIG = 'data:image/png;base64,AAAA'
const lease = { tenantUserId: 'u-t', landlordId: 'u-ll' }

describe('CR10 prefill rule', () => {
  it('own saved signature prefills when you are the signer', () => {
    expect(signaturePrefill({ sessionUserId: 'u-t', sessionSignature: SIG, signerUserId: signerUserIdFor(lease, 'tenant') })).toBe(SIG)
  })
  it('on behalf (staff for the landlord) stays empty, even with a saved signature', () => {
    expect(signaturePrefill({ sessionUserId: 'u-staff', sessionSignature: SIG, signerUserId: signerUserIdFor(lease, 'landlord') })).toBeNull()
    expect(isOnBehalf('u-staff', 'u-ll')).toBe(true)
  })
  it('no saved signature stays empty', () => {
    expect(signaturePrefill({ sessionUserId: 'u-t', sessionSignature: null, signerUserId: 'u-t' })).toBeNull()
  })
  it('a missing id stays empty', () => {
    expect(signaturePrefill({ sessionUserId: 'u-t', sessionSignature: SIG, signerUserId: null })).toBeNull()
    expect(signaturePrefill({ sessionUserId: null, sessionSignature: SIG, signerUserId: 'u-t' })).toBeNull()
    expect(signerUserIdFor({ tenantUserId: null }, 'tenant')).toBeNull()
  })
})

describe('CR10 method and checks', () => {
  it('unchanged prefill is saved_image, a drawing is drawn, paper is paper_mark', () => {
    expect(signMethodFor({ image: SIG, prefill: SIG })).toBe('saved_image')
    expect(signMethodFor({ image: SIG + 'B', prefill: SIG })).toBe('drawn')
    expect(signMethodFor({ image: SIG, prefill: null })).toBe('drawn')
    expect(signMethodFor({ paper: true })).toBe('paper_mark')
  })
  it('labels', () => {
    expect(SIGN_METHOD_LABELS).toEqual({
      drawn: 'Drawn electronic signature',
      saved_image: 'Saved electronic signature',
      paper_mark: 'Paper (marked signed)',
    })
  })
  it('Sign is blocked on an empty pad, without the on-behalf tick, and for staff on the tenant block', () => {
    const ECTA = { statements: ['a', 'b', 'c'], typedName: 'Thandi Mokoena', documentHash: 'f'.repeat(64), templateVersion: 'v' }
    expect(leaseSignCaptureError({}, {})).toMatch(/I agree/)
    expect(leaseSignCaptureError({ ectaConsent: ECTA }, {})).toMatch(/Draw a signature/)
    expect(leaseSignCaptureError({ signatureDataUrl: SIG }, { onBehalfLandlord: true })).toMatch(/mandate/)
    expect(
      leaseSignCaptureError({ signatureDataUrl: SIG, ectaConsent: ECTA, onBehalfConfirmation: onBehalfConfirmationText('L') }, { onBehalfLandlord: true }),
    ).toBeNull()
    expect(leaseSignCaptureError({ signatureDataUrl: SIG }, { staffOnTenant: true })).toMatch(/Only the tenant/)
    expect(leaseSignCaptureError({}, { staffOnTenant: true, paper: true })).toBeNull()
    expect(onBehalfConfirmationText('Lerato')).toBe("I am signing for Lerato under the agency's mandate.")
  })
})
