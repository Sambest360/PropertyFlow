import { isApiEnabled, isSupabaseMode } from './config'
import { createClient } from '../../utils/supabase/client'

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
  | { ok: true; leadId: string; bookingId?: string | null; stage: string }
  | { ok: false; error: string; waitlist?: boolean }

const ENQUIRY_TIMEOUT_MS = 20_000
const SUPABASE_ENQUIRY_TIMEOUT_MS = 15_000

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

function enquiryTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('timeout')), ms)
  })
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
    return {
      ok: true,
      leadId: String(json.leadId ?? json.lead_id ?? `LD-guest-${Date.now()}`),
      bookingId: (json.bookingId ?? json.booking_id ?? null) as string | null,
      stage: String(json.stage ?? 'New Lead'),
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

async function submitViaSupabase(input: ListingEnquiryInput): Promise<ListingEnquiryResult | null> {
  if (!isSupabaseMode) return null
  try {
    const supabase = createClient()
    const rpcPromise = supabase.rpc('submit_public_listing_enquiry', {
      p_property_fe_id: input.propertyId,
      p_action: input.action,
      p_first_name: input.firstName,
      p_last_name: input.lastName,
      p_email: input.email,
      p_phone: input.phone ?? null,
      p_notes: input.notes ?? null,
      p_slot_fe_id: input.slotId ?? null,
      p_monthly_income: input.monthlyIncome ?? null,
      p_id_number: input.idNumber ?? null,
      p_interest_type: input.interestType === 'Buy' ? 'BUY' : 'RENT',
    })
    const { data, error } = await Promise.race([rpcPromise, enquiryTimeout(SUPABASE_ENQUIRY_TIMEOUT_MS)])
    if (error) {
      return { ok: false, error: formatListingEnquiryError(error.message) }
    }
    const row = (data ?? {}) as Record<string, unknown>
    if (row.ok === false || row.code === 'LISTING_FULL') {
      return {
        ok: false,
        error: formatListingEnquiryError(String(row.code ?? row.message ?? 'LISTING_FULL')),
        waitlist: row.waitlist === true,
      }
    }
    return {
      ok: true,
      leadId: String(row.lead_id ?? row.leadId ?? `LD-guest-${Date.now()}`),
      bookingId: (row.booking_id ?? row.bookingId ?? null) as string | null,
      stage: String(row.stage ?? 'New Lead'),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: formatListingEnquiryError(msg) }
  }
}

/** Guest enquiry — persists via API/Supabase when available; errors when unavailable. */
export async function submitListingEnquiry(
  input: ListingEnquiryInput,
): Promise<ListingEnquiryResult> {
  const viaApi = await submitViaApi(input)
  if (viaApi) return viaApi

  const viaSupabase = await submitViaSupabase(input)
  if (viaSupabase) return viaSupabase

  return { ok: false, error: ENQUIRY_UNAVAILABLE }
}
