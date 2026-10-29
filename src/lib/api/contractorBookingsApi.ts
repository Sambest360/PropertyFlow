/** Client for contractor bookings (server/contractorBookings.ts). */
import { actorHeaders } from './actorAuth'
import { resolveApiAuthorizationHeader } from './authClient'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await resolveApiAuthorizationHeader().catch(() => ({}))
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...auth, ...init?.headers },
  })
  const json = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`)
  return json
}

export type TimeWindow = 'morning' | 'afternoon' | 'full_day' | 'evening'
export const TIME_WINDOWS: Array<{ key: TimeWindow; label: string }> = [
  { key: 'morning', label: 'Morning (08:00–12:00)' },
  { key: 'afternoon', label: 'Afternoon (12:00–17:00)' },
  { key: 'full_day', label: 'Full day' },
  { key: 'evening', label: 'Evening (after 17:00)' },
]

export type Booking = {
  id: string
  contractorUserId: string
  contractorName: string
  bookedByName: string | null
  listingId: string | null
  listingTitle: string | null
  ticketId: string | null
  ticketTitle: string | null
  trade: string | null
  scheduledDate: string
  timeWindow: TimeWindow
  description: string
  status: 'requested' | 'accepted' | 'declined' | 'completed' | 'cancelled'
  contractorNote: string | null
  createdAt: string
}

export const listBookingsApi = () => call<Booking[]>('/api/contractor-bookings')
export const createBookingApi = (b: {
  contractorUserId: string
  scheduledDate: string
  timeWindow: TimeWindow
  description: string
  listingId?: string
  ticketId?: string
  trade?: string
}) => call<Booking>('/api/contractor-bookings', { method: 'POST', body: JSON.stringify(b) })
export const bookingActionApi = (id: string, b: { action: 'accept' | 'decline' | 'complete' | 'cancel' | 'link_ticket'; note?: string; ticketId?: string }) =>
  call<Booking>(`/api/contractor-bookings/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(b) })
