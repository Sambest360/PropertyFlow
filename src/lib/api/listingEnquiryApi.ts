≈import { query } from './db.js'
import { ensureUuid, resolveUuid } from './entityMap.js'import { isApiEnabled, isSupabaseMode } from './config'
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
  | { ok: false; error: string }

function offlineResult(input: ListingEnquiryInput): ListingEnquiryResult {
  const ts = Date.now()
  const stage =
    input.action === 'viewing'
      ? input.slotId
        ? 'Viewing Scheduled'
        : 'Viewing Requested'
      : 'New Lead'
  return {
    ok: true,
    leadId: `LD-guest-${ts}`,
    bookingId: input.action === 'viewing' && input.slotId ? `VW-guest-${ts}` : null,
    stage,
  }
}

async function submitViaApi(input: ListingEnquiryInput): Promise<ListingEnquiryResult | null> {
  if (!isApiEnabled) return null
  try {
    const res = await fetch(`${API_BASE}/api/public/listing-enquiry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      return { ok: false, error: String(json.message ?? json.error ?? 'enquiry_failed') }
    }
    return {
      ok: true,
      leadId: String(json.leadId ?? json.lead_id ?? `LD-guest-${Date.now()}`),
      bookingId: (json.bookingId ?? json.booking_id ?? null) as string | null,
      stage: String(json.stage ?? 'New Lead'),
    }
  } catch {
    return null
  }
}

async function submitViaSupabase(input: ListingEnquiryInput): Promise<ListingEnquiryResult | null> {
  if (!isSupabaseMode) return null
  try {
    const supabase = createClient()
    const { data, error } = await supabase.rpc('submit_public_listing_enquiry', {
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
    if (error) {
      return { ok: false, error: error.message }
    }
    const row = (data ?? {}) as Record<string, unknown>
    return {
      ok: true,
      leadId: String(row.lead_id ?? row.leadId ?? `LD-guest-${Date.now()}`),
      bookingId: (row.booking_id ?? row.bookingId ?? null) as string | null,
      stage: String(row.stage ?? 'New Lead'),
    }
  } catch {
    return null
  }
}

/** Guest enquiry — persists via API/Supabase when available, else local demo ids. */
export async function submitListingEnquiry(
  input: ListingEnquiryInput,
): Promise<ListingEnquiryResult> {
  const viaApi = await submitViaApi(input)
  if (viaApi) return viaApi

  const viaSupabase = await submitViaSupabase(input)
  if (viaSupabase) return viaSupabase

  return offlineResult(input)
}
