/**
 * CR10: stored signature image rules, shared by the client (My signature
 * screen, sign dialog) and the server (user write policy, lease signing).
 *
 * Only a PNG data URL is accepted, capped at SIGNATURE_MAX_BYTES (measured on
 * the data URL string). Anything else is SIGNATURE_INVALID (HTTP 400).
 */

export const SIGNATURE_PNG_PREFIX = 'data:image/png;base64,'

/** 150 KB cap on the data URL (Jim, CR10 A). */
export const SIGNATURE_MAX_BYTES = 150 * 1024

export const SIGNATURE_INVALID = 'SIGNATURE_INVALID'

const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/

/** True when `v` is a PNG data URL within the cap. */
export function isValidSignatureDataUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false
  if (!v.startsWith(SIGNATURE_PNG_PREFIX)) return false
  if (v.length > SIGNATURE_MAX_BYTES) return false
  const body = v.slice(SIGNATURE_PNG_PREFIX.length)
  return body.length > 0 && BASE64_BODY.test(body)
}

/** 400 SIGNATURE_INVALID error (status + code read by the API error handler). */
export function signatureInvalidError(why = 'signature must be a PNG image under 150 KB'): Error & {
  status: number
  code: string
} {
  return Object.assign(new Error(`Invalid signature: ${why}`), { status: 400, code: SIGNATURE_INVALID })
}
