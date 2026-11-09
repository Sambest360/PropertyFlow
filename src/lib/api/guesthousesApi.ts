/** Client for guest houses / short stays (server/guesthouses.ts). */
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

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export type CancellationPolicy = 'flexible' | 'moderate' | 'strict'
export type GuesthouseStatus = 'draft' | 'published' | 'paused'
export type BookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'checked_in' | 'completed' | 'no_show' | 'expired'
export type PaymentStatus = 'unpaid' | 'deposit' | 'paid' | 'refunded'

export const AMENITY_LABELS: Record<string, string> = {
  wifi: 'Wi-Fi',
  parking: 'Free parking',
  breakfast: 'Breakfast included',
  pool: 'Pool',
  aircon: 'Air conditioning',
  kitchen: 'Kitchen',
  braai: 'Braai area',
  tv: 'TV / DStv',
  workspace: 'Workspace',
  washing_machine: 'Washing machine',
  pet_friendly: 'Pet friendly',
  wheelchair_access: 'Wheelchair access',
  backup_power: 'Backup power',
  security: '24h security',
  garden: 'Garden',
  sea_view: 'Sea view',
}

export const POLICY_LABELS: Record<CancellationPolicy, string> = {
  flexible: 'Flexible — full refund up to 24 hours before check-in',
  moderate: 'Moderate — full refund up to 5 days before, 50% up to 24 hours before',
  strict: 'Strict — full refund up to 14 days before, 50% up to 7 days before',
}

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: 'Request — awaiting host',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  checked_in: 'Checked in',
  completed: 'Completed',
  no_show: 'No-show',
  expired: 'Expired',
}
export const BOOKING_STATUS_TONE: Record<BookingStatus, 'info' | 'success' | 'neutral' | 'danger' | 'warning' | 'brand'> = {
  pending: 'warning',
  confirmed: 'info',
  declined: 'danger',
  cancelled: 'neutral',
  checked_in: 'brand',
  completed: 'success',
  no_show: 'danger',
  expired: 'neutral',
}

export type Quote = {
  nights: number
  nightly: Array<{ date: string; rate: number }>
  accommodation: number
  cleaningFee: number
  tourismLevy: number
  total: number
}

export type Room = {
  id: string
  guesthouseId: string
  name: string
  description: string
  bedSetup: string
  maxGuests: number
  nightlyRate: number
  weekendRate: number | null
  cleaningFee: number
  minNights: number
  maxNights: number
  photos: string[]
  active: boolean
}

export type Guesthouse = {
  id: string
  name: string
  description: string
  address: string
  suburb: string | null
  city: string
  latitude: number | null
  longitude: number | null
  photos: string[]
  amenities: string[]
  houseRules: string
  checkInTime: string
  checkOutTime: string
  cancellationPolicy: CancellationPolicy
  cancellationText: string
  instantBook: boolean
  tourismLevyPct: number
  contactPhone: string | null
  contactEmail: string | null
  status: GuesthouseStatus
  hostName: string | null
  /** Agency the guest house belongs to (null for a private landlord). */
  agencyName: string | null
  fromPrice: number | null
  maxGuests: number
  roomCount: number
  createdAt: string
}

export type StayListItem = Guesthouse & { availableRooms: number | null; stayQuote: Quote | null }
export type RoomAvailability = Room & {
  available: boolean | null
  reason: string | null
  quote: Quote | null
  unavailable: Array<{ from: string; to: string }>
}

export type GuestBooking = {
  id: string
  reference: string
  guesthouseId: string
  guesthouseName: string
  city: string
  roomId: string
  roomName: string
  guestName: string
  guestEmail: string
  guestPhone: string | null
  guests: number
  checkIn: string
  checkOut: string
  nights: number
  accommodation: number
  cleaningFee: number
  tourismLevy: number
  total: number
  status: BookingStatus
  paymentStatus: PaymentStatus
  guestMessage: string | null
  hostNote: string | null
  expiresAt: string | null
  checkInTime: string
  checkOutTime: string
  cancellationPolicy: CancellationPolicy
  createdAt: string
}

export type Block = { id: string; roomId: string; startDate: string; endDate: string; reason: string | null }
/** Who a managed guest house belongs to. */
export type Ownership = { agencyId: string | null; ownerUserId: string | null }
export type ManagedSummary = Guesthouse & Ownership & { upcoming: number; pendingRequests: number; occupancy30: number; revenue30: number }
export type ManagedGuesthouse = Guesthouse & Ownership & { rooms: Room[]; blocks: Block[]; bookings: GuestBooking[] }

