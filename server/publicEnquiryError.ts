import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { errStatus } from './errStatus.js'

/**
 * T3 C3: the public enquiry route never sends raw server or database text.
 * Only these known codes go back to the browser; anything else is the
 * generic `enquiry_failed`. The raw message is for server logs only.
 */
const PUBLIC_MESSAGE_CODES = new Set([
  'contact_required',
  'property_not_found',
  'property_not_public',
  'slot_not_found',
  'slot_unavailable',
])
const PUBLIC_ERROR_CODES = new Set(['NOTICE_TOO_SHORT', 'OUTSIDE_VIEWING_WINDOW', 'LISTING_FULL'])

export type PublicEnquiryErrorBody = {
  error: string
  message: string
  code?: string
  waitlist?: boolean
}

export function publicEnquiryErrorResponse(err: unknown): {
  status: ContentfulStatusCode
  body: PublicEnquiryErrorBody
} {
  const status = errStatus(err)
  const message = err instanceof Error ? err.message : ''
  const rawCode =
    err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code ?? '') : ''
  const code = PUBLIC_ERROR_CODES.has(rawCode)
    ? rawCode
    : PUBLIC_ERROR_CODES.has(message)
      ? message
      : ''
  if (code) {
    const body: PublicEnquiryErrorBody = { error: code === 'LISTING_FULL' ? 'LISTING_FULL' : 'enquiry_failed', message: code, code }
    if (code === 'LISTING_FULL' && err && typeof err === 'object' && 'waitlist' in err) {
      body.waitlist = Boolean((err as { waitlist: unknown }).waitlist)
    }
    return { status, body }
  }
  if (PUBLIC_MESSAGE_CODES.has(message)) {
    return { status, body: { error: 'enquiry_failed', message } }
  }
  return { status, body: { error: 'enquiry_failed', message: 'enquiry_failed' } }
}
