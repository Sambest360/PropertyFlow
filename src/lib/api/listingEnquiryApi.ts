import { isApiEnabled } from './config'
import { ENQUIRY_RATE_LIMITED_COPY } from '../leadScreenCopy'

export { ENQUIRY_RATE_LIMITED_COPY }

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export type ListingEnquiryInput = {
  propertyId: string
  agencyId?: string
  agentId?: string | null
  action: 'lead' | 'viewing'
  firstName: string
  lastName: string
  email: string
  phone?: string
  notes?: string
  slotId?: string | null
  monthlyIncome?: number | null
  interestType?: 'Buy' | 'Rent'
  value?: number
}

export type ListingEnquiryResult =
  | {
      ok: true
      duplicate?: false
      /**
       * The new lead's reference (LD-…). null only for a slot booking that
       * matched an existing lead: the booking is new (bookingId), the lead is
       * not, and its reference is never shown (T3 F4).
       */
      leadId: string | null
      bookingId?: string | null
      stage: string
      /** Occupied advert: the date the home comes free (YYYY-MM-DD); null otherwise. */
      availableFrom?: string | null
    }
  /**
   * T3 F4 (Michael): already registered on this listing. Nothing new was
   * saved and no reference is carried, even if a server sent one.
   */
  | { ok: true; duplicate: true }
  | { ok: false; error: string; waitlist?: boolean }

/** T3 (spec r5): the timeout copy. The request may have reached the server. */
export const ENQUIRY_TIMEOUT_COPY =
  'The server took too long. Your enquiry may have been received. Try again and we will tell you if it is already registered.'

const ENQUIRY_TIMEOUT_MS = 20_000

const ENQUIRY_UNAVAILABLE =
  'We could not save your enquiry. Try again in a moment.'

/** Map API / RPC codes to copy suitable for the listing enquiry form. */
export function formatListingEnquiryError(raw: string): string {
  const code = raw.trim().toLowerCase()
  if (
    code.includes('schema cache') ||
    code.includes('submit_public_listing_enquiry')
  ) {
    return 'Enquiries are not available on this environment yet. Please try again later or contact the agency.'
  }
  if (code === 'slot_not_found' || code.includes('slot_not_found')) {
    return 'That viewing time is no longer available. Pick another slot or request a viewing without a slot.'
  }
  if (code === 'slot_unavailable' || code.includes('slot_unavailable')) {
    return 'That slot just filled up. Choose another time or request a viewing without a slot.'
  }
  // Occupied adverts (027 RPC raises these lower-case; the API sends upper-case codes).
  if (code.includes('notice_too_short')) {
    return 'Someone still lives here, so viewings need more notice. Pick a later time.'
  }
  if (code.includes('outside_viewing_window')) {
    return 'Someone still lives here and that time is outside their viewing hours. Pick another slot.'
  }
  // T3 C3: plain copy for the two server checks that had none.
  if (code === 'contact_required') {
    return 'Please add an email or phone number so the agency can reach you.'
  }
  if (code === 'property_not_found') {
    return 'This listing is no longer listed. Browse other homes on the market page.'
  }
  if (code.includes('property_not_public')) {
    return 'This listing is not taking enquiries right now.'
  }
  if (code === 'listing_full' || code.includes('listing_full')) {
    return 'This listing is fully booked.'
  }
  if (code === 'enquiry_failed' || code.includes('enquiry_failed')) {
    return ENQUIRY_UNAVAILABLE
  }
  if (raw.toLowerCase().includes('abort') || raw.toLowerCase().includes('timeout')) {
    return ENQUIRY_TIMEOUT_COPY
  }
  // T3 C3: never show unknown server or database text to the public.
  return ENQUIRY_UNAVAILABLE
}

function nonBlank(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

async function submitViaApi(input: ListingEnquiryInput): Promise<ListingEnquiryResult | null> {
  if (!isApiEnabled) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ENQUIRY_TIMEOUT_MS)
  try {
    const res = await fetch(`${API_BASE}/api/public/listing-enquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        propertyId: input.propertyId,
        action: input.action,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        notes: input.notes,
        slotId: input.slotId,
        monthlyIncome: input.monthlyIncome,
        interestType: input.interestType,
      }),
    })
    // H1 (Oscar A5): any 429 shows the neutral copy; the server's text (and
    // any count, time or IP in it) is never shown on the public form.
    if (res.status === 429) return { ok: false, error: ENQUIRY_RATE_LIMITED_COPY, waitlist: false }
    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok) {
      const raw = String(json.message ?? json.error ?? 'enquiry_failed')
      return {
        ok: false,
        error: formatListingEnquiryError(raw),
        waitlist: json.waitlist === true,
      }
    }
    // T3 F4: a repeat carries no reference, whatever the server sent.
    if (json.duplicate === true) return { ok: true, duplicate: true }
    // T3: no fake reference. A 2xx is a saved enquiry only with the server's
    // new lead id or (slot booking on an existing lead) its new booking id.
    const leadId = nonBlank(json.leadId ?? json.lead_id)
    const bookingId = nonBlank(json.bookingId ?? json.booking_id)
    if (!leadId && !bookingId) {
      return { ok: false, error: ENQUIRY_UNAVAILABLE }
    }
    return {
      ok: true,
      leadId,
      bookingId,
      stage: String(json.stage ?? 'New Lead'),
      availableFrom: (json.availableFrom ?? json.available_from ?? null) as string | null,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: formatListingEnquiryError('timeout') }
    }
    return { ok: false, error: formatListingEnquiryError(ENQUIRY_UNAVAILABLE) }
  } finally {
    clearTimeout(t)
  }
}

/** Guest enquiry — persists via the API when available; errors when unavailable. */
export async function submitListingEnquiry(
  input: ListingEnquiryInput,
): Promise<ListingEnquiryResult> {
  const viaApi = await submitViaApi(input)
  if (viaApi) return viaApi

  return { ok: false, error: ENQUIRY_UNAVAILABLE }
}