export type StaySearch = { q?: string; checkIn?: string; checkOut?: string; guests?: number; sort?: string }

// Public
export const searchStaysApi = (s: StaySearch) => call<{ items: StayListItem[] }>(`/api/stays${qs(s)}`)
export const getStayApi = (id: string, s: StaySearch) =>
  call<Guesthouse & { rooms: RoomAvailability[] }>(`/api/stays/${encodeURIComponent(id)}${qs(s)}`)
export const createStayBookingApi = (b: {
  roomId: string
  checkIn: string
  checkOut: string
  guests: number
  guestName: string
  guestEmail: string
  guestPhone?: string
  message?: string
}) => call<GuestBooking>('/api/stays/bookings', { method: 'POST', body: JSON.stringify(b) })
export const lookupStayBookingApi = (reference: string, email: string) =>
  call<GuestBooking>('/api/stays/bookings/lookup', { method: 'POST', body: JSON.stringify({ reference, email }) })
export const cancelStayBookingApi = (reference: string, email: string) =>
  call<GuestBooking & { refundPercent: number }>('/api/stays/bookings/cancel', { method: 'POST', body: JSON.stringify({ reference, email }) })
export const myStayBookingsApi = () => call<GuestBooking[]>('/api/stays/bookings/mine')

// Management
export const listGuesthousesApi = () => call<ManagedSummary[]>('/api/guesthouses')
export const getGuesthouseApi = (id: string) => call<ManagedGuesthouse>(`/api/guesthouses/${encodeURIComponent(id)}`)
export type GuesthouseInput = Partial<Omit<Guesthouse, 'id' | 'hostName' | 'agencyName' | 'fromPrice' | 'maxGuests' | 'roomCount' | 'createdAt' | 'cancellationText'>> & Partial<Ownership>
export type Assignee = { id: string; name: string; role: string; agencyId: string | null }
export type AssigneeOptions = { canAssign: boolean; agencies: Array<{ id: string; name: string }>; people: Assignee[] }
/** Who a guest house can be assigned to (empty unless you are the owner or an agency admin). */
export const listGuesthouseAssigneesApi = () => call<AssigneeOptions>('/api/guesthouses/assignees')
export const createGuesthouseApi = (b: GuesthouseInput) => call<{ id: string }>('/api/guesthouses', { method: 'POST', body: JSON.stringify(b) })
export const updateGuesthouseApi = (id: string, b: GuesthouseInput) =>
  call<{ id: string }>(`/api/guesthouses/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(b) })
export const deleteGuesthouseApi = (id: string) => call<{ ok: true }>(`/api/guesthouses/${encodeURIComponent(id)}`, { method: 'DELETE' })
export type RoomInput = Partial<Omit<Room, 'id' | 'guesthouseId'>>
export const saveRoomApi = (houseId: string, roomId: string | null, b: RoomInput) =>
  call<Room>(`/api/guesthouses/${encodeURIComponent(houseId)}/rooms${roomId ? `/${encodeURIComponent(roomId)}` : ''}`, {
    method: roomId ? 'PUT' : 'POST',
    body: JSON.stringify(b),
  })
export const deleteRoomApi = (houseId: string, roomId: string) =>
  call<{ ok: true }>(`/api/guesthouses/${encodeURIComponent(houseId)}/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' })
export const addBlockApi = (houseId: string, b: { roomId: string; startDate: string; endDate: string; reason?: string }) =>
  call<Block>(`/api/guesthouses/${encodeURIComponent(houseId)}/blocks`, { method: 'POST', body: JSON.stringify(b) })
export const removeBlockApi = (houseId: string, blockId: string) =>
  call<{ ok: true }>(`/api/guesthouses/${encodeURIComponent(houseId)}/blocks/${encodeURIComponent(blockId)}`, { method: 'DELETE' })
export const listManagedBookingsApi = () => call<GuestBooking[]>('/api/guesthouses/bookings')
export type BookingAction = 'confirm' | 'decline' | 'cancel' | 'check_in' | 'check_out' | 'no_show' | 'payment' | 'note'
export const guestBookingActionApi = (id: string, b: { action: BookingAction; note?: string; paymentStatus?: PaymentStatus }) =>
  call<GuestBooking>(`/api/guesthouses/bookings/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(b) })

// Helpers
export const zar = (n: number) =>
  `R ${n.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: n % 1 ? 2 : 0 })}`
export const isoDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
