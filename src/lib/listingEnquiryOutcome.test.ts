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

  it('a repeat shows a friendly "already registered" with the original reference', () => {
    const o = enquiryOutcome({ ok: true, leadId: 'LD-guest-old', stage: 'New Lead', duplicate: true }, ctx)
    expect(o.tone).toBe('info')
    expect(o.title).toMatch(/already registered/i)
    expect(o.body).not.toMatch(/error|failed|not saved/i)
    expect(o.reference).toBe('LD-guest-old')
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
    expect(shouldRecordEnquiryLocally({ ok: true, leadId: 'LD-1', stage: 'New Lead', duplicate: true })).toBe(false)
    expect(shouldRecordEnquiryLocally({ ok: false, error: 'x' })).toBe(false)
  })
})
