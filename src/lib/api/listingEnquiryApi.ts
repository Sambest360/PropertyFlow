import { isApiEnabled } from './config'

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
  idNumber?: string | null
  interestType?: 'Buy' | 'Rent'
  value?: number
}

export type ListingEnquiryResult =
  | {
      ok: true
      leadId: string
      bookingId?: string | null
      stage: string
      /** Occupied advert: the date the home comes free (YYYY-MM-DD); null otherwise. */
      availableFrom?: string | null
      /** T3: already registered on this listing; leadId is the original reference. */
      duplicate?: boolean
    }
  | { ok: false; error: string; waitlist?: boolean }

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
    return 'The server took too long to respond. Check your connection and try again.'
  }
  return raw
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
        idNumber: input.idNumber,
        interestType: input.interestType,
      }),
    })
    const json = (await res.json()) as Record<string, unknown>
    if (!res.ok) {
      const raw = String(json.message ?? json.error ?? 'enquiry_failed')
      return {
        ok: false,
        error: formatListingEnquiryError(raw),
        waitlist: json.waitlist === true,
      }
    }
    // T3: no fake reference. A 2xx without the server's lead id is not a saved enquiry.
    const leadId = json.leadId ?? json.lead_id
    if (typeof leadId !== 'string' || !leadId.trim()) {
      return { ok: false, error: ENQUIRY_UNAVAILABLE }
    }
    return {
      ok: true,
      leadId,
      bookingId: (json.bookingId ?? json.booking_id ?? null) as string | null,
      stage: String(json.stage ?? 'New Lead'),
      availableFrom: (json.availableFrom ?? json.available_from ?? null) as string | null,
      ...(json.duplicate === true ? { duplicate: true } : {}),
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
