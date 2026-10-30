import type { ListingEnquiryResult } from './api/listingEnquiryApi'

/** T3 (spec r4): what the listing form shows inline after an enquiry. */
export type EnquiryOutcome = {
  tone: 'success' | 'info' | 'error'
  title: string
  body: string
  /** The lead reference (LD-…) the server returned; null when nothing was saved. */
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
  if (result.duplicate) {
    return {
      tone: 'info',
      title: "You're already registered",
      body: `You've already registered interest in this listing. ${who} has your details and will follow up.`,
      reference: result.leadId,
    }
  }
  if (ctx.action === 'viewing' && ctx.slot) {
    return {
      tone: 'success',
      title: 'Viewing booked',
      body: `Your slot is ${ctx.slot.date} at ${ctx.slot.time}. ${who} will confirm shortly.`,
      reference: result.leadId,
    }
  }
  if (ctx.action === 'viewing') {
    return {
      tone: 'info',
      title: 'Viewing request sent',
      body: 'No open slots right now. An agent will contact you to schedule a time.',
      reference: result.leadId,
    }
  }
  return {
    tone: 'success',
    title: 'Interest registered',
    body: `${who} will follow up on this property. No account needed.`,
    reference: result.leadId,
  }
}

/** Only a freshly saved enquiry is mirrored into local state; a repeat is already there (server-side). */
export function shouldRecordEnquiryLocally(
  result: ListingEnquiryResult,
): result is Extract<ListingEnquiryResult, { ok: true }> {
  return result.ok === true && result.duplicate !== true
}
