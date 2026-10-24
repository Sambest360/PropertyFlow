import { authHeaders } from './authClient'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export type ApplyEligibilityResponse = {
  eligible: boolean
  reason: string
  bookingId?: string | null
  overrideId?: string | null
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string }
    return body.message || body.error || `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export async function fetchApplyEligibility(unitId: string): Promise<ApplyEligibilityResponse | null> {
  const res = await fetch(`${API_BASE}/api/units/${encodeURIComponent(unitId)}/apply-eligibility`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) return null
  return (await res.json()) as ApplyEligibilityResponse
}

export async function patchBookingAttendance(
  bookingId: string,
  body: { status: 'COMPLETED' | 'NO_SHOW'; viewingMode?: 'IN_PERSON' | 'VIRTUAL' },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const res = await fetch(`${API_BASE}/api/bookings/${encodeURIComponent(bookingId)}/attendance`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) return { ok: false, message: await readError(res) }
  return { ok: true }
}

export type ApplyOverrideRow = {
  id: string
  unit_id: string
  unit_title: string | null
  applicant_email: string | null
  reason_code: string
  reason_text: string
  expires_at: string
  revoked_at: string | null
  created_at: string
}

export async function fetchApplyOverrides(agencyId?: string): Promise<ApplyOverrideRow[]> {
  const query = agencyId ? `?agencyId=${encodeURIComponent(agencyId)}` : ''
  const res = await fetch(`${API_BASE}/api/apply-overrides${query}`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) return []
  const body = (await res.json()) as { overrides?: ApplyOverrideRow[] }
  return body.overrides ?? []
}
