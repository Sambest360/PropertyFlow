import type { ListingEnquiryResult } from './api/listingEnquiryApi'

/** T3 (spec r4): what the listing form shows inline after an enquiry. */
export type EnquiryOutcome = {
  tone: 'success' | 'info' | 'error'
  title: string
  body: string
  /** The new lead (LD-…) or booking (VW-…) reference the server returned; null when nothing new was saved. */
  reference: string | null
}

export type EnquiryOutcomeContext = {
  action: 'lead' | 'viewing'
  slot: { date: string; time: string } | null
  agentName?: string | null
}

export function enquiryOutcome(result: ListingEnquiryResult, ctx: EnquiryOutcomeContext): EnquiryOutcome {
  const who = ctx.agentName?.trim() || 'The agency'
  if (result.ok === false) {
    if (result.waitlist) {
      return {
        tone: 'info',
        title: 'You are on the waitlist',
        body: 'We will contact you if a spot opens.',
        reference: null,
      }
    }
    return { tone: 'error', title: 'Could not save enquiry', body: result.error || 'Please try again.', reference: null }
  }
  if (result.duplicate === true) {
    // T3 F4 (Michael): plain text, no reference.
    return {
      tone: 'info',
      title: 'Already registered',
      body: "You're already registered; the agent will be in touch.",
      reference: null,
    }
  }
  const reference = result.leadId ?? result.bookingId ?? null
  if (ctx.action === 'viewing' && ctx.slot) {
    return {
      tone: 'success',
      title: 'Viewing booked',
      body: `Your slot is ${ctx.slot.date} at ${ctx.slot.time}. ${who} will confirm shortly.`,
      reference,
    }
  }
  if (ctx.action === 'viewing') {
    return {
      tone: 'info',
      title: 'Viewing request sent',
      body: 'No open slots right now. An agent will contact you to schedule a time.',
      reference,
    }
  }
  return {
    tone: 'success',
    title: 'Interest registered',
    body: `${who} will follow up on this property. No account needed.`,
    reference: result.leadId,
  }
}

/**
 * Only a freshly saved lead is mirrored into local state. A repeat (or a
 * booking on an existing lead, leadId null) has no new lead to mirror.
 */
export function shouldRecordEnquiryLocally(
  result: ListingEnquiryResult,
): result is Extract<ListingEnquiryResult, { ok: true; leadId: string | null }> & { leadId: string } {
  return result.ok === true && result.duplicate !== true && typeof result.leadId === 'string'
}
