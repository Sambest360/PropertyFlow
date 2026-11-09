/**
 * What a landlord deals in (users.metadata.landlordFocus):
 *   rentals     — buying, selling and long-term renting only
 *   guesthouses — guest houses / short stays only
 *   both        — everything (default for landlords created before this existed)
 */
export type LandlordFocus = 'rentals' | 'guesthouses' | 'both'

export const LANDLORD_FOCUS_OPTIONS: Array<{ value: LandlordFocus; label: string; blurb: string }> = [
  { value: 'rentals', label: 'Rentals & sales', blurb: 'Long-term rentals and properties for sale' },
  { value: 'guesthouses', label: 'Guest houses', blurb: 'Short stays booked by the night' },
  { value: 'both', label: 'Both', blurb: 'Rentals, sales and guest houses' },
]

export function normalizeLandlordFocus(v: unknown): LandlordFocus {
  return v === 'rentals' || v === 'guesthouses' ? v : 'both'
}

export const landlordFocusLabel = (v: unknown) =>
  LANDLORD_FOCUS_OPTIONS.find((o) => o.value === normalizeLandlordFocus(v))?.label ?? 'Both'

/** Whether this user may use the guest-house side / the rentals side. Non-landlords are unaffected. */
export const canUseGuesthouses = (role: string | undefined, focus: unknown) =>
  role !== 'landlord' || normalizeLandlordFocus(focus) !== 'rentals'
export const canUseRentals = (role: string | undefined, focus: unknown) =>
  role !== 'landlord' || normalizeLandlordFocus(focus) !== 'guesthouses'
