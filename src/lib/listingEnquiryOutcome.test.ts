import { describe, expect, it } from 'vitest'
import { enquiryOutcome, shouldRecordEnquiryLocally } from './listingEnquiryOutcome'

/** T3 (spec r4): what the listing form shows after Register interest / a viewing request. */
describe('T3 enquiryOutcome', () => {
  const ctx = { action: 'lead' as const, slot: null, agentName: 'Thandi' }

  it('a new lead shows "Interest registered" with the LD- reference', () => {
    const o = enquiryOutcome({ ok: true, leadId: 'LD-guest-1-abc', stage: 'New Lead' }, ctx)
    expect(o.tone).toBe('success')
    expect(o.title).toBe('Interest registered')
    expect(o.reference).toBe('LD-guest-1-abc')
    expect(o.body).toContain('Thandi')
  })

  it('a repeat shows plain "already registered" copy with NO reference (F4)', () => {
    const o = enquiryOutcome({ ok: true, duplicate: true }, ctx)
    expect(o.tone).toBe('info')
    expect(o.title).toBe('Already registered')
    expect(o.body).toBe("You're already registered; the agent will be in touch.")
    expect(o.reference).toBeNull()
    expect(JSON.stringify(o)).not.toMatch(/LD-/)
  })

  it('a slot booking that matched an existing lead shows the booking reference, never a lead one', () => {
    const o = enquiryOutcome(
      { ok: true, leadId: null, bookingId: 'VW-guest-9', stage: 'Viewing Scheduled' },
      { action: 'viewing', slot: { date: '2026-11-02', time: '10:00' }, agentName: 'Thandi' },
    )
    expect(o.title).toBe('Viewing booked')
    expect(o.reference).toBe('VW-guest-9')
  })

  it('a booked viewing names the slot and keeps the reference', () => {
    const o = enquiryOutcome(
      { ok: true, leadId: 'LD-guest-2', bookingId: 'VW-guest-2', stage: 'Viewing Scheduled' },
      { action: 'viewing', slot: { date: '2026-11-02', time: '10:00' }, agentName: 'Thandi' },
    )
    expect(o.title).toBe('Viewing booked')
    expect(o.body).toContain('2026-11-02 at 10:00')
    expect(o.reference).toBe('LD-guest-2')
  })

  it('a viewing request without a slot says an agent will schedule', () => {
    const o = enquiryOutcome({ ok: true, leadId: 'LD-guest-3', stage: 'Viewing Requested' }, { ...ctx, action: 'viewing' })
    expect(o.title).toBe('Viewing request sent')
    expect(o.reference).toBe('LD-guest-3')
  })

  it('an error (e.g. a timeout) is an error with no reference', () => {
    const o = enquiryOutcome({ ok: false, error: 'The server took too long to respond.' }, ctx)
    expect(o.tone).toBe('error')
    expect(o.title).toBe('Could not save enquiry')
    expect(o.body).toContain('took too long')
    expect(o.reference).toBeNull()
  })

  it('a waitlist answer is info, not an error', () => {
    const o = enquiryOutcome({ ok: false, error: 'LISTING_FULL', waitlist: true }, ctx)
    expect(o.tone).toBe('info')
    expect(o.title).toMatch(/waitlist/i)
  })

  it('only a fresh saved enquiry is added to local state (never a duplicate or an error)', () => {
    expect(shouldRecordEnquiryLocally({ ok: true, leadId: 'LD-1', stage: 'New Lead' })).toBe(true)
    expect(shouldRecordEnquiryLocally({ ok: true, duplicate: true })).toBe(false)
    // No lead id (a slot booking on an existing lead): nothing to mirror as a lead.
    expect(shouldRecordEnquiryLocally({ ok: true, leadId: null, bookingId: 'VW-1', stage: 'Viewing Scheduled' })).toBe(false)
    expect(shouldRecordEnquiryLocally({ ok: false, error: 'x' })).toBe(false)
  })
})
