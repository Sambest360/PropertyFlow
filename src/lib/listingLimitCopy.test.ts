import { describe, expect, it } from 'vitest'
import { fieldsFromLimitSnapshot, listingAvailabilityCopy, listingLimitsFromSettings } from './listingLimitCopy'

describe('listingAvailabilityCopy', () => {
  it('shows spots left only when the listing opted in', () => {
    expect(
      listingAvailabilityCopy({ showRemaining: true, remainingViewings: 1, fullyBooked: false }).spots,
    ).toBe('1 viewing spot left')
    expect(listingAvailabilityCopy({ showRemaining: false, remainingViewings: 3 }).spots).toBeNull()
  })

  it('switches a full listing to waitlist or hides the form', () => {
    const wait = listingAvailabilityCopy({
      fullyBooked: true,
      viewingsFull: true,
      enquiriesFull: false,
      limitAction: 'WAITLIST',
    })
    expect(wait.badge).toBe('Fully booked')
    expect(wait.viewingForm).toBe('waitlist')
    expect(wait.enquiryForm).toBe('open')

    const closed = listingAvailabilityCopy({
      fullyBooked: true,
      viewingsFull: true,
      enquiriesFull: true,
      limitAction: 'CLOSE',
    })
    expect(closed.viewingForm).toBe('hidden')
    expect(closed.enquiryForm).toBe('hidden')
  })

  it('reads the marketplace snapshot and agency defaults', () => {
    expect(
      fieldsFromLimitSnapshot({
        fully_booked: true,
        viewings_full: true,
        enquiries_full: false,
        limit_action: 'WAITLIST',
        show_remaining: true,
        remaining: { viewings: 0, enquiries: 2 },
      }),
    ).toMatchObject({ fullyBooked: true, remainingViewings: 0, remainingEnquiries: 2 })
    expect(fieldsFromLimitSnapshot(null)).toEqual({})
    expect(
      listingLimitsFromSettings({ listingLimits: { maxViewings: 4, limitAction: 'CLOSE', showRemaining: true } }),
    ).toEqual({ maxEnquiries: null, maxViewings: 4, limitAction: 'CLOSE', showRemaining: true })
  })
})
