export type ListingLimitAction = 'CLOSE' | 'WAITLIST'

export type ListingLimitFields = {
  fullyBooked?: boolean
  viewingsFull?: boolean
  enquiriesFull?: boolean
  limitAction?: ListingLimitAction | null
  showRemaining?: boolean
  remainingViewings?: number | null
}

export type ListingFormMode = 'open' | 'waitlist' | 'hidden'

export type ListingLimitsSettings = {
  maxEnquiries: number | null
  maxViewings: number | null
  limitAction: ListingLimitAction
  showRemaining: boolean
}

function wholeCap(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** Agency default stored on clients.settings.listingLimits. */
export function listingLimitsFromSettings(settings: unknown): ListingLimitsSettings | undefined {
  const root = settings && typeof settings === 'object' && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {}
  const block = root.listingLimits
  if (!block || typeof block !== 'object' || Array.isArray(block)) return undefined
  const row = block as Record<string, unknown>
  return {
    maxEnquiries: wholeCap(row.maxEnquiries),
    maxViewings: wholeCap(row.maxViewings),
    limitAction: row.limitAction === 'CLOSE' ? 'CLOSE' : 'WAITLIST',
    showRemaining: Boolean(row.showRemaining),
  }
}

/** Marketplace snapshot jsonb → property fields. Extra keys are ignored. */
export function fieldsFromLimitSnapshot(snap: unknown): ListingLimitFields & {
  remainingEnquiries?: number | null
} {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return {}
  const row = snap as Record<string, unknown>
  const remaining =
    row.remaining && typeof row.remaining === 'object' && !Array.isArray(row.remaining)
      ? (row.remaining as Record<string, unknown>)
      : null
  const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
  return {
    fullyBooked: Boolean(row.fully_booked),
    viewingsFull: Boolean(row.viewings_full),
    enquiriesFull: Boolean(row.enquiries_full),
    limitAction: row.limit_action === 'CLOSE' ? 'CLOSE' : row.limit_action === 'WAITLIST' ? 'WAITLIST' : undefined,
    showRemaining: Boolean(row.show_remaining),
    remainingViewings: remaining ? num(remaining.viewings) : null,
    remainingEnquiries: remaining ? num(remaining.enquiries) : null,
  }
}

/** Public copy for a rental listing that may have hit its enquiry or viewing cap. */
export function listingAvailabilityCopy(input: ListingLimitFields): {
  badge: string | null
  spots: string | null
  viewingForm: ListingFormMode
  enquiryForm: ListingFormMode
} {
  const action = input.limitAction === 'CLOSE' ? 'CLOSE' : 'WAITLIST'
  const mode = (full: boolean): ListingFormMode => {
    if (!full) return 'open'
    return action === 'CLOSE' ? 'hidden' : 'waitlist'
  }
  const left = input.remainingViewings
  const spots =
    input.showRemaining && typeof left === 'number'
      ? `${left} viewing spot${left === 1 ? '' : 's'} left`
      : null
  return {
    badge: input.fullyBooked ? 'Fully booked' : null,
    spots,
    viewingForm: mode(Boolean(input.viewingsFull)),
    enquiryForm: mode(Boolean(input.enquiriesFull)),
  }
}
