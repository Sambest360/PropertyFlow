import { describe, expect, it } from 'vitest'
import { applyLeadInput, enquirySubmitPlan, type EnquirySubmitContext } from './listingEnquirySubmit'

/**
 * T3 F3 (Angela): what the listing page does with a submit result is a pure
 * plan, tested here by behaviour (not by scanning the page text): what goes
 * into local state, what the inline confirmation says, and whether the note
 * is cleared. The page only executes the plan (pinned by ListingDetail.t3).
 */
const ctx: EnquirySubmitContext = {
  listing: { id: 'PR-1011', agencyId: 'agency-1', agentId: 'u-james', listingMode: 'rent', value: 6500 },
  contact: { name: 'Kelly Test', email: 'kelly@example.com', phone: '0820000000', notes: 'Pets?' },
  action: 'lead',
  slot: null,
  agentName: 'Thandi',
}
const viewingCtx: EnquirySubmitContext = {
  ...ctx,
  action: 'viewing',
  slot: { id: 'VS-1', date: '2026-11-02', time: '10:00' },
}

describe('T3 enquirySubmitPlan', () => {
  it('a fresh save mirrors the server lead locally, shows its reference, clears the note', () => {
    const plan = enquirySubmitPlan({ ok: true, leadId: 'LD-guest-1-abc', stage: 'New Lead' }, ctx)
    expect(plan.record).toEqual({
      lead: {
        id: 'LD-guest-1-abc',
        agencyId: 'agency-1',
        propertyId: 'PR-1011',
        agentId: 'u-james',
        name: 'Kelly Test',
        email: 'kelly@example.com',
        phone: '0820000000',
        channel: 'Web Form',
        type: 'Rent',
        value: 6500,
        stage: 'New Lead',
        notes: 'Pets?',
      },
      viewing: null,
    })
    expect(plan.outcome).toMatchObject({ tone: 'success', title: 'Interest registered', reference: 'LD-guest-1-abc' })
    expect(plan.clearNote).toBe(true)
  })

  it('a booked slot also mirrors the viewing with the server booking id', () => {
    const plan = enquirySubmitPlan(
      { ok: true, leadId: 'LD-guest-2', bookingId: 'VW-guest-2', stage: 'Viewing Scheduled' },
      viewingCtx,
    )
    expect(plan.record?.viewing).toEqual({
      id: 'VW-guest-2',
      agencyId: 'agency-1',
      propertyId: 'PR-1011',
      agentId: 'u-james',
      slotId: 'VS-1',
      applicantName: 'Kelly Test',
      applicantEmail: 'kelly@example.com',
      date: '2026-11-02',
      time: '10:00',
    })
    expect(plan.outcome).toMatchObject({ title: 'Viewing booked', reference: 'LD-guest-2' })
  })

  it('a sale listing records a Buy lead', () => {
    const plan = enquirySubmitPlan(
      { ok: true, leadId: 'LD-3', stage: 'New Lead' },
      { ...ctx, listing: { ...ctx.listing, listingMode: 'sale' } },
    )
    expect(plan.record?.lead.type).toBe('Buy')
  })

  it('a duplicate is NOT recorded locally and shows no reference (M07, F4)', () => {
    const plan = enquirySubmitPlan({ ok: true, duplicate: true }, ctx)
    expect(plan.record).toBeNull()
    expect(plan.outcome).toEqual({
      tone: 'info',
      title: 'Already registered',
      body: "You're already registered; the agent will be in touch.",
      reference: null,
    })
    expect(plan.clearNote).toBe(true)
  })

  it('a slot booking on an existing lead is not recorded as a lead; the booking ref is shown', () => {
    const plan = enquirySubmitPlan(
      { ok: true, leadId: null, bookingId: 'VW-guest-9', stage: 'Viewing Scheduled' },
      viewingCtx,
    )
    expect(plan.record).toBeNull()
    expect(plan.outcome.reference).toBe('VW-guest-9')
  })

  it('an error is not recorded, keeps the note, and is an inline error', () => {
    const plan = enquirySubmitPlan({ ok: false, error: 'We could not save your enquiry. Try again in a moment.' }, ctx)
    expect(plan.record).toBeNull()
    expect(plan.clearNote).toBe(false)
    expect(plan.outcome).toMatchObject({ tone: 'error', reference: null })
  })

  it('a waitlist answer clears the note and is not recorded', () => {
    const plan = enquirySubmitPlan({ ok: false, error: 'This listing is fully booked.', waitlist: true }, ctx)
    expect(plan.record).toBeNull()
    expect(plan.clearNote).toBe(true)
    expect(plan.outcome.tone).toBe('info')
  })
})

describe('T3 B1 applyLeadInput (the apply path lead)', () => {
  const args = { ...ctx, stage: 'Application Submitted' as const }

  it('a tenant applicant saves the NEW lead to the server (persist: true), with no fixed id', () => {
    const input = applyLeadInput({ listing: args.listing, contact: args.contact, role: 'tenant' })
    expect(input).toEqual({
      agencyId: 'agency-1',
      propertyId: 'PR-1011',
      agentId: 'u-james',
      name: 'Kelly Test',
      email: 'kelly@example.com',
      phone: '0820000000',
      channel: 'Web Form',
      type: 'Rent',
      value: 6500,
      stage: 'Application Submitted',
      notes: 'Pets?',
      persist: true,
    })
    expect('id' in input).toBe(false)
  })

  it.each(['agent_admin', 'client_admin', 'super_admin'])('%s saves it too', (role) => {
    expect(applyLeadInput({ listing: args.listing, contact: args.contact, role }).persist).toBe(true)
  })

  it.each([null, 'guest', 'landlord', 'contractor'])('%s keeps it local (the server would refuse it)', (role) => {
    expect(applyLeadInput({ listing: args.listing, contact: args.contact, role }).persist).toBe(false)
  })
})
