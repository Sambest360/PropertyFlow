import { describe, expect, it } from 'vitest'
import {
  SIGNATURE_INVALID,
  SIGNATURE_MAX_BYTES,
  SIGNATURE_PNG_PREFIX,
  isValidSignatureDataUrl,
  signatureInvalidError,
} from './signatureImage'
import { downscaleSignature } from './downscale'

const png = (n = 100) => SIGNATURE_PNG_PREFIX + 'A'.repeat(n)

describe('signature save validation (CR10 A)', () => {
  it('accepts a PNG data URL under the cap', () => {
    expect(isValidSignatureDataUrl(png())).toBe(true)
  })
  it('refuses other image types and non-data values', () => {
    expect(isValidSignatureDataUrl('data:image/jpeg;base64,AAAA')).toBe(false)
    expect(isValidSignatureDataUrl('data:image/svg+xml;base64,AAAA')).toBe(false)
    expect(isValidSignatureDataUrl('https://example.com/sig.png')).toBe(false)
    expect(isValidSignatureDataUrl(null)).toBe(false)
    expect(isValidSignatureDataUrl(42)).toBe(false)
  })
  it('refuses an empty or non-base64 body', () => {
    expect(isValidSignatureDataUrl(SIGNATURE_PNG_PREFIX)).toBe(false)
    expect(isValidSignatureDataUrl(SIGNATURE_PNG_PREFIX + '<script>')).toBe(false)
  })
  it('refuses anything over 150 KB', () => {
    expect(SIGNATURE_MAX_BYTES).toBe(150 * 1024)
    expect(isValidSignatureDataUrl(png(SIGNATURE_MAX_BYTES))).toBe(false)
    expect(isValidSignatureDataUrl(png(SIGNATURE_MAX_BYTES - SIGNATURE_PNG_PREFIX.length))).toBe(true)
  })
  it('the error is a 400 with code SIGNATURE_INVALID', () => {
    const err = signatureInvalidError()
    expect(err.status).toBe(400)
    expect(err.code).toBe(SIGNATURE_INVALID)
  })
  it('downscale refuses a non-PNG value', async () => {
    expect(await downscaleSignature('data:image/jpeg;base64,AAAA')).toBeNull()
  })
})
